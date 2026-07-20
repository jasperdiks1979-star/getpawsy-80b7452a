// PCIE2 Evidence Governor — nightly trait-weight learner.
// Reads lineage (pcie2_creatives.pinterest_pin_id ↔ pinterest_pin_performance ↔
// pinterest_revenue_funnel_daily), splits into "recent" vs "prior" rolling
// windows, requires deterministic lineage + minimum sample + Wilson confidence
// + minimum age + trend stability before nudging weights. Updates
// `pcie2_trait_weights` via small EMA steps, records every change in
// `pcie2_trait_weight_history`, and logs the run in `pcie2_evidence_runs`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Evidence thresholds
const RECENT_WINDOW = 30;          // days for "recent" evidence
const PRIOR_WINDOW = 30;           // days for "prior" comparison
const MIN_SAMPLE = 20;             // pins per trait
const MIN_IMPRESSIONS = 500;
const MIN_AGE_DAYS = 14;           // first-seen must be ≥ this
const MIN_CONFIDENCE = 0.6;        // Wilson lower bound
const ALPHA_BASE = 0.10;           // EMA step — never instant flip (scaled by ALG learning_speed)
const WEIGHT_MIN = 0.2;
const WEIGHT_MAX = 2.0;
const OUTLIER_PIN_SHARE = 0.40;    // single pin > 40% impressions ⇒ observational
const ACTIVE_TREND_FLOOR = -0.10;  // trait must not be declining > 10% to stay active

type Dna = Record<string, unknown>;
type Creative = { pinterest_pin_id: string; creative_dna: Dna | null; family: string | null; visual_style: string | null; posted_at?: string | null; created_at?: string };
type Perf = { pin_id: string; impressions: number | null; clicks: number | null; saves: number | null; created_at: string };
type Rev = { pin_id: string; revenue_cents: number | null; purchases: number | null; day: string };

function wilsonLower(p: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (c - m) / d);
}

function flattenDna(dna: Dna | null, prefix = ""): Array<[string, string]> {
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
      out.push(...flattenDna(v as Dna, key));
    }
  }
  return out;
}

type Agg = {
  n: number; impr: number; clicks: number; saves: number;
  rev: number; purchases: number; topPinImpr: number;
};
const emptyAgg = (): Agg => ({ n: 0, impr: 0, clicks: 0, saves: 0, rev: 0, purchases: 0, topPinImpr: 0 });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);

  // Consult Adaptive Learning Governor — never bypass.
  const { data: alg } = await supa
    .from("pcie2_alg_state").select("state, learning_speed").eq("scope", "global").maybeSingle();
  const algState = alg?.state ?? "LEARNING";
  const algSpeed = Number(alg?.learning_speed ?? 1);
  if (algState === "PAUSED" && !dryRun) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "ALG state=PAUSED" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const ALPHA = ALPHA_BASE * Math.max(0, Math.min(1, algSpeed));
  const t0 = Date.now();
  const now = Date.now();
  const recentSince = new Date(now - RECENT_WINDOW * 864e5);
  const priorSince = new Date(now - (RECENT_WINDOW + PRIOR_WINDOW) * 864e5);

  // 1. Pull lineage with deterministic join keys
  const [{ data: creatives }, { data: perf }, { data: rev }] = await Promise.all([
    supa.from("pcie2_creatives")
      .select("pinterest_pin_id,creative_dna,family,visual_style,created_at")
      .not("pinterest_pin_id", "is", null)
      .gte("created_at", priorSince.toISOString())
      .limit(20000),
    supa.from("pinterest_pin_performance")
      .select("pin_id,impressions,clicks,saves,created_at")
      .gte("created_at", priorSince.toISOString())
      .limit(50000),
    supa.from("pinterest_revenue_funnel_daily")
      .select("pin_id,revenue_cents,purchases,day")
      .gte("day", priorSince.toISOString().slice(0, 10))
      .limit(100000),
  ]);

  // 2. Index perf/rev by pin + window
  const perfRecent = new Map<string, Perf>();
  const perfPrior = new Map<string, Perf>();
  for (const p of (perf ?? []) as Perf[]) {
    const bucket = new Date(p.created_at).getTime() >= recentSince.getTime() ? perfRecent : perfPrior;
    const cur = bucket.get(p.pin_id) ?? { pin_id: p.pin_id, impressions: 0, clicks: 0, saves: 0, created_at: p.created_at };
    cur.impressions = (cur.impressions ?? 0) + (p.impressions ?? 0);
    cur.clicks = (cur.clicks ?? 0) + (p.clicks ?? 0);
    cur.saves = (cur.saves ?? 0) + (p.saves ?? 0);
    bucket.set(p.pin_id, cur);
  }
  const revRecent = new Map<string, Rev>();
  const revPrior = new Map<string, Rev>();
  for (const r of (rev ?? []) as Rev[]) {
    if (!r.pin_id) continue;
    const bucket = r.day >= recentSince.toISOString().slice(0, 10) ? revRecent : revPrior;
    const cur = bucket.get(r.pin_id) ?? { pin_id: r.pin_id, revenue_cents: 0, purchases: 0, day: r.day };
    cur.revenue_cents = (cur.revenue_cents ?? 0) + (r.revenue_cents ?? 0);
    cur.purchases = (cur.purchases ?? 0) + (r.purchases ?? 0);
    bucket.set(r.pin_id, cur);
  }

  // 3. Aggregate per (dim,val) per window
  type Key = string;
  const recentAgg = new Map<Key, Agg>();
  const priorAgg = new Map<Key, Agg>();
  const firstSeen = new Map<Key, string>(); // earliest creative.created_at per trait
  const pinShare = new Map<Key, Map<string, number>>(); // for outlier detection

  function bump(map: Map<Key, Agg>, key: Key, p: Perf | undefined, r: Rev | undefined, pinId: string) {
    const a = map.get(key) ?? emptyAgg();
    a.n += 1;
    const im = p?.impressions ?? 0;
    a.impr += im;
    a.clicks += p?.clicks ?? 0;
    a.saves += p?.saves ?? 0;
    a.rev += r?.revenue_cents ?? 0;
    a.purchases += r?.purchases ?? 0;
    if (im > a.topPinImpr) a.topPinImpr = im;
    map.set(key, a);
    // track per-pin impressions for outlier check (recent only matters)
    if (map === recentAgg) {
      const ps = pinShare.get(key) ?? new Map<string, number>();
      ps.set(pinId, (ps.get(pinId) ?? 0) + im);
      pinShare.set(key, ps);
    }
  }

  for (const c of (creatives ?? []) as Creative[]) {
    const pinId = c.pinterest_pin_id;
    const pairs = flattenDna(c.creative_dna);
    if (c.family) pairs.push(["family", c.family]);
    if (c.visual_style) pairs.push(["visual_style", c.visual_style]);
    const pR = perfRecent.get(pinId);
    const pP = perfPrior.get(pinId);
    const rR = revRecent.get(pinId);
    const rP = revPrior.get(pinId);
    for (const [d, v] of pairs) {
      const key = `${d}|${v}`;
      if (pR) bump(recentAgg, key, pR, rR, pinId);
      if (pP) bump(priorAgg, key, pP, rP, pinId);
      const seen = firstSeen.get(key);
      if (c.created_at && (!seen || c.created_at < seen)) firstSeen.set(key, c.created_at);
    }
  }

  // 4. Baselines (recent window only)
  let bImpr = 0, bClicks = 0, bSaves = 0, bRev = 0, bPurch = 0, bPins = 0;
  for (const p of perfRecent.values()) { bImpr += p.impressions ?? 0; bClicks += p.clicks ?? 0; bSaves += p.saves ?? 0; bPins += 1; }
  for (const r of revRecent.values()) { bRev += r.revenue_cents ?? 0; bPurch += r.purchases ?? 0; }
  const baseCtr = bImpr ? bClicks / bImpr : 0;
  const baseSaveRate = bImpr ? bSaves / bImpr : 0;
  const baseRevPerPin = bPins ? bRev / bPins : 0;
  const basePurchasePerPin = bPins ? bPurch / bPins : 0;

  // 5. Build evidence + decision per trait
  const { data: prior } = await supa.from("pcie2_trait_weights")
    .select("dimension,value,weight,status,first_seen_at");
  const priorMap = new Map<string, { weight: number; status: string; first_seen_at: string }>();
  for (const p of (prior ?? []) as Array<{ dimension: string; value: string; weight: number; status: string; first_seen_at: string }>) {
    priorMap.set(`${p.dimension}|${p.value}`, { weight: Number(p.weight), status: p.status, first_seen_at: p.first_seen_at });
  }

  const runId = crypto.randomUUID();
  const upserts: Array<Record<string, unknown>> = [];
  const history: Array<Record<string, unknown>> = [];
  let evaluated = 0, promoted = 0, demoted = 0, observed = 0;
  let totalConf = 0, confN = 0;
  const decisions: Array<{ dim: string; val: string; old: number; next: number; reason: string; conf: number; n: number }> = [];

  for (const [key, aR] of recentAgg) {
    const [dim, val] = key.split("|");
    if (!dim || !val) continue;
    evaluated++;
    const aP = priorAgg.get(key) ?? emptyAgg();
    const seenAt = firstSeen.get(key) ?? new Date().toISOString();
    const ageDays = Math.floor((now - new Date(seenAt).getTime()) / 864e5);

    const ctr = aR.impr ? aR.clicks / aR.impr : 0;
    const saveRate = aR.impr ? aR.saves / aR.impr : 0;
    const ctrLift = baseCtr ? ctr / baseCtr : 1;
    const saveLift = baseSaveRate ? saveRate / baseSaveRate : 1;
    const revPerPin = aR.n ? aR.rev / aR.n : 0;
    const purchPerPin = aR.n ? aR.purchases / aR.n : 0;
    const revLift = baseRevPerPin ? revPerPin / baseRevPerPin : 1;
    const purchLift = basePurchasePerPin ? purchPerPin / basePurchasePerPin : 1;

    // Wilson confidence on CTR + sample saturation
    const ctrConf = wilsonLower(ctr, aR.impr);
    const confidence = Math.min(0.99, 0.55 * ctrConf + 0.45 * Math.min(1, aR.n / 40));

    // Trend: recent CTR vs prior CTR
    const priorCtr = aP.impr ? aP.clicks / aP.impr : ctr;
    const trend = priorCtr ? (ctr - priorCtr) / priorCtr : 0;

    // Outlier: top pin share
    const ps = pinShare.get(key);
    const topShare = ps && aR.impr ? aR.topPinImpr / aR.impr : 0;
    const isOutlierDominated = topShare > OUTLIER_PIN_SHARE;

    // Stability: 1 - |trend| (clipped)
    const stability = Math.max(0, Math.min(1, 1 - Math.abs(trend)));

    const priorRow = priorMap.get(key);
    const oldWeight = priorRow?.weight ?? 1.0;

    // Gate: require evidence to flip status away from observational
    const meetsGate = aR.n >= MIN_SAMPLE
      && aR.impr >= MIN_IMPRESSIONS
      && ageDays >= MIN_AGE_DAYS
      && confidence >= MIN_CONFIDENCE
      && !isOutlierDominated;

    // Composite target weight (blends lifts, anchored at 1.0)
    const targetLift = 0.45 * ctrLift + 0.25 * saveLift + 0.20 * revLift + 0.10 * purchLift;
    const target = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, targetLift));

    let status: "active" | "observational" | "retired" = "observational";
    let nextWeight = oldWeight;
    let reason = "";

    if (!meetsGate) {
      observed++;
      reason = `awaiting evidence (n=${aR.n}, impr=${aR.impr}, age=${ageDays}d, conf=${confidence.toFixed(2)}${isOutlierDominated ? `, outlier_share=${(topShare*100).toFixed(0)}%` : ""})`;
    } else if (trend < ACTIVE_TREND_FLOOR && oldWeight > 1.0) {
      // Self-healing: gradual decay for declining winners
      nextWeight = Math.max(WEIGHT_MIN, oldWeight + ALPHA * (Math.max(target, 0.8) - oldWeight));
      status = "active";
      demoted++;
      reason = `declining: trend ${(trend*100).toFixed(1)}%, ctrLift ${ctrLift.toFixed(2)} — soft decay`;
    } else if (target > oldWeight) {
      nextWeight = Math.min(WEIGHT_MAX, oldWeight + ALPHA * (target - oldWeight));
      status = "active";
      promoted++;
      reason = `improving: ctrLift ${ctrLift.toFixed(2)}, saveLift ${saveLift.toFixed(2)}, revLift ${revLift.toFixed(2)} (n=${aR.n}, conf=${confidence.toFixed(2)})`;
    } else if (target < oldWeight) {
      nextWeight = Math.max(WEIGHT_MIN, oldWeight + ALPHA * (target - oldWeight));
      status = "active";
      demoted++;
      reason = `softening: target ${target.toFixed(2)} < current ${oldWeight.toFixed(2)} (n=${aR.n})`;
    } else {
      status = "active";
      reason = `stable at ${oldWeight.toFixed(2)} (n=${aR.n}, conf=${confidence.toFixed(2)})`;
    }

    totalConf += confidence; confN++;

    upserts.push({
      dimension: dim,
      value: val,
      weight: Number(nextWeight.toFixed(4)),
      prev_weight: Number(oldWeight.toFixed(4)),
      status,
      sample_n: aR.n,
      confidence: Number(confidence.toFixed(4)),
      ctr_lift: Number(ctrLift.toFixed(4)),
      save_lift: Number(saveLift.toFixed(4)),
      rev_lift: Number(revLift.toFixed(4)),
      purchase_lift: Number(purchLift.toFixed(4)),
      trend: Number(trend.toFixed(4)),
      stability: Number(stability.toFixed(4)),
      evidence_age_days: ageDays,
      evidence_window_days: RECENT_WINDOW,
      last_reason: reason,
      first_seen_at: priorRow?.first_seen_at ?? seenAt,
      last_evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (Math.abs(nextWeight - oldWeight) > 1e-4) {
      history.push({
        dimension: dim, value: val,
        old_weight: Number(oldWeight.toFixed(4)),
        new_weight: Number(nextWeight.toFixed(4)),
        delta: Number((nextWeight - oldWeight).toFixed(4)),
        reason,
        evidence: {
          n: aR.n, impressions: aR.impr, ctr, save_rate: saveRate,
          ctr_lift: ctrLift, save_lift: saveLift, rev_lift: revLift, purchase_lift: purchLift,
          trend, stability, confidence, age_days: ageDays, top_pin_share: topShare,
          baseline_ctr: baseCtr, baseline_save_rate: baseSaveRate,
        },
        run_id: runId,
      });
      decisions.push({ dim, val, old: oldWeight, next: nextWeight, reason, conf: confidence, n: aR.n });
    }
  }

  let writtenWeights = 0, writtenHistory = 0;
  if (!dryRun) {
    // Batched upsert
    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500);
      const { error } = await supa.from("pcie2_trait_weights")
        .upsert(chunk, { onConflict: "dimension,value" });
      if (!error) writtenWeights += chunk.length;
    }
    for (let i = 0; i < history.length; i += 500) {
      const chunk = history.slice(i, i + 500);
      const { error } = await supa.from("pcie2_trait_weight_history").insert(chunk);
      if (!error) writtenHistory += chunk.length;
    }
  }

  const avgConfidence = confN ? totalConf / confN : 0;
  // Learning velocity: weight changes per day (history rows / window_days)
  const learningVelocity = history.length / Math.max(1, RECENT_WINDOW);

  const summary = {
    run_id: runId,
    window_days: RECENT_WINDOW,
    prior_window_days: PRIOR_WINDOW,
    joinable_pins_recent: perfRecent.size,
    joinable_pins_prior: perfPrior.size,
    traits_evaluated: evaluated,
    traits_promoted: promoted,
    traits_demoted: demoted,
    traits_observed: observed,
    weight_changes: history.length,
    avg_confidence: Number(avgConfidence.toFixed(4)),
    learning_velocity: Number(learningVelocity.toFixed(4)),
    baseline_ctr: baseCtr,
    baseline_save_rate: baseSaveRate,
    baseline_rev_per_pin: baseRevPerPin,
    written_weights: writtenWeights,
    written_history: writtenHistory,
    top_changes: decisions.sort((a, b) => Math.abs(b.next - b.old) - Math.abs(a.next - a.old)).slice(0, 10),
    duration_ms: Date.now() - t0,
  };

  if (!dryRun) {
    await supa.from("pcie2_evidence_runs").insert({
      id: runId,
      finished_at: new Date().toISOString(),
      traits_evaluated: evaluated,
      traits_promoted: promoted,
      traits_demoted: demoted,
      traits_observed: observed,
      avg_confidence: avgConfidence,
      learning_velocity: learningVelocity,
      summary,
    });
  }

  return new Response(JSON.stringify({ ok: true, dry_run: dryRun, summary }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});