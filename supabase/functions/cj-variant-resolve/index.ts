// cj-variant-resolve — READ-ONLY multi-strategy CJ variant resolver.
// No writes to Shopify, CJ, or catalog tables (only shared cj_token_cache).
// Input: { sku: string, shopify_product_title?: string, shopify_variant_title?: string, debug?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STOPWORDS = new Set([
  "the","a","an","and","or","with","for","of","to","in","on","new","sale","hot","best",
  "usb","charging","rechargeable","white","black","red","blue","green","pink","gray","grey",
  "small","medium","large","xl","xxl","free","shipping","2024","2025","2026",
]);

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t) && t.length > 2);
}

async function getAccessToken(): Promise<{ token: string; auth_status: number }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cached } = await supabase
    .from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").single();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return { token: cached.access_token, auth_status: 200 };
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data?.result) throw new Error(`CJ auth failed status=${res.status} code=${data?.code}`);
  const expiry = new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 5 * 60 * 1000);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: expiry.toISOString(),
    updated_at: new Date().toISOString(),
  });
  return { token: data.data.accessToken, auth_status: res.status };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function cjGet(path: string, token: string) {
  // Retry once on 429 with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${CJ_API_BASE}${path}`, {
      headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 429 && body?.code !== 1600200) return { status: res.status, body };
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const sku: string = (body?.sku || "").trim();
    const productTitle: string = String(body?.shopify_product_title || "").trim();
    const variantTitle: string = String(body?.shopify_variant_title || "").trim();
    const debug: boolean = !!body?.debug;
    if (!sku) return json({ ok: false, error: "sku required" }, 400);

    const { token, auth_status } = await getAccessToken();
    const skuNorm = sku.trim().toLowerCase();
    const http_statuses: Record<string, number> = { auth: auth_status };
    const cj_codes: Record<string, unknown> = {};

    // --- Strategy A: direct variant/product query by SKU ---
    const q1 = await cjGet(`/product/query?productSku=${encodeURIComponent(sku)}`, token);
    http_statuses["product/query"] = q1.status;
    cj_codes["product/query"] = { code: q1.body?.code ?? null, message: q1.body?.message ?? null };

    const q2 = await cjGet(`/product/list?productSku=${encodeURIComponent(sku)}&pageNum=1&pageSize=50`, token);
    http_statuses["product/list?sku"] = q2.status;
    cj_codes["product/list?sku"] = { code: q2.body?.code ?? null, message: q2.body?.message ?? null };

    // Collect candidate pids from A.
    const candidatePids = new Set<string>();
    const addRow = (r: any) => {
      const pid = r?.pid ?? r?.productId;
      if (pid) candidatePids.add(String(pid));
    };
    if (q1.body?.data?.pid) addRow(q1.body.data);
    (q1.body?.data?.list ?? []).forEach(addRow);
    (q2.body?.data?.list ?? []).forEach(addRow);

    // --- Strategy B: broad title search ---
    const searches: string[] = [];
    if (productTitle) searches.push(productTitle);
    const toks = tokenize(`${productTitle} ${variantTitle}`);
    if (toks.length >= 3) searches.push(toks.slice(0, 4).join(" "));
    if (toks.length >= 2) searches.push(toks.slice(0, 3).join(" "));
    const uniqueSearches = Array.from(new Set(searches));
    const searchHits: Array<{ term: string; status: number; code: unknown; hits: number }> = [];
    for (const term of uniqueSearches) {
      const s = await cjGet(`/product/list?productNameEn=${encodeURIComponent(term)}&pageNum=1&pageSize=40`, token);
      http_statuses[`search:${term}`] = s.status;
      const rows: any[] = s.body?.data?.list ?? [];
      rows.forEach(addRow);
      searchHits.push({ term, status: s.status, code: s.body?.code ?? null, hits: rows.length });
    }
    cj_codes["broad_search"] = searchHits;

    // --- Strategy C: expand each candidate product → read variants → exact SKU match ---
    const exactMatches: Array<{
      pid: string; vid: string; productName: string | null; variantName: string | null;
      variantSku: string; variantAttrs: unknown;
    }> = [];
    const candidateVariantsChecked = { count: 0 };
    const candidatePidsList = Array.from(candidatePids).slice(0, 25); // cap
    const productReads: Array<{ pid: string; status: number; code: unknown; variants: number }> = [];

    for (const pid of candidatePidsList) {
      await sleep(700); // CJ product/query is rate-limited (~1 req/sec)
      const p = await cjGet(`/product/query?pid=${encodeURIComponent(pid)}`, token);
      http_statuses[`product/query:${pid}`] = p.status;
      const productData = p.body?.data;
      if (!productData) {
        productReads.push({ pid, status: p.status, code: p.body?.code ?? null, variants: 0 });
        continue;
      }
      const variants: any[] = Array.isArray(productData.variants) ? productData.variants : [];
      productReads.push({ pid, status: p.status, code: p.body?.code ?? null, variants: variants.length });
      for (const v of variants) {
        candidateVariantsChecked.count += 1;
        const vSku = String(v?.variantSku ?? "").trim();
        if (!vSku) continue;
        if (vSku.toLowerCase() === skuNorm) {
          exactMatches.push({
            pid: String(productData.pid ?? pid),
            vid: String(v?.vid ?? ""),
            productName: productData.productNameEn ?? productData.productName ?? null,
            variantName: v?.variantNameEn ?? v?.variantName ?? null,
            variantSku: vSku,
            variantAttrs: v ?? null,
          });
        }
      }
    }
    cj_codes["product_reads"] = productReads;

    // --- Match status ---
    let match_status: "exact_unique" | "exact_multiple" | "not_found" | "identity_mismatch" | "upstream_error";
    const anyUpstream200 =
      q1.status === 200 || q2.status === 200 || productReads.some((r) => r.status === 200);
    if (!anyUpstream200) {
      match_status = "upstream_error";
    } else if (exactMatches.length === 0) {
      match_status = "not_found";
    } else if (exactMatches.length > 1) {
      match_status = "exact_multiple";
    } else {
      match_status = "exact_unique";
    }

    // --- Semantic identity check (only when exact_unique) ---
    let semantic_match: "confirmed" | "probable" | "conflicting" | "insufficient_evidence" = "insufficient_evidence";
    let semantic_report: Record<string, unknown> = {};
    let stock_total = 0;
    let warehouses: any[] = [];

    if (match_status === "exact_unique") {
      const m = exactMatches[0];
      // Live stock read.
      const st = await cjGet(`/product/stock/queryBySku?sku=${encodeURIComponent(m.variantSku)}`, token);
      http_statuses["stock/queryBySku"] = st.status;
      cj_codes["stock/queryBySku"] = { code: st.body?.code ?? null, message: st.body?.message ?? null };
      const areas: any[] = Array.isArray(st.body?.data) ? st.body.data : [];
      warehouses = areas.map((a) => ({
        warehouse_id: String(a?.areaId ?? a?.countryCode ?? ""),
        warehouse_name: String(a?.areaEn ?? a?.countryNameEn ?? a?.countryCode ?? ""),
        country_code: a?.countryCode ?? null,
        stock: Number(a?.totalInventoryNum ?? 0),
      }));
      stock_total = warehouses.reduce((s, w) => s + (w.stock || 0), 0);

      const shopTok = new Set(tokenize(`${productTitle} ${variantTitle}`));
      const cjTok = new Set(tokenize(`${m.productName ?? ""} ${m.variantName ?? ""}`));
      const overlap = [...shopTok].filter((t) => cjTok.has(t));
      const missing = [...shopTok].filter((t) => !cjTok.has(t));
      const extra = [...cjTok].filter((t) => !shopTok.has(t));

      // Colour conflict test (variantTitle mentions colour; CJ variantName must not contradict).
      const COLORS = ["white","black","red","blue","green","pink","gray","grey","yellow","brown","orange","purple"];
      const shopColors = COLORS.filter((c) => variantTitle.toLowerCase().includes(c));
      const cjName = (m.variantName ?? "").toLowerCase();
      const cjColors = COLORS.filter((c) => cjName.includes(c));
      const colorConflict = shopColors.length > 0 && cjColors.length > 0 &&
        !shopColors.some((c) => cjColors.includes(c));

      const productReadOk = !!m.pid && !!m.vid;
      const stockOk = st.status === 200 && st.body?.result === true;
      const overlapRatio = shopTok.size ? overlap.length / shopTok.size : 0;

      semantic_report = {
        matched_tokens: overlap,
        missing_tokens: missing,
        extra_cj_tokens: extra,
        overlap_ratio: Number(overlapRatio.toFixed(3)),
        shopify_colors: shopColors,
        cj_colors: cjColors,
        color_conflict: colorConflict,
        product_read_ok: productReadOk,
        stock_read_ok: stockOk,
      };

      if (colorConflict) {
        semantic_match = "conflicting";
      } else if (productReadOk && stockOk && overlapRatio >= 0.6 && !colorConflict) {
        semantic_match = "confirmed";
      } else if (overlapRatio >= 0.4) {
        semantic_match = "probable";
      } else {
        semantic_match = "insufficient_evidence";
      }
    }

    const winner = match_status === "exact_unique" ? exactMatches[0] : null;

    return json({
      ok: true,
      environment: "live",
      auth_verified: auth_status === 200,
      input_sku: sku,
      match_status,
      semantic_match,
      candidate_products_checked: candidatePidsList.length,
      candidate_variants_checked: candidateVariantsChecked.count,
      cj_product_id: winner?.pid ?? null,
      cj_variant_id: winner?.vid ?? null,
      cj_product_name: winner?.productName ?? null,
      cj_variant_name: winner?.variantName ?? null,
      cj_variant_sku: winner?.variantSku ?? null,
      stock_total,
      warehouses,
      semantic_report,
      exact_match_count: exactMatches.length,
      search_terms: uniqueSearches,
      candidate_pids: candidatePidsList,
      http_statuses,
      cj_codes,
      elapsed_ms: Date.now() - started,
      writes_performed: 0,
      _debug: debug ? {
        q1_first: q1.body?.data,
        q2_first: (q2.body?.data?.list ?? []).slice(0, 3),
        exact_matches: exactMatches,
      } : undefined,
    });
  } catch (e) {
    return json({ ok: false, environment: "live", error: String(e).slice(0, 300), writes_performed: 0 }, 500);
  }
});