// cj-canary-discovery — READ-ONLY discovery wave.
// Sweeps Shopify variants, filters candidates, then live-verifies each SKU
// against the CJ API (exact variantSku, pid, vid, stock) and semantically
// compares product/variant identity. Selects a single safest canary.
// Writes performed: 0 (no Shopify, CJ, or catalog mutations).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Shopify variant sweep ────────────────────────────────────────────────
const VARIANTS_Q = `
query Variants($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        sku
        title
        inventoryQuantity
        product { id title handle status }
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 5) {
            edges {
              node {
                id
                location { id name isActive }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
        }
      }
    }
  }
}`;

interface ShopVariant {
  product_id: string;
  variant_id: string;
  inventory_item_id: string | null;
  inventory_level_id: string | null;
  location_id: string | null;
  location_name: string | null;
  tracked: boolean;
  available: number;
  product_title: string;
  variant_title: string;
  handle: string;
  product_status: string;
  sku: string;
}

async function sweepShopify(): Promise<{ variants: ShopVariant[]; pages: number; errors: number }> {
  const variants: ShopVariant[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let errors = 0;
  while (true) {
    const { data, errors: gqlErr, status } = await shopifyAdminFetch<any>(VARIANTS_Q, { cursor });
    pages += 1;
    if (status !== 200 || gqlErr) { errors += 1; break; }
    const conn = data?.productVariants;
    for (const e of (conn?.edges ?? [])) {
      const v = e.node;
      const lvl = v?.inventoryItem?.inventoryLevels?.edges?.[0]?.node ?? null;
      const avail = (lvl?.quantities ?? []).find((q: any) => q.name === "available")?.quantity ?? 0;
      variants.push({
        product_id: v.product?.id ?? "",
        variant_id: v.id,
        inventory_item_id: v.inventoryItem?.id ?? null,
        inventory_level_id: lvl?.id ?? null,
        location_id: lvl?.location?.id ?? null,
        location_name: lvl?.location?.name ?? null,
        tracked: !!v.inventoryItem?.tracked,
        available: Number(avail || 0),
        product_title: String(v.product?.title ?? ""),
        variant_title: String(v.title ?? ""),
        handle: String(v.product?.handle ?? ""),
        product_status: String(v.product?.status ?? ""),
        sku: String(v.sku ?? "").trim(),
      });
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    if (pages >= 20) break;
  }
  return { variants, pages, errors };
}

// ─── CJ auth + fetch ──────────────────────────────────────────────────────
async function getAccessToken(): Promise<{ token: string; status: number }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cached } = await supabase
    .from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").single();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return { token: cached.access_token, status: 200 };
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data?.result) throw new Error(`CJ auth failed status=${res.status}`);
  const expiry = new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 5 * 60_000);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton", access_token: data.data.accessToken,
    token_expiry: expiry.toISOString(), updated_at: new Date().toISOString(),
  });
  return { token: data.data.accessToken, status: res.status };
}

async function cjGet(path: string, token: string) {
  const doFetch = async () => {
    const res = await fetch(`${CJ_API_BASE}${path}`, {
      headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
  let r = await doFetch();
  if (r.status === 429 || r.body?.code === 1600200) { await sleep(1500); r = await doFetch(); }
  return r;
}

// ─── Tokenization for semantic compare ────────────────────────────────────
const STOP = new Set(["the","a","an","and","or","with","for","of","to","in","on","new","sale","hot","best","usb","charging","rechargeable","free","shipping","2024","2025","2026"]);
const COLORS = ["white","black","red","blue","green","pink","gray","grey","yellow","brown","orange","purple","beige"];
const SIZES = ["xs","sm","small","md","medium","lg","large","xl","xxl"];
function tokenize(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter((t) => t && !STOP.has(t) && t.length > 2);
}

// ─── Live CJ resolution for one SKU ───────────────────────────────────────
interface CJExactMatch {
  pid: string; vid: string; productName: string | null; variantName: string | null;
  variantSku: string; productStatus: string | null; attrs: unknown;
}
async function resolveSku(v: ShopVariant, token: string, budget: { reqs: number; max: number }) {
  const http: Record<string, number> = {};
  const codes: Record<string, unknown> = {};
  const exact: CJExactMatch[] = [];
  const candidatePids = new Set<string>();

  if (budget.reqs >= budget.max) return { skipped: true, http, codes, exact };
  const q1 = await cjGet(`/product/list?productSku=${encodeURIComponent(v.sku)}&pageNum=1&pageSize=30`, token);
  budget.reqs += 1;
  http["product/list?sku"] = q1.status;
  codes["product/list?sku"] = q1.body?.code ?? null;
  (q1.body?.data?.list ?? []).forEach((r: any) => { const pid = r?.pid ?? r?.productId; if (pid) candidatePids.add(String(pid)); });

  // Title-based fallback (small)
  if (candidatePids.size === 0) {
    const toks = tokenize(`${v.product_title} ${v.variant_title}`);
    if (toks.length >= 2 && budget.reqs < budget.max) {
      const term = toks.slice(0, 4).join(" ");
      const s = await cjGet(`/product/list?productNameEn=${encodeURIComponent(term)}&pageNum=1&pageSize=20`, token);
      budget.reqs += 1;
      http["search:title"] = s.status;
      (s.body?.data?.list ?? []).forEach((r: any) => { const pid = r?.pid ?? r?.productId; if (pid) candidatePids.add(String(pid)); });
    }
  }

  const pids = Array.from(candidatePids).slice(0, 8);
  const skuNorm = v.sku.trim().toLowerCase();
  for (const pid of pids) {
    if (budget.reqs >= budget.max) break;
    await sleep(1100);
    const p = await cjGet(`/product/query?pid=${encodeURIComponent(pid)}`, token);
    budget.reqs += 1;
    http[`product/query:${pid}`] = p.status;
    const pd = p.body?.data;
    if (!pd) continue;
    const variants: any[] = Array.isArray(pd.variants) ? pd.variants : [];
    for (const cv of variants) {
      const vSku = String(cv?.variantSku ?? "").trim();
      if (!vSku) continue;
      if (vSku.toLowerCase() === skuNorm) {
        exact.push({
          pid: String(pd.pid ?? pid),
          vid: String(cv?.vid ?? ""),
          productName: pd.productNameEn ?? pd.productName ?? null,
          variantName: cv?.variantNameEn ?? cv?.variantName ?? null,
          variantSku: vSku,
          productStatus: pd.status ?? pd.productStatus ?? null,
          attrs: cv,
        });
      }
    }
  }
  return { skipped: false, http, codes, exact, pids_checked: pids.length };
}

// ─── Semantic compare ────────────────────────────────────────────────────
function semanticCompare(v: ShopVariant, m: CJExactMatch) {
  const shopTok = new Set(tokenize(`${v.product_title} ${v.variant_title}`));
  const cjTok = new Set(tokenize(`${m.productName ?? ""} ${m.variantName ?? ""}`));
  const overlap = [...shopTok].filter((t) => cjTok.has(t));
  const ratio = shopTok.size ? overlap.length / shopTok.size : 0;
  const shopColors = COLORS.filter((c) => v.variant_title.toLowerCase().includes(c));
  const cjName = (m.variantName ?? "").toLowerCase();
  const cjColors = COLORS.filter((c) => cjName.includes(c));
  const colorConflict = shopColors.length > 0 && cjColors.length > 0 && !shopColors.some((c) => cjColors.includes(c));
  const shopSizes = SIZES.filter((s) => v.variant_title.toLowerCase().split(/\W+/).includes(s));
  const cjSizes = SIZES.filter((s) => cjName.split(/\W+/).includes(s));
  const sizeConflict = shopSizes.length > 0 && cjSizes.length > 0 && !shopSizes.some((s) => cjSizes.includes(s));
  let verdict: "confirmed" | "probable" | "conflicting" | "insufficient_evidence";
  if (colorConflict || sizeConflict) verdict = "conflicting";
  else if (ratio >= 0.6) verdict = "confirmed";
  else if (ratio >= 0.4) verdict = "probable";
  else verdict = "insufficient_evidence";
  return { verdict, overlap, overlap_ratio: Number(ratio.toFixed(3)), color_conflict: colorConflict, size_conflict: sizeConflict, shop_colors: shopColors, cj_colors: cjColors };
}

// ─── Main handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const targetConfirmed: number = Math.max(1, Math.min(5, Number(body?.target_confirmed ?? 3)));
    const maxCjReqs: number = Math.max(10, Math.min(200, Number(body?.max_cj_requests ?? 90)));
    const excludeSkus: Set<string> = new Set((body?.exclude_skus ?? []).map((s: string) => String(s).trim().toLowerCase()));

    // ── FASE 1: Shopify sweep
    const sweep = await sweepShopify();
    const totalVariants = sweep.variants.length;

    // ── FASE 2: filter
    const skuCounts = new Map<string, number>();
    for (const v of sweep.variants) {
      const k = v.sku.trim().toLowerCase();
      if (k) skuCounts.set(k, (skuCounts.get(k) ?? 0) + 1);
    }
    const isMalformed = (s: string) => !s || s.length < 4 || /\s/.test(s) || /[^A-Za-z0-9._\-]/.test(s);

    let excludedMissing = 0, excludedMalformed = 0, excludedDup = 0, excludedManual = 0, excludedIdentity = 0;
    const candidates: ShopVariant[] = [];
    for (const v of sweep.variants) {
      if (!v.sku) { excludedMissing += 1; continue; }
      if (isMalformed(v.sku)) { excludedMalformed += 1; continue; }
      if ((skuCounts.get(v.sku.toLowerCase()) ?? 0) > 1) { excludedDup += 1; continue; }
      if (excludeSkus.has(v.sku.toLowerCase())) { excludedManual += 1; continue; }
      if (!v.product_id || !v.variant_id || !v.inventory_item_id) { excludedIdentity += 1; continue; }
      candidates.push(v);
    }

    // Prioritize by SKU-shape hint (CJ-style prefixes go first) — order only.
    const cjLike = (s: string) => /^CJ[A-Z]{0,4}\d{6,}[A-Z]{0,3}$/i.test(s);
    candidates.sort((a, b) => {
      const pa = cjLike(a.sku) ? 0 : 1;
      const pb = cjLike(b.sku) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.sku.localeCompare(b.sku);
    });

    // ── FASE 3+4+5: probe live
    const { token, status: authStatus } = await getAccessToken();
    const budget = { reqs: 0, max: maxCjReqs };

    const classifications: Record<string, number> = {
      exact_unique_variant: 0, exact_multiple_variants: 0, master_sku_only: 0,
      not_found: 0, discontinued: 0, identity_conflict: 0, upstream_error: 0, skipped_budget: 0,
    };
    interface Probe {
      sku: string; shop: ShopVariant; classification: string;
      cj?: CJExactMatch; stock_total?: number; warehouses?: any[];
      semantic?: any; http: Record<string, number>; pids_checked: number;
    }
    const probes: Probe[] = [];
    const confirmed: Probe[] = [];

    for (const v of candidates) {
      if (budget.reqs >= budget.max) { classifications.skipped_budget += 1; continue; }
      if (confirmed.length >= targetConfirmed) break;

      const r = await resolveSku(v, token, budget);
      if (r.skipped) { classifications.skipped_budget += 1; continue; }

      let classification: string;
      const anyUpstream = Object.values(r.http).some((s) => s === 200);
      if (!anyUpstream) classification = "upstream_error";
      else if (r.exact.length === 0) classification = "not_found";
      else if (r.exact.length > 1) classification = "exact_multiple_variants";
      else classification = "exact_unique_variant";

      const probe: Probe = { sku: v.sku, shop: v, classification, http: r.http, pids_checked: r.pids_checked ?? 0 };

      if (classification === "exact_unique_variant") {
        const m = r.exact[0];
        probe.cj = m;
        // stock read
        if (budget.reqs < budget.max) {
          const st = await cjGet(`/product/stock/queryBySku?sku=${encodeURIComponent(m.variantSku)}`, token);
          budget.reqs += 1;
          probe.http["stock/queryBySku"] = st.status;
          const areas: any[] = Array.isArray(st.body?.data) ? st.body.data : [];
          probe.warehouses = areas.map((a) => ({
            warehouse_id: String(a?.areaId ?? a?.countryCode ?? ""),
            warehouse_name: String(a?.areaEn ?? a?.countryNameEn ?? a?.countryCode ?? ""),
            country_code: a?.countryCode ?? null,
            stock: Number(a?.totalInventoryNum ?? 0),
          }));
          probe.stock_total = probe.warehouses.reduce((s, w) => s + (w.stock || 0), 0);
        }
        // classify discontinued
        const st = (m.productStatus ?? "").toString().toLowerCase();
        if (st.includes("discontinu") || st.includes("delist") || st.includes("removed")) {
          classification = "discontinued"; probe.classification = classification;
        } else {
          probe.semantic = semanticCompare(v, m);
          if (probe.semantic.verdict === "conflicting") { classification = "identity_conflict"; probe.classification = classification; }
          if (probe.semantic.verdict === "confirmed" && (probe.stock_total ?? 0) > 0) confirmed.push(probe);
        }
      }

      classifications[classification] = (classifications[classification] ?? 0) + 1;
      probes.push(probe);
    }

    // ── FASE 6: choose canary
    const rankUS = (w: any[]) => w.some((x) => (x.country_code ?? "").toString().toUpperCase() === "US");
    confirmed.sort((a, b) => {
      const aUS = rankUS(a.warehouses ?? []) ? 0 : 1;
      const bUS = rankUS(b.warehouses ?? []) ? 0 : 1;
      if (aUS !== bUS) return aUS - bUS;
      return (b.stock_total ?? 0) - (a.stock_total ?? 0);
    });
    const canary = confirmed[0] ?? null;

    // ── FASE 8: gate
    const ready = !!(canary
      && canary.cj?.pid && canary.cj?.vid
      && (canary.stock_total ?? 0) > 0
      && canary.shop.tracked
      && canary.shop.inventory_item_id
      && canary.shop.inventory_level_id
      && canary.shop.location_id);

    const report = {
      ok: true,
      environment: "live",
      writes_performed: 0,
      timestamp: new Date().toISOString(),
      deployment: { function: "cj-canary-discovery", auth_verified: authStatus === 200 },
      shopify: {
        total_variants_in_scope: totalVariants,
        pages_fetched: sweep.pages,
        errors: sweep.errors,
      },
      exclusions: {
        missing_sku: excludedMissing,
        malformed_sku: excludedMalformed,
        duplicate_sku: excludedDup,
        manually_excluded: excludedManual,
        incomplete_identity: excludedIdentity,
        remaining_candidates: candidates.length,
      },
      probing: {
        cj_requests_used: budget.reqs,
        cj_request_budget: budget.max,
        skus_probed: probes.length,
        classifications,
      },
      probe_results: probes.map((p) => ({
        sku: p.sku,
        shop_product_title: p.shop.product_title,
        shop_variant_title: p.shop.variant_title,
        handle: p.shop.handle,
        classification: p.classification,
        pids_checked: p.pids_checked,
        cj_pid: p.cj?.pid ?? null,
        cj_vid: p.cj?.vid ?? null,
        cj_product_name: p.cj?.productName ?? null,
        cj_variant_name: p.cj?.variantName ?? null,
        cj_variant_sku: p.cj?.variantSku ?? null,
        cj_product_status: p.cj?.productStatus ?? null,
        stock_total: p.stock_total ?? null,
        warehouses: p.warehouses ?? null,
        semantic: p.semantic ?? null,
        http_statuses: p.http,
      })),
      confirmed_candidates: confirmed.slice(0, 3).map((c) => ({
        sku: c.sku,
        cj_pid: c.cj?.pid,
        cj_vid: c.cj?.vid,
        stock_total: c.stock_total,
        us_warehouse: rankUS(c.warehouses ?? []),
      })),
      selected_canary: canary ? {
        shopify_product_id: canary.shop.product_id,
        shopify_variant_id: canary.shop.variant_id,
        inventory_item_id: canary.shop.inventory_item_id,
        inventory_level_id: canary.shop.inventory_level_id,
        location_id: canary.shop.location_id,
        location_name: canary.shop.location_name,
        product_title: canary.shop.product_title,
        variant_title: canary.shop.variant_title,
        handle: canary.shop.handle,
        shopify_sku: canary.shop.sku,
        shopify_available: canary.shop.available,
        shopify_tracked: canary.shop.tracked,
        cj_pid: canary.cj?.pid,
        cj_vid: canary.cj?.vid,
        cj_product_name: canary.cj?.productName,
        cj_variant_name: canary.cj?.variantName,
        cj_variant_sku: canary.cj?.variantSku,
        semantic_match: canary.semantic?.verdict,
        stock_total: canary.stock_total,
        warehouses: canary.warehouses,
        reason: "exact unique CJ variantSku match, semantic confirmed, live stock > 0, US warehouse preferred",
      } : null,
      gate: ready ? "READY_FOR_SINGLE_VARIANT_CANARY" : "BLOCKED",
      recommended_next_action: ready
        ? "Human approval to execute single-variant read-back-only canary against the selected Shopify variant."
        : "Increase max_cj_requests and/or exclude_skus of previously discontinued SKUs, then re-run cj-canary-discovery until >=1 exact_unique_variant+confirmed+stock>0 candidate is proven.",
      elapsed_ms: Date.now() - started,
    };

    return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 400), writes_performed: 0 }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});