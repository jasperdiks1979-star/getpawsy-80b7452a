// QA end-to-end purchase certification.
//
// Simulates a purchase for a given session_id and then verifies the
// event landed in every canonical dashboard source:
//   1. lp_funnel_events            (via runPostPaymentTracking)
//   2. visitor_activity            (via runPostPaymentTracking)
//   3. canonical_events            (direct insert, source_system='orders')
//   4. session_forensics VIEW      (via analytics_funnel_waterfall upsert)
//   5. session_journey_steps VIEW  (via analytics_funnel_waterfall upsert)
//   6. GA4 Measurement Protocol    (via sendGa4PurchaseMp)
//
// Every write is tagged `qa=true` / `source_system='orders'` with a
// deterministic `qa_e2e_...` stripe_session_id so the row is trivially
// excludable from clean KPIs. The endpoint is admin-only via the
// X-QA-Secret header (INTERNAL_FUNCTION_SECRET or QA_E2E_SECRET) so
// production traffic can never trigger it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runPostPaymentTracking, type PostPaymentContext } from "../_shared/post-payment-tracking.ts";
import { sendGa4PurchaseMp } from "../_shared/ga4-measurement-protocol.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL     = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const QA_SECRET    = Deno.env.get("QA_E2E_SECRET") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  // Auth: require the internal / QA shared secret.
  const auth = req.headers.get("x-qa-secret") ?? "";
  if (!auth || (auth !== INTERNAL && auth !== QA_SECRET)) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: {
    session_id?: string;
    visitor_id?: string | null;
    ga_client_id?: string | null;
    product?: { id?: string; name?: string; price?: number; quantity?: number };
    value?: number;
    currency?: string;
    country?: string | null;
  };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }

  const session_id = String(body.session_id ?? "").slice(0, 128);
  if (!session_id) return json(400, { ok: false, error: "session_id required" });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Deterministic QA identifiers so re-runs are idempotent per session.
  const runId = crypto.randomUUID();
  const stripe_session_id = `qa_e2e_${session_id.slice(0, 12)}_${Date.now()}`;
  const order_id = crypto.randomUUID();
  const value = Number(body.value ?? body.product?.price ?? 34.99);
  const currency = (body.currency ?? "USD").toUpperCase();
  const product = {
    id: body.product?.id ?? "qa-product-1",
    name: body.product?.name ?? "QA Certification Product",
    price: Number(body.product?.price ?? value),
    quantity: Number(body.product?.quantity ?? 1),
  };
  const nowIso = new Date().toISOString();

  const steps: Array<{ name: string; ok: boolean; detail?: unknown }> = [];

  // 1) Waterfall upsert — powers session_forensics + session_journey_steps.
  try {
    await sb.from("analytics_funnel_waterfall").upsert({
      session_id,
      visitor_id: body.visitor_id ?? null,
      purchase_at: nowIso,
      furthest_step: "purchase",
      last_step: "purchase",
      value,
      currency,
      product_id: product.id,
      product_name: product.name,
      updated_at: nowIso,
    }, { onConflict: "session_id" });
    steps.push({ name: "waterfall_upsert", ok: true });
  } catch (e) {
    steps.push({ name: "waterfall_upsert", ok: false, detail: String(e) });
  }

  // 2) canonical_events direct insert (source_system='orders', PURCHASE anchor = order_id).
  try {
    const dedup_key = ["orders", "CANONICAL_PURCHASE", order_id].join("|");
    const { error } = await sb.from("canonical_events").upsert({
      occurred_at: nowIso,
      canonical_name: "CANONICAL_PURCHASE",
      source_system: "orders",
      source_event_id: order_id,
      visitor_id: body.visitor_id ?? null,
      session_id,
      ga_client_id: body.ga_client_id ?? session_id,
      stripe_session_id,
      order_id,
      product_id: product.id,
      value_cents: Math.round(value * 100),
      currency,
      country: body.country ?? null,
      dedup_key,
      meta: { qa: true, run_id: runId, source: "qa-purchase-e2e" },
    }, { onConflict: "dedup_key", ignoreDuplicates: true });
    steps.push({ name: "canonical_events_insert", ok: !error, detail: error?.message });
  } catch (e) {
    steps.push({ name: "canonical_events_insert", ok: false, detail: String(e) });
  }

  // 3) Canonical mirrors — lp_funnel_events + visitor_activity.
  const ctx: PostPaymentContext = {
    orderId: order_id,
    stripeSessionId: stripe_session_id,
    stripePaymentIntentId: `pi_qa_${runId.slice(0, 8)}`,
    totalValue: value,
    currency,
    items: [{ id: product.id, name: product.name, price: product.price, quantity: product.quantity }],
    customerEmail: `qa+${runId.slice(0, 8)}@getpawsy.test`,
    customerName: "QA Certification",
    country: body.country ?? "US",
  };
  try {
    await runPostPaymentTracking(sb, ctx);
    steps.push({ name: "post_payment_tracking", ok: true });
  } catch (e) {
    steps.push({ name: "post_payment_tracking", ok: false, detail: String(e) });
  }

  // 4) GA4 Measurement Protocol mirror.
  let ga4Result: { ok: boolean; reason?: string; status?: number } = { ok: false, reason: "not_run" };
  try {
    ga4Result = await sendGa4PurchaseMp({
      clientId: body.ga_client_id ?? session_id,
      sessionId: session_id,
      orderId: order_id,
      value,
      currency,
      items: [{ id: product.id, name: product.name, price: product.price, quantity: product.quantity }],
    });
    steps.push({ name: "ga4_mp_purchase", ok: ga4Result.ok, detail: ga4Result });
  } catch (e) {
    steps.push({ name: "ga4_mp_purchase", ok: false, detail: String(e) });
  }

  // Give async mirrors and view materialization a moment to settle.
  await sleep(1500);

  // ── Verify every downstream source ────────────────────────────────
  const checks: Record<string, { present: boolean; row?: unknown; error?: string }> = {};

  async function verify(name: string, run: () => Promise<{ present: boolean; row?: unknown; error?: string }>) {
    try { checks[name] = await run(); }
    catch (e) { checks[name] = { present: false, error: String(e) }; }
  }

  await Promise.all([
    verify("lp_funnel_events", async () => {
      const { data, error } = await sb.from("lp_funnel_events")
        .select("id, event_name, value, idempotency_key")
        .eq("event_name", "purchase")
        .eq("idempotency_key", `purchase_${stripe_session_id}`)
        .maybeSingle();
      return { present: !!data?.id, row: data, error: error?.message };
    }),
    verify("visitor_activity", async () => {
      const { data, error } = await sb.from("visitor_activity")
        .select("id, activity_type, order_id, order_value")
        .eq("activity_type", "purchase")
        .eq("order_id", order_id)
        .limit(1).maybeSingle();
      return { present: !!data?.id, row: data, error: error?.message };
    }),
    verify("canonical_events", async () => {
      const { data, error } = await sb.from("canonical_events")
        .select("id, canonical_name, source_system, session_id, order_id")
        .eq("canonical_name", "CANONICAL_PURCHASE")
        .eq("order_id", order_id)
        .limit(1).maybeSingle();
      return { present: !!data?.id, row: data, error: error?.message };
    }),
    verify("session_forensics", async () => {
      const { data, error } = await sb.from("session_forensics")
        .select("session_id, purchased, purchase_at, exit_reason")
        .eq("session_id", session_id)
        .limit(1).maybeSingle();
      return { present: !!data?.purchased, row: data, error: error?.message };
    }),
    verify("session_journey_steps", async () => {
      const { data, error } = await sb.from("session_journey_steps")
        .select("session_id, step, ts")
        .eq("session_id", session_id)
        .eq("step", "purchase")
        .limit(1).maybeSingle();
      return { present: !!data?.session_id, row: data, error: error?.message };
    }),
  ]);

  checks["ga4_mirror"] = { present: ga4Result.ok, row: ga4Result };

  const requiredSources = [
    "lp_funnel_events",
    "visitor_activity",
    "canonical_events",
    "session_forensics",
    "session_journey_steps",
    "ga4_mirror",
  ] as const;

  const missing = requiredSources.filter((s) => !checks[s]?.present);
  const certification = missing.length === 0 ? "PASS" : "FAIL";

  return json(200, {
    ok: true,
    certification,
    missing,
    run_id: runId,
    session_id,
    order_id,
    stripe_session_id,
    value,
    currency,
    steps,
    checks,
    hint: certification === "FAIL"
      ? "Missing sources indicate a broken writer or view; inspect the `checks` entry for each."
      : "All six canonical sources contain the purchase event.",
  });
});
