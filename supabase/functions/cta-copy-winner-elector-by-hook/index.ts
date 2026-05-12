/**
 * cta-copy-winner-elector-by-hook — Phase 24.
 *
 * Per-(placement, mode, hook_family) auto-elector. Reads `lp_funnel_events`
 * tagged with `cta_copy_label`, `cta_copy_mode` AND `hook_family`, picks
 * the highest-CTR label per cohort triple, and upserts into
 * `cta_copy_winners_by_hook`.
 *
 * Threshold is intentionally LOWER than the global elector (≥30 imps per
 * variant, vs ≥50) because cohort traffic is segmented and would
 * otherwise rarely reach the bar. Internal traffic excluded.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_HOURS = 48;
const MIN_IMPRESSIONS = 30;
const PLACEMENTS = ["bio_primary", "bio_secondary", "bio_sticky"] as const;
const MODES = ["calm", "urgent"] as const;

type Mode = (typeof MODES)[number];
type Placement = (typeof PLACEMENTS)[number];

interface VariantStat {
  placement: Placement;
  mode: Mode;
  hook_family: string;
  label: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

function traceId(): string {
  return `elec_hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = traceId();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";

  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("lp_funnel_events")
      .select("event_name, placement, cta_copy_label, cta_copy_mode, payload")
      .gte("created_at", since)
      .in("event_name", ["lp_cta_impression", "lp_cta_click"])
      .in("placement", PLACEMENTS as readonly string[])
      .not("cta_copy_label", "is", null)
      .not("cta_copy_mode", "is", null)
      .eq("is_internal", false)
      .limit(100000);

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, traceId: trace, message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Aggregate: (placement, mode, hook_family, label) → { imps, clicks }.
    // hook_family is read from the event payload jsonb (we stamp it on every
    // impression/click in LinkInBio). Skip rows without a hook_family — the
    // global elector already covers those.
    const buckets = new Map<string, VariantStat>();
    for (const row of data ?? []) {
      const placement = row.placement as Placement;
      const mode = row.cta_copy_mode as Mode;
      const label = row.cta_copy_label as string;
      const hookFamily = (row.payload as Record<string, unknown> | null)?.hook_family as
        | string
        | null
        | undefined;
      if (!hookFamily) continue;
      if (!PLACEMENTS.includes(placement) || !MODES.includes(mode)) continue;
      const key = `${placement}::${mode}::${hookFamily}::${label}`;
      let entry = buckets.get(key);
      if (!entry) {
        entry = {
          placement, mode, hook_family: hookFamily, label,
          impressions: 0, clicks: 0, ctr: 0,
        };
        buckets.set(key, entry);
      }
      if (row.event_name === "lp_cta_impression") entry.impressions += 1;
      else if (row.event_name === "lp_cta_click") entry.clicks += 1;
    }
    for (const stat of buckets.values()) {
      stat.ctr = stat.impressions > 0 ? stat.clicks / stat.impressions : 0;
    }

    // Group by (placement, mode, hook_family) and elect.
    type CohortKey = string;
    const byCohort = new Map<CohortKey, VariantStat[]>();
    for (const stat of buckets.values()) {
      const k = `${stat.placement}::${stat.mode}::${stat.hook_family}`;
      const arr = byCohort.get(k) ?? [];
      arr.push(stat);
      byCohort.set(k, arr);
    }

    const elections: Array<{
      placement: Placement; mode: Mode; hook_family: string;
      winning_label: string | null; ctr_pct: number | null;
      impressions: number; clicks: number; reason: string;
      candidates: VariantStat[];
    }> = [];

    for (const [, candidates] of byCohort) {
      const allHaveSample = candidates.every((c) => c.impressions >= MIN_IMPRESSIONS);
      const totalImps = candidates.reduce((s, c) => s + c.impressions, 0);
      const totalClicks = candidates.reduce((s, c) => s + c.clicks, 0);
      const head = candidates[0];
      if (!allHaveSample) {
        elections.push({
          placement: head.placement, mode: head.mode, hook_family: head.hook_family,
          winning_label: null, ctr_pct: null,
          impressions: totalImps, clicks: totalClicks,
          reason: `insufficient_sample (need ≥${MIN_IMPRESSIONS} per variant)`,
          candidates,
        });
        continue;
      }
      const sorted = [...candidates].sort(
        (a, b) => b.ctr - a.ctr || b.clicks - a.clicks,
      );
      const winner = sorted[0];
      elections.push({
        placement: winner.placement, mode: winner.mode, hook_family: winner.hook_family,
        winning_label: winner.label,
        ctr_pct: Math.round(winner.ctr * 100000) / 1000,
        impressions: winner.impressions, clicks: winner.clicks,
        reason: "elected",
        candidates: sorted,
      });
    }

    const promoted: string[] = [];
    if (!dryRun) {
      for (const e of elections) {
        if (!e.winning_label) continue;
        const { error: upErr } = await supabase
          .from("cta_copy_winners_by_hook")
          .upsert(
            {
              placement: e.placement,
              mode: e.mode,
              hook_family: e.hook_family,
              winning_label: e.winning_label,
              ctr_pct: e.ctr_pct,
              impressions: e.impressions,
              clicks: e.clicks,
              window_hours: WINDOW_HOURS,
              evaluated_at: new Date().toISOString(),
              notes: `auto-elected (cohort); ${e.candidates.length} candidates`,
            },
            { onConflict: "placement,mode,hook_family" },
          );
        if (!upErr) {
          promoted.push(`${e.placement}/${e.mode}/${e.hook_family}=${e.winning_label}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId: trace,
        message: dryRun ? "dry-run" : `promoted ${promoted.length} cohort winner(s)`,
        window_hours: WINDOW_HOURS,
        min_impressions: MIN_IMPRESSIONS,
        promoted,
        elections,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        traceId: trace,
        message: err instanceof Error ? err.message : "unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});