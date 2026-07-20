import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Json = Record<string, unknown>;

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; resp: Response }> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, resp: new Response("unauthorized", { status: 401, headers: corsHeaders }) };
  const user = await sb.auth.getUser(token);
  if (!user.data.user) return { ok: false, resp: new Response("unauthorized", { status: 401, headers: corsHeaders }) };
  const { data: role } = await sb.rpc("has_role", { _user_id: user.data.user.id, _role: "admin" });
  if (!role) return { ok: false, resp: new Response("forbidden", { status: 403, headers: corsHeaders }) };
  return { ok: true };
}

// --- Discovery: surface candidate experiments from existing recommendations ---
async function discover(): Promise<Json> {
  const created: string[] = [];

  // Pull top untested recommendations from the AI CEO + Growth Orchestrator
  const [{ data: ceoRecs }, { data: orchRecs }] = await Promise.all([
    sb.from("ai_ceo_recommendations").select("id,title,rationale,category,expected_revenue_cents,confidence").eq("status","pending").limit(25),
    sb.from("growth_orchestrator_recommendations").select("id,title,rationale,category,expected_revenue_cents,confidence").limit(25),
  ]);

  const pool = [
    ...((ceoRecs ?? []).map((r: any) => ({ ...r, source: "ai_ceo" }))),
    ...((orchRecs ?? []).map((r: any) => ({ ...r, source: "growth_orchestrator" }))),
  ];

  // De-dup against existing knowledge base + experiments
  const { data: knowledge } = await sb.from("growth_lab_knowledge").select("pattern_key");
  const known = new Set((knowledge ?? []).map((k: any) => k.pattern_key));
  const { data: existing } = await sb.from("growth_lab_experiments").select("name");
  const existingNames = new Set((existing ?? []).map((e: any) => e.name));

  for (const r of pool) {
    const name = (r.title ?? "").toString().slice(0, 180);
    if (!name) continue;
    const key = name.toLowerCase().replace(/\s+/g, "-").slice(0, 120);
    if (known.has(key) || existingNames.has(name)) continue;
    const { error } = await sb.from("growth_lab_experiments").insert({
      name,
      hypothesis: r.rationale ?? `If we implement "${name}", revenue or conversion will improve measurably.`,
      category: r.category ?? "general",
      surface: r.source,
      success_metric: "purchases",
      failure_metric: "bounce_rate",
      expected_revenue_cents: r.expected_revenue_cents ?? 0,
      confidence_target: 0.95,
      min_sample_size: 200,
      status: "discovered",
      source: r.source,
      affected_ids: [r.id],
    });
    if (!error) created.push(name);
    if (created.length >= 25) break;
  }

  return { discovered: created.length, samples: created.slice(0, 5) };
}

// --- Analysis: compute confidence on latest snapshots, promote winners/losers ---
function ztest(a: { n: number; p: number }, b: { n: number; p: number }): { z: number; conf: number } {
  if (a.n < 30 || b.n < 30) return { z: 0, conf: 0 };
  const pPool = (a.p * a.n + b.p * b.n) / (a.n + b.n);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.n + 1 / b.n));
  if (se === 0) return { z: 0, conf: 0 };
  const z = (a.p - b.p) / se;
  // Approx two-sided confidence from |z|
  const conf = Math.min(0.999, Math.max(0, 1 - Math.exp(-0.717 * Math.abs(z) - 0.416 * z * z)));
  return { z, conf };
}

async function analyse(): Promise<Json> {
  const { data: experiments } = await sb
    .from("growth_lab_experiments")
    .select("id,name,status,confidence_target,min_sample_size,affected_ids,category")
    .in("status", ["running", "discovered"]);

  let promoted = 0, retired = 0, inconclusive = 0;
  for (const exp of experiments ?? []) {
    const { data: rows } = await sb
      .from("growth_lab_results")
      .select("variant,impressions,purchases,revenue_cents,snapshot_at")
      .eq("experiment_id", exp.id)
      .order("snapshot_at", { ascending: false })
      .limit(2);
    if (!rows || rows.length < 2) { inconclusive++; continue; }
    const A = rows.find((r: any) => r.variant === "A");
    const B = rows.find((r: any) => r.variant === "B");
    if (!A || !B) { inconclusive++; continue; }
    const a = { n: A.impressions || 0, p: (A.purchases || 0) / Math.max(1, A.impressions || 1) };
    const b = { n: B.impressions || 0, p: (B.purchases || 0) / Math.max(1, B.impressions || 1) };
    const { conf } = ztest(a, b);
    const minN = exp.min_sample_size ?? 200;
    if (a.n < minN || b.n < minN || conf < (exp.confidence_target ?? 0.95)) { inconclusive++; continue; }
    const winner = a.p > b.p ? "A" : "B";
    const revDelta = (winner === "A" ? (A.revenue_cents - B.revenue_cents) : (B.revenue_cents - A.revenue_cents));
    await sb.from("growth_lab_experiments").update({
      status: "completed",
      outcome: "proven",
      winner,
      evidence: { conf, a, b },
      completed_at: new Date().toISOString(),
    }).eq("id", exp.id);
    await sb.from("growth_lab_knowledge").upsert({
      experiment_id: exp.id,
      pattern_key: (exp.name ?? "").toLowerCase().replace(/\s+/g, "-").slice(0, 120),
      pattern_type: exp.category ?? "general",
      verdict: revDelta >= 0 ? "winner" : "loser",
      confidence: conf,
      evidence: { a, b, winner },
      revenue_delta_cents: revDelta,
      lessons: `Variant ${winner} won with ${(conf * 100).toFixed(1)}% confidence.`,
    }, { onConflict: "pattern_key" });
    if (revDelta >= 0) promoted++; else retired++;
  }
  return { promoted, retired, inconclusive };
}

async function summary(): Promise<Json> {
  const [exp, kno, runs] = await Promise.all([
    sb.from("growth_lab_experiments").select("status").limit(2000),
    sb.from("growth_lab_knowledge").select("verdict,revenue_delta_cents,confidence").limit(2000),
    sb.from("growth_lab_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);
  const byStatus: Record<string, number> = {};
  for (const r of exp.data ?? []) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const proven = (kno.data ?? []).filter((k: any) => k.verdict === "winner").length;
  const rejected = (kno.data ?? []).filter((k: any) => k.verdict === "loser").length;
  const totalKnown = (kno.data ?? []).length;
  const provenRate = totalKnown ? proven / totalKnown : 0;
  const revenueGain = (kno.data ?? []).reduce((s: number, k: any) => s + (k.revenue_delta_cents || 0), 0);
  return { byStatus, proven, rejected, provenRate, revenueGainCents: revenueGain, recentRuns: runs.data ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.resp;

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = body.action ?? "summary";

  if (action === "summary") {
    const s = await summary();
    return new Response(JSON.stringify({ ok: true, ...s }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: run } = await sb.from("growth_lab_runs").insert({ kind: action, status: "running" }).select().single();
  try {
    let stats: Json = {};
    if (action === "discover") stats = await discover();
    else if (action === "analyse" || action === "analyze") stats = await analyse();
    else if (action === "run_full") {
      const d = await discover();
      const a = await analyse();
      stats = { discover: d, analyse: a };
    } else {
      return new Response(JSON.stringify({ ok: false, error: "unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await sb.from("growth_lab_runs").update({ status: "ok", stats, finished_at: new Date().toISOString() }).eq("id", run!.id);
    return new Response(JSON.stringify({ ok: true, run_id: run!.id, ...stats }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await sb.from("growth_lab_runs").update({ status: "error", error: String(e), finished_at: new Date().toISOString() }).eq("id", run!.id);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});