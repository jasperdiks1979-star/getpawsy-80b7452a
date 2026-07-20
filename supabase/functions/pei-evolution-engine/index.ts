// PEI-V1 — Pinterest Evolution Intelligence engine.
// Orchestrates DNA capture, attribution rollup, Thompson Sampling weight
// updates, weekly evolution reports, retirement, and predicted winners.
// Sits above PCIE-V2, PPE, AEC — does not duplicate their storage.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action =
  | "snapshot_dna"
  | "rollup_attribution"
  | "update_weights"
  | "predict_winners"
  | "weekly_report"
  | "retire_stale"
  | "run_full"
  | "dashboard";

const SEASON = (d = new Date()): string => {
  const m = d.getUTCMonth() + 1;
  if ([12, 1, 2].includes(m)) return "winter";
  if ([3, 4, 5].includes(m)) return "spring";
  if ([6, 7, 8].includes(m)) return "summer";
  return "fall";
};

function pickGenes(genome: Record<string, unknown>): Array<[string, string]> {
  const dims = [
    "story", "emotion", "hook", "headline", "cta",
    "typography", "camera", "lens", "perspective", "composition",
    "lighting", "palette", "scene", "environment", "season",
    "pet_species", "breed", "owner_profile", "badge", "psychology",
  ];
  const out: Array<[string, string]> = [];
  for (const d of dims) {
    const v = (genome as any)[d];
    if (v && typeof v === "string") out.push([d, v.slice(0, 80)]);
  }
  return out;
}

async function snapshotDNA(sb: ReturnType<typeof createClient>) {
  // Pull most-recent PCIE-V2 creatives that don't yet have a DNA row.
  const { data: creatives } = await sb
    .from("pcie_v2_creatives")
    .select("id,product_id,published_pin_id,published_at,dna,scores,image_url,destination_url,country")
    .not("published_pin_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(500);

  if (!creatives?.length) return { inserted: 0 };
  const ids = creatives.map((c: any) => c.id);
  const { data: existing } = await sb
    .from("pei_creative_dna").select("creative_id").in("creative_id", ids);
  const have = new Set((existing ?? []).map((r: any) => r.creative_id));
  const rows = creatives.filter((c: any) => !have.has(c.id)).map((c: any) => ({
    creative_id: c.id,
    source_engine: "pcie_v2",
    product_id: c.product_id,
    pinterest_pin_id: c.published_pin_id,
    destination_url: c.destination_url,
    image_url: c.image_url,
    country: c.country ?? "US",
    season: SEASON(new Date(c.published_at ?? Date.now())),
    genome: c.dna ?? {},
    scores: c.scores ?? {},
    published_at: c.published_at,
  }));
  if (!rows.length) return { inserted: 0 };
  const { error } = await sb.from("pei_creative_dna").insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}

async function rollupAttribution(sb: ReturnType<typeof createClient>) {
  const { data: dna } = await sb
    .from("pei_creative_dna")
    .select("id,pinterest_pin_id,product_id")
    .is("retired_at", null)
    .not("pinterest_pin_id", "is", null)
    .limit(2000);
  if (!dna?.length) return { rolled: 0 };

  const pinIds = dna.map((d: any) => d.pinterest_pin_id);
  const { data: perf } = await sb
    .from("pcie2_pin_performance")
    .select("pin_id,impressions,saves,outbound_clicks,closeups,ctr")
    .in("pin_id", pinIds);
  const perfMap = new Map((perf ?? []).map((p: any) => [p.pin_id, p]));

  const productIds = [...new Set(dna.map((d: any) => d.product_id).filter(Boolean))];
  const { data: revenue } = await sb
    .from("orders")
    .select("items_json,total_amount_cents,created_at")
    .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
    .limit(5000);
  // Naive per-product revenue split across DNA rows of same product.
  const revByProduct = new Map<string, number>();
  for (const o of revenue ?? []) {
    const items = Array.isArray((o as any).items_json) ? (o as any).items_json : [];
    for (const it of items) {
      const pid = it.product_id ?? it.id;
      if (!pid || !productIds.includes(pid)) continue;
      const cents = Number(it.price_cents ?? it.amount_cents ?? 0) * Number(it.quantity ?? 1);
      revByProduct.set(pid, (revByProduct.get(pid) ?? 0) + cents);
    }
  }

  const rows = dna.map((d: any) => {
    const p = perfMap.get(d.pinterest_pin_id) ?? {};
    const productRev = revByProduct.get(d.product_id) ?? 0;
    const dnaForProduct = dna.filter((x: any) => x.product_id === d.product_id).length || 1;
    const revShare = Math.floor(productRev / dnaForProduct);
    return {
      dna_id: d.id,
      pinterest_pin_id: d.pinterest_pin_id,
      impressions: p.impressions ?? 0,
      closeups: p.closeups ?? 0,
      saves: p.saves ?? 0,
      outbound_clicks: p.outbound_clicks ?? 0,
      ctr: p.ctr ?? null,
      revenue_cents: revShare,
      profit_cents: Math.floor(revShare * 0.35),
      roas: revShare > 0 ? revShare / 100 : null,
      window_days: 14,
    };
  });
  // Replace rollup window: delete existing 14d, then insert.
  await sb.from("pei_attribution_rollup").delete().eq("window_days", 14).in("dna_id", dna.map((d: any) => d.id));
  const { error } = await sb.from("pei_attribution_rollup").insert(rows);
  if (error) throw error;
  return { rolled: rows.length };
}

async function updateWeights(sb: ReturnType<typeof createClient>) {
  const { data: dna } = await sb
    .from("pei_creative_dna")
    .select("id,country,season,genome");
  if (!dna?.length) return { updated: 0 };

  const { data: attr } = await sb
    .from("pei_attribution_rollup").select("dna_id,outbound_clicks,impressions,purchases,revenue_cents");
  const attrMap = new Map((attr ?? []).map((a: any) => [a.dna_id, a]));

  // Aggregate alpha/beta + revenue per gene/country/season.
  type Agg = { alpha: number; beta: number; n: number; rev: number };
  const acc = new Map<string, Agg>();
  for (const d of dna) {
    const a = attrMap.get((d as any).id);
    if (!a) continue;
    const imps = Number((a as any).impressions ?? 0);
    const clicks = Number((a as any).outbound_clicks ?? 0);
    if (imps < 50) continue;
    const success = clicks + Number((a as any).purchases ?? 0) * 10;
    const fail = Math.max(0, imps - success);
    const rev = Number((a as any).revenue_cents ?? 0);
    for (const [dim, val] of pickGenes((d as any).genome ?? {})) {
      const key = `${dim}|${val}|${(d as any).country ?? "US"}|${(d as any).season ?? ""}`;
      const e = acc.get(key) ?? { alpha: 1, beta: 1, n: 0, rev: 0 };
      e.alpha += success;
      e.beta += fail;
      e.n += 1;
      e.rev += rev;
      acc.set(key, e);
    }
  }

  const rows = [...acc.entries()].map(([k, v]) => {
    const [gene_dimension, gene_value, country, season] = k.split("|");
    const mean = v.alpha / (v.alpha + v.beta);
    const weight = 0.5 + Math.min(1.5, mean * 2); // 0.5..2.0
    return {
      gene_dimension, gene_value, country, season: season || null,
      alpha: v.alpha, beta: v.beta, sample_count: v.n,
      revenue_cents: v.rev, weight,
      last_updated: new Date().toISOString(),
    };
  });

  for (const r of rows) {
    await sb.from("pei_gene_performance").upsert(r, {
      onConflict: "gene_dimension,gene_value,country,season",
    });
  }
  await sb.from("pei_weight_snapshots").insert({
    country: "US",
    snapshot: { top: rows.sort((a, b) => b.weight - a.weight).slice(0, 50) },
  });
  return { updated: rows.length };
}

async function predictWinners(sb: ReturnType<typeof createClient>) {
  const { data: weights } = await sb
    .from("pei_gene_performance").select("*").eq("country", "US")
    .order("weight", { ascending: false }).limit(200);
  if (!weights?.length) return { predicted: 0 };

  const { data: products } = await sb
    .from("products").select("id,name,margin_percent,inventory_score,category")
    .eq("is_active", true).gte("margin_percent", 0.3).limit(50);
  if (!products?.length) return { predicted: 0 };

  const season = SEASON();
  const rows = products.map((p: any) => {
    const recommended: Record<string, string> = {};
    const topByDim = new Map<string, any>();
    for (const w of weights) {
      if (w.season && w.season !== season) continue;
      if (!topByDim.has(w.gene_dimension)) topByDim.set(w.gene_dimension, w);
    }
    const codes: string[] = [];
    for (const [dim, w] of topByDim) {
      recommended[dim] = w.gene_value;
      codes.push(`${dim}:${w.gene_value} (+${Math.round((w.weight - 1) * 100)}%)`);
    }
    const meanWeight = [...topByDim.values()].reduce((s, x) => s + x.weight, 0) / Math.max(1, topByDim.size);
    const expCtr = Math.min(0.08, 0.015 * meanWeight);
    const expCvr = Math.min(0.07, 0.02 * meanWeight);
    const aov = 4500;
    const expRev = Math.round(expCtr * expCvr * 10000 * aov);
    const expProf = Math.round(expRev * (p.margin_percent ?? 0.35));
    return {
      product_id: p.id, country: "US", season,
      expected_ctr: expCtr, expected_cvr: expCvr,
      expected_roas: meanWeight * 3,
      expected_revenue_cents: expRev,
      expected_profit_cents: expProf,
      recommended_genome: recommended,
      rationale: `Top genes for ${season} US: ${codes.slice(0, 6).join(", ")}`,
      reason_codes: codes.slice(0, 10),
      confidence: Math.min(0.95, 0.4 + meanWeight * 0.2),
    };
  });
  await sb.from("pei_predicted_winners").delete().eq("country", "US").eq("season", season);
  const { error } = await sb.from("pei_predicted_winners").insert(rows);
  if (error) throw error;
  return { predicted: rows.length };
}

async function weeklyReport(sb: ReturnType<typeof createClient>) {
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const ws = weekStart.toISOString().slice(0, 10);

  const { data: top } = await sb.from("pei_attribution_rollup")
    .select("dna_id,revenue_cents,outbound_clicks,ctr").order("revenue_cents", { ascending: false }).limit(10);
  const { data: worst } = await sb.from("pei_attribution_rollup")
    .select("dna_id,impressions,outbound_clicks").gte("impressions", 500).order("outbound_clicks").limit(10);
  const { data: rising } = await sb.from("pei_gene_performance")
    .select("gene_dimension,gene_value,weight,sample_count").eq("country", "US")
    .order("weight", { ascending: false }).limit(15);
  const { data: declining } = await sb.from("pei_gene_performance")
    .select("gene_dimension,gene_value,weight,sample_count").eq("country", "US")
    .gte("sample_count", 5).order("weight").limit(15);

  const totalRev = (top ?? []).reduce((s, r: any) => s + Number(r.revenue_cents ?? 0), 0);
  const briefing = [
    `Week of ${ws} (US).`,
    `Top 10 creatives generated $${(totalRev / 100).toFixed(0)} revenue.`,
    `Rising genes: ${(rising ?? []).slice(0, 5).map((r: any) => `${r.gene_value}(${r.weight.toFixed(2)})`).join(", ")}.`,
    `Declining genes: ${(declining ?? []).slice(0, 5).map((r: any) => `${r.gene_value}(${r.weight.toFixed(2)})`).join(", ")}.`,
  ].join(" ");

  await sb.from("pei_evolution_reports").upsert({
    week_start: ws, country: "US",
    top_performers: top ?? [], worst_performers: worst ?? [],
    rising_genes: rising ?? [], declining_genes: declining ?? [],
    revenue_insights: { total_top10_cents: totalRev },
    briefing,
  }, { onConflict: "week_start,country" });
  return { week: ws };
}

async function retireStale(sb: ReturnType<typeof createClient>) {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: stale } = await sb
    .from("pei_attribution_rollup")
    .select("dna_id,impressions,outbound_clicks")
    .gte("impressions", 1000)
    .lte("outbound_clicks", 3);
  const ids = (stale ?? []).map((s: any) => s.dna_id);
  if (!ids.length) return { retired: 0 };
  await sb.from("pei_creative_dna").update({
    retired_at: new Date().toISOString(),
    retired_reason: "low_ctr_high_impressions",
  }).in("id", ids).is("retired_at", null).lt("published_at", cutoff);
  return { retired: ids.length };
}

async function dashboard(sb: ReturnType<typeof createClient>) {
  const [dna, attr, weights, reports, preds, runs] = await Promise.all([
    sb.from("pei_creative_dna").select("id", { count: "exact", head: true }),
    sb.from("pei_attribution_rollup").select("revenue_cents,outbound_clicks,impressions"),
    sb.from("pei_gene_performance").select("*").order("weight", { ascending: false }).limit(20),
    sb.from("pei_evolution_reports").select("*").order("week_start", { ascending: false }).limit(4),
    sb.from("pei_predicted_winners").select("*").order("expected_profit_cents", { ascending: false }).limit(20),
    sb.from("pei_engine_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);
  const totalRev = (attr.data ?? []).reduce((s: number, r: any) => s + Number(r.revenue_cents ?? 0), 0);
  return {
    counts: { dna: dna.count ?? 0 },
    revenue_cents: totalRev,
    top_genes: weights.data ?? [],
    reports: reports.data ?? [],
    predicted_winners: preds.data ?? [],
    runs: runs.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  let action = (url.searchParams.get("action") || "dashboard") as Action;
  if (req.method === "POST") {
    try { const body = await req.json(); if (body?.action) action = body.action; } catch {}
  }

  if (action === "dashboard") {
    const data = await dashboard(sb);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: run } = await sb.from("pei_engine_runs").insert({ action, status: "running" }).select().single();
  const t0 = Date.now();
  try {
    let summary: Record<string, unknown> = {};
    if (action === "snapshot_dna") summary = await snapshotDNA(sb);
    else if (action === "rollup_attribution") summary = await rollupAttribution(sb);
    else if (action === "update_weights") summary = await updateWeights(sb);
    else if (action === "predict_winners") summary = await predictWinners(sb);
    else if (action === "weekly_report") summary = await weeklyReport(sb);
    else if (action === "retire_stale") summary = await retireStale(sb);
    else if (action === "run_full") {
      summary = {
        snapshot: await snapshotDNA(sb),
        rollup: await rollupAttribution(sb),
        weights: await updateWeights(sb),
        predict: await predictWinners(sb),
        retire: await retireStale(sb),
      };
    }
    await sb.from("pei_engine_runs").update({
      status: "ok", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, summary,
    }).eq("id", (run as any)?.id);
    return new Response(JSON.stringify({ ok: true, action, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await sb.from("pei_engine_runs").update({
      status: "error", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0, error: String((e as Error).message ?? e),
    }).eq("id", (run as any)?.id);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});