// Wave 2 — Products + Variants migration to Shopify.
//
// Contract:
// - Uses ONLY the client_credentials token provider (_shared/shopify-token-provider.ts).
//   Legacy SHOPIFY_ADMIN_ACCESS_TOKEN is not read.
// - Every created product is status = DRAFT. No publishing.
// - Excludes QA-STRIPE-TEST-001 by SKU.
// - Idempotent: skips products already recorded in shopify_id_map with status='created'.
// - Certified variant mapping from Wave 2a is applied verbatim.
// - Rate-limited: small sleep between calls to stay well under Admin GraphQL cost.
// - Every attempt logged to shopify_migration_audit_log (wave='W2', dry_run=false).
// - Failure classification: retryable (429/5xx/THROTTLED) vs permanent.
// - Chunked per invocation via ?limit=N so caller can drive full run.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const WAVE = "W2";
const EXCLUDED_SKUS = new Set(["QA-STRIPE-TEST-001"]);

const PRODUCT_SET_MUTATION = /* GraphQL */ `
  mutation Wave2ProductSet($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product {
        id
        handle
        status
        variants(first: 100) { nodes { id sku inventoryItem { id } } }
      }
      userErrors { field message code }
    }
  }
`;

interface DBProduct {
  id: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  weight: number | null;
  stock: number | null;
  brand: string | null;
  product_type: string | null;
  slug: string | null;
  variants: unknown;
}

function safeNum(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x.trim())) return Number(x);
  return null;
}

function buildProductSetInput(p: DBProduct): Record<string, unknown> {
  const rawVariants = Array.isArray(p.variants) ? (p.variants as Array<Record<string, unknown>>) : [];
  const productPrice = p.price ?? 0;
  const productWeight = p.weight ?? 0;
  const productStock = p.stock ?? 0;

  const optionName = rawVariants.length > 1 ? "Style" : "Title";

  const variantSpecs = rawVariants.length === 0
    ? [{
        sku: p.sku ?? undefined,
        price: String(productPrice),
        compareAtPrice: p.compare_at_price != null ? String(p.compare_at_price) : undefined,
        inventoryItem: { measurement: { weight: { value: productWeight, unit: "GRAMS" } }, tracked: true },
        inventoryPolicy: "DENY",
        inventoryQuantities: undefined,
        optionValues: [{ optionName, name: "Default Title" }],
        _inventoryQty: productStock,
      }]
    : rawVariants.map((v) => {
        const skuRaw = (v["variantSku"] ?? v["sku"] ?? p.sku) as string | null;
        const priceRaw = safeNum(v["variantSellPrice"]) ?? safeNum(v["price"]) ?? productPrice;
        const weightRaw = safeNum(v["variantWeight"]) ?? safeNum(v["weight"]) ?? productWeight;
        const invArr = Array.isArray(v["inventories"]) ? (v["inventories"] as Array<Record<string, unknown>>) : [];
        const invSum = invArr.reduce((s, i) => s + (safeNum(i["totalInventory"]) ?? 0), 0);
        const inventoryQty = invArr.length > 0
          ? invSum
          : (safeNum(v["inventoryNum"]) ?? safeNum(v["stock"]) ?? productStock);
        const optionValue = (v["variantNameEn"] ?? v["variantKey"] ?? v["name"] ?? v["color"] ?? v["size"] ?? "Default") as string;
        return {
          sku: skuRaw ?? undefined,
          price: String(priceRaw),
          compareAtPrice: p.compare_at_price != null ? String(p.compare_at_price) : undefined,
          inventoryItem: { measurement: { weight: { value: weightRaw, unit: "GRAMS" } }, tracked: true },
          inventoryPolicy: "DENY",
          optionValues: [{ optionName, name: String(optionValue).slice(0, 250) }],
          _inventoryQty: inventoryQty,
        };
      });

  // Strip helper fields not part of the Shopify schema.
  const cleanVariants = variantSpecs.map((v) => {
    const { _inventoryQty: _q, ...rest } = v as Record<string, unknown>;
    return rest;
  });

  return {
    title: p.name ?? "Untitled",
    handle: p.slug ?? undefined,
    vendor: p.brand ?? "GetPawsy",
    productType: p.product_type ?? "General",
    status: "DRAFT",
    productOptions: [{ name: optionName, values: cleanVariants.map((v) => ({ name: (v as any).optionValues[0].name })) }],
    variants: cleanVariants,
  };
}

function classifyError(status: number, errorText: string): "retryable" | "permanent" {
  if (status === 429 || status >= 500) return "retryable";
  if (/THROTTLED|throttled|rate.?limit/i.test(errorText)) return "retryable";
  return "permanent";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const started = Date.now();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 100);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Load already-migrated product IDs (idempotency).
  const { data: doneRows, error: doneErr } = await supabase
    .from("shopify_id_map")
    .select("source_id")
    .eq("source_type", "product")
    .eq("status", "created");
  if (doneErr) {
    return new Response(JSON.stringify({ ok: false, error: `id_map read failed: ${doneErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const done = new Set((doneRows ?? []).map((r) => r.source_id));

  // Load candidate active products.
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id,name,sku,price,compare_at_price,weight,stock,brand,product_type,slug,variants")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (pErr) {
    return new Response(JSON.stringify({ ok: false, error: `products read failed: ${pErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pending = (products ?? []).filter((p) =>
    !done.has(p.id) && !(p.sku && EXCLUDED_SKUS.has(p.sku))
  );

  const batch = pending.slice(0, limit);

  const stats = {
    products_created: 0,
    variants_created: 0,
    inventory_items_created: 0,
    failed_products: 0,
    failed_variants: 0,
    retryable_failures: 0,
    permanent_failures: 0,
    skipped_excluded: (products ?? []).filter((p) => p.sku && EXCLUDED_SKUS.has(p.sku)).length,
    already_done: done.size,
    pending_before: pending.length,
    processed_this_call: 0,
  };

  for (const p of batch) {
    const attemptStart = Date.now();
    const input = buildProductSetInput(p as DBProduct);
    let httpStatus = 0;
    let ok = false;
    let errorText: string | null = null;
    let shopifyGid: string | null = null;
    let variantCount = 0;
    let inventoryItemCount = 0;

    try {
      if (dryRun) {
        ok = true;
        shopifyGid = "gid://shopify/Product/DRYRUN";
        variantCount = (input.variants as unknown[]).length;
        inventoryItemCount = variantCount;
      } else {
        const res = await shopifyAdminFetch<{ productSet: {
          product: { id: string; variants: { nodes: Array<{ id: string; inventoryItem: { id: string } }> } } | null;
          userErrors: Array<{ field?: string[]; message: string; code?: string }>;
        } }>(PRODUCT_SET_MUTATION, { input });
        httpStatus = res.status;
        const userErrors = res.data?.productSet?.userErrors ?? [];
        if (res.status >= 200 && res.status < 300 && userErrors.length === 0 && res.data?.productSet?.product) {
          ok = true;
          shopifyGid = res.data.productSet.product.id;
          const nodes = res.data.productSet.product.variants.nodes ?? [];
          variantCount = nodes.length;
          inventoryItemCount = nodes.filter((n) => n?.inventoryItem?.id).length;
        } else {
          errorText = JSON.stringify({ status: res.status, userErrors, gqlErrors: (res as any).errors }).slice(0, 4000);
        }
      }
    } catch (e) {
      errorText = (e instanceof Error ? e.message : String(e)).slice(0, 4000);
    }

    const duration = Date.now() - attemptStart;

    if (ok && shopifyGid) {
      stats.products_created++;
      stats.variants_created += variantCount;
      stats.inventory_items_created += inventoryItemCount;

      await supabase.from("shopify_id_map").upsert({
        source_type: "product",
        source_id: p.id,
        source_handle: p.slug ?? null,
        shopify_gid: shopifyGid,
        wave: WAVE,
        status: "created",
        last_synced_at: new Date().toISOString(),
        metadata: { variant_count: variantCount },
      }, { onConflict: "source_type,source_id" });

      await supabase.from("shopify_migration_audit_log").insert({
        wave: WAVE, action: "productSet", entity_type: "product", entity_id: p.id,
        actor: "shopify-wave2-migrate", dry_run: dryRun,
        request_payload: { title: input.title, variant_count: (input.variants as unknown[]).length },
        response_payload: { shopify_gid: shopifyGid, variants: variantCount, inventory_items: inventoryItemCount },
        http_status: httpStatus, duration_ms: duration, ok: true, error: null,
      });
    } else {
      const cls = classifyError(httpStatus, errorText ?? "");
      stats.failed_products++;
      if (cls === "retryable") stats.retryable_failures++; else stats.permanent_failures++;
      stats.failed_variants += Array.isArray((p as DBProduct).variants) ? ((p as DBProduct).variants as unknown[]).length : 1;

      await supabase.from("shopify_id_map").upsert({
        source_type: "product",
        source_id: p.id,
        source_handle: p.slug ?? null,
        wave: WAVE,
        status: cls === "retryable" ? "retryable_failed" : "permanent_failed",
        last_synced_at: new Date().toISOString(),
        error: errorText,
      }, { onConflict: "source_type,source_id" });

      await supabase.from("shopify_migration_audit_log").insert({
        wave: WAVE, action: "productSet", entity_type: "product", entity_id: p.id,
        actor: "shopify-wave2-migrate", dry_run: dryRun,
        request_payload: { title: input.title, variant_count: (input.variants as unknown[]).length },
        response_payload: null,
        http_status: httpStatus, duration_ms: duration, ok: false, error: errorText,
      });

      // Stop the batch on the first authentication or permission failure — never mask.
      if (httpStatus === 401 || httpStatus === 403) {
        stats.processed_this_call++;
        return new Response(JSON.stringify({
          ok: false, halt: "auth_or_permission_error", stats,
          duration_ms: Date.now() - started,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    stats.processed_this_call++;

    // Gentle pacing — well under Admin GraphQL cost.
    await new Promise((r) => setTimeout(r, 120));
  }

  const remaining = pending.length - batch.length;
  return new Response(JSON.stringify({
    ok: true, wave: WAVE, has_more: remaining > 0, remaining,
    stats, duration_ms: Date.now() - started,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});