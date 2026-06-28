// Pinterest Creative Evolution Engine
// Learns WHY variants win and evolves future creatives via weighted DNA.
// Reuses existing tables only: pinterest_pin_queue, pinterest_pin_performance,
// pin_ab_outcomes, pin_ab_experiments, pinterest_pattern_weights,
// pinterest_evolution_log, pinterest_ops_snapshots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const HALF_LIFE_DAYS = 21;             // decay
const MIN_SAMPLE = 2;                  // per dimension/value (early-stage)
const EXPLORATION_RATIO = 0.2;         // 80/20
const WINDOW_DAYS = 365;

type Row = Record<string, any>;

function decay(ageDays: number) {
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function featuresFromDim(d: Row): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: any) => {
    if (v === null || v === undefined) return;
    const s = String(v).toLowerCase().trim().slice(0, 80);
    if (s) out[k] = s;
  };
  put("hook_variant", d.hook_variant);
  put("copy_variant", d.copy_variant);
  put("cta_variant", d.cta_variant);
  put("niche", d.niche_key);
  put("category", d.category_key);
  put("board", d.board_id);
  if (d.published_at) {
    const dt = new Date(d.published_at);
    put("posting_hour", `${dt.getUTCHours()}h`);
    put("weekday", `${dt.getUTCDay()}`);
    put("month", `${dt.getUTCMonth() + 1}`);
  }
  return out;
}

function featuresFromQueue(q: Row): Record<string, string> {
  const meta = (q?.meta ?? {}) as Row;
  const intel = (meta.intelligence ?? {}) as Row;
  const dna = (meta.dna ?? meta.creative_dna ?? {}) as Row;
  const out: Record<string, string> = {};
  const put = (k: string, v: any) => {
    if (v === null || v === undefined) return;
    const s = String(v).toLowerCase().trim().slice(0, 80);
    if (s) out[k] = s;
  };
  put("headline_length_bucket", q.pin_title
    ? `${Math.min(10, Math.round(String(q.pin_title).split(/\s+/).length / 2) * 2)}w` : null);
  put("hook_category", intel.hook_category ?? dna.hook_category);
  put("pattern_id", intel.pattern_id ?? dna.pattern_id);
  put("cta", q.cta ?? intel.cta);
  put("niche", q.niche_key ?? dna.niche_key);
  put("board", q.board_name);
  put("posting_hour", q.posted_at ? `${new Date(q.posted_at).getUTCHours()}h` : null);
  put("weekday", q.posted_at ? `${new Date(q.posted_at).getUTCDay()}` : null);
  put("scene", dna.scene ?? intel.scene ?? dna.scene_template);
  put("lighting", dna.lighting);
  put("background", dna.background);
  put("composition", dna.composition);
  put("camera_angle", dna.camera_angle);
  put("pet_position", dna.pet_position);
  put("breed", dna.breed);
  put("color_palette", dna.color_palette);
  put("emotion", dna.emotion ?? intel.emotion);
  put("angle", dna.angle ?? intel.angle);
  put("style", dna.style);
  return out;
}

function scorePerf(p: Row): number {
  const ctr = Number(p.ctr ?? 0);
  const saves = Number(p.saves ?? 0);
  const clicks = Number(p.clicks ?? p.outbound_clicks ?? 0);
  const imp = Math.max(1, Number(p.impressions ?? 0));
  // composite: 60% CTR, 30% save-rate, 10% raw click volume (log)
  return 0.6 * ctr * 100 + 0.3 * (saves / imp) * 100 + 0.1 * Math.log10(1 + clicks) * 10;
}

async function run(supabase: any, execute: boolean) {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  // 1. Production evidence: pin_dimensions (DNA) + analytics_daily (signals)
  const { data: dims } = await supabase
    .from("pinterest_pin_dimensions")
    .select("pin_id,hook_variant,copy_variant,cta_variant,niche_key,category_key,board_id,published_at")
    .gte("published_at", sinceIso)
    .limit(5000);
  const dimensions: Row[] = dims ?? [];

  // Also include queue meta DNA when available (richer features)
  const { data: q } = await supabase
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id,niche_key,board_name,cta,pin_title,posted_at,meta")
    .eq("status", "posted")
    .gte("posted_at", sinceIso)
    .limit(2000);
  const queueByPinId = new Map<string, Row>();
  (q ?? []).forEach((r: Row) => { if (r.pinterest_pin_id) queueByPinId.set(String(r.pinterest_pin_id), r); });

  // 2. Sum analytics by pin_id (any pin_id observed in dims OR queue)
  const pinIds = Array.from(new Set([
    ...dimensions.map((d) => String(d.pin_id)),
    ...Array.from(queueByPinId.keys()),
  ])).filter(Boolean);
  const perfMap = new Map<string, Row>();
  if (pinIds.length) {
    // chunk to keep IN list reasonable
    for (let i = 0; i < pinIds.length; i += 500) {
      const slice = pinIds.slice(i, i + 500);
      const { data: perfData } = await supabase
        .from("pinterest_analytics_daily")
        .select("pin_id,impressions,outbound_clicks,saves,pin_clicks")
        .in("pin_id", slice);
      (perfData ?? []).forEach((p: Row) => {
        const k = String(p.pin_id);
        const a = perfMap.get(k) ?? { pin_id: k, impressions: 0, clicks: 0, saves: 0 };
        a.impressions += Number(p.impressions ?? 0);
        a.clicks += Number(p.outbound_clicks ?? 0) + Number(p.pin_clicks ?? 0);
        a.saves += Number(p.saves ?? 0);
        perfMap.set(k, a);
      });
    }
    // derive ctr
    perfMap.forEach((v) => { v.ctr = v.impressions > 0 ? v.clicks / v.impressions : 0; });
  }

  // 3. Aggregate by (dimension, value) with time decay
  type Agg = { score: number; weight: number; n: number; raw: number[] };
  const buckets = new Map<string, Agg>();
  const now = Date.now();
  let evaluated = 0;

  const samples: { pin_id: string; perf: Row; feats: Record<string, string>; postedAt: string }[] = [];
  for (const d of dimensions) {
    const perf = perfMap.get(String(d.pin_id));
    if (!perf || (perf.impressions ?? 0) < 1) continue;
    const qrow = queueByPinId.get(String(d.pin_id));
    const feats = { ...featuresFromDim(d), ...(qrow ? featuresFromQueue(qrow) : {}) };
    samples.push({
      pin_id: String(d.pin_id), perf, feats,
      postedAt: d.published_at ?? qrow?.posted_at ?? new Date().toISOString(),
    });
  }
  // also add queue-only pins (no dim row) when they have perf
  queueByPinId.forEach((qrow, pid) => {
    if (dimensions.find((d) => String(d.pin_id) === pid)) return;
    const perf = perfMap.get(pid);
    if (!perf || (perf.impressions ?? 0) < 1) return;
    samples.push({ pin_id: pid, perf, feats: featuresFromQueue(qrow), postedAt: qrow.posted_at });
  });

  for (const sm of samples) {
    evaluated++;
    const ageDays = (now - new Date(sm.postedAt).getTime()) / 86_400_000;
    const w = decay(Math.max(0, ageDays));
    const s = scorePerf(sm.perf);
    for (const [dim, val] of Object.entries(sm.feats)) {
      const key = `${dim}::${val}`;
      const a = buckets.get(key) ?? { score: 0, weight: 0, n: 0, raw: [] };
      a.score += s * w;
      a.weight += w;
      a.n += 1;
      a.raw.push(s);
      buckets.set(key, a);
    }
  }

  // 4. Compute composite_score per bucket and global baseline
  const baseline = (() => {
    const all: number[] = [];
    buckets.forEach((a) => all.push(...a.raw));
    if (!all.length) return 1;
    return all.reduce((x, y) => x + y, 0) / all.length || 1;
  })();

  type GenomeRow = {
    dimension: string;
    value: string;
    composite_score: number;
    sample_size: number;
    lift_pct: number;
    confidence: number;
    evidence_pins: number;
  };
  const genome: GenomeRow[] = [];
  const writes: Row[] = [];
  buckets.forEach((a, key) => {
    if (a.n < MIN_SAMPLE) return;
    const [dim, val] = key.split("::");
    const composite = a.score / Math.max(a.weight, 0.0001);
    const lift = ((composite - baseline) / baseline) * 100;
    const confidence = Math.min(1, a.n / 30);
    genome.push({
      dimension: dim, value: val,
      composite_score: Number(composite.toFixed(4)),
      sample_size: a.n,
      lift_pct: Number(lift.toFixed(2)),
      confidence: Number(confidence.toFixed(3)),
      evidence_pins: a.n,
    });
    writes.push({
      pattern_id: key,
      hook_category: dim,
      niche_key: val.slice(0, 64),
      composite_score: Number(composite.toFixed(4)),
      sample_size: a.n,
      updated_at: new Date().toISOString(),
    });
  });

  genome.sort((a, b) => b.composite_score - a.composite_score);
  const winners = genome.filter((g) => g.lift_pct >= 10 && g.confidence >= 0.5).slice(0, 25);
  const losers = genome.filter((g) => g.lift_pct <= -15 && g.confidence >= 0.5).slice(-15);
  const decaying = genome
    .filter((g) => g.sample_size >= MIN_SAMPLE && g.lift_pct < 0)
    .slice(0, 10);

  // 5. Expected lift estimate (weighted mean of winners vs baseline)
  const expectedCtrLiftPct = winners.length
    ? winners.reduce((s, w) => s + w.lift_pct * w.confidence, 0) /
      Math.max(1, winners.reduce((s, w) => s + w.confidence, 0))
    : 0;

  const snapshot = {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    evaluated_pins: evaluated,
    baseline_score: Number(baseline.toFixed(4)),
    exploitation_ratio: 1 - EXPLORATION_RATIO,
    exploration_ratio: EXPLORATION_RATIO,
    expected_ctr_lift_pct: Number(expectedCtrLiftPct.toFixed(2)),
    winners,
    losers,
    decaying,
    full_genome: genome.slice(0, 200),
  };

  if (!execute) return { ok: true, snapshot, persisted: false };

  // 6. Persist weights (upsert)
  if (writes.length) {
    const { error: upErr } = await supabase
      .from("pinterest_pattern_weights")
      .upsert(writes, { onConflict: "pattern_id,hook_category,niche_key" });
    if (upErr) console.warn("pattern_weights upsert", upErr.message);
  }

  // 7. Snapshot
  await supabase.from("pinterest_ops_snapshots").insert({
    snapshot_date: new Date().toISOString().slice(0, 10),
    metrics: { engine: "creative_evolution", ...snapshot },
  });

  // 8. Log every evolutionary change with evidence
  const logs = [
    ...winners.map((w) => ({
      decision_type: "evolution_promote",
      niche_key: w.dimension,
      target_dimension: w.dimension,
      old_value: { value: w.value, prior_score: baseline },
      new_value: { value: w.value, composite_score: w.composite_score },
      rationale: `Promote ${w.dimension}=${w.value}: +${w.lift_pct}% vs baseline, n=${w.sample_size}, conf=${w.confidence}`,
      metrics: w,
    })),
    ...losers.map((l) => ({
      decision_type: "evolution_demote",
      niche_key: l.dimension,
      target_dimension: l.dimension,
      old_value: { value: l.value, prior_score: baseline },
      new_value: { value: l.value, composite_score: l.composite_score },
      rationale: `Demote ${l.dimension}=${l.value}: ${l.lift_pct}% vs baseline, n=${l.sample_size}`,
      metrics: l,
    })),
  ];
  if (logs.length) {
    await supabase.from("pinterest_evolution_log").insert(logs);
  }

  return { ok: true, snapshot, persisted: true, weights_written: writes.length, decisions_logged: logs.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    // GET = snapshot only; POST = execute & persist
    const execute = req.method === "POST";
    // Allow cron header with anon to execute
    const apikey = req.headers.get("apikey");
    const isCron = apikey && apikey === ANON;
    const result = await run(supabase, execute || !!isCron);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});