// Catalog Recovery Tick — drains ONE batch of 25 unmapped Shopify variants
// through the deterministic recovery ladder. NEVER calls AI. NEVER mutates
// Shopify products. Writes only:
//   - catalog_recovery_mappings (variant -> CJ ids + confidence + method)
//   - catalog_recovery_memory   (learned SKU / handle / supplier patterns)
//   - catalog_recovery_events   (forensic log)
// AI similarity fallback intentionally NOT implemented in this build — it
// requires an explicit AI-enable flag & credit-guard integration and would
// consume AI credits, which the mission caps hard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type IndexRow = {
  shopify_variant_id: string;
  shopify_product_id: string;
  handle: string | null;
  sku: string | null;
  vendor: string | null;
  title: string | null;
};

type Hit = {
  method: string;
  confidence: number;
  cj_pid: string | null;
  cj_vid: string | null;
  cj_sku: string | null;
  warehouse: string | null;
  evidence: Record<string, unknown>;
};

function pickHit(product: any, method: string, confidence: number, evidence: Record<string, unknown>): Hit | null {
  if (!product?.cj_product_id) return null;
  return {
    method, confidence,
    cj_pid: product.cj_product_id ?? null,
    cj_vid: product.cj_variant_id ?? null,
    cj_sku: product.sku ?? null,
    warehouse: product.supplier_warehouse ?? null,
    evidence,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Claim next pending batch (atomic-ish via update-returning).
  const { data: batchRow, error: batchErr } = await supabase
    .from("catalog_recovery_batches")
    .select("*")
    .in("status", ["pending", "paused_credits"])
    .order("cursor", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (batchErr) return json({ ok: false, error: batchErr.message }, 500);
  if (!batchRow) return json({ ok: true, done: true, message: "no pending batches" });

  await supabase.from("catalog_recovery_batches")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", batchRow.id);

  // 2. Load 25 unmapped variants from the index, offset by cursor.
  //    "Unmapped" = no row in catalog_recovery_mappings.
  const { data: mappedIds } = await supabase
    .from("catalog_recovery_mappings").select("shopify_variant_id");
  const mappedSet = new Set((mappedIds ?? []).map((r: any) => r.shopify_variant_id));

  const { data: allRows } = await supabase
    .from("catalog_recovery_index")
    .select("shopify_variant_id,shopify_product_id,handle,sku,vendor,title")
    .order("shopify_variant_id", { ascending: true });
  const unmapped: IndexRow[] = (allRows ?? []).filter((r: any) => !mappedSet.has(r.shopify_variant_id));
  const slice = unmapped.slice(0, batchRow.size ?? 25);

  // 3. Preload lookup tables ONCE.
  const [{ data: products }, { data: idMap }, { data: memory }] = await Promise.all([
    supabase.from("products")
      .select("id, slug, sku, cj_product_id, cj_variant_id, supplier_name, supplier_warehouse, name"),
    supabase.from("shopify_id_map")
      .select("source_type, source_id, source_handle, shopify_numeric_id, shopify_handle"),
    supabase.from("catalog_recovery_memory").select("*"),
  ]);

  const productsBySku = new Map<string, any>();
  const productsBySlug = new Map<string, any>();
  const productsById = new Map<string, any>();
  (products ?? []).forEach((p: any) => {
    if (p.sku) productsBySku.set(String(p.sku).trim().toLowerCase(), p);
    if (p.slug) productsBySlug.set(String(p.slug).trim().toLowerCase(), p);
    productsById.set(p.id, p);
  });

  const idMapByShopifyId = new Map<string, any>();
  const idMapByHandle = new Map<string, any>();
  (idMap ?? []).forEach((r: any) => {
    if (r.shopify_numeric_id) idMapByShopifyId.set(String(r.shopify_numeric_id), r);
    if (r.shopify_handle) idMapByHandle.set(String(r.shopify_handle).toLowerCase(), r);
  });

  const memBySkuPrefix = new Map<string, any>();
  (memory ?? []).forEach((m: any) => {
    if (m.pattern_type === "sku_prefix") memBySkuPrefix.set(m.pattern_key, m);
  });

  // 4. Deterministic ladder per variant.
  const stats: Record<string, number> = {
    processed: 0, hit_exact_sku: 0, hit_legacy_id: 0, hit_handle: 0,
    hit_slug: 0, hit_pattern: 0, unmatched: 0,
  };
  const events: any[] = [];
  const mappingsToInsert: any[] = [];
  const memoryUpserts = new Map<string, any>();

  for (const v of slice) {
    stats.processed++;
    let hit: Hit | null = null;
    const skuKey = v.sku ? v.sku.trim().toLowerCase() : "";

    // A. Exact SKU on products table.
    if (!hit && skuKey && productsBySku.has(skuKey)) {
      hit = pickHit(productsBySku.get(skuKey), "exact_sku", 100, { sku: v.sku });
      if (hit) stats.hit_exact_sku++;
    }

    // B. Shopify legacy id map by numeric product id.
    if (!hit) {
      const m = idMapByShopifyId.get(v.shopify_product_id);
      if (m?.source_type === "product" && m.source_id) {
        const p = productsById.get(m.source_id);
        if (p) {
          hit = pickHit(p, "legacy", 99, { source_id: m.source_id, source_type: m.source_type });
          if (hit) stats.hit_legacy_id++;
        }
      }
    }

    // C. Handle match through shopify_id_map.
    if (!hit && v.handle) {
      const m = idMapByHandle.get(v.handle.toLowerCase());
      if (m?.source_id) {
        const p = productsById.get(m.source_id);
        if (p) {
          hit = pickHit(p, "historical_import", 99, { handle: v.handle });
          if (hit) stats.hit_handle++;
        }
      }
    }

    // D. Handle == products.slug (direct).
    if (!hit && v.handle && productsBySlug.has(v.handle.toLowerCase())) {
      hit = pickHit(productsBySlug.get(v.handle.toLowerCase()), "variant_code", 98, { slug: v.handle });
      if (hit) stats.hit_slug++;
    }

    // E. Pattern propagation — SKU prefix memory.
    if (!hit && skuKey.length >= 4) {
      const prefix = skuKey.slice(0, 4);
      const mem = memBySkuPrefix.get(prefix);
      if (mem?.cj_hint?.cj_product_id) {
        const conf = Math.min(98, 80 + (mem.hit_count ?? 0));
        if (conf >= 98) {
          hit = {
            method: "pattern",
            confidence: conf,
            cj_pid: mem.cj_hint.cj_product_id,
            cj_vid: mem.cj_hint.cj_variant_id ?? null,
            cj_sku: null,
            warehouse: mem.cj_hint.warehouse ?? null,
            evidence: { sku_prefix: prefix, hits: mem.hit_count },
          };
          stats.hit_pattern++;
        }
      }
    }

    if (hit) {
      mappingsToInsert.push({
        shopify_variant_id: v.shopify_variant_id,
        shopify_product_id: v.shopify_product_id,
        cj_pid: hit.cj_pid, cj_vid: hit.cj_vid, cj_sku: hit.cj_sku,
        warehouse: hit.warehouse, confidence: hit.confidence,
        method: hit.method, evidence: hit.evidence,
      });
      // Learn: sku prefix -> cj_product_id
      if (skuKey.length >= 4 && hit.cj_pid) {
        const prefix = skuKey.slice(0, 4);
        const prev = memoryUpserts.get(`sku_prefix:${prefix}`) ?? memBySkuPrefix.get(prefix) ?? {
          pattern_type: "sku_prefix", pattern_key: prefix, cj_hint: {}, hit_count: 0,
        };
        prev.cj_hint = { cj_product_id: hit.cj_pid, cj_variant_id: hit.cj_vid, warehouse: hit.warehouse };
        prev.hit_count = (prev.hit_count ?? 0) + 1;
        prev.last_used = new Date().toISOString();
        memoryUpserts.set(`sku_prefix:${prefix}`, prev);
      }
      events.push({
        batch_id: batchRow.id, shopify_variant_id: v.shopify_variant_id,
        level: "info", event: "mapped", payload: { method: hit.method, confidence: hit.confidence },
      });
    } else {
      stats.unmatched++;
      events.push({
        batch_id: batchRow.id, shopify_variant_id: v.shopify_variant_id,
        level: "warn", event: "unmatched", payload: { sku: v.sku, handle: v.handle },
      });
    }
  }

  // 5. Persist.
  if (mappingsToInsert.length) {
    await supabase.from("catalog_recovery_mappings").upsert(mappingsToInsert, { onConflict: "shopify_variant_id" });
  }
  if (memoryUpserts.size) {
    await supabase.from("catalog_recovery_memory")
      .upsert(Array.from(memoryUpserts.values()), { onConflict: "pattern_type,pattern_key" });
  }
  if (events.length) await supabase.from("catalog_recovery_events").insert(events);

  await supabase.from("catalog_recovery_batches")
    .update({ status: "done", finished_at: new Date().toISOString(), stats })
    .eq("id", batchRow.id);

  return json({ ok: true, batch_id: batchRow.id, stats, remaining_unmapped: Math.max(0, unmapped.length - slice.length) });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}