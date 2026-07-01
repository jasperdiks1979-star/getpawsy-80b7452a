// PDP → ATC Drop-off Drilldown (Genesis V7.1)
// Reads existing PDP health + event logs and buckets sessions that viewed a
// PDP but never added to cart into concrete reason codes. Read-only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = Record<string, unknown>;

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireInternalOrAdmin(req);
  if (gate) return gate;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? "14")));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Sessions that viewed a PDP in window
  const { data: pdpEvents = [] } = await sb
    .from("canonical_events")
    .select("session_id, product_id, page_path, occurred_at")
    .eq("canonical_name", "CANONICAL_PRODUCT_VIEW")
    .gte("occurred_at", since)
    .limit(50_000);

  const { data: atcEvents = [] } = await sb
    .from("canonical_events")
    .select("session_id, product_id")
    .eq("canonical_name", "CANONICAL_ADD_TO_CART")
    .gte("occurred_at", since)
    .limit(50_000);

  const atcSessions = new Set((atcEvents as Row[]).map((r) => String(r.session_id ?? "")));
  const pdpSessions = new Set((pdpEvents as Row[]).map((r) => String(r.session_id ?? "")));
  const droppedSessions = new Set(
    Array.from(pdpSessions).filter((s) => s && !atcSessions.has(s)),
  );

  // product_id -> [session_ids] restricted to dropped sessions
  const productDropSessions = new Map<string, Set<string>>();
  for (const r of pdpEvents as Row[]) {
    const s = String(r.session_id ?? "");
    const p = String(r.product_id ?? "");
    if (!s || !p) continue;
    if (!droppedSessions.has(s)) continue;
    if (!productDropSessions.has(p)) productDropSessions.set(p, new Set());
    productDropSessions.get(p)!.add(s);
  }
  const droppedProductIds = Array.from(productDropSessions.keys());

  // 2. Out-of-stock — sum qty per product in product_global_inventory
  const oosProductIds = new Set<string>();
  if (droppedProductIds.length) {
    const { data: inv = [] } = await sb
      .from("product_global_inventory")
      .select("product_id, qty")
      .in("product_id", droppedProductIds);
    const totals = new Map<string, number>();
    for (const r of inv as Row[]) {
      const pid = String(r.product_id);
      totals.set(pid, (totals.get(pid) ?? 0) + Number(r.qty ?? 0));
    }
    for (const pid of droppedProductIds) {
      if ((totals.get(pid) ?? 0) <= 0) oosProductIds.add(pid);
    }
  }

  // 3. PDP audits — trust missing + price/shipping mismatch
  const trustMissingProducts = new Set<string>();
  const priceShippingProducts = new Set<string>();
  if (droppedProductIds.length) {
    const { data: audits = [] } = await sb
      .from("pdp_health_audits")
      .select("product_id, trust_score, reviews_score, issues, audited_at")
      .in("product_id", droppedProductIds)
      .order("audited_at", { ascending: false })
      .limit(5_000);
    const seen = new Set<string>();
    for (const r of audits as Row[]) {
      const pid = String(r.product_id);
      if (seen.has(pid)) continue; // keep latest
      seen.add(pid);
      const trust = Number(r.trust_score ?? 100);
      const reviews = Number(r.reviews_score ?? 100);
      if (trust < 60 || reviews < 40) trustMissingProducts.add(pid);
      const issuesText = JSON.stringify(r.issues ?? "").toLowerCase();
      if (/price|shipping|delivery|tax|fee/.test(issuesText)) priceShippingProducts.add(pid);
    }
  }

  const sessionsForProducts = (pids: Iterable<string>): Set<string> => {
    const out = new Set<string>();
    for (const pid of pids) {
      const s = productDropSessions.get(pid);
      if (!s) continue;
      for (const sid of s) out.add(sid);
    }
    return out;
  };

  // 4. JS / console errors on PDP paths within dropped sessions
  const jsErrorSessions = new Set<string>();
  const blockedAtcSessions = new Set<string>();
  const variantSessions = new Set<string>();
  {
    const { data: errs = [] } = await sb
      .from("frontend_error_logs")
      .select("session_id, component_name, error_message, page_url, created_at")
      .gte("created_at", since)
      .ilike("page_url", "%/product/%")
      .limit(20_000);
    for (const r of errs as Row[]) {
      const sid = String(r.session_id ?? "");
      if (!sid || !droppedSessions.has(sid)) continue;
      const comp = String(r.component_name ?? "").toLowerCase();
      const msg = String(r.error_message ?? "").toLowerCase();
      jsErrorSessions.add(sid);
      if (/addtocart|add[-_ ]?to[-_ ]?cart|atc/.test(comp + " " + msg)) blockedAtcSessions.add(sid);
      if (/variant|option|swatch|size|color/.test(msg)) variantSessions.add(sid);
    }
  }

  // 5. UX signals — variant not selected / atc blocked
  {
    const { data: signals = [] } = await sb
      .from("cro_ux_signals")
      .select("session_id, path, signal_type, payload, created_at")
      .gte("created_at", since)
      .ilike("path", "%/product/%")
      .limit(20_000);
    for (const r of signals as Row[]) {
      const sid = String(r.session_id ?? "");
      if (!sid || !droppedSessions.has(sid)) continue;
      const t = String(r.signal_type ?? "").toLowerCase();
      const payload = JSON.stringify(r.payload ?? "").toLowerCase();
      if (/variant|option_missing|no_variant/.test(t + " " + payload)) variantSessions.add(sid);
      if (/atc.*(block|fail|disabled)|cart.*(block|fail)/.test(t + " " + payload)) blockedAtcSessions.add(sid);
    }
  }

  const oosSessions = sessionsForProducts(oosProductIds);
  const trustSessions = sessionsForProducts(trustMissingProducts);
  const priceSessions = sessionsForProducts(priceShippingProducts);

  // Top offending products per reason
  const topByReason = (pids: Set<string>, n = 10) =>
    Array.from(pids)
      .map((pid) => ({ product_id: pid, dropped_sessions: productDropSessions.get(pid)?.size ?? 0 }))
      .sort((a, b) => b.dropped_sessions - a.dropped_sessions)
      .slice(0, n);

  const totalDropped = droppedSessions.size;
  const reasons = [
    { code: "OUT_OF_STOCK", label: "Out of stock",
      sessions: oosSessions.size, product_ids: Array.from(oosProductIds).slice(0, 25),
      top_products: topByReason(oosProductIds) },
    { code: "VARIANT_NOT_SELECTED", label: "Variant not selected",
      sessions: variantSessions.size, product_ids: [], top_products: [] },
    { code: "PRICE_SHIPPING_MISMATCH", label: "Price / shipping mismatch",
      sessions: priceSessions.size, product_ids: Array.from(priceShippingProducts).slice(0, 25),
      top_products: topByReason(priceShippingProducts) },
    { code: "TRUST_SIGNAL_MISSING", label: "Trust signals missing (reviews / badges)",
      sessions: trustSessions.size, product_ids: Array.from(trustMissingProducts).slice(0, 25),
      top_products: topByReason(trustMissingProducts) },
    { code: "JS_CONSOLE_ERRORS", label: "JS / console errors on PDP",
      sessions: jsErrorSessions.size, product_ids: [], top_products: [] },
    { code: "BLOCKED_ATC", label: "Blocked Add-to-Cart",
      sessions: blockedAtcSessions.size, product_ids: [], top_products: [] },
  ]
    .map((r) => ({
      ...r,
      share_pct: totalDropped ? Math.round((r.sessions / totalDropped) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // Sessions with NO diagnosed reason = residual "unknown"
  const diagnosed = new Set<string>([
    ...oosSessions, ...variantSessions, ...priceSessions,
    ...trustSessions, ...jsErrorSessions, ...blockedAtcSessions,
  ]);
  const unknown = Array.from(droppedSessions).filter((s) => !diagnosed.has(s)).length;
  reasons.push({
    code: "UNDIAGNOSED",
    label: "No signal captured (needs instrumentation)",
    sessions: unknown,
    product_ids: [],
    top_products: [],
    share_pct: totalDropped ? Math.round((unknown / totalDropped) * 1000) / 10 : 0,
  });

  const body = {
    ok: true,
    window_days: days,
    generated_at: new Date().toISOString(),
    totals: {
      pdp_sessions: pdpSessions.size,
      atc_sessions: atcSessions.size,
      dropped_sessions: totalDropped,
      drop_rate_pct: pdpSessions.size
        ? Math.round(((pdpSessions.size - atcSessions.size) / pdpSessions.size) * 1000) / 10
        : 0,
      diagnosed_sessions: diagnosed.size,
      undiagnosed_sessions: unknown,
      products_with_drops: droppedProductIds.length,
    },
    reasons,
    notes: [
      "Read-only. Sources: canonical_events, pdp_health_audits, product_global_inventory, frontend_error_logs, cro_ux_signals.",
      "Sessions can appear under multiple reason codes; share_pct will not sum to 100%.",
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});