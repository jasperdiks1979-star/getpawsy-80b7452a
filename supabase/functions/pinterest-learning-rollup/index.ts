// ─────────────────────────────────────────────────────────────────────────────
// pinterest-learning-rollup
// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Auto-Learning Feedback Loop
//
// Joins pinterest_pin_performance + pinterest_creative_intents (which carries
// pin_mode, hook, niche, landing_slug per pin) and rolls them up into
// pinterest_performance_signals keyed on the dimensional combination
// (niche × pin_mode × hook × pattern × board × cta × backdrop_style ×
// product_category). It then derives leaderboard rows in
// pinterest_winner_dimensions that the Creative Director consults when
// `pickStrategy` runs.
//
// Designed to be invoked hourly by pg_cron. Public/no-auth — the function
// itself uses the service role internally and only reads/writes its own
// rollup tables. No PII.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const traceId = () => crypto.randomUUID().slice(0, 8);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface PerfRow {
  pin_id: string;
  impressions: number | null;
  clicks: number | null;
  saves: number | null;
}

interface IntentRow {
  pin_queue_id: string;
  niche_key: string | null;
  hook_type: string | null;
  pin_mode: string | null;
  visual_style: string | null; // pattern_id surrogate
  cta_style: string | null;
  landing_slug: string | null;
}

interface QueueRow {
  id: string;
  category_key: string | null;
  hook_group: string | null;
}

interface SignalAccum {
  niche_key: string;
  pin_mode: string | null;
  hook_category: string | null;
  pattern_id: string | null;
  board_id: string | null;
  product_category: string | null;
  cta: string | null;
  backdrop_style: string | null;
  impressions: number;
  saves: number;
  outbound: number;
  sample_size: number;
}

function dimKey(s: SignalAccum) {
  return [
    s.niche_key,
    s.pin_mode ?? "",
    s.hook_category ?? "",
    s.pattern_id ?? "",
    s.board_id ?? "",
    s.product_category ?? "",
    s.cta ?? "",
    s.backdrop_style ?? "",
  ].join("|");
}

/** Composite score: weights saves & outbound (no on-site data yet). */
function compositeScore(s: SignalAccum) {
  const impr = Math.max(1, s.impressions);
  const saveRate = s.saves / impr;
  const outRate = s.outbound / impr;
  // Saves drive Pinterest distribution; outbound = commerce intent.
  const score = saveRate * 60 + outRate * 40;
  // Mild damping for low sample sizes.
  const damp = Math.min(1, s.sample_size / 5);
  return Number((score * 100 * damp).toFixed(3));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const tid = traceId();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // 1. Pull recent perf rows (limit 1000) and the matching intents/queue rows.
    const { data: perfRows, error: perfErr } = await supabase
      .from("pinterest_pin_performance")
      .select("pin_id, impressions, clicks, saves")
      .gte("updated_at", new Date(Date.now() - 72 * 3600 * 1000).toISOString())
      .limit(1000);
    if (perfErr) {
      console.error("[learning-rollup] perf err", tid, perfErr);
      return json({ ok: false, traceId: tid, message: "perf_query_failed" }, 500);
    }
    const perf: PerfRow[] = (perfRows ?? []) as PerfRow[];
    if (perf.length === 0) {
      return json({ ok: true, traceId: tid, data: { rolled_up: 0, winners: 0 } });
    }

    const pinIds = Array.from(new Set(perf.map((p) => p.pin_id).filter(Boolean)));

    // pin_id from analytics maps to pinterest_pin_queue.id (uuid string).
    const { data: queueRows } = await supabase
      .from("pinterest_pin_queue")
      .select("id, category_key, hook_group")
      .in("id", pinIds);
    const queueById = new Map<string, QueueRow>(
      (queueRows ?? []).map((q) => [q.id as string, q as QueueRow]),
    );

    const { data: intentRows } = await supabase
      .from("pinterest_creative_intents")
      .select("pin_queue_id, niche_key, hook_type, pin_mode, visual_style, cta_style, landing_slug")
      .in("pin_queue_id", pinIds);
    const intentById = new Map<string, IntentRow>(
      (intentRows ?? []).map((i) => [i.pin_queue_id as string, i as IntentRow]),
    );

    // 2. Aggregate into dimension buckets.
    const buckets = new Map<string, SignalAccum>();
    for (const p of perf) {
      const intent = intentById.get(p.pin_id);
      const q = queueById.get(p.pin_id);
      const niche = (intent?.niche_key || q?.category_key || "generic_pet") as string;
      const accum: SignalAccum = {
        niche_key: niche,
        pin_mode: intent?.pin_mode ?? null,
        hook_category: (intent?.hook_type || q?.hook_group) ?? null,
        pattern_id: intent?.visual_style ?? null,
        board_id: null,
        product_category: null,
        cta: intent?.cta_style ?? null,
        backdrop_style: null,
        impressions: 0,
        saves: 0,
        outbound: 0,
        sample_size: 0,
      };
      const key = dimKey(accum);
      const existing = buckets.get(key) ?? accum;
      existing.impressions += Number(p.impressions ?? 0);
      existing.saves += Number(p.saves ?? 0);
      existing.outbound += Number(p.clicks ?? 0); // Pinterest "outbound clicks"
      existing.sample_size += 1;
      buckets.set(key, existing);
    }

    // 3. Upsert rollups.
    const signalRows = Array.from(buckets.values()).map((s) => ({
      niche_key: s.niche_key,
      pin_mode: s.pin_mode,
      hook_category: s.hook_category,
      pattern_id: s.pattern_id,
      board_id: s.board_id,
      product_category: s.product_category,
      cta: s.cta,
      backdrop_style: s.backdrop_style,
      impressions: s.impressions,
      saves: s.saves,
      outbound: s.outbound,
      sample_size: s.sample_size,
      last_updated: new Date().toISOString(),
    }));

    if (signalRows.length) {
      const { error: upErr } = await supabase
        .from("pinterest_performance_signals")
        .upsert(signalRows, {
          onConflict:
            "niche_key,pin_mode,hook_category,pattern_id,board_id,product_category,cta,backdrop_style",
          ignoreDuplicates: false,
        });
      if (upErr) {
        // Conflict target may need coalesce-driven uniqueness; surface error.
        console.warn("[learning-rollup] upsert signals err", tid, upErr.message);
      }
    }

    // 4. Derive winner dimensions: top performers per (niche, pin_mode, hook).
    const winners = Array.from(buckets.values())
      .filter((s) => s.sample_size >= 2 && s.impressions >= 50)
      .map((s) => ({
        niche_key: s.niche_key,
        pin_mode: s.pin_mode,
        hook_category: s.hook_category,
        pattern_id: s.pattern_id,
        composite_score: compositeScore(s),
        save_rate: s.impressions ? Number((s.saves / s.impressions).toFixed(4)) : null,
        outbound_rate: s.impressions ? Number((s.outbound / s.impressions).toFixed(4)) : null,
        conversion_rate: null,
        revenue_per_impression: null,
        sample_size: s.sample_size,
        is_active: true,
        computed_at: new Date().toISOString(),
      }));

    if (winners.length) {
      const { error: wErr } = await supabase
        .from("pinterest_winner_dimensions")
        .upsert(winners, {
          onConflict: "niche_key,pin_mode,hook_category,pattern_id",
          ignoreDuplicates: false,
        });
      if (wErr) console.warn("[learning-rollup] upsert winners err", tid, wErr.message);
    }

    return json({
      ok: true,
      traceId: tid,
      data: { rolled_up: signalRows.length, winners: winners.length, perf_rows: perf.length },
    });
  } catch (e) {
    console.error("[learning-rollup] unhandled", tid, e);
    return json(
      { ok: false, traceId: tid, message: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});
