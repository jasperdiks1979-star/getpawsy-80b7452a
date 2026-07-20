// AGD — Autonomous Growth Director (Phase 1 orchestrator)
// Hourly loop: Observe -> Analyze -> Reason -> Prioritize -> Predict -> (Experiment) -> Measure -> Learn
// Safety: never executes destructive changes; only records decisions, opportunities, hypotheses, briefings.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

type StepResult = { step: string; status: "ok" | "error" | "skipped"; details: Record<string, unknown>; error?: string };

async function runStep<T extends Record<string, unknown>>(
  db: ReturnType<typeof admin>,
  runId: string,
  step: string,
  fn: () => Promise<T>,
): Promise<StepResult> {
  const startedAt = new Date().toISOString();
  try {
    const details = await fn();
    await db.from("agd_run_steps").insert({
      run_id: runId,
      step,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      status: "ok",
      details,
    });
    return { step, status: "ok", details };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("agd_run_steps").insert({
      run_id: runId,
      step,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      status: "error",
      details: {},
      error: message,
    });
    return { step, status: "error", details: {}, error: message };
  }
}

async function observe(db: ReturnType<typeof admin>): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const out: Record<string, unknown> = {};

  // Pinterest daily analytics (sum last 24h)
  const { data: pin } = await db
    .from("pinterest_analytics_daily")
    .select("impressions, clicks, saves, outbound_clicks, created_at")
    .gte("created_at", since);
  const sum = (rows: any[] | null, k: string) =>
    (rows ?? []).reduce((a, r) => a + Number(r?.[k] ?? 0), 0);
  out.pinterest = {
    impressions: sum(pin, "impressions"),
    clicks: sum(pin, "clicks"),
    saves: sum(pin, "saves"),
    outbound: sum(pin, "outbound_clicks"),
  };

  // Orders last 24h
  const { data: orders } = await db
    .from("orders")
    .select("amount_total, currency, status, created_at")
    .gte("created_at", since);
  const paid = (orders ?? []).filter((o: any) =>
    ["paid", "complete", "succeeded", "completed"].includes(String(o?.status ?? "").toLowerCase()),
  );
  out.orders = {
    count: paid.length,
    revenue_cents: paid.reduce((a: number, o: any) => a + Number(o?.amount_total ?? 0), 0),
  };

  // Checkout funnel last 24h
  const { data: funnel } = await db
    .from("checkout_funnel_events")
    .select("event_name, created_at")
    .gte("created_at", since);
  const byEvent: Record<string, number> = {};
  for (const r of funnel ?? []) byEvent[String((r as any).event_name)] = (byEvent[String((r as any).event_name)] ?? 0) + 1;
  out.funnel = byEvent;

  // Inventory bottleneck
  const { count: oosCount } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("in_stock", false);
  out.inventory = { out_of_stock: oosCount ?? 0 };

  // Persist as signals
  const now = new Date().toISOString();
  const signals: any[] = [];
  for (const [src, payload] of Object.entries(out)) {
    if (payload && typeof payload === "object") {
      for (const [metric, value] of Object.entries(payload as Record<string, unknown>)) {
        signals.push({
          observed_at: now,
          source: src,
          metric,
          value: typeof value === "number" ? value : null,
          value_text: typeof value === "number" ? null : JSON.stringify(value),
        });
      }
    }
  }
  if (signals.length) await db.from("agd_signals").insert(signals);
  return out;
}

function identifyBottleneck(snapshot: Record<string, any>): { bottleneck: string; rationale: string } {
  const pin = snapshot.pinterest ?? {};
  const orders = snapshot.orders ?? {};
  const funnel = snapshot.funnel ?? {};
  const oos = snapshot.inventory?.out_of_stock ?? 0;

  const sessions = Number(funnel.session_start ?? 0);
  const atc = Number(funnel.add_to_cart ?? 0);
  const purchases = Number(orders.count ?? 0);
  const clicks = Number(pin.clicks ?? 0);

  if (sessions === 0 && clicks < 100) {
    return { bottleneck: "traffic", rationale: "Almost no sessions and very low Pinterest clicks in last 24h." };
  }
  if (sessions > 50 && atc === 0) {
    return { bottleneck: "conversion", rationale: "Visitors arrive but no add-to-carts — PDP or trust issue." };
  }
  if (atc > 5 && purchases === 0) {
    return { bottleneck: "checkout", rationale: "Carts created but no purchases — checkout friction." };
  }
  if (oos > 50) {
    return { bottleneck: "inventory", rationale: `${oos} active products marked out of stock.` };
  }
  if (clicks > 0 && sessions === 0) {
    return { bottleneck: "tracking", rationale: "Pinterest clicks recorded but no site sessions — attribution leak." };
  }
  return { bottleneck: "creative", rationale: "Baseline operations healthy; focus shifts to creative/scale." };
}

function generateHypotheses(bottleneck: string, snapshot: Record<string, any>) {
  const list: { area: string; statement: string; confidence: number; expected_impact_cents: number }[] = [];
  switch (bottleneck) {
    case "traffic":
      list.push({ area: "pinterest", statement: "Increase Pinterest publishing cadence on revenue-tiered products.", confidence: 0.72, expected_impact_cents: 25000 });
      list.push({ area: "seo", statement: "Refresh top 20 SEO landing pages with updated titles & schema.", confidence: 0.6, expected_impact_cents: 15000 });
      break;
    case "conversion":
      list.push({ area: "pdp", statement: "Trust strip + ATC button contrast experiment will lift CVR ≥10%.", confidence: 0.7, expected_impact_cents: 40000 });
      list.push({ area: "creative", statement: "Pinterest hooks attract low-intent visitors; rewrite top 10 hooks.", confidence: 0.65, expected_impact_cents: 30000 });
      break;
    case "checkout":
      list.push({ area: "checkout", statement: "Shipping cost surprise causes cart abandonment.", confidence: 0.68, expected_impact_cents: 50000 });
      break;
    case "inventory":
      list.push({ area: "inventory", statement: `Refresh CJ stock sync — ${snapshot.inventory?.out_of_stock} OOS products may be stale.`, confidence: 0.8, expected_impact_cents: 60000 });
      break;
    case "tracking":
      list.push({ area: "tracking", statement: "UTM stripping on Pinterest redirect; verify attribution chain.", confidence: 0.78, expected_impact_cents: 20000 });
      break;
    default:
      list.push({ area: "creative", statement: "Mutate top winning DNA into 5 new variants via PCIE-V2.", confidence: 0.6, expected_impact_cents: 18000 });
  }
  return list;
}

function businessValueScore(h: { confidence: number; expected_impact_cents: number }) {
  const impactScore = Math.min(100, h.expected_impact_cents / 1000);
  return Math.round(impactScore * h.confidence);
}

async function reasonAndQueue(db: ReturnType<typeof admin>, snapshot: Record<string, any>) {
  const { bottleneck, rationale } = identifyBottleneck(snapshot);
  const hyps = generateHypotheses(bottleneck, snapshot);

  const hypothesisRows = hyps.map((h) => ({
    area: h.area,
    statement: h.statement,
    confidence: h.confidence,
    expected_impact_cents: h.expected_impact_cents,
    evidence: { bottleneck, snapshot },
    generated_by: "agd-loop",
  }));
  const { data: insertedHyps } = await db.from("agd_hypotheses").insert(hypothesisRows).select("id, area, statement, confidence, expected_impact_cents");

  const opps = (insertedHyps ?? []).map((h) => ({
    category: h.area,
    title: h.statement.slice(0, 120),
    description: h.statement,
    bottleneck,
    business_value_score: businessValueScore({ confidence: Number(h.confidence), expected_impact_cents: Number(h.expected_impact_cents) }),
    expected_revenue_cents: h.expected_impact_cents,
    confidence: h.confidence,
    evidence: { rationale, snapshot },
  }));
  if (opps.length) await db.from("agd_opportunities").insert(opps);

  // Always record a "reasoning" decision (read-only).
  await db.from("agd_decisions").insert({
    decision_type: "diagnose_bottleneck",
    subject: bottleneck,
    rationale,
    reasoning_chain: [
      { step: "observe", snapshot },
      { step: "identify", bottleneck, rationale },
      { step: "hypothesize", count: hyps.length },
    ],
    inputs: snapshot,
    action: { type: "queue_opportunities", count: opps.length },
    confidence: 0.9,
    business_value_score: Math.max(...opps.map((o) => o.business_value_score), 0),
    expected_revenue_cents: opps.reduce((a, o) => a + (o.expected_revenue_cents ?? 0), 0),
    status: "recorded",
  });

  return { bottleneck, rationale, hypotheses: hyps.length, opportunities: opps.length };
}

function forecastFromSnapshot(snapshot: Record<string, any>) {
  const orders24h = Number(snapshot.orders?.revenue_cents ?? 0);
  const orders7d = orders24h * 7;
  const orders30d = orders24h * 30;
  return [
    { horizon: "7d", metric: "revenue_cents", predicted_value: orders7d, lower_bound: orders7d * 0.7, upper_bound: orders7d * 1.3, confidence: 0.5, model: "naive_extrapolation", inputs: snapshot },
    { horizon: "30d", metric: "revenue_cents", predicted_value: orders30d, lower_bound: orders30d * 0.5, upper_bound: orders30d * 1.6, confidence: 0.4, model: "naive_extrapolation", inputs: snapshot },
  ];
}

async function buildBriefing(db: ReturnType<typeof admin>, snapshot: Record<string, any>, bottleneck: string) {
  const today = new Date().toISOString().slice(0, 10);
  const revenue = Number(snapshot.orders?.revenue_cents ?? 0);

  const { data: topOpps } = await db
    .from("agd_opportunities")
    .select("title, business_value_score, expected_revenue_cents, category")
    .eq("status", "open")
    .order("business_value_score", { ascending: false })
    .limit(5);

  const bullets = [
    `Revenue last 24h: $${(revenue / 100).toFixed(2)}.`,
    `Current growth bottleneck: ${bottleneck}.`,
    `Pinterest 24h: ${snapshot.pinterest?.clicks ?? 0} clicks · ${snapshot.pinterest?.impressions ?? 0} impressions.`,
    `Active products out of stock: ${snapshot.inventory?.out_of_stock ?? 0}.`,
    `Top opportunity: ${topOpps?.[0]?.title ?? "n/a"}.`,
  ];

  await db
    .from("agd_briefings")
    .upsert(
      {
        briefing_date: today,
        revenue_yesterday_cents: revenue,
        top_opportunities: topOpps ?? [],
        recommended_actions: (topOpps ?? []).map((o) => ({ title: o.title, value_score: o.business_value_score })),
        predicted_revenue_cents: revenue * 30,
        growth_score: Math.min(100, Math.round(((topOpps?.[0]?.business_value_score ?? 0) + 50) / 1.5)),
        bullets,
      },
      { onConflict: "briefing_date" },
    );
  return { bullets, top_opportunities: topOpps?.length ?? 0 };
}

async function runLoop(trigger: string) {
  const db = admin();
  const { data: run } = await db.from("agd_runs").insert({ trigger, status: "running" }).select("id").single();
  const runId = run!.id as string;

  let snapshot: Record<string, any> = {};
  let bottleneck = "unknown";
  let hypotheses = 0;
  let opportunities = 0;

  const observed = await runStep(db, runId, "observe", async () => {
    snapshot = await observe(db);
    return { signals: Object.keys(snapshot).length, snapshot };
  });

  if (observed.status === "ok") {
    const reasoned = await runStep(db, runId, "reason", async () => {
      const r = await reasonAndQueue(db, snapshot);
      bottleneck = r.bottleneck;
      hypotheses = r.hypotheses;
      opportunities = r.opportunities;
      return r as unknown as Record<string, unknown>;
    });
    void reasoned;

    await runStep(db, runId, "forecast", async () => {
      const forecasts = forecastFromSnapshot(snapshot);
      await db.from("agd_forecasts").insert(forecasts);
      return { inserted: forecasts.length };
    });

    await runStep(db, runId, "briefing", async () => {
      return (await buildBriefing(db, snapshot, bottleneck)) as unknown as Record<string, unknown>;
    });
  }

  const growthScore = Math.max(
    0,
    Math.min(
      100,
      50 +
        Math.min(30, Number(snapshot?.orders?.count ?? 0) * 2) -
        Math.min(20, Number(snapshot?.inventory?.out_of_stock ?? 0) / 10),
    ),
  );

  await db
    .from("agd_runs")
    .update({
      ended_at: new Date().toISOString(),
      status: "completed",
      bottleneck,
      hypotheses_generated: hypotheses,
      opportunities_added: opportunities,
      growth_score: growthScore,
      summary: { snapshot, bottleneck },
    })
    .eq("id", runId);

  return { run_id: runId, bottleneck, hypotheses, opportunities, growth_score: growthScore, snapshot };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    let body: any = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));
    const action = body.action ?? new URL(req.url).searchParams.get("action") ?? "run";

    if (action === "snapshot") {
      const db = admin();
      const [runs, opps, brief, decisions] = await Promise.all([
        db.from("agd_runs").select("*").order("started_at", { ascending: false }).limit(20),
        db.from("agd_opportunities").select("*").eq("status", "open").order("business_value_score", { ascending: false }).limit(20),
        db.from("agd_briefings").select("*").order("briefing_date", { ascending: false }).limit(1),
        db.from("agd_decisions").select("*").order("decided_at", { ascending: false }).limit(20),
      ]);
      return new Response(
        JSON.stringify({ runs: runs.data, opportunities: opps.data, briefing: brief.data?.[0] ?? null, decisions: decisions.data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await runLoop(body.trigger ?? "manual");
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});