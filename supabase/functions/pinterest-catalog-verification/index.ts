// GETPAWSY PINTEREST — POST-RECONNECT CATALOG VERIFICATION
// Read-only against the storefront / DB. The only Pinterest mutation allowed is
// POST /catalogs/feeds/{id}/ingest (explicitly authorized by the mission).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FEED_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-feed?format=xml";
const CAT_PERCH_SLUG = "wooden-door-mounted-cat-tree-wall-mounted-cat-tree";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function pf(url: string, headers: Record<string, string>, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin-only when called with a user token
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userSb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u } = await userSb.auth.getUser();
      if (!u?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const { data: role } = await userSb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!role) return json({ ok: false, traceId, message: "forbidden" }, 403);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const triggerIngest = body.trigger_ingestion !== false; // default on (mission-authorized)

    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token, scopes, account_name")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn?.access_token) return json({ ok: false, code: "no_connection" });

    const scopeList = (conn.scopes || "").split(/\s+/).filter(Boolean);
    const oauth = {
      account: conn.account_name,
      catalogs_read: scopeList.includes("catalogs:read"),
      catalogs_write: scopeList.includes("catalogs:write"),
      ads_read: scopeList.includes("ads:read"),
      ads_write: scopeList.includes("ads:write"),
    };

    const apiBase = await getPinterestApiBase(sb);
    const headers = { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" };

    // ---------- 2. CATALOGS / FEEDS ----------
    const feedsRes = await pf(`${apiBase}/catalogs/feeds?page_size=50`, headers);
    const feeds = Array.isArray(feedsRes.body?.items) ? feedsRes.body.items : [];
    const feed = feeds.find((f: any) => f.location === FEED_URL) || feeds[0] || null;

    let feedDetail: any = null;
    let processingResults: any[] = [];
    let ingestionTriggered = false;
    let ingestionId: string | null = null;
    let ingestionError: any = null;

    if (feed?.id) {
      const [fd, pr] = await Promise.all([
        pf(`${apiBase}/catalogs/feeds/${feed.id}`, headers),
        pf(`${apiBase}/catalogs/feeds/${feed.id}/processing_results?page_size=5`, headers),
      ]);
      feedDetail = fd.body;
      processingResults = Array.isArray(pr.body?.items) ? pr.body.items : [];

      // ---------- 3. TRIGGER FRESH INGESTION ----------
      if (triggerIngest) {
        const ing = await pf(`${apiBase}/catalogs/feeds/${feed.id}/ingest`, headers, { method: "POST" });
        if (ing.ok && ing.body?.id) {
          ingestionTriggered = true;
          ingestionId = ing.body.id;
        } else {
          ingestionTriggered = false;
          ingestionId = `trigger_failed:${ing.status}`;
          ingestionError = ing.body;
        }
      }
    }

    const latestPR = processingResults[0] || {};

    // ---------- EXPECTED PRODUCTS (generated feed) ----------
    const feedXmlRes = await fetch(FEED_URL);
    const feedXml = await feedXmlRes.text();
    const feedIds = [...feedXml.matchAll(/<g:id>([^<]+)<\/g:id>/g)].map((m) => m[1].trim());
    const feedLinkCount = [...feedXml.matchAll(/<link>/g)].length - 1; // minus channel link
    const feedImageCount = [...feedXml.matchAll(/<g:image_link>/g)].length;
    const uniqueIds = new Set(feedIds);

    // ---------- 4+5. CATALOG ITEMS LOOKUP (Cat Wall Perch + reconciliation) ----------
    // Resolve Cat Wall Perch product id from DB
    const { data: perch } = await sb
      .from("products_public")
      .select("id, name, slug, price, image_url")
      .eq("slug", CAT_PERCH_SLUG)
      .maybeSingle();

    async function catalogItemsLookup(itemIds: string[]) {
      // Primary: GET /catalogs/items with item_ids query param
      const getUrl = `${apiBase}/catalogs/items?country=US&language=en-US&item_ids=${encodeURIComponent(itemIds.join(","))}`;
      const r = await pf(getUrl, headers);
      if (r.status !== 405) return r;
      // Fallback: POST /catalogs/items with filters body
      return pf(`${apiBase}/catalogs/items?country=US&language=en-US`, headers, {
        method: "POST",
        body: JSON.stringify({ country: "US", language: "en-US", filters: { item_ids: itemIds, catalog_type: "RETAIL" } }),
      });
    }

    let perchResult: any = { found: false };
    if (perch?.id) {
      const r = await catalogItemsLookup([perch.id]);
      const items = Array.isArray(r.body?.items) ? r.body.items : [];
      const hit = items.find((i: any) => i.item_id === perch.id);
      if (hit) {
        const attrs = hit.attributes || {};
        perchResult = {
          found: true,
          item_id: hit.item_id,
          title: attrs.title || null,
          price: attrs.price ? String(attrs.price) : null,
          availability: attrs.availability || null,
          link: attrs.link || null,
          image: attrs.image_link || attrs.additional_image_link || null,
          status: hit.status || null,
          errors: hit.errors || [],
          searchable: !(hit.errors || []).length,
          expected: {
            price: Number(perch.price),
            slug: perch.slug,
          },
        };
      } else {
        perchResult = {
          found: false,
          lookup_status: r.status,
          lookup_error: r.ok ? "item not returned" : r.body,
          expected_item_id: perch.id,
        };
      }
    }

    // Reconciliation: batch lookup of every feed item id (100 per call)
    const foundSet = new Set<string>();
    const rejectedItems: any[] = [];
    const lookupErrors: any[] = [];
    const idList = [...uniqueIds];
    for (let i = 0; i < idList.length; i += 100) {
      const batch = idList.slice(i, i + 100);
      const r = await catalogItemsLookup(batch);
      if (!r.ok) {
        lookupErrors.push({ batch: i / 100, status: r.status, body: r.body });
        continue;
      }
      for (const it of (Array.isArray(r.body?.items) ? r.body.items : [])) {
        if (it.item_id) foundSet.add(it.item_id);
        if ((it.errors || []).length || (it.warnings || []).length) {
          rejectedItems.push({
            item_id: it.item_id,
            title: it.attributes?.title || null,
            errors: it.errors || [],
            warnings: it.warnings || [],
            status: it.status || null,
          });
        }
      }
      if (idList.length > 100) await new Promise((res) => setTimeout(res, 400));
    }

    const missing = idList.filter((id) => !foundSet.has(id));

    // ---------- 6. ITEM-LEVEL ISSUES from processing results ----------
    const asArr = (v: any): any[] => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v).flat() : [];
    const itemIssues: any[] = [];
    for (const pr of processingResults.slice(0, 3)) {
      const vd = pr.validation_details || {};
      for (const e of asArr(vd.errors)) itemIssues.push({ type: "error", ...(typeof e === "object" ? e : { message: String(e) }) });
      for (const w of asArr(vd.warnings)) itemIssues.push({ type: "warning", ...(typeof w === "object" ? w : { message: String(w) }) });
    }

    // ---------- 7. AD-READY TOP 10 ----------
    const foundIds = [...foundSet];
    const { data: products } = foundIds.length
      ? await sb
          .from("products_public")
          .select("id, name, slug, price, image_url, category, stock, is_active")
          .in("id", foundIds.slice(0, 1000))
      : { data: [] };
    const errorIds = new Set(rejectedItems.map((r) => r.item_id));
    const adReady = (products || [])
      .filter((p: any) =>
        p.is_active !== false &&
        (p.stock ?? 1) > 0 &&
        !errorIds.has(p.id) &&
        Number(p.price) <= 75 &&
        p.image_url && p.name
      )
      .sort((a: any, b: any) => Number(a.price) - Number(b.price))
      .slice(0, 10)
      .map((p: any) => ({
        item_id: p.id,
        title: p.name,
        price: Number(p.price),
        category: p.category,
        pdp: `https://getpawsy.pet/products/${p.slug}`,
        image: p.image_url,
      }));

    return json({
      ok: true,
      traceId,
      oauth,
      catalog: feed
        ? {
            catalog_id: feed.catalog_id || feedDetail?.catalog_id || null,
            data_source_id: feed.id,
            name: feed.name,
            default_country: feed.default_country,
            default_locale: feed.default_locale,
            status: feed.status,
            item_count: feed.item_count ?? null,
          }
        : null,
      latest_processing: {
        ingestion_id: latestPR.id || null,
        status: latestPR.status || null,
        created_at: latestPR.created_at || null,
        product_counts: latestPR.product_counts || null,
        video_counts: latestPR.video_counts || null,
      },
      ingestion_triggered: ingestionTriggered,
      ingestion_id: ingestionId,
      ingestion_error: ingestionError,
      cat_wall_perch: perchResult,
      reconciliation: {
        expected_products: feedIds.length,
        unique_feed_ids: uniqueIds.size,
        ingested_products: latestPR.product_counts?.original ?? null,
        findable_products: foundSet.size,
        missing_products: missing.length,
        missing_item_ids: missing.slice(0, 50),
        rejected_products: rejectedItems.length,
        rejected_items_detail: rejectedItems.slice(0, 20),
        duplicate_collisions: feedIds.length - uniqueIds.size,
        url_collisions: Math.max(0, feedIds.length - feedLinkCount),
        image_collisions: feedIds.length - feedImageCount,
        lookup_errors: lookupErrors,
      },
      item_issues: itemIssues.slice(0, 50),
      item_issues_total: itemIssues.length,
      raw_validation_details: processingResults[0]?.validation_details || null,
      raw_feed_record: feedDetail ? { item_count: feedDetail.item_count, catalog_id: feedDetail.catalog_id, preferred_processing_schedule: feedDetail.preferred_processing_schedule, credentials: undefined } : null,
      ad_ready_top10: adReady,
    });
  } catch (e: any) {
    console.error("[pinterest-catalog-verification]", traceId, e?.message);
    return json({ ok: false, traceId, message: e?.message || "error" }, 500);
  }
});
