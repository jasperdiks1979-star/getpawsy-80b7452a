// CIE Orchestrator — runs the Conversion Integrity Engine cycle:
// 1. Snapshot hourly funnel + per-channel ratios
// 2. Compare cross-source revenue (Stripe / orders / GA4 / Pinterest / TikTok)
// 3. Compute per-metric confidence scores + gating
// 4. Persist an overall health snapshot
// 5. Open incidents for divergences > tolerance
//
// All write paths use the service role. JWT is validated in code; admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request): Promise<{ ok: boolean; userId?: string; status?: number; message?: string }> {
  // Internal cron / service-to-service bypass: signed with INTERNAL_FUNCTION_SECRET.
  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const cron = Deno.env.get("CIE_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (provided && ((internal && provided === internal) || (cron && provided === cron))) {
    return { ok: true, userId: "internal-cron" };
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, message: "missing bearer" };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return { ok: false, status: 401, message: "invalid jwt" };
  const { data: roles } = await admin()
    .from("user_roles").select("role").eq("user_id", u.user.id);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) return { ok: false, status: 403, message: "admin only" };
  return { ok: true, userId: u.user.id };
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 10000) / 100;
}

async function snapshotFunnel(c: ReturnType<typeof admin>, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const until = new Date().toISOString();

  // Pull lightweight step counts from existing waterfall when present.
  const { data: rows } = await c
    .from("analytics_funnel_waterfall")
    .select("step, channel")
    .gte("ts", since)
    .limit(50000);

  const byChannel = new Map<string, Record<string, number>>();
  for (const r of rows ?? []) {
    const ch = (r as any).channel || "unknown";
    const s = (r as any).step || "page_view";
    if (!byChannel.has(ch)) byChannel.set(ch, {});
    byChannel.get(ch)![s] = (byChannel.get(ch)![s] ?? 0) + 1;
  }

  const inserts: any[] = [];
  for (const [channel, steps] of byChannel) {
    const sessions = steps["page_view"] ?? 0;
    const product_views = steps["view_item"] ?? 0;
    const atc = steps["add_to_cart"] ?? 0;
    const checkout = steps["begin_checkout"] ?? 0;
    const payment = steps["payment"] ?? 0;
    const purchase = steps["purchase"] ?? 0;
    const cvr = sessions ? purchase / sessions : 0;
    const anomalies: string[] = [];
    if (atc > 0 && checkout === 0) anomalies.push("atc_without_checkout");
    if (checkout > 0 && payment === 0) anomalies.push("checkout_without_payment");
    if (sessions > 100 && product_views === 0) anomalies.push("no_product_views");
    inserts.push({
      window_start: since, window_end: until,
      channel, sessions, product_views,
      add_to_cart: atc, checkout, payment, purchase,
      cvr, anomalies,
    });
  }
  if (inserts.length) await c.from("cie_funnel_snapshots").insert(inserts);
  return inserts;
}

async function revenueTruth(c: ReturnType<typeof admin>, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const until = new Date().toISOString();

  const { data: orders } = await c
    .from("orders")
    .select("total_cents, currency, created_at, status")
    .gte("created_at", since);

  const orders_cents = (orders ?? [])
    .filter((o: any) => ["paid", "completed", "fulfilled"].includes(String(o.status ?? "").toLowerCase()))
    .reduce((s: number, o: any) => s + Number(o.total_cents ?? 0), 0);

  // Stripe / GA4 / Pinterest / TikTok sources are placeholders until each adapter
  // is wired — record 0 with status=pending so divergence is not falsely raised.
  const stripe_cents = orders_cents; // orders mirror Stripe in this build
  const ga4_cents = 0;
  const pinterest_cents = 0;
  const tiktok_cents = 0;
  const ledger_cents = orders_cents;

  const values = [stripe_cents, orders_cents, ledger_cents].filter((v) => v > 0);
  let max_div = 0;
  if (values.length >= 2) {
    const max = Math.max(...values), min = Math.min(...values);
    max_div = max ? ((max - min) / max) * 100 : 0;
  }
  const { data: s } = await c.from("cie_settings").select("revenue_divergence_tolerance_pct").limit(1).maybeSingle();
  const tol = Number(s?.revenue_divergence_tolerance_pct ?? 1);
  const status = max_div > tol ? "diverged" : (ga4_cents === 0 && pinterest_cents === 0 ? "partial" : "ok");

  await c.from("cie_revenue_truth").insert({
    window_start: since, window_end: until,
    stripe_cents, orders_cents, ga4_cents, pinterest_cents, tiktok_cents, ledger_cents,
    max_divergence_pct: max_div, status,
    details: { tolerance_pct: tol, adapters_pending: ["ga4", "pinterest", "tiktok"] },
  });

  if (status === "diverged") {
    await c.from("cie_incidents").insert({
      title: `Revenue divergence ${max_div.toFixed(2)}% > ${tol}%`,
      category: "revenue_truth", severity: "high",
      owner_engine: "cie",
      description: "Cross-source revenue mismatch over tolerance",
      evidence: { stripe_cents, orders_cents, ledger_cents, max_div },
    });
  }
  return { stripe_cents, orders_cents, ledger_cents, max_div, status };
}

async function confidence(c: ReturnType<typeof admin>) {
  // Compute confidence per surface from recent volume + adapter availability.
  const { count: evCount } = await c.from("cie_events").select("id", { count: "exact", head: true });
  const { count: sesCount } = await c.from("cie_sessions").select("id", { count: "exact", head: true });
  const baseTracking = Math.min(100, ((evCount ?? 0) > 50 ? 95 : (evCount ?? 0) * 1.8));
  const baseSessions = Math.min(100, ((sesCount ?? 0) > 20 ? 95 : (sesCount ?? 0) * 4));
  // Pull confidence rows the adapters wrote earlier in this cycle.
  const { data: adapterRows } = await c
    .from("cie_confidence_scores")
    .select("metric, confidence, rationale")
    .in("metric", ["ga4", "pinterest", "tiktok"])
    .eq("scope", "global");
  const adapter: Record<string, { c: number; r: string }> = {};
  for (const r of adapterRows ?? []) {
    adapter[(r as any).metric] = { c: Number((r as any).confidence ?? 0), r: String((r as any).rationale ?? "") };
  }
  const ga4Conf = adapter.ga4?.c ?? 0;
  const pinConf = adapter.pinterest?.c ?? 0;
  const ttConf = adapter.tiktok?.c ?? 0;
  const metrics = [
    { metric: "tracking", confidence: baseTracking, rationale: "event volume heuristic" },
    { metric: "sessions", confidence: baseSessions, rationale: "session volume heuristic" },
    { metric: "ga4", confidence: ga4Conf, rationale: ga4Conf > 0 ? (adapter.ga4?.r ?? "GA4 adapter live") : "GA4 adapter no data" },
    { metric: "pinterest", confidence: pinConf, rationale: pinConf > 0 ? (adapter.pinterest?.r ?? "Pinterest adapter live") : "Pinterest adapter no data" },
    { metric: "tiktok", confidence: ttConf, rationale: ttConf > 0 ? (adapter.tiktok?.r ?? "TikTok adapter live") : "TikTok adapter no data" },
    { metric: "revenue", confidence: 100, rationale: "internal orders are authoritative" },
    { metric: "checkout", confidence: baseTracking, rationale: "derived from event volume" },
    { metric: "purchase", confidence: 100, rationale: "internal orders are authoritative" },
  ];
  const { data: s } = await c.from("cie_settings").select("ai_training_min_confidence").limit(1).maybeSingle();
  const min = Number(s?.ai_training_min_confidence ?? 90);
  for (const m of metrics) {
    await c.from("cie_confidence_scores").upsert({
      metric: m.metric, scope: "global", confidence: m.confidence,
      gating_ok: m.confidence >= min, rationale: m.rationale,
      evaluated_at: new Date().toISOString(),
    }, { onConflict: "metric,scope" });
  }
  return metrics;
}

async function healthSnapshot(c: ReturnType<typeof admin>) {
  const { data: conf } = await c.from("cie_confidence_scores").select("metric, confidence");
  const lookup: Record<string, number> = {};
  for (const r of conf ?? []) lookup[(r as any).metric] = Number((r as any).confidence ?? 0);
  const overall = Math.round(
    Object.values(lookup).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(lookup).length)
  );
  await c.from("cie_health_snapshots").insert({
    overall,
    tracking: lookup.tracking ?? 0,
    revenue: lookup.revenue ?? 0,
    pixel: lookup.tracking ?? 0,
    ga4: lookup.ga4 ?? 0,
    pinterest: lookup.pinterest ?? 0,
    tiktok: lookup.tiktok ?? 0,
    meta: 0,
    checkout: lookup.checkout ?? 0,
    purchase: lookup.purchase ?? 0,
    details: lookup,
  });
  return { overall, ...lookup };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, message: auth.message }), {
      status: auth.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "cycle");
  const c = admin();
  const traceId = crypto.randomUUID();
  try {
    if (action === "cycle") {
      const funnel = await snapshotFunnel(c, body.hours ?? 24);
      const truth = await revenueTruth(c, body.hours ?? 24);
      // Refresh evidence from each channel adapter before computing confidence.
      const days = Math.max(1, Math.ceil((body.hours ?? 24) / 24));
      const callAdapter = async (fn: string) => {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
              Authorization: `Bearer ${SERVICE_ROLE}`,
            },
            body: JSON.stringify({ days }),
          });
          return await r.json();
        } catch (e) {
          return { ok: false, message: (e as Error).message };
        }
      };
      const [ga4, pinterest, tiktok] = await Promise.all([
        callAdapter("cie-ga4-adapter"),
        callAdapter("cie-pinterest-adapter"),
        callAdapter("cie-tiktok-adapter"),
      ]);
      const metrics = await confidence(c);
      const health = await healthSnapshot(c);
      // Auto-repair runs after confidence is recomputed so it uses fresh signals.
      const autorepair = await callAdapter("cie-auto-repair");
      return new Response(JSON.stringify({ ok: true, traceId, funnel, truth, ga4, pinterest, tiktok, metrics, health, autorepair }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "funnel") {
      return new Response(JSON.stringify({ ok: true, traceId, funnel: await snapshotFunnel(c, body.hours ?? 24) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "revenue") {
      return new Response(JSON.stringify({ ok: true, traceId, truth: await revenueTruth(c, body.hours ?? 24) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "confidence") {
      const metrics = await confidence(c);
      const health = await healthSnapshot(c);
      return new Response(JSON.stringify({ ok: true, traceId, metrics, health }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, traceId, message: `unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});