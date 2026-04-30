/**
 * cta-copy-winner-elector — auto-promotes the highest-CTR copy variant
 * per (placement, mode) for the /go landing page.
 *
 * Strategy (decided with operator on 2026-04-30):
 *   - Server-cached winner. Page reads `cta_copy_winners` directly.
 *   - Promotion threshold (aggressive): 48h window AND ≥50 impressions
 *     per candidate variant. Any variant with fewer impressions is
 *     considered un-tested and the current winner is kept.
 *   - Internal traffic (Founder Mode) is excluded.
 *   - Only `lp_cta_impression` and `lp_cta_click` events with both
 *     `cta_copy_label` AND `cta_copy_mode` populated are counted.
 *
 * UTM / campaign / content / deep-link refs are NEVER touched — only
 * the `winning_label` per (placement, mode) row is rewritten. The page
 * resolves that label to visible text via `ctaCopyRegistry`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const WINDOW_HOURS = 48;
const MIN_IMPRESSIONS = 50;
const PLACEMENTS = ['bio_primary', 'bio_secondary', 'bio_sticky'] as const;
const MODES = ['calm', 'urgent'] as const;

type Mode = (typeof MODES)[number];
type Placement = (typeof PLACEMENTS)[number];

interface VariantStat {
  placement: Placement;
  mode: Mode;
  label: string;
  impressions: number;
  clicks: number;
  ctr: number; // 0..1
}

interface ElectionResult {
  placement: Placement;
  mode: Mode;
  winning_label: string | null;
  ctr_pct: number | null;
  impressions: number;
  clicks: number;
  candidates: VariantStat[];
  reason: string;
}

function traceId(): string {
  return `elec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const trace = traceId();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Optional dry-run flag — `?dry=1` returns what WOULD be promoted but
  // does not write to cta_copy_winners. Useful for the admin preview.
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';

  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    // Pull the relevant slice. We only need impression + click events that
    // are tagged with a copy label/mode. The query intentionally pulls raw
    // rows (not a SQL aggregate) so we can run the elector logic in TS and
    // surface the per-candidate breakdown to the admin dashboard.
    const { data, error } = await supabase
      .from('lp_funnel_events')
      .select('event_name, placement, cta_copy_label, cta_copy_mode')
      .gte('created_at', since)
      .in('event_name', ['lp_cta_impression', 'lp_cta_click'])
      .in('placement', PLACEMENTS as readonly string[])
      .not('cta_copy_label', 'is', null)
      .not('cta_copy_mode', 'is', null)
      .eq('is_internal', false)
      .limit(50000);

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, traceId: trace, message: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Aggregate: (placement, mode, label) → { imps, clicks }
    const buckets = new Map<string, VariantStat>();
    for (const row of data ?? []) {
      const placement = row.placement as Placement;
      const mode = row.cta_copy_mode as Mode;
      const label = row.cta_copy_label as string;
      if (!PLACEMENTS.includes(placement) || !MODES.includes(mode)) continue;
      const key = `${placement}::${mode}::${label}`;
      let entry = buckets.get(key);
      if (!entry) {
        entry = { placement, mode, label, impressions: 0, clicks: 0, ctr: 0 };
        buckets.set(key, entry);
      }
      if (row.event_name === 'lp_cta_impression') entry.impressions += 1;
      else if (row.event_name === 'lp_cta_click') entry.clicks += 1;
    }
    for (const stat of buckets.values()) {
      stat.ctr = stat.impressions > 0 ? stat.clicks / stat.impressions : 0;
    }

    // Elect per (placement, mode).
    const elections: ElectionResult[] = [];
    for (const placement of PLACEMENTS) {
      for (const mode of MODES) {
        const candidates = [...buckets.values()].filter(
          (s) => s.placement === placement && s.mode === mode,
        );
        if (candidates.length === 0) {
          elections.push({
            placement, mode, winning_label: null, ctr_pct: null,
            impressions: 0, clicks: 0, candidates: [],
            reason: 'no_data',
          });
          continue;
        }
        const allHaveSample = candidates.every((c) => c.impressions >= MIN_IMPRESSIONS);
        if (!allHaveSample) {
          elections.push({
            placement, mode, winning_label: null, ctr_pct: null,
            impressions: candidates.reduce((s, c) => s + c.impressions, 0),
            clicks: candidates.reduce((s, c) => s + c.clicks, 0),
            candidates,
            reason: `insufficient_sample (need ≥${MIN_IMPRESSIONS} per variant)`,
          });
          continue;
        }
        // Highest CTR wins. Tie-break on raw clicks for stability.
        const sorted = [...candidates].sort(
          (a, b) => b.ctr - a.ctr || b.clicks - a.clicks,
        );
        const winner = sorted[0];
        elections.push({
          placement, mode,
          winning_label: winner.label,
          ctr_pct: Math.round(winner.ctr * 100000) / 1000, // 3 decimals
          impressions: winner.impressions,
          clicks: winner.clicks,
          candidates: sorted,
          reason: 'elected',
        });
      }
    }

    // Persist winners (idempotent upsert). Skip rows with no_data /
    // insufficient_sample — keep whatever the seed/last-known winner was.
    const promoted: string[] = [];
    if (!dryRun) {
      for (const e of elections) {
        if (!e.winning_label) continue;
        const { error: upErr } = await supabase
          .from('cta_copy_winners')
          .upsert(
            {
              placement: e.placement,
              mode: e.mode,
              winning_label: e.winning_label,
              ctr_pct: e.ctr_pct,
              impressions: e.impressions,
              clicks: e.clicks,
              window_hours: WINDOW_HOURS,
              evaluated_at: new Date().toISOString(),
              notes: `auto-elected; ${e.candidates.length} candidates`,
            },
            { onConflict: 'placement,mode' },
          );
        if (!upErr) promoted.push(`${e.placement}/${e.mode}=${e.winning_label}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId: trace,
        message: dryRun ? 'dry-run' : `promoted ${promoted.length} winner(s)`,
        window_hours: WINDOW_HOURS,
        min_impressions: MIN_IMPRESSIONS,
        promoted,
        elections,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        traceId: trace,
        message: err instanceof Error ? err.message : 'unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});