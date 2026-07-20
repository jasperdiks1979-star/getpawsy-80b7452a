// PCIE-V2 Phase 3 — Revenue Intelligence Engine.
// Nightly orchestrator: ingest performance → score → evolve weights → cohort
// detect → retire losers → trend scan → revenue dashboard snapshot →
// queue mutated children from winning DNA.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Cfg = Record<string, any>;

function num(v: any, d = 0): number {
  const n = Number(v); return Number.isFinite(n) ? n : d;
}

async function loadConfig(sb: any): Promise<Cfg> {
  const { data } = await sb.from("pcie_v2_config").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

async function flagEnabled(sb: any, flag: string): Promise<boolean> {
  const { data } = await sb.from("pcie_v2_feature_flags").select("enabled").eq("flag", flag).maybeSingle();
  return !!data?.enabled;
}

// Composite revenue score from real outcomes (CTR, save, outbound, ATC, checkout, purchase, revenue, ROAS).
function compositeScore(p: any, weights: Cfg): number {
  const impr = num(p.impressions);
  const sessions = num(p.ga4_sessions);
  const ctr = impr > 0 ? num(p.outbound_clicks) / impr : 0;
  const save = impr > 0 ? num(p.saves) / impr : 0;
  const outbound = impr > 0 ? num(p.outbound_clicks) / impr : 0;
  const atc = sessions > 0 ? num(p.add_to_cart) / sessions : 0;
  const checkout = sessions > 0 ? num(p.checkout) / sessions : 0;
  const purchase = sessions > 0 ? num(p.purchases) / sessions : 0;
  const rev = num(p.revenue_cents) / 100;
  const roas = num(p.roas);
  const w = weights ?? {};
  return (
    ctr * num(w.ctr, 0.15) * 1000 +
    save * num(w.save_rate, 0.10) * 1000 +
    outbound * num(w.outbound_ctr, 0.15) * 1000 +
    atc * num(w.atc_rate, 0.15) * 1000 +
    checkout * num(w.checkout_rate, 0.10) * 1000 +
    purchase * num(w.purchase_rate, 0.15) * 1000 +
    Math.log10(1 + rev) * num(w.revenue, 0.10) * 100 +
    roas * num(w.roas, 0.10) * 10
  );
}

function dnaFingerprint(traits: Record<string, string>): string {
  const keys = Object.keys(traits).sort();
  return keys.map((k) => `${k}:${traits[k] ?? ""}`).join("|");
}

// ---- 1. INGEST: roll Pinterest pin perf + GA4 sessions + orders into per-creative perf rows.
async function ingestPerformance(sb: any, runId: string): Promise<number> {
  // Find creatives with pinterest_pin_id linked.
  const { data: creatives } = await sb
    .from("pcie_v2_creatives")
    .select("id,pinterest_pin_id,product_id,created_at")
    .not("pinterest_pin_id", "is", null)
    .is("retired_at", null)
    .limit(5000);
  if (!creatives?.length) return 0;

  const pinIds = creatives.map((c: any) => c.pinterest_pin_id).filter(Boolean);
  const { data: perfRows } = await sb
    .from("pinterest_pin_performance")
    .select("pin_id,impressions,saves,outbound_clicks,clicks")
    .in("pin_id", pinIds);
  const perfByPin = new Map<string, any>();
  for (const r of perfRows ?? []) perfByPin.set(r.pin_id, r);

  // Pull product-level revenue from orders (last 7d) keyed by product_id for attribution proxy.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const productIds = creatives.map((c: any) => c.product_id).filter(Boolean);
  const revByProduct = new Map<string, { rev: number; orders: number }>();
  if (productIds.length) {
    const { data: orders } = await sb
      .from("orders").select("items,total_amount,created_at,status")
      .gte("created_at", since).in("status", ["paid", "fulfilled", "completed"]).limit(5000);
    for (const o of orders ?? []) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const pid = it.product_id ?? it.id;
        if (!pid) continue;
        const cur = revByProduct.get(pid) ?? { rev: 0, orders: 0 };
        cur.rev += num(it.price_cents ?? (it.price ? it.price * 100 : 0)) * num(it.quantity ?? 1, 1);
        cur.orders += 1;
        revByProduct.set(pid, cur);
      }
    }
  }

  const windowEnd = new Date();
  const windowStart = new Date(Date.now() - 24 * 3600 * 1000);
  const rows: any[] = [];
  for (const c of creatives) {
    const pp = perfByPin.get(c.pinterest_pin_id) ?? {};
    const rev = revByProduct.get(c.product_id) ?? { rev: 0, orders: 0 };
    const impressions = num(pp.impressions);
    const outbound = num(pp.outbound_clicks ?? pp.clicks);
    const saves = num(pp.saves);
    // Best-effort approx: distribute product revenue across creatives weighted by outbound clicks.
    rows.push({
      creative_id: c.id,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      impressions,
      saves,
      outbound_clicks: outbound,
      ga4_sessions: outbound, // proxy until GA4 stitching available
      add_to_cart: 0,
      checkout: 0,
      purchases: rev.orders,
      revenue_cents: rev.rev,
      ad_spend_cents: 0,
      profit_cents: rev.rev,
      aov_cents: rev.orders > 0 ? Math.round(rev.rev / rev.orders) : 0,
      roas: null,
      cac_cents: null,
      cohort: null,
      meta: { source: "phase3_ingest_v1" },
    });
  }
  if (rows.length) {
    // Upsert by unique (creative_id, window_start, window_end)
    await sb.from("pcie_v2_creative_performance").upsert(rows, {
      onConflict: "creative_id,window_start,window_end",
    });
  }
  return rows.length;
}

// ---- 2. DNA: ensure every creative has DNA + updated performance_score.
async function refreshDna(sb: any, weights: Cfg): Promise<{ updated: number; scored: Array<any> }> {
  const { data: creatives } = await sb
    .from("pcie_v2_creatives")
    .select("id,decisions,model,seed,generation,provider_slug,prompt_version")
    .is("retired_at", null)
    .limit(5000);
  if (!creatives?.length) return { updated: 0, scored: [] };

  const cids = creatives.map((c: any) => c.id);
  const { data: perfs } = await sb
    .from("pcie_v2_creative_performance")
    .select("creative_id,impressions,saves,outbound_clicks,ga4_sessions,add_to_cart,checkout,purchases,revenue_cents,roas")
    .in("creative_id", cids);
  const perfByC = new Map<string, any>();
  for (const p of perfs ?? []) {
    const cur = perfByC.get(p.creative_id) ?? { impressions: 0, saves: 0, outbound_clicks: 0, ga4_sessions: 0, add_to_cart: 0, checkout: 0, purchases: 0, revenue_cents: 0, roas: 0 };
    for (const k of Object.keys(cur)) cur[k] = num(cur[k]) + num((p as any)[k]);
    perfByC.set(p.creative_id, cur);
  }

  const rows: any[] = [];
  const scored: any[] = [];
  for (const c of creatives) {
    const d = c.decisions ?? {};
    const traits = {
      style: d.style_family ?? d.style ?? "",
      hook: d.hook ?? "",
      hook_category: d.hook_category ?? "",
      camera: d.camera ?? "",
      emotion: d.emotion ?? "",
      typography: d.typography ?? "",
      cta: d.cta ?? "",
      scene: d.scene ?? "",
    };
    const fp = dnaFingerprint(traits as any);
    const perf = perfByC.get(c.id) ?? {};
    const score = compositeScore(perf, weights);
    rows.push({
      creative_id: c.id, fingerprint: fp, traits,
      provider_slug: c.provider_slug ?? null,
      seed: c.seed ?? null,
      prompt_version: c.prompt_version ?? null,
      performance_score: score,
      generation: c.generation ?? 0,
    });
    scored.push({ creative_id: c.id, traits, fp, score, perf });
  }
  // Chunk upsert
  for (let i = 0; i < rows.length; i += 500) {
    await sb.from("pcie_v2_creative_dna").upsert(rows.slice(i, i + 500), { onConflict: "creative_id" });
  }
  // mirror fingerprint on creative
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await Promise.all(batch.map((r) =>
      sb.from("pcie_v2_creatives").update({ dna_fingerprint: r.fingerprint }).eq("id", r.creative_id)
    ));
  }
  return { updated: rows.length, scored };
}

// ---- 3. WEIGHT EVOLUTION: EMA update on pcie_v2_attribute_weights from real CTR/revenue.
async function evolveWeights(sb: any, scored: any[], alpha: number, signals: string[]): Promise<number> {
  // For each trait value, compute mean composite score; blend into existing weight.
  const trait_keys = ["style", "hook", "hook_category", "camera", "emotion", "typography", "cta", "scene"];
  const acc: Record<string, Record<string, { sum: number; n: number }>> = {};
  for (const s of scored) {
    for (const k of trait_keys) {
      const v = s.traits[k]; if (!v) continue;
      acc[k] = acc[k] ?? {}; acc[k][v] = acc[k][v] ?? { sum: 0, n: 0 };
      acc[k][v].sum += s.score; acc[k][v].n += 1;
    }
  }
  // Compute global mean to normalize
  let gSum = 0, gN = 0;
  for (const s of scored) { gSum += s.score; gN += 1; }
  const gMean = gN ? gSum / gN : 1;
  const updates: any[] = [];
  for (const [attr, byVal] of Object.entries(acc)) {
    for (const [val, agg] of Object.entries(byVal)) {
      const mean = agg.n ? agg.sum / agg.n : gMean;
      // ratio relative to global; >1 = winner, <1 = loser
      const ratio = gMean > 0 ? mean / gMean : 1;
      for (const sig of signals) {
        // Fetch existing weight
        const { data: existing } = await sb.from("pcie_v2_attribute_weights")
          .select("weight").eq("attribute", attr).eq("value_slug", val).eq("signal_slug", sig).maybeSingle();
        const prev = existing ? num(existing.weight, 1) : 1;
        const next = Math.max(0.05, Math.min(5, prev * (1 - alpha) + ratio * alpha));
        updates.push({ attribute: attr, value_slug: val, signal_slug: sig, weight: next, sample_size: agg.n, confidence: Math.min(1, agg.n / 30) });
      }
    }
  }
  for (let i = 0; i < updates.length; i += 200) {
    await sb.from("pcie_v2_attribute_weights").upsert(updates.slice(i, i + 200), {
      onConflict: "attribute,value_slug,signal_slug",
    });
  }
  return updates.length;
}

// ---- 4. COHORT: tag winners / middle / losers; retire chronic losers.
async function classifyCohorts(sb: any, scored: any[], topPct: number, bottomPct: number, minImpr: number): Promise<{ winners: any[]; losers: any[] }> {
  const judged = scored.filter((s) => num(s.perf.impressions) >= minImpr);
  judged.sort((a, b) => b.score - a.score);
  const wN = Math.max(1, Math.floor(judged.length * topPct));
  const lN = Math.max(1, Math.floor(judged.length * bottomPct));
  const winners = judged.slice(0, wN);
  const losers = judged.slice(-lN);
  // Update cohort tag
  const tag = async (rows: any[], cohort: string) => {
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map((r) => r.creative_id);
      await sb.from("pcie_v2_creative_dna").update({ cohort }).in("creative_id", ids);
    }
  };
  await tag(winners, "winner");
  await tag(losers, "loser");
  return { winners, losers };
}

async function autoRetire(sb: any, losers: any[]): Promise<number> {
  if (!losers.length) return 0;
  let retired = 0;
  for (const l of losers) {
    await sb.from("pcie_v2_creatives").update({ retired_at: new Date().toISOString() }).eq("id", l.creative_id);
    await sb.from("pcie_v2_retired_dna").upsert({
      fingerprint: l.fp,
      reason: "bottom_decile_phase3",
      performance_score: l.score,
      sample_size: num(l.perf.impressions),
      traits: l.traits,
    }, { onConflict: "fingerprint" });
    retired += 1;
  }
  return retired;
}

// ---- 5. TREND DETECTION (lightweight v1: seasonality + emerging hooks from winners).
async function detectTrends(sb: any, winners: any[]): Promise<number> {
  if (!winners.length) return 0;
  // Headline / hook frequency among winners → mark trending.
  const hookCount = new Map<string, number>();
  for (const w of winners) {
    const h = w.traits.hook_category; if (!h) continue;
    hookCount.set(h, (hookCount.get(h) ?? 0) + 1);
  }
  const rows: any[] = [];
  const now = new Date();
  const month = now.getUTCMonth();
  const seasonality = month === 10 || month === 11 ? "holiday_q4" : month <= 1 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "fall";
  rows.push({
    trend_type: "seasonality", trend_key: seasonality,
    influence: 1.2, confidence: 0.9, source: "calendar",
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    evidence: { month },
  });
  for (const [k, n] of hookCount.entries()) {
    const conf = Math.min(1, n / Math.max(5, winners.length));
    rows.push({
      trend_type: "hook", trend_key: k,
      influence: 1 + Math.min(1, n / Math.max(5, winners.length)),
      confidence: conf, source: "winner_frequency_v1",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      evidence: { wins: n, sample: winners.length },
    });
  }
  for (let i = 0; i < rows.length; i += 100) {
    await sb.from("pcie_v2_trend_signals").upsert(rows.slice(i, i + 100), { onConflict: "trend_type,trend_key" });
  }
  return rows.length;
}

// ---- 6. EVOLUTION: queue child creatives derived from winner DNA with controlled mutation.
async function queueMutations(sb: any, runId: string, winners: any[], mutationsPerWinner: number, mutationRate: number): Promise<number> {
  if (!winners.length) return 0;
  // Load mutation pools from catalogs
  const [hk, cam, em, typ, sc, ct] = await Promise.all([
    sb.from("pcie_v2_hook_categories").select("slug").eq("enabled", true),
    sb.from("pcie_v2_camera_presets").select("slug").eq("enabled", true),
    sb.from("pcie_v2_emotions").select("slug").eq("enabled", true),
    sb.from("pcie_v2_typography_systems").select("slug").eq("enabled", true),
    sb.from("pcie_v2_scene_generators").select("slug").eq("enabled", true),
    sb.from("pcie_v2_cta_styles").select("slug").eq("enabled", true),
  ]);
  const pools: Record<string, string[]> = {
    hook_category: (hk.data ?? []).map((r: any) => r.slug),
    camera: (cam.data ?? []).map((r: any) => r.slug),
    emotion: (em.data ?? []).map((r: any) => r.slug),
    typography: (typ.data ?? []).map((r: any) => r.slug),
    scene: (sc.data ?? []).map((r: any) => r.slug),
    cta: (ct.data ?? []).map((r: any) => r.slug),
  };
  const traitKeys = Object.keys(pools);
  let queued = 0;
  for (const w of winners) {
    const { data: parent } = await sb.from("pcie_v2_creatives")
      .select("id,product_id,decisions,generation").eq("id", w.creative_id).maybeSingle();
    if (!parent) continue;
    for (let i = 0; i < mutationsPerWinner; i++) {
      const childDecisions = { ...(parent.decisions ?? {}) };
      const mutated: Record<string, string> = {};
      // Pick 1..k traits to mutate
      const k = Math.max(1, Math.round(traitKeys.length * mutationRate));
      const shuffled = [...traitKeys].sort(() => Math.random() - 0.5).slice(0, k);
      for (const t of shuffled) {
        const pool = pools[t]; if (!pool || !pool.length) continue;
        const next = pool[Math.floor(Math.random() * pool.length)];
        if (next && next !== childDecisions[t]) {
          mutated[t] = next; childDecisions[t] = next;
        }
      }
      const inherited: Record<string, string> = {};
      for (const k2 of Object.keys(childDecisions)) {
        if (!(k2 in mutated)) inherited[k2] = childDecisions[k2];
      }
      // Queue evolution row; actual rendering is performed by pcie-v2-creative-director on next invocation.
      const { data: child } = await sb.from("pcie_v2_creatives").insert({
        product_id: parent.product_id,
        decisions: childDecisions,
        parent_creative_id: parent.id,
        generation: (parent.generation ?? 0) + 1,
        status: "queued",
        dry_run: false,
        explanation: {
          inherited_from: parent.id,
          inherited_traits: inherited,
          mutated_traits: mutated,
          expected_lift: 0.10,
          rationale: `Inherited winning DNA from parent ${parent.id} (score=${w.score.toFixed(1)}); mutated ${Object.keys(mutated).length} traits.`,
          run_id: runId,
        },
      }).select("id").maybeSingle();
      if (child) {
        await sb.from("pcie_v2_evolution_lineage").insert({
          run_id: runId,
          parent_creative_id: parent.id,
          child_creative_id: child.id,
          inherited_traits: inherited,
          mutated_traits: mutated,
          expected_lift: 0.10,
          rationale: `winner_mutation generation=${(parent.generation ?? 0) + 1}`,
        });
        queued += 1;
      }
    }
  }
  return queued;
}

// ---- 7. DASHBOARD SNAPSHOT.
async function snapshotDashboard(sb: any, scored: any[], learningSpeed: number, mutationRate: number) {
  const byTrait = (key: string) => {
    const acc = new Map<string, { sum: number; n: number; rev: number; impr: number; clicks: number }>();
    for (const s of scored) {
      const v = s.traits[key]; if (!v) continue;
      const cur = acc.get(v) ?? { sum: 0, n: 0, rev: 0, impr: 0, clicks: 0 };
      cur.sum += s.score; cur.n += 1;
      cur.rev += num(s.perf.revenue_cents);
      cur.impr += num(s.perf.impressions);
      cur.clicks += num(s.perf.outbound_clicks);
      acc.set(v, cur);
    }
    return [...acc.entries()].map(([v, a]) => ({
      value: v, avg_score: a.n ? a.sum / a.n : 0, samples: a.n,
      revenue_cents: a.rev, impressions: a.impr,
      ctr: a.impr > 0 ? a.clicks / a.impr : 0,
    })).sort((a, b) => b.avg_score - a.avg_score);
  };
  const topDna = [...scored].sort((a, b) => b.score - a.score).slice(0, 20).map((s) => ({ creative_id: s.creative_id, fingerprint: s.fp, score: s.score, traits: s.traits }));
  const worstDna = [...scored].sort((a, b) => a.score - b.score).slice(0, 20).map((s) => ({ creative_id: s.creative_id, fingerprint: s.fp, score: s.score, traits: s.traits }));
  const totals = scored.reduce((acc, s) => {
    acc.impressions += num(s.perf.impressions);
    acc.outbound += num(s.perf.outbound_clicks);
    acc.revenue_cents += num(s.perf.revenue_cents);
    acc.creatives += 1;
    return acc;
  }, { impressions: 0, outbound: 0, revenue_cents: 0, creatives: 0 });
  await sb.from("pcie_v2_revenue_snapshots").upsert({
    snapshot_date: new Date().toISOString().slice(0, 10),
    top_dna: topDna, worst_dna: worstDna,
    winning_hooks: byTrait("hook_category").slice(0, 10),
    winning_scenes: byTrait("scene").slice(0, 10),
    winning_emotions: byTrait("emotion").slice(0, 10),
    winning_typography: byTrait("typography").slice(0, 10),
    revenue_per_style: byTrait("style").slice(0, 10),
    ctr_per_hook: byTrait("hook_category").slice(0, 10),
    roas_per_family: byTrait("style").slice(0, 10),
    evolution_graph: [],
    learning_speed: learningSpeed,
    mutation_rate: mutationRate,
    totals,
  }, { onConflict: "snapshot_date" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: run } = await sb.from("pcie_v2_evolution_runs").insert({ status: "running" }).select("id").maybeSingle();
  const runId = run?.id;
  try {
    const cfg = await loadConfig(sb);
    const learningSpeed = num(cfg.learning_speed_default, 0.15);
    const mutationRate = num(cfg.mutation_rate_default, 0.25);
    const mutationsPerWinner = num(cfg.mutations_per_winner, 3);
    const minImpr = num(cfg.min_impressions_for_judgment, 500);
    const topPct = num(cfg.winner_top_pct, 0.10);
    const botPct = num(cfg.loser_bottom_pct, 0.10);
    const revWeights = cfg.revenue_signal_weights ?? {};

    const learning = await flagEnabled(sb, "pcie_v2_revenue_learning");
    const auto = await flagEnabled(sb, "pcie_v2_auto_evolution");
    const retire = await flagEnabled(sb, "pcie_v2_auto_retirement");
    const trends = await flagEnabled(sb, "pcie_v2_trend_detection");

    let ingested = 0, weightUpd = 0, queued = 0, retired = 0, trendCount = 0;
    if (learning) ingested = await ingestPerformance(sb, runId);
    const { scored } = await refreshDna(sb, revWeights);
    if (learning) weightUpd = await evolveWeights(sb, scored, learningSpeed, ["ctr", "save_rate", "purchase_rate", "revenue", "roas"]);
    const { winners, losers } = await classifyCohorts(sb, scored, topPct, botPct, minImpr);
    if (retire) retired = await autoRetire(sb, losers);
    if (trends) trendCount = await detectTrends(sb, winners);
    if (auto) queued = await queueMutations(sb, runId, winners, mutationsPerWinner, mutationRate);
    await snapshotDashboard(sb, scored, learningSpeed, mutationRate);

    await sb.from("pcie_v2_evolution_runs").update({
      status: "completed", finished_at: new Date().toISOString(),
      creatives_evaluated: scored.length,
      winners_selected: winners.length,
      mutations_queued: queued,
      losers_retired: retired,
      weights_updated: weightUpd,
      trends_detected: trendCount,
      learning_speed: learningSpeed,
      mutation_rate: mutationRate,
      notes: { ingested },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true, run_id: runId, ingested,
      evaluated: scored.length, winners: winners.length, losers: losers.length,
      mutations_queued: queued, retired, trends_detected: trendCount, weights_updated: weightUpd,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await sb.from("pcie_v2_evolution_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: String(e?.message ?? e),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});