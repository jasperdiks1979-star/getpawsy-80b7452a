/**
 * cta-variant-rollback-guard
 *
 * Periodic guardrail for the /go landing-page CTA experiment.
 *
 * What it does (every run, normally hourly via cron):
 *   1. Loads the singleton row from `cta_variant_config` to learn:
 *        active_variant, baseline_variant, ctr_floor_pct,
 *        evaluation_window_hours, min_impressions, rollback_enabled.
 *   2. Aggregates `lp_funnel_events` over the evaluation window for the
 *      currently active variant, EXCLUDING internal/Founder traffic, and
 *      counts impressions (`lp_cta_impression`) and clicks (`lp_cta_click`).
 *   3. If sample size ≥ min_impressions AND ctr_pct < ctr_floor_pct AND
 *      active_variant !== baseline_variant AND rollback_enabled, it:
 *        - flips active_variant → baseline_variant in cta_variant_config
 *        - appends an audit row to cta_variant_rollback_log
 *
 * Returns the standard envelope { ok, traceId, message, data }.
 *
 * Auth: cron-invoked, public (verify_jwt = false). All writes use the
 * service-role key so RLS doesn't block the rollback.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ConfigRow = {
  id: number;
  active_variant: string;
  baseline_variant: string;
  ctr_floor_pct: number;
  evaluation_window_hours: number;
  min_impressions: number;
  rollback_enabled: boolean;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const traceId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Optional manual override (for admin "run now" / dry-run testing).
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dry_run') === '1';

    // 1. Load the active config (singleton row id=1).
    const { data: config, error: cfgErr } = await supabase
      .from('cta_variant_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle<ConfigRow>();

    if (cfgErr) throw new Error(`config load failed: ${cfgErr.message}`);
    if (!config) throw new Error('cta_variant_config singleton row missing');

    if (!config.rollback_enabled) {
      return jsonResponse(200, {
        ok: true,
        traceId,
        message: 'rollback disabled — no-op',
        data: { config },
      });
    }

    if (config.active_variant === config.baseline_variant) {
      return jsonResponse(200, {
        ok: true,
        traceId,
        message: 'already on baseline — no-op',
        data: { config },
      });
    }

    // 2. Aggregate the evaluation window for the active variant.
    const sinceIso = new Date(
      Date.now() - config.evaluation_window_hours * 3600 * 1000,
    ).toISOString();

    const baseQuery = supabase
      .from('lp_funnel_events')
      .select('event_name', { count: 'exact', head: true })
      .eq('cta_variant', config.active_variant)
      .eq('is_internal', false)
      .gte('created_at', sinceIso);

    const [{ count: impressions, error: impErr }, { count: clicks, error: clkErr }] =
      await Promise.all([
        baseQuery.eq('event_name', 'lp_cta_impression'),
        supabase
          .from('lp_funnel_events')
          .select('event_name', { count: 'exact', head: true })
          .eq('cta_variant', config.active_variant)
          .eq('is_internal', false)
          .gte('created_at', sinceIso)
          .eq('event_name', 'lp_cta_click'),
      ]);

    if (impErr) throw new Error(`impression count failed: ${impErr.message}`);
    if (clkErr) throw new Error(`click count failed: ${clkErr.message}`);

    const imp = impressions ?? 0;
    const clk = clicks ?? 0;
    const ctrPct = imp > 0 ? Number(((clk / imp) * 100).toFixed(2)) : 0;
    const sampleReady = imp >= config.min_impressions;
    const breach = sampleReady && ctrPct < Number(config.ctr_floor_pct);

    // 3. Decide.
    if (!breach) {
      return jsonResponse(200, {
        ok: true,
        traceId,
        message: sampleReady
          ? `CTR ${ctrPct}% ≥ floor ${config.ctr_floor_pct}% — no rollback`
          : `sample too small (${imp}/${config.min_impressions} impressions) — skipping`,
        data: {
          active_variant: config.active_variant,
          impressions: imp,
          clicks: clk,
          ctr_pct: ctrPct,
          ctr_floor_pct: Number(config.ctr_floor_pct),
          window_hours: config.evaluation_window_hours,
          sample_ready: sampleReady,
          dry_run: dryRun,
        },
      });
    }

    if (dryRun) {
      return jsonResponse(200, {
        ok: true,
        traceId,
        message: `[dry-run] would rollback ${config.active_variant} → ${config.baseline_variant} (CTR ${ctrPct}% < ${config.ctr_floor_pct}%)`,
        data: { ctr_pct: ctrPct, impressions: imp, clicks: clk },
      });
    }

    // BREACH — execute rollback + audit.
    const reason = `auto-rollback: CTR ${ctrPct}% < floor ${config.ctr_floor_pct}% over ${config.evaluation_window_hours}h (${clk}/${imp})`;

    const { error: updErr } = await supabase
      .from('cta_variant_config')
      .update({ active_variant: config.baseline_variant, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (updErr) throw new Error(`config update failed: ${updErr.message}`);

    const { error: logErr } = await supabase.from('cta_variant_rollback_log').insert({
      from_variant: config.active_variant,
      to_variant: config.baseline_variant,
      reason,
      ctr_pct: ctrPct,
      ctr_floor_pct: Number(config.ctr_floor_pct),
      impressions: imp,
      clicks: clk,
      window_hours: config.evaluation_window_hours,
      was_automatic: true,
    });
    if (logErr) console.error('[rollback-guard] audit log insert failed:', logErr);

    return jsonResponse(200, {
      ok: true,
      traceId,
      message: reason,
      data: {
        rolled_back: true,
        from: config.active_variant,
        to: config.baseline_variant,
        ctr_pct: ctrPct,
        impressions: imp,
        clicks: clk,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cta-variant-rollback-guard] error', traceId, message);
    return jsonResponse(500, { ok: false, traceId, message });
  }
});