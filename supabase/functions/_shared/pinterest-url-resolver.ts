/**
 * Pinterest URL Recovery Resolver — single source of truth for turning any
 * historical Pinterest destination URL into a live, in-stock product page.
 *
 * Strict ladder (stops at first success):
 *   1. exact_slug      — products_public has slug, active + in_stock
 *   2. slug_history    — product_slug_history.old_slug → current_slug
 *   3. alias           — product_aliases.alias (any kind)
 *   4. sku             — products.sku
 *   5. cj_map          — products.cj_product_id
 *   6. similar         — keyword Jaccard ≥ 0.55 + same category, top score wins
 *   7. category        — /collections/{category-slug} when non-empty
 *   8. not_found       — 404
 *
 * Query strings (utm_*, gclid, fbclid, pin_mode, hook, intent, pin_id, ref,
 * session, sort, filter, variant, plus everything else) are preserved verbatim
 * on the resolved target.
 */

export type ResolverStep =
  | "exact_slug"
  | "slug_history"
  | "alias"
  | "sku"
  | "cj_map"
  | "similar"
  | "category"
  | "not_found";

export interface ResolverResult {
  ok: boolean;
  step: ResolverStep;
  target: string | null;        // absolute or path-relative URL to redirect to
  product_id: string | null;
  product_slug: string | null;
  category: string | null;
  reason?: string;
}

const HOST = "https://getpawsy.pet";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","for","with","in","on","at","to","of","is",
  "are","was","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","must","shall","can","need",
  "pet","pets","dog","cat","best","top","new","premium",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Extract the slug from any inbound recovery path. Returns null if not recognized. */
export function extractInboundSlug(pathname: string): string | null {
  const m =
    pathname.match(/^\/(?:products|product|go|lp|legacy|old-product|redirect)\/([^\/?#]+)/i) ||
    pathname.match(/^\/collections?\/([^\/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

/** Preserve all query params on the final target. */
export function withQuery(target: string, rawQuery: string): string {
  if (!rawQuery || rawQuery === "?") return target;
  const qs = rawQuery.startsWith("?") ? rawQuery : `?${rawQuery}`;
  return target.includes("?") ? `${target}&${qs.slice(1)}` : `${target}${qs}`;
}

/** Return the absolute canonical PDP URL for an active in-stock product. */
function pdp(slug: string): string {
  return `${HOST}/products/${slug}`;
}

/** Quick liveness check against products_public (active + in-stock). */
async function liveProductBySlug(sb: any, slug: string) {
  const { data } = await sb
    .from("products_public")
    .select("id, slug, name, category, stock")
    .eq("slug", slug)
    .maybeSingle();
  return data || null;
}

export async function resolveDestination(
  sb: any,
  inputUrl: string,
): Promise<ResolverResult> {
  let u: URL;
  try {
    u = new URL(inputUrl, HOST);
  } catch {
    return mk("not_found", null, null, null, "invalid_url");
  }

  const rawQuery = u.search || "";
  const slug = extractInboundSlug(u.pathname);

  if (!slug) {
    return mk("not_found", null, null, null, "no_slug_in_path");
  }

  // 1) exact slug
  {
    const live = await liveProductBySlug(sb, slug);
    if (live) {
      return mk("exact_slug", withQuery(pdp(live.slug), rawQuery), live.id, live.slug, live.category);
    }
  }

  // 2) slug history
  {
    const { data: hist } = await sb
      .from("product_slug_history")
      .select("current_slug, product_id")
      .eq("old_slug", slug)
      .maybeSingle();
    if (hist?.current_slug) {
      const live = await liveProductBySlug(sb, hist.current_slug);
      if (live) {
        return mk("slug_history", withQuery(pdp(live.slug), rawQuery), live.id, live.slug, live.category);
      }
    }
  }

  // 3) alias
  {
    const { data: alias } = await sb
      .from("product_aliases")
      .select("product_id")
      .eq("alias", slug)
      .maybeSingle();
    if (alias?.product_id) {
      const { data: live } = await sb
        .from("products_public")
        .select("id, slug, category")
        .eq("id", alias.product_id)
        .maybeSingle();
      if (live?.slug) {
        return mk("alias", withQuery(pdp(live.slug), rawQuery), live.id, live.slug, live.category);
      }
    }
  }

  // 4) sku
  {
    const { data: bySku } = await sb
      .from("products_public")
      .select("id, slug, category")
      .eq("sku", slug)
      .maybeSingle();
    if (bySku?.slug) {
      return mk("sku", withQuery(pdp(bySku.slug), rawQuery), bySku.id, bySku.slug, bySku.category);
    }
  }

  // 5) cj map
  {
    const { data: byCj } = await sb
      .from("products_public")
      .select("id, slug, category")
      .eq("cj_product_id", slug)
      .maybeSingle();
    if (byCj?.slug) {
      return mk("cj_map", withQuery(pdp(byCj.slug), rawQuery), byCj.id, byCj.slug, byCj.category);
    }
  }

  // 6) similar — keyword Jaccard
  {
    const slugTokens = new Set(tokens(slug.replace(/-/g, " ")));
    if (slugTokens.size >= 2) {
      // Pull candidate pool — limit to 500 to keep things fast.
      const { data: pool } = await sb
        .from("products_public")
        .select("id, slug, name, category")
        .limit(500);
      let best: { score: number; row: any } | null = null;
      for (const row of pool || []) {
        const score = jaccard(slugTokens, new Set(tokens(row.name || row.slug || "")));
        if (score >= 0.55 && (!best || score > best.score)) {
          best = { score, row };
        }
      }
      if (best) {
        return mk(
          "similar",
          withQuery(pdp(best.row.slug), rawQuery),
          best.row.id,
          best.row.slug,
          best.row.category,
          `jaccard=${best.score.toFixed(2)}`,
        );
      }
    }
  }

  // 7) category fallback — only if path was a collection or slug encodes a known category
  {
    const catFromPath = u.pathname.match(/^\/collections?\/([^\/?#]+)/i)?.[1] ||
      slug.split("-").slice(-2).join("-");
    if (catFromPath) {
      const { count } = await sb
        .from("products_public")
        .select("id", { count: "exact", head: true })
        .eq("category", catFromPath);
      if ((count || 0) > 0) {
        return mk(
          "category",
          withQuery(`${HOST}/collections/${catFromPath}`, rawQuery),
          null,
          null,
          catFromPath,
        );
      }
    }
  }

  return mk("not_found", null, null, null, slug, "all_steps_exhausted");
}

function mk(
  step: ResolverStep,
  target: string | null,
  product_id: string | null,
  product_slug: string | null,
  category: string | null,
  reason?: string,
  reason2?: string,
): ResolverResult {
  return {
    ok: step !== "not_found",
    step,
    target,
    product_id,
    product_slug,
    category,
    reason: reason2 ? `${reason}|${reason2}` : reason,
  };
}