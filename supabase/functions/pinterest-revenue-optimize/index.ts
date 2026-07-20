// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Pinterest Revenue Optimisation — single-pass orchestrator + learner.
 *
 * Reuses existing infrastructure only. Writes to existing tables:
 *   - pinterest_loser_blocklist     (was empty — now populated)
 *   - pinterest_pattern_weights     (was empty — now populated)
 *
 * POST body:
 *   { chain?: boolean }   // when true, also invokes the 4 nightly engines first
 *
 * Returns:
 *   { ok, traceId, message, report }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WINDOW_DAYS = 30;
const MIN_IMPRESSIONS_FOR_WINNER = 200;
const MIN_IMPRESSIONS_FOR_LOSER = 400;
const LOSER_CTR_MAX = 0.003;          // <0.3% CTR with traffic = loser
const LOSER_SAVE_RATE_MAX = 0.005;
const LOSER_BLOCK_DAYS = 21;
const PATTERN_MIN_SAMPLES = 3;

function traceId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

/** Cheap n-gram extraction for headline/CTA pattern learning. */
function extractPattern(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 8) return null;
  const words = t.split(" ").filter(w => w.length > 2);
  if (words.length < 2) return null;
  return words.slice(0, 3).join(" ");
}

async function chainEngines(sb: any, trace: string) {
  const steps = [
    "pinterest-growth-orchestrator",
    "pinterest-auto-evolve",
    "growth-learning-loop",
    "pinterest-revenue-brain",
  ];
  const log: Array<{ step: string; ok: boolean; ms: number; error?: string }> = [];
  for (const fn of steps) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ trigger: `revenue-optimize:${trace}` }),
      });
      const body = await res.text();
      log.push({ step: fn, ok: res.ok, ms: Date.now() - t0, error: res.ok ? undefined : body.slice(0, 200) });
    } catch (e) {
      log.push({ step: fn, ok: false, ms: Date.now() - t0, error: (e as Error).message });
    }
  }
  return log;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = traceId();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const doChain = !!body.chain;

    // 0) Optional: run the existing engines first
    const chainLog = doChain ? await chainEngines(sb, trace) : [];

    // 1) Pull Pinterest pin performance (existing table, populated by analytics sync)
    const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
    const { data: pinsRaw, error: pinErr } = await sb
      .from("pinterest_pin_performance")
      .select("id,pin_id,product_id,product_url,pin_title,pin_description,hook_angle,impressions,clicks,saves,ctr,performance_score,updated_at")
      .gte("updated_at", sinceIso)
      .limit(5000);
    if (pinErr) throw pinErr;
    const pins = (pinsRaw ?? []) as any[];

    // 2) Pull the revenue funnel rollup (existing materialised table)
    const dayCut = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
    const { data: scoresRaw } = await sb
      .from("pinterest_revenue_scores")
      .select("day,pin_id,product_id,product_slug,category_key,impressions,saves,outbound_clicks,product_views,add_to_carts,checkouts,purchases,revenue_cents")
      .gte("day", dayCut)
      .limit(10000);
    const scores = (scoresRaw ?? []) as any[];

    // 3) Pin-level metrics
    const scored = pins.map(p => {
      const impr = Number(p.impressions ?? 0);
      const clicks = Number(p.clicks ?? 0);
      const saves = Number(p.saves ?? 0);
      const ctr = impr > 0 ? clicks / impr : 0;
      const saveRate = impr > 0 ? saves / impr : 0;
      const engagement = impr > 0 ? (clicks + saves) / impr : 0;
      return {
        id: p.id, pin_id: p.pin_id, product_id: p.product_id,
        pin_title: p.pin_title, hook_angle: p.hook_angle,
        impressions: impr, clicks, saves, ctr, saveRate, engagement,
      };
    });

    const top20 = [...scored]
      .filter(p => p.impressions >= MIN_IMPRESSIONS_FOR_WINNER)
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 20);

    const bottom20 = [...scored]
      .filter(p => p.impressions >= MIN_IMPRESSIONS_FOR_LOSER)
      .sort((a, b) => a.engagement - b.engagement)
      .slice(0, 20);

    // 4) Product leaderboard (uses revenue_scores funnel)
    const byProduct = new Map<string, any>();
    for (const r of scores) {
      const key = r.product_slug || r.product_id;
      if (!key) continue;
      const cur = byProduct.get(key) ?? { product_slug: r.product_slug, product_id: r.product_id, impressions: 0, saves: 0, outbound_clicks: 0, product_views: 0, add_to_carts: 0, purchases: 0, revenue_cents: 0 };
      cur.impressions += Number(r.impressions ?? 0);
      cur.saves += Number(r.saves ?? 0);
      cur.outbound_clicks += Number(r.outbound_clicks ?? 0);
      cur.product_views += Number(r.product_views ?? 0);
      cur.add_to_carts += Number(r.add_to_carts ?? 0);
      cur.purchases += Number(r.purchases ?? 0);
      cur.revenue_cents += Number(r.revenue_cents ?? 0);
      byProduct.set(key, cur);
    }
    const productLeaderboard = Array.from(byProduct.values())
      .sort((a, b) => (b.revenue_cents - a.revenue_cents) || (b.purchases - a.purchases) || (b.outbound_clicks - a.outbound_clicks))
      .slice(0, 30);

    // 5) Loser suppression — write into existing pinterest_loser_blocklist
    const blockUntil = new Date(Date.now() + LOSER_BLOCK_DAYS * 86400_000).toISOString();
    const blocklistRows: any[] = [];
    const seen = new Set<string>();
    for (const p of bottom20) {
      if (!(p.ctr <= LOSER_CTR_MAX || p.saveRate <= LOSER_SAVE_RATE_MAX)) continue;
      const hookVariant = (p.hook_angle || extractPattern(p.pin_title) || "unknown").slice(0, 80);
      const slugKey = `${p.product_id ?? "none"}::${hookVariant}`;
      if (seen.has(slugKey)) continue;
      seen.add(slugKey);
      blocklistRows.push({
        product_slug: p.product_id ?? null,
        hook_variant: hookVariant,
        reason: `auto-suppress: impr=${p.impressions} ctr=${(p.ctr * 100).toFixed(2)}% saves=${p.saves}`,
        blocked_until: blockUntil,
      });
    }
    let losersInserted = 0;
    if (blocklistRows.length > 0) {
      const { error: blErr, count } = await sb
        .from("pinterest_loser_blocklist")
        .insert(blocklistRows, { count: "exact" });
      if (!blErr) losersInserted = count ?? blocklistRows.length;
    }

    // 6) Pattern weights — learn winners vs losers, persist to pinterest_pattern_weights
    type PatternAgg = { impressions: number; engagement: number; samples: number; winSignal: number };
    const patternAgg = new Map<string, PatternAgg & { hook_category: string; niche_key: string }>();
    for (const p of scored) {
      if (p.impressions < 100) continue;
      const headlinePattern = extractPattern(p.pin_title);
      if (!headlinePattern) continue;
      const pid = `headline:${headlinePattern}`;
      const hookCat = (p.hook_angle || "unknown").slice(0, 40);
      const niche = "global";
      const cur = patternAgg.get(pid) ?? { impressions: 0, engagement: 0, samples: 0, winSignal: 0, hook_category: hookCat, niche_key: niche };
      cur.impressions += p.impressions;
      cur.engagement += p.engagement * p.impressions; // impression-weighted
      cur.samples += 1;
      cur.winSignal += p.engagement > 0.02 ? 1 : (p.engagement < 0.005 ? -1 : 0);
      patternAgg.set(pid, cur);
    }
    const weightRows = Array.from(patternAgg.entries())
      .filter(([, v]) => v.samples >= PATTERN_MIN_SAMPLES && v.impressions > 0)
      .map(([pattern_id, v]) => {
        const avgEngagement = v.engagement / Math.max(1, v.impressions);
        // composite_score in [0, 100]: 70% engagement, 30% win-signal momentum
        const composite = clamp(
          (avgEngagement * 100 * 0.7) + (50 + (v.winSignal / Math.max(1, v.samples)) * 50) * 0.3,
          0, 100,
        );
        return {
          pattern_id,
          hook_category: v.hook_category,
          niche_key: v.niche_key,
          composite_score: Number(composite.toFixed(2)),
          sample_size: v.samples,
          updated_at: new Date().toISOString(),
        };
      });
    let patternsUpserted = 0;
    if (weightRows.length > 0) {
      const { error: pwErr } = await sb
        .from("pinterest_pattern_weights")
        .upsert(weightRows, { onConflict: "pattern_id" });
      if (!pwErr) patternsUpserted = weightRows.length;
    }

    // 7) Revenue forecast — linear projection from last-7d daily mean
    const dailyRevenue = new Map<string, number>();
    for (const r of scores) {
      const d = r.day;
      if (!d) continue;
      dailyRevenue.set(d, (dailyRevenue.get(d) ?? 0) + Number(r.revenue_cents ?? 0));
    }
    const days = Array.from(dailyRevenue.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const last7 = days.slice(-7).map(d => d[1]);
    const last30 = days.slice(-30).map(d => d[1]);
    const mean = (a: number[]) => a.length > 0 ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const dailyAvg7 = mean(last7);
    const dailyAvg30 = mean(last30);
    // 7d momentum vs 30d baseline → growth multiplier capped at ±50%
    const momentum = dailyAvg30 > 0 ? clamp(dailyAvg7 / dailyAvg30, 0.5, 1.5) : 1;
    const forecast = {
      daily_avg_cents_7d: Math.round(dailyAvg7),
      daily_avg_cents_30d: Math.round(dailyAvg30),
      momentum: Number(momentum.toFixed(3)),
      forecast_7d_cents: Math.round(dailyAvg7 * 7 * momentum),
      forecast_30d_cents: Math.round(dailyAvg7 * 30 * momentum),
      forecast_90d_cents: Math.round(dailyAvg7 * 90 * momentum),
    };

    // 8) Opportunity engine — high impr + low CTR; high CTR + low conv
    const opportunities = {
      high_impressions_low_clicks: Array.from(byProduct.values())
        .filter(p => p.impressions >= 1000 && (p.outbound_clicks / p.impressions) < 0.005)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10)
        .map(p => ({ product_slug: p.product_slug, impressions: p.impressions, ctr: p.outbound_clicks / p.impressions, hint: "rewrite headline/CTA — copy is failing despite reach" })),
      high_clicks_low_conversion: Array.from(byProduct.values())
        .filter(p => p.outbound_clicks >= 30 && p.product_views > 0 && (p.purchases / p.product_views) < 0.005)
        .sort((a, b) => b.outbound_clicks - a.outbound_clicks)
        .slice(0, 10)
        .map(p => ({ product_slug: p.product_slug, clicks: p.outbound_clicks, views: p.product_views, conv: p.purchases / p.product_views, hint: "PDP issue: price, trust, or stock — pin promise mismatches landing" })),
      scalable_winners: productLeaderboard
        .filter(p => p.purchases >= 2 && p.revenue_cents > 0)
        .slice(0, 10)
        .map(p => ({ product_slug: p.product_slug, purchases: p.purchases, revenue_cents: p.revenue_cents, hint: "scale: feed more variants of this product into the queue" })),
    };

    const report = {
      window_days: WINDOW_DAYS,
      counts: {
        pins_analyzed: pins.length,
        funnel_rows: scores.length,
        products_ranked: byProduct.size,
      },
      top_20_pins: top20,
      bottom_20_pins: bottom20,
      product_leaderboard: productLeaderboard,
      losers_blocked: losersInserted,
      patterns_upserted: patternsUpserted,
      revenue_forecast: forecast,
      opportunities,
      chain: doChain ? chainLog : null,
    };

    return new Response(
      JSON.stringify({ ok: true, traceId: trace, message: "Revenue optimisation pass complete", report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});