import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DiversityGuard, normaliseCategoryKey, scoreVariety } from "../_shared/pinterest-diversity-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Hard blocklist of phrases that must never appear in any replacement draft.
const BANNED_PHRASES = [
  "stop scooping every day",
  "stop scooping so much",
  "see the setup",
  "shop the upgrade",
  "this changed everything for cat owners",
  "this changed everything for pet owners",
];

const POOL_CATEGORIES = ["cat_trees", "carriers", "dog_beds", "litter", "toys", "cat_essentials"] as const;
type PoolCategory = typeof POOL_CATEGORIES[number];

function inferCategoryFromSlug(slug: string | null | undefined, fallback?: string | null): PoolCategory {
  const norm = normaliseCategoryKey(fallback || "");
  if (POOL_CATEGORIES.includes(norm as PoolCategory)) return norm as PoolCategory;
  const s = (slug || "").toLowerCase();
  if (/litter|scoop/.test(s)) return "litter";
  if (/carrier|travel|stroller|car[-_]?seat/.test(s)) return "carriers";
  if (/dog.*bed|orthopedic|calming.*bed|sofa[-_]?bed/.test(s)) return "dog_beds";
  if (/tree|tower|condo|perch|cat.*scratch|scratcher|scratching|climb|cat.*furniture|cat.*enclosure/.test(s)) return "cat_trees";
  if (/toy|wand|ball|teaser|tunnel|chew/.test(s)) return "toys";
  if (/bed/.test(s)) return "dog_beds";
  return "cat_essentials";
}

function containsBanned(text: string): string | null {
  const t = (text || "").toLowerCase();
  for (const p of BANNED_PHRASES) if (t.includes(p)) return p;
  return null;
}

function pickFresh(guard: DiversityGuard, category: PoolCategory, type: "headline" | "cta" | "hook" | "angle" | "benefit"): string | null {
  const v = guard.pickFromPool(category, type);
  if (!v) return null;
  if (type === "headline" || type === "cta" || type === "hook") {
    if (containsBanned(v)) return null;
  }
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "300")));
  const dryRun = url.searchParams.get("dry") === "1";

  const guard = new DiversityGuard();
  await guard.load(supabase);

  // Pull pending replace rows
  const { data: queue, error: qErr } = await supabase
    .from("pinterest_live_pin_repair_queue")
    .select("id, pin_queue_id, pinterest_pin_id, product_slug, category_key, board_name, destination_link, overlay_text, pin_title, hook_group, severity, violation_types")
    .eq("recommended_action", "replace")
    .eq("status", "pending")
    .order("severity", { ascending: false })
    .limit(limit);

  if (qErr) {
    return new Response(JSON.stringify({ ok: false, error: qErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve products for the slugs we need
  const slugs = [...new Set((queue ?? []).map((r) => r.product_slug).filter(Boolean))];
  const { data: products } = await supabase
    .from("products")
    .select("id, slug, name, category")
    .in("slug", slugs);
  const productBySlug = new Map<string, any>();
  for (const p of products ?? []) productBySlug.set(p.slug, p);

  // Resolve board_id when possible
  const boards = [...new Set((queue ?? []).map((r) => r.board_name).filter(Boolean))];
  const { data: boardRows } = await supabase
    .from("pinterest_boards")
    .select("id, name")
    .in("name", boards.length ? boards : ["__none__"]);
  const boardIdByName = new Map<string, string>();
  for (const b of boardRows ?? []) {
    if (b.name && b.id) boardIdByName.set(b.name, b.id);
  }

  let drafted = 0;
  let skippedNoProduct = 0;
  let skippedPoolExhausted = 0;
  let skippedBanned = 0;
  const draftSamples: any[] = [];

  for (const row of queue ?? []) {
    const product = row.product_slug ? productBySlug.get(row.product_slug) : null;
    if (!product) { skippedNoProduct++; continue; }

    const category = inferCategoryFromSlug(row.product_slug, row.category_key || product.category);

    const headline = pickFresh(guard, category, "headline");
    const cta = pickFresh(guard, category, "cta");
    const hook = pickFresh(guard, category, "hook");
    const angle = pickFresh(guard, category, "angle");
    const benefit = pickFresh(guard, category, "benefit");

    if (!headline || !cta) { skippedPoolExhausted++; continue; }
    if (containsBanned(`${headline} ${cta} ${hook || ""}`)) { skippedBanned++; continue; }

    const candidate = { headline, cta, hook, angle, benefit };
    const evalRes = guard.evaluate(candidate, category);
    if (!evalRes.ok) { skippedPoolExhausted++; continue; }
    const final = evalRes.final;
    const variety = scoreVariety(guard, final);
    if (variety.total < 75) { skippedPoolExhausted++; continue; }

    const overlay = `${final.headline} • ${final.cta}`;
    const pinTitle = final.headline.slice(0, 100);
    const pinDescription = [final.headline, final.hook || final.angle || "", final.benefit || ""]
      .filter(Boolean).join(" — ").slice(0, 480);

    const insertRow = {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      pin_variant: "live_repair_replacement",
      pin_title: pinTitle,
      pin_description: pinDescription,
      destination_link: row.destination_link,
      board_name: row.board_name || "Smart Pet Gadgets",
      board_id: boardIdByName.get(row.board_name || "") || null,
      priority: "high",
      status: "draft",
      hook_group: final.hook || null,
      category_key: category,
      overlay_text: overlay,
      content_type: "product",
      qa_reasons: [],
      replacement_for_pin_id: row.pin_queue_id || null,
      repair_strategy: "live_pin_category_repair",
      meta: {
        live_repair: true,
        repair_queue_id: row.id,
        original_pinterest_pin_id: row.pinterest_pin_id,
        original_pin_title: row.pin_title,
        original_violations: row.violation_types,
        severity: row.severity,
        variety_score: variety.total,
        variety_parts: variety.parts,
        diversity_replaced_from_pool: evalRes.replacedFromPool,
        category,
        creative: { headline: final.headline, cta: final.cta, hook: final.hook, angle: final.angle, benefit: final.benefit },
      },
    };

    if (!dryRun) {
      const { data: ins, error: insErr } = await supabase
        .from("pinterest_pin_queue")
        .insert(insertRow)
        .select("id")
        .single();
      if (insErr) {
        return new Response(JSON.stringify({ ok: false, error: insErr.message, drafted }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase
        .from("pinterest_live_pin_repair_queue")
        .update({
          status: "replacement_drafted",
          details: { ...((row as any).details || {}), replacement_draft_id: ins!.id, replacement_category: category, replacement_variety_score: variety.total },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    guard.register(final, category);
    drafted++;
    if (draftSamples.length < 10) {
      draftSamples.push({ slug: product.slug, category, headline: final.headline, cta: final.cta, hook: final.hook, variety: variety.total });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    drafted,
    skippedNoProduct,
    skippedPoolExhausted,
    skippedBanned,
    processed: queue?.length ?? 0,
    dryRun,
    samples: draftSamples,
    snapshot: guard.snapshot(),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});