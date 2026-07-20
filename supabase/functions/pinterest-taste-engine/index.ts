// Pinterest Taste Engine V1
// Higher intelligence layer over the existing Pinterest ecosystem.
// Learns evolving Pinterest TASTE from production performance signals
// (pinterest_analytics_daily + pinterest_pin_dimensions + pinterest_pin_queue.meta)
// and writes signals/clusters consumed by Creative Factory + Evolution Engine.
// Reuses: pinterest_pattern_weights, pinterest_evolution_log, pinterest_ops_snapshots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HALF_LIFE_DAYS = 14;
const WINDOW_DAYS = 60;
const MIN_SAMPLE = 3;

type Row = Record<string, any>;

function decay(ageDays: number) { return Math.pow(0.5, ageDays / HALF_LIFE_DAYS); }

function bucketHeadline(t?: string | null) {
  if (!t) return null;
  const w = String(t).split(/\s+/).filter(Boolean).length;
  if (w <= 3) return "ultra_short";
  if (w <= 6) return "short";
  if (w <= 10) return "medium";
  return "long";
}

function featuresFor(dim: Row, q: Row | undefined): Record<string, string> {
  const meta = (q?.meta ?? {}) as Row;
  const intel = (meta.intelligence ?? {}) as Row;
  const master = (intel.master ?? {}) as Row;
  const dna = (meta.dna ?? meta.creative_dna ?? {}) as Row;
  const out: Record<string, string> = {};
  const put = (k: string, v: any) => {
    if (v === null || v === undefined) return;
    const s = String(v).toLowerCase().trim().slice(0, 80);
    if (s) out[k] = s;
  };
  put("hook_variant", dim.hook_variant);
  put("cta_variant", dim.cta_variant);
  put("niche", dim.niche_key);
  put("category", dim.category_key);
  put("board", dim.board_id);
  put("hook_category", intel.hook_category ?? dna.hook_category);
  put("composition", master.composition ?? dna.composition);
  put("camera_angle", master.camera_angle ?? dna.camera_angle);
  put("room_style", master.room ?? dna.room_style);
  put("lighting", master.lighting ?? dna.lighting);
  put("color_palette", master.palette ?? dna.color_palette);
  put("story", master.story ?? dna.story);
  put("emotion", master.emotion ?? dna.emotion);
  put("owner_presence", master.owner ?? dna.owner_presence);
  put("season", master.season ?? dna.season);
  put("headline_length", bucketHeadline(q?.pin_title));
  if (dim.published_at) {
    const dt = new Date(dim.published_at);
    put("posting_hour", `${dt.getUTCHours()}h`);
    put("weekday", `${dt.getUTCDay()}`);
    put("month", `${dt.getUTCMonth() + 1}`);
  }
  return out;
}

// Coarse cluster mapping from features
function clusterFor(f: Record<string, string>): string {
  const room = f.room_style ?? "";
  const palette = f.color_palette ?? "";
  const story = f.story ?? "";
  const emotion = f.emotion ?? "";
  if (/luxury|premium/.test(room) || /luxury/.test(story)) return "luxury_minimal";
  if (/scandi|japandi|minimal/.test(room)) return "bright_scandinavian";
  if (/farmhouse|cottage|cabin/.test(room)) return "cozy_winter";
  if (/apartment|loft|tiny|urban/.test(room)) return "tiny_apartment";
  if (/outdoor|garden|beach|travel|trail/.test(room) || /adventure/.test(story)) return "outdoor_dog_adventure";
  if (/family|kids/.test(story)) return "family_home";
  if (/wellness|calm|relax/.test(emotion)) return "pet_wellness";
  if (/modern/.test(room)) return "modern_cat_parent";
  return "premium_interior";
}

function clusterLabel(k: string) {
  return ({
    luxury_minimal: "Luxury Minimal",
    bright_scandinavian: "Bright Scandinavian",
    cozy_winter: "Cozy Winter",
    tiny_apartment: "Tiny Apartment",
    outdoor_dog_adventure: "Outdoor Dog Adventure",
    family_home: "Family Home",
    pet_wellness: "Pet Wellness",
    modern_cat_parent: "Modern Cat Parent",
    premium_interior: "Premium Interior",
  } as Record<string, string>)[k] ?? k;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

    // 1) Load production signals
    const [{ data: dims }, { data: analytics }] = await Promise.all([
      sb.from("pinterest_pin_dimensions").select("*").limit(5000),
      sb.from("pinterest_analytics_daily").select("pin_id,day,impressions,saves,outbound_clicks,pin_clicks,ctr,engagement_rate").gte("day", since),
    ]);
    const pinIds = Array.from(new Set((dims ?? []).map((d: Row) => d.pin_id)));
    const queueByPin = new Map<string, Row>();
    if (pinIds.length) {
      const { data: q } = await sb.from("pinterest_pin_queue")
        .select("pin_id,pin_title,meta")
        .in("pin_id", pinIds);
      (q ?? []).forEach((r: Row) => queueByPin.set(r.pin_id, r));
    }

    // 2) Aggregate per-pin signals with decay (recent + 7d window for velocity)
    const now = Date.now();
    const per = new Map<string, { score: number; recent: number; older: number; n: number; cluster: string; features: Record<string, string> }>();
    for (const d of dims ?? []) {
      const rows = (analytics ?? []).filter((a: Row) => a.pin_id === d.pin_id);
      if (!rows.length) continue;
      const q = queueByPin.get(d.pin_id);
      const features = featuresFor(d, q);
      const cluster = clusterFor(features);
      let score = 0, recent = 0, older = 0, n = 0;
      for (const r of rows) {
        const age = (now - new Date(r.day).getTime()) / 86400_000;
        const dec = decay(age);
        const ctr = Number(r.ctr) || 0;
        const saveRate = Number(r.impressions) > 0 ? Number(r.saves) / Number(r.impressions) : 0;
        const clicks = Math.log1p(Number(r.outbound_clicks) + Number(r.pin_clicks));
        const s = (ctr * 0.5 + saveRate * 0.4 + clicks * 0.1) * dec;
        score += s;
        n += 1;
        if (age <= 7) recent += s; else older += s;
      }
      per.set(d.pin_id, { score, recent, older, n, cluster, features });
    }

    // 3) Aggregate by (dimension, value) — global baselines + lift
    const dimVals = new Map<string, { score: number; n: number; recent: number; older: number }>();
    const dimTotals = new Map<string, { score: number; n: number }>();
    for (const [, info] of per) {
      for (const [k, v] of Object.entries(info.features)) {
        const key = `${k}::${v}`;
        const cur = dimVals.get(key) ?? { score: 0, n: 0, recent: 0, older: 0 };
        cur.score += info.score; cur.n += 1;
        cur.recent += info.recent; cur.older += info.older;
        dimVals.set(key, cur);
        const dt = dimTotals.get(k) ?? { score: 0, n: 0 };
        dt.score += info.score; dt.n += 1;
        dimTotals.set(k, dt);
      }
    }

    // 4) Build signal rows
    const signalRows: Row[] = [];
    for (const [key, cur] of dimVals) {
      if (cur.n < MIN_SAMPLE) continue;
      const [dimension, value] = key.split("::");
      const dt = dimTotals.get(dimension)!;
      const baseline = dt.score / Math.max(1, dt.n);
      const avg = cur.score / cur.n;
      const lift = baseline > 0 ? (avg - baseline) / baseline : 0;
      const velocity = cur.recent - cur.older * (7 / Math.max(1, WINDOW_DAYS - 7));
      const momentum = cur.score;
      const confidence = Math.min(1, Math.log10(cur.n + 1) / 2);
      const status = lift > 0.15 ? "rising" : lift < -0.15 ? "declining" : "stable";
      const expected_lifetime_days = status === "rising" ? 45 : status === "declining" ? 7 : 21;
      signalRows.push({
        dimension, value,
        lift_score: Number(lift.toFixed(4)),
        velocity_7d: Number(velocity.toFixed(4)),
        momentum_30d: Number(momentum.toFixed(4)),
        confidence: Number(confidence.toFixed(3)),
        sample_n: cur.n,
        expected_lifetime_days,
        status,
        computed_at: startedAt,
        run_id: runId,
      });
    }

    // 5) Cluster aggregation
    const clusterAgg = new Map<string, { score: number; recent: number; older: number; n: number; signals: string[] }>();
    for (const [, info] of per) {
      const c = clusterAgg.get(info.cluster) ?? { score: 0, recent: 0, older: 0, n: 0, signals: [] };
      c.score += info.score; c.recent += info.recent; c.older += info.older; c.n += 1;
      clusterAgg.set(info.cluster, c);
    }
    const clusterRows: Row[] = [];
    for (const [k, c] of clusterAgg) {
      const momentum = c.older > 0 ? (c.recent - c.older) / c.older : c.recent;
      clusterRows.push({
        cluster_key: k,
        label: clusterLabel(k),
        weight: Number((c.score).toFixed(4)),
        momentum: Number(momentum.toFixed(4)),
        sample_n: c.n,
        status: momentum > 0.1 ? "rising" : momentum < -0.1 ? "declining" : "stable",
        signals: signalRows.filter(s => s.lift_score > 0.2).slice(0, 12).map(s => ({ d: s.dimension, v: s.value, lift: s.lift_score })),
        last_seen: startedAt,
        computed_at: startedAt,
      });
    }

    // 6) Persist (upsert)
    let signalsWritten = 0, clustersWritten = 0;
    if (signalRows.length) {
      const { error } = await sb.from("pinterest_taste_signals")
        .upsert(signalRows, { onConflict: "dimension,value" });
      if (!error) signalsWritten = signalRows.length;
    }
    if (clusterRows.length) {
      const { error } = await sb.from("pinterest_taste_clusters")
        .upsert(clusterRows, { onConflict: "cluster_key" });
      if (!error) clustersWritten = clusterRows.length;
    }

    // 7) Compute Taste Score for recent unpublished drafts (predictive)
    const topRising = signalRows.filter(s => s.status === "rising").slice(0, 50);
    const risingSet = new Set(topRising.map(s => `${s.dimension}::${s.value}`));
    const { data: drafts } = await sb.from("pinterest_pin_queue")
      .select("id,pin_title,meta,status")
      .in("status", ["draft", "ready"]).limit(200);
    let scored = 0, gateOk = 0;
    for (const d of drafts ?? []) {
      const meta = (d.meta ?? {}) as Row;
      const intel = (meta.intelligence ?? {}) as Row;
      const master = (intel.master ?? {}) as Row;
      const fakeDim: Row = { hook_variant: meta?.hook_variant, niche_key: meta?.niche_key };
      const f = featuresFor(fakeDim, d);
      let hits = 0;
      for (const [k, v] of Object.entries(f)) if (risingSet.has(`${k}::${v}`)) hits += 1;
      const trendAlign = Math.min(60, hits * 12);
      const baseQuality = Number(master.inspiration_score ?? intel.score ?? 75);
      const tasteScore = Math.round(0.5 * baseQuality + trendAlign);
      const newMeta = { ...meta, intelligence: { ...intel, taste: { score: tasteScore, hits, computed_at: startedAt, run_id: runId } } };
      await sb.from("pinterest_pin_queue").update({ meta: newMeta }).eq("id", d.id);
      scored += 1; if (tasteScore >= 95) gateOk += 1;
    }

    // 8) Log to evolution log + ops snapshot
    await sb.from("pinterest_evolution_log").insert({
      decision_type: "taste_engine_run",
      target_dimension: "account",
      rationale: `Taste run ${runId}: ${signalsWritten} signals, ${clustersWritten} clusters, ${scored} drafts scored (${gateOk} pass).`,
      new_value: {
        run_id: runId,
        signals_written: signalsWritten,
        clusters_written: clustersWritten,
        rising_signals: signalRows.filter(s => s.status === "rising").length,
        declining_signals: signalRows.filter(s => s.status === "declining").length,
        top_rising: topRising.slice(0, 10),
        cluster_summary: clusterRows.map(c => ({ k: c.cluster_key, w: c.weight, m: c.momentum, s: c.status })),
      },
      metrics: { window_days: WINDOW_DAYS, pins_with_signal: per.size, drafts_scored: scored, drafts_pass_gate: gateOk },
    });
    try {
      await sb.from("pinterest_ops_snapshots").insert({
        metrics: { engine: "taste_engine", run_id: runId, signals: signalsWritten, clusters: clustersWritten, drafts_scored: scored, drafts_pass_gate: gateOk },
      });
    } catch { /* unique constraint on snapshot_date — ok */ }

    return new Response(JSON.stringify({
      ok: true, run_id: runId,
      pins_with_signal: per.size, signals_written: signalsWritten,
      clusters_written: clustersWritten, drafts_scored: scored, drafts_pass_gate: gateOk,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});