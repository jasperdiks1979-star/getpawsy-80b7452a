// cj-shopify-connect-scoped — SINGLE PRODUCT scoped CJ↔Shopify connection recovery.
//
// Targets EXACTLY one Shopify variant + one CJ variant. Refuses to operate on
// anything else. Supports three modes:
//   - "preflight"   READ-ONLY. Proves identity on both sides. No writes.
//   - "connect"     Writes ONLY the mapping row in catalog_recovery_mappings.
//                   Does NOT touch title/handle/description/images/SEO/vendor/
//                   price/compare-at/SKU/variant title/collections/status/publication.
//   - "verify"      READ-ONLY. Fresh independent Shopify + CJ reads for the
//                   Phase 4 read-back proof.
//
// No inventory writes. No product mutations. No publish. Draft is preserved.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";
import { getCjAccessToken, resolveCjVariant, type CjBudget, CJ_API_BASE } from "../_shared/cj-resolver.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ---- Hard-coded scope. Refuse any other target. -------------------------------
const TARGET = {
  shopifyProductId: "gid://shopify/Product/15889810194764",
  shopifySku: "CJFT268927601AZ",
  cjSku: "CJFT268927601AZ",
  expected: {
    handle: "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats",
    title: "Ailurova XL Stainless Steel Enclosed Cat Litter Box",
    vendor: "Ailurova",
    variantTitle: "Light Gray",
    status: "DRAFT",
  },
} as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function readShopifyScope() {
  const q = `query($id: ID!) {
    shop { id name myshopifyDomain primaryDomain { url host } }
    product(id: $id) {
      id status handle title vendor
      resourcePublicationsCount { count }
      seo { title description }
      media(first: 50) { nodes { id } }
      variants(first: 50) {
        nodes {
          id sku title price compareAtPrice inventoryPolicy inventoryQuantity
          inventoryItem {
            id tracked
            inventoryLevels(first: 25) {
              nodes {
                location { id name }
                quantities(names: ["available","on_hand"]) { name quantity }
              }
            }
          }
        }
      }
      collections(first: 25) { nodes { id handle title } }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: TARGET.shopifyProductId });
  return { http: r.status, errors: r.errors, shop: r.data?.shop ?? null, product: r.data?.product ?? null };
}

async function readCjScope() {
  const { token } = await getCjAccessToken();
  const budget: CjBudget = { reqs: 0, max: 6 };
  const res = await resolveCjVariant(TARGET.cjSku, token, budget, { readStock: true, maxPids: 3 });
  const exact = res.exact.find(e => e.variantSku === TARGET.cjSku) ?? res.exact[0] ?? null;
  return { classification: res.classification, exact, warehouses: res.warehouses, usStock: res.usStock, requests: res.requests };
}

function shopifyEvidence(product: any) {
  const v = product?.variants?.nodes?.[0] ?? null;
  const inv = v?.inventoryItem?.inventoryLevels?.nodes ?? [];
  const primary = inv[0] ?? null;
  return {
    productId: product?.id ?? null,
    variantId: v?.id ?? null,
    sku: v?.sku ?? null,
    variantTitle: v?.title ?? null,
    price: v?.price ?? null,
    compareAtPrice: v?.compareAtPrice ?? null,
    inventoryPolicy: v?.inventoryPolicy ?? null,
    inventoryQuantity: v?.inventoryQuantity ?? null,
    inventoryItemId: v?.inventoryItem?.id ?? null,
    inventoryTracked: v?.inventoryItem?.tracked ?? null,
    inventoryLocationId: primary?.location?.id ?? null,
    inventoryLocationName: primary?.location?.name ?? null,
    inventoryLevels: inv.map((l: any) => ({
      location: l.location?.name,
      quantities: l.quantities,
    })),
    handle: product?.handle ?? null,
    title: product?.title ?? null,
    vendor: product?.vendor ?? null,
    status: product?.status ?? null,
    mediaCount: product?.media?.nodes?.length ?? 0,
    publicationCount: product?.resourcePublicationsCount?.count ?? 0,
    collections: (product?.collections?.nodes ?? []).map((c: any) => c.handle),
    seo: product?.seo ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const mode = String(body?.mode ?? "preflight");

  // Refuse any override of the scope.
  if (body?.shopifyProductId && body.shopifyProductId !== TARGET.shopifyProductId)
    return new Response(JSON.stringify({ verdict: "BLOCKED_NO_MUTATION", reason: "scope override rejected" }), { status: 400, headers: cors });
  if (body?.cjSku && body.cjSku !== TARGET.cjSku)
    return new Response(JSON.stringify({ verdict: "BLOCKED_NO_MUTATION", reason: "cj sku override rejected" }), { status: 400, headers: cors });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { domain } = getShopifyConfig();

  try {
    if (mode === "preflight" || mode === "verify") {
      const [shop, cj] = await Promise.all([readShopifyScope(), readCjScope()]);
      const ev = shopifyEvidence(shop.product);
      const skuMatch = ev.sku === TARGET.shopifySku;
      const cjExact = cj.exact && cj.exact.variantSku === TARGET.cjSku;
      const { data: mapping } = await supabase
        .from("catalog_recovery_mappings")
        .select("*")
        .eq("shopify_variant_id", ev.variantId ?? "")
        .maybeSingle();

      const preflightOk =
        !!ev.productId && ev.productId === TARGET.shopifyProductId &&
        !!ev.variantId && skuMatch &&
        cj.classification === "EXACT_UNIQUE_CONFIRMED" && !!cjExact;

      const verdict =
        mode === "verify"
          ? (preflightOk && mapping && mapping.cj_pid === cj.exact?.pid && mapping.cj_vid === cj.exact?.vid
              ? "CONNECTED_AND_VERIFIED"
              : mapping ? "BLOCKED_NO_MUTATION" : "BLOCKED_NO_MUTATION")
          : (preflightOk ? "PREFLIGHT_OK" : "BLOCKED_NO_MUTATION");

      return new Response(JSON.stringify({
        mode,
        verdict,
        shopDomain: shop.shop?.myshopifyDomain ?? null,
        shopName: shop.shop?.name ?? null,
        shopify: ev,
        cj: {
          classification: cj.classification,
          pid: cj.exact?.pid ?? null,
          vid: cj.exact?.vid ?? null,
          variantSku: cj.exact?.variantSku ?? null,
          variantName: cj.exact?.variantName ?? null,
          productName: cj.exact?.productName ?? null,
          productStatus: cj.exact?.productStatus ?? null,
          usStock: cj.usStock,
          warehouses: cj.warehouses,
          requests: cj.requests,
        },
        mapping: mapping ?? null,
        checks: {
          shopifyProductIdMatch: ev.productId === TARGET.shopifyProductId,
          shopifySkuMatch: skuMatch,
          shopifyStatusIsDraft: ev.status === TARGET.expected.status,
          shopifyHandleMatch: ev.handle === TARGET.expected.handle,
          shopifyVendorMatch: ev.vendor === TARGET.expected.vendor,
          shopifyVariantTitleMatch: ev.variantTitle === TARGET.expected.variantTitle,
          shopifyPublicationCountZero: (ev.publicationCount ?? -1) === 0,
          cjExactUnique: cj.classification === "EXACT_UNIQUE_CONFIRMED",
          cjVariantSkuMatch: !!cjExact,
          mappingPresent: !!mapping,
          mappingMatchesCj: !!(mapping && cj.exact && mapping.cj_pid === cj.exact.pid && mapping.cj_vid === cj.exact.vid),
        },
        shopifyConfigDomain: domain,
      }, null, 2), { headers: cors });
    }

    if (mode === "connect") {
      // Require explicit confirmation phrase to write anything.
      if (body?.confirm !== "CONNECT_SCOPED_SINGLE_VARIANT") {
        return new Response(JSON.stringify({ verdict: "BLOCKED_NO_MUTATION", reason: "missing confirm phrase" }), { status: 400, headers: cors });
      }

      const [shop, cj] = await Promise.all([readShopifyScope(), readCjScope()]);
      const ev = shopifyEvidence(shop.product);
      const cjExact = cj.exact && cj.exact.variantSku === TARGET.cjSku;
      if (!(ev.productId === TARGET.shopifyProductId && ev.sku === TARGET.shopifySku &&
            cj.classification === "EXACT_UNIQUE_CONFIRMED" && cjExact)) {
        return new Response(JSON.stringify({ verdict: "BLOCKED_NO_MUTATION", reason: "preflight failed inside connect", shopify: ev, cj }), { status: 409, headers: cors });
      }

      // Upsert mapping ONLY. No Shopify writes.
      const row = {
        shopify_variant_id: ev.variantId!,
        shopify_product_id: ev.productId!,
        cj_pid: cj.exact!.pid,
        cj_vid: cj.exact!.vid,
        cj_sku: cj.exact!.variantSku,
        warehouse: cj.warehouses.find(w => (w.country_code ?? "").toUpperCase() === "US")?.warehouse_name ?? null,
        confidence: 1.0,
        method: "scoped-manual-recovery",
        evidence: {
          scope: "single-variant",
          reason: "manual scoped recovery ailurova xl light gray",
          cj_product_name: cj.exact!.productName,
          cj_variant_name: cj.exact!.variantName,
          us_stock_at_link: cj.usStock,
          shopify_status_at_link: ev.status,
          shopify_publication_count_at_link: ev.publicationCount,
        },
        updated_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabase
        .from("catalog_recovery_mappings")
        .upsert(row, { onConflict: "shopify_variant_id" });
      if (upErr) return new Response(JSON.stringify({ verdict: "CONNECTION_FAILED_ROLLED_BACK", error: upErr.message }), { status: 500, headers: cors });

      await supabase.from("catalog_recovery_events").insert({
        shopify_variant_id: ev.variantId,
        level: "info",
        event: "scoped_manual_connect",
        payload: { cj_pid: cj.exact!.pid, cj_vid: cj.exact!.vid, cj_sku: cj.exact!.variantSku, us_stock: cj.usStock },
      });

      return new Response(JSON.stringify({
        verdict: "CONNECTED_AND_VERIFIED",
        mapping: row,
        note: "Mapping row upserted. NO Shopify product/inventory/publication mutations were performed.",
      }, null, 2), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "unknown mode" }), { status: 400, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ verdict: "BLOCKED_NO_MUTATION", error: String((e as Error).message).slice(0, 500) }), { status: 500, headers: cors });
  }
});