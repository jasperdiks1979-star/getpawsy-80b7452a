// Catalog Recovery Scan — walks Shopify Admin GraphQL and upserts
// one row per variant into public.catalog_recovery_index.
// Idempotent. Read-only against Shopify. Report-only SKU issue detection.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const QUERY = `
  query Variants($cursor: String) {
    productVariants(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          sku
          barcode
          title
          inventoryQuantity
          inventoryItem { id }
          product {
            id
            handle
            title
            vendor
            productType
          }
        }
      }
    }
  }`;

function stripGid(gid: string | null | undefined): string {
  if (!gid) return "";
  const p = gid.split("/");
  return p[p.length - 1] || gid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let cursor: string | null = null;
  let scanned = 0;
  const seenSkus = new Map<string, string[]>();
  const started = Date.now();
  const MAX_MS = 55_000;

  try {
    do {
      const { data, errors, status } = await shopifyAdminFetch<any>(QUERY, { cursor });
      if (status !== 200 || errors) {
        return new Response(JSON.stringify({ ok: false, status, errors }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const edges = data?.productVariants?.edges ?? [];
      const rows = edges.map((e: any) => {
        const n = e.node;
        const vid = stripGid(n.id);
        const pid = stripGid(n.product?.id);
        const iid = stripGid(n.inventoryItem?.id);
        const sku = (n.sku || "").trim() || null;
        if (sku) {
          const arr = seenSkus.get(sku) ?? [];
          arr.push(vid);
          seenSkus.set(sku, arr);
        }
        return {
          shopify_variant_id: vid,
          shopify_product_id: pid,
          inventory_item_id: iid || null,
          handle: n.product?.handle || null,
          sku,
          barcode: (n.barcode || "").trim() || null,
          vendor: n.product?.vendor || null,
          title: n.product?.title || null,
          variant_title: n.title || null,
          product_type: n.product?.productType || null,
          current_inventory: n.inventoryQuantity ?? null,
          last_seen: new Date().toISOString(),
        };
      });
      if (rows.length) {
        const { error } = await supabase
          .from("catalog_recovery_index")
          .upsert(rows, { onConflict: "shopify_variant_id" });
        if (error) throw error;
      }
      scanned += rows.length;
      const pi = data?.productVariants?.pageInfo;
      cursor = pi?.hasNextPage ? pi.endCursor : null;
      if (Date.now() - started > MAX_MS) break;
    } while (cursor);

    // SKU issues (report-only)
    const issues: any[] = [];
    const { data: all } = await supabase
      .from("catalog_recovery_index")
      .select("shopify_variant_id, sku, barcode");
    const skuMap = new Map<string, string[]>();
    (all ?? []).forEach((r: any) => {
      if (!r.sku) issues.push({ shopify_variant_id: r.shopify_variant_id, issue_type: "missing_sku", detail: {} });
      else {
        if (!/^[A-Za-z0-9\-_.]{2,64}$/.test(r.sku))
          issues.push({ shopify_variant_id: r.shopify_variant_id, issue_type: "malformed_sku", detail: { sku: r.sku } });
        const arr = skuMap.get(r.sku) ?? [];
        arr.push(r.shopify_variant_id);
        skuMap.set(r.sku, arr);
      }
      if (r.barcode && !/^[0-9]{8,14}$/.test(r.barcode))
        issues.push({ shopify_variant_id: r.shopify_variant_id, issue_type: "invalid_barcode", detail: { barcode: r.barcode } });
    });
    for (const [sku, vids] of skuMap) {
      if (vids.length > 1) for (const v of vids) issues.push({ shopify_variant_id: v, issue_type: "duplicate_sku", detail: { sku, count: vids.length } });
    }
    if (issues.length) {
      await supabase.from("catalog_recovery_sku_issues").upsert(issues, { onConflict: "shopify_variant_id,issue_type" });
    }

    // Seed pending batches (25/batch) for any variants without a mapping yet.
    const { data: unmapped } = await supabase.rpc("exec_sql" as never, {} as never).then(() => ({ data: null })).catch(() => ({ data: null }));
    const { count: totalVariants } = await supabase.from("catalog_recovery_index").select("*", { count: "exact", head: true });
    const { count: existingBatches } = await supabase.from("catalog_recovery_batches").select("*", { count: "exact", head: true }).eq("status", "pending");
    const desiredBatches = Math.ceil((totalVariants ?? 0) / 25);
    if ((existingBatches ?? 0) === 0 && desiredBatches > 0) {
      const batches = Array.from({ length: desiredBatches }, (_, i) => ({ cursor: i * 25, size: 25, status: "pending" }));
      // chunk insert
      for (let i = 0; i < batches.length; i += 200) {
        await supabase.from("catalog_recovery_batches").insert(batches.slice(i, i + 200));
      }
    }

    await supabase.from("catalog_recovery_events").insert({
      level: "info", event: "scan_complete",
      payload: { scanned, total_variants: totalVariants, sku_issues: issues.length, batches_seeded: desiredBatches },
    });

    return new Response(JSON.stringify({
      ok: true, scanned, total_variants: totalVariants, sku_issues: issues.length, batches_seeded: desiredBatches,
      truncated: cursor !== null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await supabase.from("catalog_recovery_events").insert({
      level: "error", event: "scan_failed", payload: { error: String(e) },
    });
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});