// Revenue Recovery — Funnel Validator
// Pulls real metrics from the database for the last 7d/30d and writes
// per-step status rows to public.rr_funnel_checks. NEVER reports a step
// "green" without evidence.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Status = "green" | "yellow" | "red" | "skip";
type Check = {
  step: string;
  status: Status;
  latency_ms?: number | null;
  evidence?: Record<string, unknown>;
  error_message?: string | null;
};

function judge(value: number, redBelow: number, yellowBelow: number): Status {
  if (value < redBelow) return "red";
  if (value < yellowBelow) return "yellow";
  return "green";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const run_id = crypto.randomUUID();
  const checks: Check[] = [];

  const sinceISO = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

  // 1. Visitors arriving — browsing rows in last 24h.
  {
    const t0 = Date.now();
    const { count, error } = await supabase
      .from("visitor_activity")
      .select("id", { count: "exact", head: true })
      .eq("activity_type", "browsing")
      .gte("created_at", sinceISO(1));
    checks.push({
      step: "visitor_arrival_24h",
      status: error ? "red" : judge(count ?? 0, 50, 200),
      latency_ms: Date.now() - t0,
      evidence: { browsing_rows_24h: count ?? 0 },
      error_message: error?.message ?? null,
    });
  }

  // 2. Product views — last 24h.
  let productViews24h = 0;
  {
    const t0 = Date.now();
    const { count, error } = await supabase
      .from("visitor_activity")
      .select("id", { count: "exact", head: true })
      .eq("activity_type", "product_view")
      .gte("created_at", sinceISO(1));
    productViews24h = count ?? 0;
    checks.push({
      step: "product_views_24h",
      status: error ? "red" : judge(productViews24h, 20, 100),
      latency_ms: Date.now() - t0,
      evidence: { rows: productViews24h },
      error_message: error?.message ?? null,
    });
  }

  // 3. Add to cart — last 24h. Critical step.
  let atc24h = 0;
  {
    const t0 = Date.now();
    const { count, error } = await supabase
      .from("visitor_activity")
      .select("id", { count: "exact", head: true })
      // CartContext.tsx emits `activity_type='cart'`. ~10 other modules
      // (CRO dashboards, monitoring, AB tests, pricing intel, V2.1 scorer)
      // incorrectly query for 'add_to_cart' and report false 0s. The wire
      // value is 'cart'. Do NOT change the emitter — historical data is here.
      .in("activity_type", ["cart", "add_to_cart"])
      .gte("created_at", sinceISO(1));
    atc24h = count ?? 0;
    // ATC rate vs product views — red if <1%, yellow <4%.
    const rate = productViews24h > 0 ? (atc24h / productViews24h) * 100 : 0;
    checks.push({
      step: "add_to_cart_24h",
      status: error ? "red" : rate < 1 ? "red" : rate < 4 ? "yellow" : "green",
      latency_ms: Date.now() - t0,
      evidence: { rows: atc24h, product_views: productViews24h, atc_rate_pct: Number(rate.toFixed(2)) },
      error_message: error?.message ?? null,
    });
  }

  // 4. Begin checkout / view cart — last 24h.
  {
    const t0 = Date.now();
    const { count, error } = await supabase
      .from("visitor_activity")
      .select("id", { count: "exact", head: true })
      .in("activity_type", ["view_cart", "checkout"])
      .gte("created_at", sinceISO(1));
    checks.push({
      step: "begin_checkout_24h",
      status: error ? "red" : (count ?? 0) === 0 ? "red" : judge(count ?? 0, 1, 5),
      latency_ms: Date.now() - t0,
      evidence: { rows: count ?? 0 },
      error_message: error?.message ?? null,
    });
  }

  // 5. Stripe sessions / orders — paid vs expired last 14d.
  {
    const t0 = Date.now();
    const { data, error } = await supabase
      .from("orders")
      .select("status")
      .gte("created_at", sinceISO(14));
    const tally: Record<string, number> = {};
    (data ?? []).forEach((r: { status: string }) => { tally[r.status] = (tally[r.status] ?? 0) + 1; });
    const paid = tally["paid"] ?? 0;
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    const conv = total > 0 ? (paid / total) * 100 : 0;
    checks.push({
      step: "stripe_paid_orders_14d",
      status: error ? "red" : paid === 0 ? "red" : conv < 30 ? "yellow" : "green",
      latency_ms: Date.now() - t0,
      evidence: { tally, paid, total, paid_rate_pct: Number(conv.toFixed(1)) },
      error_message: error?.message ?? null,
    });
  }

  // 6. Pinterest CAPI outbox — sent vs failed last 7d.
  {
    const t0 = Date.now();
    const { data, error } = await supabase
      .from("pinterest_capi_outbox")
      .select("status, event_name")
      .gte("created_at", sinceISO(7));
    const tally: Record<string, number> = {};
    (data ?? []).forEach((r: { status: string }) => { tally[r.status] = (tally[r.status] ?? 0) + 1; });
    const sent = tally["sent"] ?? 0;
    const total = (data ?? []).length;
    checks.push({
      step: "pinterest_capi_7d",
      status: error ? "red" : total === 0 ? "red" : sent < total * 0.5 ? "red" : "green",
      latency_ms: Date.now() - t0,
      evidence: { tally, total },
      error_message: error?.message ?? null,
    });
  }

  // 7. Pinterest attribution sessions — last 7d.
  {
    const t0 = Date.now();
    const { count, error } = await supabase
      .from("pinterest_attribution_sessions")
      .select("id", { count: "exact", head: true })
      .gte("last_seen", sinceISO(7));
    checks.push({
      step: "pinterest_attribution_7d",
      status: error ? "red" : (count ?? 0) === 0 ? "red" : judge(count ?? 0, 10, 50),
      latency_ms: Date.now() - t0,
      evidence: { sessions: count ?? 0 },
      error_message: error?.message ?? null,
    });
  }

  // 8. Pinterest pin publishing — published in last 24h.
  {
    const t0 = Date.now();
    const { count, error } = await supabase
      .from("pinterest_pins")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceISO(1));
    checks.push({
      step: "pinterest_pins_published_24h",
      status: error ? "red" : (count ?? 0) === 0 ? "red" : judge(count ?? 0, 5, 20),
      latency_ms: Date.now() - t0,
      evidence: { pins: count ?? 0 },
      error_message: error?.message ?? null,
    });
  }

  // Persist all checks.
  const rows = checks.map((c) => ({
    run_id,
    step: c.step,
    status: c.status,
    latency_ms: c.latency_ms ?? null,
    evidence: c.evidence ?? {},
    error_message: c.error_message ?? null,
  }));
  const { error: insErr } = await supabase.from("rr_funnel_checks").insert(rows);

  const summary = {
    run_id,
    duration_ms: Date.now() - started,
    green: checks.filter((c) => c.status === "green").length,
    yellow: checks.filter((c) => c.status === "yellow").length,
    red: checks.filter((c) => c.status === "red").length,
    persisted: !insErr,
    persist_error: insErr?.message ?? null,
    checks,
  };
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});