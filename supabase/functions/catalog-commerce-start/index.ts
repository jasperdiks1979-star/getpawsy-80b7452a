// catalog-commerce-start — Step C Phase 1.
// Creates a Step C run, loads eligible items from Step B, performs preflight,
// and schedules the tick cron. NO Shopify mutations here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch, getShopifyConfig, getShopifyTokenMeta } from "../_shared/shopify-token-provider.ts";
import { CANONICAL_LOCATION_ID, getOnlineStorePublicationId } from "../_shared/commerce-helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOURCE_RUN = "stepB-1783921456385";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const runId = `stepC-${Date.now()}`;
  const { domain } = getShopifyConfig();

  // Preflight
  const preflight: any = { shop_domain: domain, source_run: SOURCE_RUN };
  try {
    const tokMeta = await getShopifyTokenMeta();
    preflight.auth = { ok: true, mode: tokMeta.authMode, expires_in_sec: tokMeta.expiresInSec };
  } catch (e) {
    preflight.auth = { ok: false, error: String((e as Error).message) };
  }

  const locQ = `{ locations(first: 25) { nodes { id name isActive fulfillsOnlineOrders } } }`;
  const locR = await shopifyAdminFetch<any>(locQ);
  const locations = locR.data?.locations?.nodes ?? [];
  const activeLoc = locations.filter((l: any) => l.isActive);
  const canonical = locations.find((l: any) => l.id === CANONICAL_LOCATION_ID);
  preflight.locations = {
    total_active: activeLoc.length,
    canonical_present: !!canonical,
    canonical_active: !!canonical?.isActive,
    canonical_fulfills_online: !!canonical?.fulfillsOnlineOrders,
  };

  const pubId = await getOnlineStorePublicationId();
  preflight.online_store_publication = { present: !!pubId, id: pubId };

  const themeQ = `{ themes(first: 20, roles: [MAIN]) { nodes { id name role } } }`;
  const themeR = await shopifyAdminFetch<any>(themeQ);
  preflight.published_theme = { count: themeR.data?.themes?.nodes?.length ?? 0 };

  // Load eligible variants from Step B
  const { data: eligible, error: eErr } = await supabase
    .from("catalog_classification_variants")
    .select("id, product_id, variant_id, inventory_item_id, location_id, sku, handle, cj_pid, cj_vid, cj_variant_sku, us_stock, proposed_target_available, future_activation_eligible, product_status")
    .eq("run_id", SOURCE_RUN)
    .eq("future_mutation_eligible", true)
    .eq("final_classification", "EXACT_UNIQUE_CONFIRMED");
  if (eErr) return new Response(JSON.stringify({ ok: false, error: eErr.message }), { headers: cors, status: 500 });

  // Strict gates
  const strict = (eligible ?? []).filter(v =>
    v.cj_pid && v.cj_vid && v.cj_variant_sku && v.sku === v.cj_variant_sku &&
    v.location_id === CANONICAL_LOCATION_ID && (v.us_stock ?? 0) > 5 &&
    (v.proposed_target_available ?? 0) > 0
  );
  const uniqueProducts = new Set(strict.filter(v => v.future_activation_eligible).map(v => v.product_id));
  preflight.eligibility = {
    variants_loaded: eligible?.length ?? 0,
    variants_pass_strict: strict.length,
    eligible_products: uniqueProducts.size,
  };

  const systemicOk = preflight.auth?.ok && preflight.locations.canonical_active && preflight.locations.canonical_fulfills_online && preflight.online_store_publication.present && strict.length > 0;

  // Wave assignment: 1..10 => wave1, 11..60 => wave2, rest => wave3
  // Sort by us_stock desc (safer highest-stock first)
  strict.sort((a, b) => (b.us_stock ?? 0) - (a.us_stock ?? 0));
  const items = strict.map((v, i) => ({
    run_id: runId,
    wave: i < 10 ? 1 : (i < 60 ? 2 : 3),
    product_id: v.product_id,
    variant_id: v.variant_id,
    inventory_item_id: v.inventory_item_id,
    location_id: v.location_id,
    sku: v.sku,
    cj_pid: v.cj_pid,
    cj_vid: v.cj_vid,
    cj_variant_sku: v.cj_variant_sku,
    target_on_hand: v.proposed_target_available,
    status: systemicOk ? "pending" : "blocked",
    block_reason: systemicOk ? null : "preflight_systemic",
    idempotency_key: `${runId}:${v.variant_id}`,
  }));

  // Create run
  await supabase.from("catalog_commerce_runs").insert({
    run_id: runId,
    source_run_id: SOURCE_RUN,
    shop_domain: domain,
    location_id: CANONICAL_LOCATION_ID,
    status: systemicOk ? "ready" : "blocked_systemic",
    phase: systemicOk ? "wave1" : "preflight_failed",
    current_wave: systemicOk ? 1 : 0,
    eligible_variants: strict.length,
    eligible_products: uniqueProducts.size,
    wave1_target: Math.min(10, strict.length),
    wave2_target: Math.max(0, Math.min(50, strict.length - 10)),
    wave3_target: Math.max(0, strict.length - 60),
    preflight,
    stop_reason: systemicOk ? null : "preflight_systemic",
  });
  if (items.length > 0) {
    // Insert in chunks of 200
    for (let i = 0; i < items.length; i += 200) {
      await supabase.from("catalog_commerce_items").insert(items.slice(i, i + 200));
    }
  }

  return new Response(JSON.stringify({ ok: true, run_id: runId, systemic_ok: systemicOk, preflight, eligible_variants: strict.length, eligible_products: uniqueProducts.size }), { headers: cors });
});