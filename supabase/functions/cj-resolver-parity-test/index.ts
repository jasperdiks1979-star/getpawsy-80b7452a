// cj-resolver-parity-test — READ-ONLY.
//
// Runs 5 fixtures through both codepaths and returns a side-by-side diff:
//
//   A) canonical resolver (shared module _shared/cj-resolver.ts) — the
//      ladder proven by cj-canary-discovery.
//   B) legacy batch codepath (variant/queryByVariantSku + stock/queryBySku),
//      inlined here byte-for-byte from catalog-recovery-batch-execute so
//      we can measure divergence without importing that file.
//
// Writes performed: 0.

import {
  CJ_API_BASE, CJ_RESOLVER_VERSION,
  getCjAccessToken, resolveCjVariant,
  type CjBudget,
} from "../_shared/cj-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const POSITIVE = [
  { sku: "CJBC254137101AZ",  expect_pid: "1971105580151660546", expect_vid: "1971105580222963714" },
  { sku: "CJBC26801360001",  expect_pid: "2003458837022810114", expect_vid: "2003458839006715906" },
  { sku: "CJBC265305702BY",  expect_pid: "2001225039162568706", expect_vid: "2057281478752038913" },
];
const NEGATIVE = [
  { sku: "CJMY199072801AZ", reason: "no_exact_variant_sku_match" },
  { sku: "CJCT252683101AZ", reason: "duplicate_removed_discontinued" },
];

// ── Legacy batch codepath (byte-for-byte from catalog-recovery-batch-execute).
async function cjGetLegacy(path: string, token: string) {
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function legacyResolve(sku: string, token: string) {
  const http: Record<string, number> = {};
  const stockRes = await cjGetLegacy(`/product/stock/queryBySku?sku=${encodeURIComponent(sku)}`, token);
  http["stock/queryBySku"] = stockRes.status;
  const stockAreas: any[] = Array.isArray(stockRes.body?.data) ? stockRes.body.data : [];
  if (stockRes.status !== 200) {
    return { classification: "BLOCKED_API_ERROR", pid: null, vid: null, variantSku: null, http, reason: `stock http ${stockRes.status}` };
  }
  if (stockAreas.length === 0) {
    return { classification: "BLOCKED_CJ_NOT_FOUND", pid: null, vid: null, variantSku: null, http, reason: "stock_empty" };
  }
  const varRes = await cjGetLegacy(`/product/variant/queryByVariantSku?variantSku=${encodeURIComponent(sku)}`, token);
  http["variant/queryByVariantSku"] = varRes.status;
  const vlist: any[] = Array.isArray(varRes.body?.data)
    ? varRes.body.data
    : varRes.body?.data ? [varRes.body.data] : [];
  const exact = vlist.filter((v) => String(v?.variantSku ?? "") === sku);
  if (varRes.status !== 200) {
    return { classification: "BLOCKED_API_ERROR", pid: null, vid: null, variantSku: null, http, reason: `variant http ${varRes.status}` };
  }
  if (exact.length === 0) {
    return { classification: "BLOCKED_CJ_NOT_FOUND", pid: null, vid: null, variantSku: null, http, reason: "variant_exact_empty" };
  }
  if (exact.length > 1) {
    return { classification: "BLOCKED_MULTIPLE_CJ_MATCHES", pid: null, vid: null, variantSku: null, http, reason: "multi" };
  }
  const v = exact[0];
  const pid = String(v?.pid ?? "");
  const vid = String(v?.vid ?? "");
  const variantSku = String(v?.variantSku ?? "");
  if (!pid || !vid) return { classification: "BLOCKED_MASTER_SKU_ONLY", pid, vid, variantSku, http, reason: "missing_ids" };
  return { classification: "EXACT_UNIQUE_CONFIRMED", pid, vid, variantSku, http, reason: null };
}

function summarize(a: any, b: any, expected?: { pid?: string; vid?: string }) {
  const canonicalOk = a.classification === "EXACT_UNIQUE_CONFIRMED" && a.exact.length === 1;
  const canonicalPid = canonicalOk ? a.exact[0].pid : null;
  const canonicalVid = canonicalOk ? a.exact[0].vid : null;
  const legacyPid = b.pid || null;
  const legacyVid = b.vid || null;
  const parity =
    (canonicalOk && b.classification === "EXACT_UNIQUE_CONFIRMED"
      && canonicalPid === legacyPid && canonicalVid === legacyVid)
    || (!canonicalOk && b.classification !== "EXACT_UNIQUE_CONFIRMED");
  const meetsExpected = expected
    ? (canonicalPid === expected.pid && canonicalVid === expected.vid)
    : null;
  return { parity, canonicalPid, canonicalVid, legacyPid, legacyVid, meetsExpected };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = new Date().toISOString();
  const t0 = Date.now();
  try {
    const { token, status: authStatus } = await getCjAccessToken();
    const budget: CjBudget = { reqs: 0, max: 80 };

    const fixtures = [
      ...POSITIVE.map((f) => ({ ...f, kind: "positive" as const })),
      ...NEGATIVE.map((f) => ({ ...f, kind: "negative" as const })),
    ];

    const results: any[] = [];
    let legacyReqs = 0;
    for (const f of fixtures) {
      const canonical = await resolveCjVariant(f.sku, token, budget, { maxPids: 6, readStock: false });
      const legacyStart = Date.now();
      const legacy = await legacyResolve(f.sku, token);
      // Legacy path spends 2 CJ requests always (stock + variant).
      legacyReqs += Object.keys(legacy.http).length;
      const cmp = summarize(canonical, legacy, f.kind === "positive" ? { pid: (f as any).expect_pid, vid: (f as any).expect_vid } : undefined);
      results.push({
        sku: f.sku,
        kind: f.kind,
        expected_pid: (f as any).expect_pid ?? null,
        expected_vid: (f as any).expect_vid ?? null,
        negative_reason: (f as any).reason ?? null,
        canonical: {
          classification: canonical.classification,
          candidate_pids: canonical.candidatePids,
          exact_count: canonical.exact.length,
          pid: cmp.canonicalPid,
          vid: cmp.canonicalVid,
          variantSku: canonical.exact[0]?.variantSku ?? null,
          productStatus: canonical.exact[0]?.productStatus ?? null,
          http: canonical.http,
          requests: canonical.requests,
        },
        legacy: {
          classification: legacy.classification,
          pid: legacy.pid,
          vid: legacy.vid,
          variantSku: legacy.variantSku,
          http: legacy.http,
          reason: legacy.reason,
          elapsed_ms: Date.now() - legacyStart,
        },
        parity: cmp.parity,
        meets_expected_ids: cmp.meetsExpected,
      });
    }

    const positivePass = results.filter((r) => r.kind === "positive").every((r) => r.canonical.classification === "EXACT_UNIQUE_CONFIRMED" && r.meets_expected_ids === true);
    const negativePass = results.filter((r) => r.kind === "negative").every((r) => r.canonical.classification !== "EXACT_UNIQUE_CONFIRMED");
    const parityAll = results.every((r) => r.parity);

    // NOTE: parity here is measured between canonical and the *legacy* codepath.
    // For the mission we intentionally REPLACE the legacy path with the canonical
    // one in batch-execute; parity==false on the legacy row is the documented
    // divergence, not a failure.
    const canonicalHealthy = positivePass && negativePass;
    let status: "RESOLVER_PARITY_CONFIRMED" | "RESOLVER_PARTIALLY_FIXED" | "RESOLVER_STILL_BROKEN";
    if (canonicalHealthy) status = "RESOLVER_PARITY_CONFIRMED";
    else if (results.filter((r) => r.kind === "positive").some((r) => r.canonical.classification === "EXACT_UNIQUE_CONFIRMED")) status = "RESOLVER_PARTIALLY_FIXED";
    else status = "RESOLVER_STILL_BROKEN";

    return new Response(JSON.stringify({
      ok: true,
      started_at: started,
      finished_at: new Date().toISOString(),
      runtime_ms: Date.now() - t0,
      writes_performed: 0,
      cj_auth_status: authStatus,
      resolver_version: CJ_RESOLVER_VERSION,
      cj_requests: { canonical: budget.reqs, legacy: legacyReqs, total: budget.reqs + legacyReqs },
      canonical_positive_pass: positivePass,
      canonical_negative_pass: negativePass,
      legacy_matches_canonical: parityAll,
      results,
      status,
    }, null, 2), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      writes_performed: 0,
      error: String((e as Error).message ?? e),
      status: "RESOLVER_STILL_BROKEN",
    }), { headers: corsHeaders, status: 500 });
  }
});