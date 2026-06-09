import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Composite Pinterest Score = CTR + SaveRate + ATCRate + PurchaseRate (each 0..1, summed; max ~4).
// Classification thresholds tuned for sparse data: require min impressions to avoid noise.
const MIN_IMPRESSIONS_FOR_CLASSIFICATION = 200;
const WINNER_SCORE = 0.08;   // ~ CTR 3% + ATC 2% + saves 3% — strong signal
const LOSER_SCORE = 0.012;   // very weak engagement

type ScoreRow = {
  day: string;
  pin_id: string;
  product_id: string | null;
  product_slug: string | null;
  category_key: string | null;
  board_name: string | null;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  product_views: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
};

function classify(impressions: number, score: number): string {
  if (impressions < MIN_IMPRESSIONS_FOR_CLASSIFICATION) return "insufficient_data";
  if (score >= WINNER_SCORE) return "winner";
  if (score <= LOSER_SCORE) return "loser";
  return "average";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 30, 1), 90);
    const dryRun = body.dryRun === true;

    // 1) Pull funnel rows for the window
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const { data: funnel, error: funnelErr } = await supabase
      .from("pinterest_revenue_funnel_daily")
      .select("*")
      .gte("day", since);

    if (funnelErr) throw funnelErr;
    const rows = (funnel ?? []) as ScoreRow[];

    // 2) Compute scores
    const scored = rows.map((r) => {
      const imp = r.impressions || 0;
      const ctr = imp > 0 ? r.outbound_clicks / imp : 0;
      const saveRate = imp > 0 ? r.saves / imp : 0;
      const atcRate = r.product_views > 0 ? r.add_to_carts / r.product_views : 0;
      const purchRate = r.product_views > 0 ? r.purchases / r.product_views : 0;
      const score = ctr + saveRate + atcRate + purchRate;
      return {
        day: r.day,
        pin_id: r.pin_id,
        product_id: r.product_id,
        product_slug: r.product_slug,
        category_key: r.category_key,
        board_name: r.board_name,
        impressions: imp,
        saves: r.saves || 0,
        outbound_clicks: r.outbound_clicks || 0,
        product_views: r.product_views || 0,
        add_to_carts: r.add_to_carts || 0,
        checkouts: r.checkouts || 0,
        purchases: r.purchases || 0,
        revenue_cents: r.revenue_cents || 0,
        ctr: Number(ctr.toFixed(5)),
        save_rate: Number(saveRate.toFixed(5)),
        atc_rate: Number(atcRate.toFixed(5)),
        purchase_rate: Number(purchRate.toFixed(5)),
        pinterest_score: Number(score.toFixed(4)),
        classification: classify(imp, score),
        computed_at: new Date().toISOString(),
      };
    });

    // 3) Upsert into pinterest_revenue_scores
    let upserted = 0;
    if (!dryRun && scored.length > 0) {
      // Chunk to avoid payload limits
      for (let i = 0; i < scored.length; i += 500) {
        const chunk = scored.slice(i, i + 500);
        const { error: upErr } = await supabase
          .from("pinterest_revenue_scores")
          .upsert(chunk, { onConflict: "day,pin_id" });
        if (upErr) throw upErr;
        upserted += chunk.length;
      }
    }

    // 4) Aggregate to product level over last 14 days for action decisions
    const sinceAction = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const productAgg = new Map<
      string,
      { slug: string | null; imp: number; clicks: number; saves: number; atc: number; purch: number; revenue: number; sample: number }
    >();
    for (const r of scored) {
      if (!r.product_id || r.day < sinceAction) continue;
      const cur = productAgg.get(r.product_id) || {
        slug: r.product_slug,
        imp: 0, clicks: 0, saves: 0, atc: 0, purch: 0, revenue: 0, sample: 0,
      };
      cur.imp += r.impressions;
      cur.clicks += r.outbound_clicks;
      cur.saves += r.saves;
      cur.atc += r.add_to_carts;
      cur.purch += r.purchases;
      cur.revenue += r.revenue_cents;
      cur.sample += 1;
      productAgg.set(r.product_id, cur);
    }

    // 5) Decide actions: pause losers, mark scale candidates
    const actions: Array<{
      action_type: string;
      pin_id: string | null;
      product_id: string | null;
      product_slug: string | null;
      reason: string;
      details: Record<string, unknown>;
    }> = [];

    for (const [productId, agg] of productAgg.entries()) {
      if (agg.imp < MIN_IMPRESSIONS_FOR_CLASSIFICATION * 2) continue;
      const ctr = agg.imp > 0 ? agg.clicks / agg.imp : 0;
      const productScore = ctr + (agg.imp > 0 ? agg.saves / agg.imp : 0);
      if (productScore <= LOSER_SCORE) {
        actions.push({
          action_type: "pause_loser",
          pin_id: null,
          product_id: productId,
          product_slug: agg.slug,
          reason: `14d productScore ${productScore.toFixed(4)} <= ${LOSER_SCORE}`,
          details: { imp: agg.imp, clicks: agg.clicks, saves: agg.saves, atc: agg.atc, purch: agg.purch },
        });
      } else if (productScore >= WINNER_SCORE && agg.purch >= 1) {
        actions.push({
          action_type: "scale_winner",
          pin_id: null,
          product_id: productId,
          product_slug: agg.slug,
          reason: `14d productScore ${productScore.toFixed(4)} >= ${WINNER_SCORE} with ${agg.purch} purchases`,
          details: { imp: agg.imp, clicks: agg.clicks, saves: agg.saves, atc: agg.atc, purch: agg.purch, revenue_cents: agg.revenue },
        });
      }
    }

    // 6) Apply actions: write autopilot overrides + log
    let appliedPauses = 0;
    let appliedScales = 0;
    if (!dryRun) {
      for (const a of actions) {
        if (a.action_type === "pause_loser" && a.product_id) {
          const { error: ovErr } = await supabase
            .from("pinterest_autopilot_overrides")
            .upsert(
              {
                product_id: a.product_id,
                action: "paused",
                reason: a.reason,
                expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
              },
              { onConflict: "product_id" },
            );
          if (!ovErr) appliedPauses += 1;
        } else if (a.action_type === "scale_winner" && a.product_id) {
          const { error: ovErr } = await supabase
            .from("pinterest_autopilot_overrides")
            .upsert(
              {
                product_id: a.product_id,
                action: "force_promote",
                reason: a.reason,
                expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
              },
              { onConflict: "product_id" },
            );
          if (!ovErr) appliedScales += 1;
        }
      }
      if (actions.length > 0) {
        await supabase.from("pinterest_winner_actions_log").insert(
          actions.map((a) => ({
            action_type: a.action_type,
            pin_id: a.pin_id,
            product_id: a.product_id,
            product_slug: a.product_slug,
            reason: a.reason,
            details: a.details,
            source: "pinterest-revenue-engine",
          })),
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: "scoring_complete",
        dryRun,
        windowDays: days,
        funnelRows: rows.length,
        scored: scored.length,
        upserted,
        productsEvaluated: productAgg.size,
        actionsPlanned: actions.length,
        appliedPauses,
        appliedScales,
        thresholds: { MIN_IMPRESSIONS_FOR_CLASSIFICATION, WINNER_SCORE, LOSER_SCORE },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[pinterest-revenue-engine]", traceId, err);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});