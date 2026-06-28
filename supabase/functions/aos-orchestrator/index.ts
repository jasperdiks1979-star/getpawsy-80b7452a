// AI Operating System (AOS) — central nervous system.
// Orchestrates: event ingest, task scheduling, health scoring, daily strategy, digital twin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function loadSettings() {
  const { data } = await supabase.from("aos_settings").select("key,value");
  const m: Record<string, any> = {};
  (data ?? []).forEach((r: any) => (m[r.key] = r.value));
  return m;
}

async function publishEvent(e: {
  event_type: string; source_engine?: string; subject?: string; payload?: any; severity?: string;
}) {
  const { data, error } = await supabase.from("aos_events").insert({
    event_type: e.event_type,
    source_engine: e.source_engine ?? "aos",
    subject: e.subject ?? null,
    payload: e.payload ?? {},
    severity: e.severity ?? "info",
  }).select("id, sequence_no").single();
  if (error) throw error;
  return data;
}

async function publishKnowledge(k: {
  topic: string; key: string; publisher_engine: string; kind: string; payload: any; confidence?: number; tags?: string[];
}) {
  // Supersede latest existing version
  const { data: prev } = await supabase
    .from("aos_knowledge")
    .select("id, version")
    .eq("topic", k.topic).eq("key", k.key)
    .is("superseded_at", null)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (prev?.version ?? 0) + 1;
  if (prev) {
    await supabase.from("aos_knowledge").update({ superseded_at: new Date().toISOString() }).eq("id", prev.id);
  }
  const { data, error } = await supabase.from("aos_knowledge").insert({
    topic: k.topic, key: k.key, version: nextVersion,
    publisher_engine: k.publisher_engine, kind: k.kind, payload: k.payload,
    confidence: k.confidence ?? 0.5, supersedes_id: prev?.id ?? null, tags: k.tags ?? [],
  }).select("id, version").single();
  if (error) throw error;
  return data;
}

async function scheduleTask(t: {
  title: string; category: string; owner_engine?: string; priority?: number; payload?: any; related_event_id?: string;
}) {
  const settings = await loadSettings();
  const rules = settings.priority_rules ?? {};
  const pri = t.priority ?? rules[t.category] ?? 50;
  const { data, error } = await supabase.from("aos_tasks").insert({
    title: t.title, category: t.category, owner_engine: t.owner_engine ?? null,
    priority: pri, payload: t.payload ?? {}, related_event_id: t.related_event_id ?? null,
  }).select("id, priority").single();
  if (error) throw error;
  return data;
}

async function castVote(v: {
  decision_id: string; engine_key: string; vote: string; weight?: number; confidence?: number; reasoning?: string;
}) {
  await supabase.from("aos_consensus_votes").upsert({
    decision_id: v.decision_id, engine_key: v.engine_key, vote: v.vote,
    weight: v.weight ?? 1, confidence: v.confidence ?? null, reasoning: v.reasoning ?? null,
  }, { onConflict: "decision_id,engine_key" });
  return resolveConsensus(v.decision_id);
}

async function resolveConsensus(decisionId: string) {
  const [{ data: dec }, { data: votes }] = await Promise.all([
    supabase.from("aos_consensus_decisions").select("*").eq("id", decisionId).single(),
    supabase.from("aos_consensus_votes").select("*").eq("decision_id", decisionId),
  ]);
  if (!dec || !votes) return null;
  const totals: Record<string, number> = {};
  let totalW = 0;
  for (const v of votes) {
    totals[v.vote] = (totals[v.vote] ?? 0) + Number(v.weight ?? 1);
    totalW += Number(v.weight ?? 1);
  }
  let leader = "abstain"; let leaderW = 0;
  for (const [k, w] of Object.entries(totals)) if (w > leaderW) { leader = k; leaderW = w; }
  const share = totalW > 0 ? leaderW / totalW : 0;
  if (share >= Number(dec.required_weight ?? 0.66) && totalW >= 2) {
    await supabase.from("aos_consensus_decisions").update({
      status: "resolved", final_verdict: leader, resolved_at: new Date().toISOString(),
      rationale: `${leader} wins with ${(share * 100).toFixed(1)}% weighted share`,
    }).eq("id", decisionId);
    return { resolved: true, verdict: leader, share };
  }
  return { resolved: false, leader, share };
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

async function computeHealth() {
  // Pull lightweight signals; missing tables degrade gracefully.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [{ count: errCnt }, { data: agalTrust }, { data: arieInc }, { count: ordersCnt }, { count: pinFails }] = await Promise.all([
    supabase.from("frontend_error_logs").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("agal_trust_scores").select("overall_trust").gte("created_at", since),
    supabase.from("arie_incidents").select("severity,status").eq("status", "open"),
    supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("pinterest_pipeline_failures").select("id", { count: "exact", head: true }).gte("created_at", since).then((r:any)=>r).catch(()=>({count:0})),
  ] as any);

  const infra = clamp01(1 - Math.min(1, (errCnt ?? 0) / 200));
  const ai = clamp01(((agalTrust ?? []).reduce((s: number, r: any) => s + Number(r.overall_trust ?? 0), 0) / Math.max(1, (agalTrust ?? []).length)) || 0.7);
  const tracking = clamp01(1 - Math.min(1, (arieInc ?? []).length / 5));
  const revenue = clamp01(Math.min(1, (ordersCnt ?? 0) / 20));
  const creative = clamp01(1 - Math.min(1, (pinFails ?? 0) / 50));
  const traffic = revenue; // proxy until GA4 wired here
  const business = (revenue + creative) / 2;
  const cx = clamp01(1 - Math.min(1, (errCnt ?? 0) / 500));

  const settings = await loadSettings();
  const w = settings.health_weights ?? {};
  const overall =
    ai * (w.ai ?? 0.1) + business * (w.business ?? 0.2) + traffic * (w.traffic ?? 0.1) +
    creative * (w.creative ?? 0.1) + revenue * (w.revenue ?? 0.2) + tracking * (w.tracking ?? 0.1) +
    infra * (w.infra ?? 0.1) + cx * (w.cx ?? 0.1);

  const { data } = await supabase.from("aos_health_snapshots").insert({
    ai_health: ai, business_health: business, traffic_health: traffic, creative_health: creative,
    revenue_health: revenue, tracking_health: tracking, infra_health: infra, cx_health: cx,
    overall_score: overall,
    details: { errors_24h: errCnt, open_incidents: (arieInc ?? []).length, orders_24h: ordersCnt, pin_failures_24h: pinFails },
  }).select("overall_score").single();
  return data?.overall_score ?? overall;
}

async function scheduleFromOpenIncidents(runId: string) {
  const { data: inc } = await supabase
    .from("arie_incidents").select("id,title,severity").eq("status", "open").limit(20);
  let n = 0;
  for (const i of inc ?? []) {
    const cat = /checkout/i.test(i.title) ? "checkout_broken" : /track|attrib/i.test(i.title) ? "tracking_failure" : "revenue_drop";
    const evt = await publishEvent({
      event_type: `incident.${cat}`, source_engine: "arie", subject: i.id,
      payload: { title: i.title, severity: i.severity }, severity: i.severity,
    });
    await scheduleTask({
      title: `Resolve incident: ${i.title}`, category: cat,
      owner_engine: "agd", payload: { incident_id: i.id }, related_event_id: evt.id,
    });
    n++;
  }
  return n;
}

async function generateDailyStrategy() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("aos_daily_strategy").select("id").eq("strategy_date", today).maybeSingle();
  if (existing) return existing.id;

  // Pull recent winners/signals from already-existing AI tables.
  const [{ data: trustTop }, { data: healthLast }] = await Promise.all([
    supabase.from("agal_trust_scores").select("engine_key,overall_trust").order("overall_trust", { ascending: false }).limit(5),
    supabase.from("aos_health_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ] as any);

  const briefing = [
    `# AOS Daily Strategy — ${today}`,
    `Overall health: ${((healthLast?.overall_score ?? 0) * 100).toFixed(1)}/100`,
    `Most reliable engines: ${(trustTop ?? []).map((t: any) => `${t.engine_key} (${((t.overall_trust ?? 0) * 100).toFixed(0)})`).join(", ") || "n/a"}`,
    `Today's focus: defend revenue, accelerate winning creatives, throttle low-confidence experiments.`,
  ].join("\n\n");

  const { data } = await supabase.from("aos_daily_strategy").insert({
    strategy_date: today,
    best_channels: [], worst_channels: [], best_creatives: [], worst_creatives: [],
    top_products: [], inventory_risks: [], trends: {},
    strategy: "defend_revenue_amplify_winners",
    briefing_md: briefing,
  }).select("id").single();
  return data?.id;
}

async function updateDigitalTwin() {
  // Predict next-24h revenue from last-7d order count avg as a baseline.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since);
  const avgPerDay = (count ?? 0) / 7;
  await supabase.from("aos_digital_twin_snapshots").insert({
    horizon: "24h",
    predicted: { orders: Math.round(avgPerDay), basis: "7d_avg" },
    confidence: 0.6,
  });
}

async function runOrchestrator(trigger: string) {
  const { data: runRow } = await supabase.from("aos_orchestrator_runs").insert({ trigger }).select("id").single();
  const runId = runRow!.id as string;
  const t = (s: string) => Date.now();
  let events = 0, tasks = 0;

  // Heartbeat for self
  await supabase.from("aos_engine_registry")
    .update({ last_heartbeat_at: new Date().toISOString(), health: "ok" })
    .eq("engine_key", "agal");

  const t0 = t("ingest");
  try {
    tasks += await scheduleFromOpenIncidents(runId);
  } catch (e) {
    await supabase.from("aos_orchestrator_steps").insert({ run_id: runId, step: "schedule_incidents", status: "error", details: { error: String(e) } });
  }
  await supabase.from("aos_orchestrator_steps").insert({ run_id: runId, step: "schedule_incidents", status: "ok", duration_ms: Date.now() - t0, details: { tasks } });

  const t1 = Date.now();
  const health = await computeHealth();
  await supabase.from("aos_orchestrator_steps").insert({ run_id: runId, step: "health", status: "ok", duration_ms: Date.now() - t1, details: { health } });

  const t2 = Date.now();
  await updateDigitalTwin();
  await supabase.from("aos_orchestrator_steps").insert({ run_id: runId, step: "twin", status: "ok", duration_ms: Date.now() - t2 });

  const t3 = Date.now();
  await generateDailyStrategy();
  await supabase.from("aos_orchestrator_steps").insert({ run_id: runId, step: "strategy", status: "ok", duration_ms: Date.now() - t3 });

  await supabase.from("aos_orchestrator_runs").update({
    ended_at: new Date().toISOString(), status: "ok",
    events_ingested: events, tasks_scheduled: tasks, health_score: health,
    summary: { tasks, health },
  }).eq("id", runId);

  return { runId, tasks, health };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "run";
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }

    let result: any;
    if (action === "publish_event") result = await publishEvent(body);
    else if (action === "publish_knowledge") result = await publishKnowledge(body);
    else if (action === "schedule_task") result = await scheduleTask(body);
    else if (action === "vote") result = await castVote(body);
    else result = await runOrchestrator(body.trigger ?? "manual");

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});