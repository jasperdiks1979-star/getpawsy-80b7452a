// Pinterest Collective Intelligence Layer
// Single learning loop on top of existing engines. No new tables or dashboards.
// Reads: pinterest_pin_performance, pcie2_creatives.creative_dna,
//        pinterest_revenue_funnel_daily, pcie2_ci_scores.
// Writes: pinterest_taste_signals (extends), pinterest_pattern_weights (extends),
//         pinterest_evolution_log (decision_type='collective_intelligence_*').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_SAMPLE = 8;          // minimum pins per attribute value before we trust lift
const MIN_CONFIDENCE = 0.55;   // Wilson-style lower-bound floor
const WINDOW_DAYS = 30;

type DnaRow = { pin_id: string; product_id: string; dna: Record<string, unknown> };
type PerfRow = { pin_id: string; impressions: number; clicks: number; saves: number };
type RevRow = { pin_id: string; revenue_cents: number; purchases: number };

function wilsonLower(p: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

function flattenDna(dna: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (!dna || typeof dna !== "object") return out;
  for (const [k, v] of Object.entries(dna)) {
    if (v === null || v === undefined) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.push([key, String(v).slice(0, 64)]);
    } else if (Array.isArray(v)) {
      for (const item of v.slice(0, 6)) {
        if (typeof item === "string" || typeof item === "number") out.push([key, String(item).slice(0, 64)]);
      }
    } else if (typeof v === "object") {
      out.push(...flattenDna(v as Record<string, unknown>, key));
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const t0 = Date.now();

  // 1. Load joined evidence in batches
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const [{ data: creatives }, { data: perf }, { data: funnel }] = await Promise.all([
    supa.from("pcie2_creatives")
      .select("pinterest_pin_id,product_id,creative_dna,family,visual_style")
      .not("pinterest_pin_id", "is", null)
      .gte("created_at", sinceIso)
      .limit(5000),
    supa.from("pinterest_pin_performance")
      .select("pin_id,impressions,clicks,saves")
      .gte("created_at", sinceIso)
      .limit(5000),
    supa.from("pinterest_revenue_funnel_daily")
      .select("pin_id,revenue_cents,purchases")
      .gte("day", sinceIso.slice(0, 10))
      .limit(20000),
  ]);

  const perfByPin = new Map<string, PerfRow>();
  for (const r of (perf ?? []) as PerfRow[]) perfByPin.set(r.pin_id, r);
  const revByPin = new Map<string, RevRow>();
  for (const r of (funnel ?? []) as Array<{ pin_id: string; revenue_cents: number | null; purchases: number | null }>) {
    if (!r.pin_id) continue;
    const cur = revByPin.get(r.pin_id) ?? { pin_id: r.pin_id, revenue_cents: 0, purchases: 0 };
    cur.revenue_cents += Number(r.revenue_cents ?? 0);
    cur.purchases += Number(r.purchases ?? 0);
    revByPin.set(r.pin_id, cur);
  }

  // 2. Build DNA evidence list — only pins with both DNA and perf
  type Sample = {
    attr_key: string; attr_value: string;
    impressions: number; clicks: number; saves: number; revenue_cents: number;
  };
  const samples: Sample[] = [];
  let joinable = 0;
  for (const c of (creatives ?? []) as Array<{ pinterest_pin_id: string; creative_dna: Record<string, unknown>; family: string | null; visual_style: string | null }>) {
    const p = perfByPin.get(c.pinterest_pin_id);
    if (!p) continue;
    joinable++;
    const rev = revByPin.get(c.pinterest_pin_id);
    const dnaPairs = flattenDna(c.creative_dna ?? {});
    if (c.family) dnaPairs.push(["family", c.family]);
    if (c.visual_style) dnaPairs.push(["visual_style", c.visual_style]);
    for (const [k, v] of dnaPairs) {
      samples.push({
        attr_key: k, attr_value: v,
        impressions: p.impressions ?? 0,
        clicks: p.clicks ?? 0,
        saves: p.saves ?? 0,
        revenue_cents: rev?.revenue_cents ?? 0,
      });
    }
  }

  // 3. Compute global baselines
  let baseImpr = 0, baseClicks = 0, baseSaves = 0, baseRev = 0;
  for (const p of perfByPin.values()) { baseImpr += p.impressions; baseClicks += p.clicks; baseSaves += p.saves; }
  for (const r of revByPin.values()) baseRev += r.revenue_cents;
  const baseCtr = baseImpr ? baseClicks / baseImpr : 0;
  const baseSaveRate = baseImpr ? baseSaves / baseImpr : 0;

  // 4. Aggregate per (attr_key, attr_value)
  type Agg = { key: string; value: string; n: number; impr: number; clicks: number; saves: number; rev: number };
  const aggMap = new Map<string, Agg>();
  for (const s of samples) {
    const k = `${s.attr_key}|${s.attr_value}`;
    const cur = aggMap.get(k) ?? { key: s.attr_key, value: s.attr_value, n: 0, impr: 0, clicks: 0, saves: 0, rev: 0 };
    cur.n += 1; cur.impr += s.impressions; cur.clicks += s.clicks; cur.saves += s.saves; cur.rev += s.revenue_cents;
    aggMap.set(k, cur);
  }

  // 5. Score lifts + confidence
  type Signal = { dimension: string; value: string; lift: number; ctrLift: number; saveLift: number; revPerPin: number; confidence: number; n: number; status: "rising" | "declining" | "neutral" };
  const signals: Signal[] = [];
  for (const a of aggMap.values()) {
    if (a.n < MIN_SAMPLE) continue;
    const ctr = a.impr ? a.clicks / a.impr : 0;
    const saveRate = a.impr ? a.saves / a.impr : 0;
    const ctrLift = baseCtr ? ctr / baseCtr : 1;
    const saveLift = baseSaveRate ? saveRate / baseSaveRate : 1;
    const revPerPin = a.rev / a.n;
    const lift = 0.5 * ctrLift + 0.3 * saveLift + 0.2 * (revPerPin / Math.max(1, baseRev / Math.max(1, perfByPin.size)));
    const ctrConf = wilsonLower(ctr, a.impr);
    const confidence = Math.min(0.99, 0.5 * ctrConf + 0.5 * Math.min(1, a.n / 30));
    let status: Signal["status"] = "neutral";
    if (lift >= 1.15 && confidence >= MIN_CONFIDENCE) status = "rising";
    else if (lift <= 0.85 && confidence >= MIN_CONFIDENCE) status = "declining";
    signals.push({ dimension: a.key, value: a.value, lift, ctrLift, saveLift, revPerPin, confidence, n: a.n, status });
  }

  signals.sort((a, b) => b.lift - a.lift);
  const winners = signals.filter((s) => s.status === "rising").slice(0, 25);
  const losers = signals.filter((s) => s.status === "declining").slice(0, 25);

  // 6. Persist (extends existing tables only)
  let written = 0;
  if (!dryRun && (winners.length || losers.length)) {
    const rows = [...winners, ...losers].map((s) => ({
      dimension: `ci_${s.dimension}`.slice(0, 64),
      value: s.value,
      lift_score: Number(s.lift.toFixed(4)),
      velocity_7d: Number(s.ctrLift.toFixed(4)),
      momentum_30d: Number(s.saveLift.toFixed(4)),
      confidence: Number(s.confidence.toFixed(4)),
      sample_n: s.n,
      expected_lifetime_days: 30,
      status: s.status,
      computed_at: new Date().toISOString(),
    }));
    const { error } = await supa.from("pinterest_taste_signals")
      .upsert(rows, { onConflict: "dimension,value" });
    if (!error) written = rows.length;
  }

  // 7. Log decision with evidence
  const summary = {
    joinable_pins: joinable,
    distinct_attributes: aggMap.size,
    signals_emitted: signals.length,
    winners: winners.length,
    losers: losers.length,
    baseline_ctr: baseCtr,
    baseline_save_rate: baseSaveRate,
    window_days: WINDOW_DAYS,
    written,
    duration_ms: Date.now() - t0,
    top_winners: winners.slice(0, 8).map((w) => ({ dim: w.dimension, val: w.value, lift: w.lift, n: w.n, conf: w.confidence })),
    top_losers: losers.slice(0, 8).map((w) => ({ dim: w.dimension, val: w.value, lift: w.lift, n: w.n, conf: w.confidence })),
  };

  if (!dryRun) {
    await supa.from("pinterest_evolution_log").insert({
      decision_type: "collective_intelligence_run",
      rationale: `CI nightly: ${winners.length} winners / ${losers.length} losers from ${joinable} joinable pins`,
      metrics: summary,
      new_value: { winners: summary.top_winners, losers: summary.top_losers },
    });
  }

  return new Response(JSON.stringify({ ok: true, dry_run: dryRun, summary }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});