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
const PIN_TTL_DAYS = 7;
/** Phase 30 — guardrail window + threshold. */
const GUARDRAIL_WINDOW_HOURS = 24;
const GUARDRAIL_MIN_IMPRESSIONS = 60; // ~2× per-variant min, summed
const GUARDRAIL_RATIO = 0.7;          // cohort CTR < 70% of global → block
/** Phase 33 — min-traffic gate: cohorts with <X total imps in 24h fall back to global. */
const MIN_COHORT_TRAFFIC_24H = 40;
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
  wilson_lb: number;
}

function traceId(): string {
  return `elec_hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wilson score lower bound (95% CI). Penalises low-volume variants so a
 * 1/2 clicker doesn't beat a 30/300 winner. Returns value in [0, 1].
 */
function wilsonLowerBound(clicks: number, impressions: number, z = 1.96): number {
  if (impressions <= 0) return 0;
  const phat = clicks / impressions;
  const denom = 1 + (z * z) / impressions;
  const centre = phat + (z * z) / (2 * impressions);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * impressions)) / impressions);
  return Math.max(0, (centre - margin) / denom);
}

/** Wilson score upper bound (95% CI). Mirror of the lower bound. */
function wilsonUpperBound(clicks: number, impressions: number, z = 1.96): number {
  if (impressions <= 0) return 1;
  const phat = clicks / impressions;
  const denom = 1 + (z * z) / impressions;
  const centre = phat + (z * z) / (2 * impressions);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * impressions)) / impressions);
  return Math.min(1, (centre + margin) / denom);
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
    const guardrailSince = new Date(
      Date.now() - GUARDRAIL_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Phase 28: auto-decay stale pins. Pins older than PIN_TTL_DAYS are
    // released so manual overrides don't linger forever; auto-elector then
    // re-evaluates the cohort on the next run.
    const decayCutoff = new Date(Date.now() - PIN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: decayed } = await supabase
      .from("cta_copy_winners_by_hook")
      .update({
        pinned: false,
        pinned_at: null,
        pinned_by: null,
        notes: `auto-unpinned after ${PIN_TTL_DAYS}d TTL`,
      })
      .eq("pinned", true)
      .lt("pinned_at", decayCutoff)
      .select("placement, mode, hook_family");
    const decayedKeys = (decayed ?? []).map(
      (r: any) => `${r.placement}/${r.mode}/${r.hook_family}`,
    );
    if ((decayed ?? []).length > 0) {
      await supabase.from("cohort_copy_pin_history").insert(
        (decayed ?? []).map((r: any) => ({
          action: "decay",
          placement: r.placement,
          mode: r.mode,
          hook_family: r.hook_family,
          actor: "system",
          reason: `auto-unpinned after ${PIN_TTL_DAYS}d TTL`,
        })),
      );
    }

    // Phase 26: skip still-pinned cohorts so manual overrides aren't clobbered.
    const { data: pinnedRows } = await supabase
      .from("cta_copy_winners_by_hook")
      .select("placement, mode, hook_family")
      .eq("pinned", true);
    const pinnedKeys = new Set(
      (pinnedRows ?? []).map((r: any) => `${r.placement}::${r.mode}::${r.hook_family}`),
    );

    const { data, error } = await supabase
      .from("lp_funnel_events")
      .select("event_name, placement, cta_copy_label, cta_copy_mode, hook_family")
      .gte("created_at", since)
      .in("event_name", ["lp_cta_impression", "lp_cta_click"])
      .in("placement", PLACEMENTS as readonly string[])
      .not("cta_copy_label", "is", null)
      .not("cta_copy_mode", "is", null)
      .not("hook_family", "is", null)
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
      const hookFamily = row.hook_family as string | null | undefined;
      if (!hookFamily) continue;
      if (!PLACEMENTS.includes(placement) || !MODES.includes(mode)) continue;
      const key = `${placement}::${mode}::${hookFamily}::${label}`;
      let entry = buckets.get(key);
      if (!entry) {
        entry = {
          placement, mode, hook_family: hookFamily, label,
          impressions: 0, clicks: 0, ctr: 0, wilson_lb: 0,
        };
        buckets.set(key, entry);
      }
      if (row.event_name === "lp_cta_impression") entry.impressions += 1;
      else if (row.event_name === "lp_cta_click") entry.clicks += 1;
    }
    for (const stat of buckets.values()) {
      stat.ctr = stat.impressions > 0 ? stat.clicks / stat.impressions : 0;
      stat.wilson_lb = wilsonLowerBound(stat.clicks, stat.impressions);
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
      confidence_score: number | null;
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
          winning_label: null, ctr_pct: null, confidence_score: null,
          impressions: totalImps, clicks: totalClicks,
          reason: `insufficient_sample (need ≥${MIN_IMPRESSIONS} per variant)`,
          candidates,
        });
        continue;
      }
      // Phase 27: rank by Wilson lower bound, tie-break on raw CTR then clicks.
      const sorted = [...candidates].sort(
        (a, b) => b.wilson_lb - a.wilson_lb || b.ctr - a.ctr || b.clicks - a.clicks,
      );
      const winner = sorted[0];
      const runnerUp = sorted[1];
      // Phase 31 — significance gate: require winner LB ≥ runner-up UB so
      // overlapping confidence intervals don't trigger flip-flops between
      // statistically-tied variants. With a single candidate the gate passes
      // automatically.
      if (runnerUp) {
        const runnerUpUB = wilsonUpperBound(runnerUp.clicks, runnerUp.impressions);
        if (winner.wilson_lb < runnerUpUB) {
          elections.push({
            placement: winner.placement, mode: winner.mode, hook_family: winner.hook_family,
            winning_label: null, ctr_pct: null, confidence_score: null,
            impressions: totalImps, clicks: totalClicks,
            reason: `not_significant (winner LB ${(winner.wilson_lb * 100).toFixed(2)}% < runner-up UB ${(runnerUpUB * 100).toFixed(2)}%)`,
            candidates: sorted,
          });
          continue;
        }
      }
      elections.push({
        placement: winner.placement, mode: winner.mode, hook_family: winner.hook_family,
        winning_label: winner.label,
        ctr_pct: Math.round(winner.ctr * 100000) / 1000,
        confidence_score: Math.round(winner.wilson_lb * 100000) / 100000,
        impressions: winner.impressions, clicks: winner.clicks,
        reason: "elected (wilson-lb)",
        candidates: sorted,
      });
    }

    const promoted: string[] = [];
    const skippedPinned: string[] = [];
    const guardrailBlocked: string[] = [];
    const guardrailCleared: string[] = [];

    // Phase 30 — compute global CTR per (placement, mode) over the guardrail
    // window. We compare each cohort's elected winner CTR (last 24h slice) to
    // the global CTR for that placement+mode. If the cohort underperforms the
    // global by ≥30%, block the cohort override so the runtime resolver falls
    // back to the global elected winner.
    const { data: guardrailRows } = await supabase
      .from("lp_funnel_events")
      .select("event_name, placement, cta_copy_mode, cta_copy_label, hook_family")
      .gte("created_at", guardrailSince)
      .in("event_name", ["lp_cta_impression", "lp_cta_click"])
      .in("placement", PLACEMENTS as readonly string[])
      .not("cta_copy_mode", "is", null)
      .eq("is_internal", false)
      .limit(100000);

    type Tally = { imps: number; clicks: number };
    const globalTally = new Map<string, Tally>(); // key: placement::mode
    const cohortWinnerTally = new Map<string, Tally>(); // key: placement::mode::hook_family::label
    for (const row of guardrailRows ?? []) {
      const placement = row.placement as Placement;
      const mode = row.cta_copy_mode as Mode;
      if (!PLACEMENTS.includes(placement) || !MODES.includes(mode)) continue;
      const gKey = `${placement}::${mode}`;
      const g = globalTally.get(gKey) ?? { imps: 0, clicks: 0 };
      if (row.event_name === "lp_cta_impression") g.imps += 1;
      else if (row.event_name === "lp_cta_click") g.clicks += 1;
      globalTally.set(gKey, g);
      const hookFamily = row.hook_family as string | null | undefined;
      const label = row.cta_copy_label as string | null | undefined;
      if (hookFamily && label) {
        const cKey = `${placement}::${mode}::${hookFamily}::${label}`;
        const c = cohortWinnerTally.get(cKey) ?? { imps: 0, clicks: 0 };
        if (row.event_name === "lp_cta_impression") c.imps += 1;
        else if (row.event_name === "lp_cta_click") c.clicks += 1;
        cohortWinnerTally.set(cKey, c);
      }
    }

    function evaluateGuardrail(
      placement: Placement, mode: Mode, hook_family: string, winning_label: string,
    ): { blocked: boolean; reason: string | null; cohort_ctr: number; global_ctr: number } {
      const g = globalTally.get(`${placement}::${mode}`) ?? { imps: 0, clicks: 0 };
      const c = cohortWinnerTally.get(`${placement}::${mode}::${hook_family}::${winning_label}`)
        ?? { imps: 0, clicks: 0 };
      const globalCtr = g.imps > 0 ? g.clicks / g.imps : 0;
      const cohortCtr = c.imps > 0 ? c.clicks / c.imps : 0;
      if (c.imps < GUARDRAIL_MIN_IMPRESSIONS) {
        return { blocked: false, reason: null, cohort_ctr: cohortCtr, global_ctr: globalCtr };
      }
      if (globalCtr <= 0) {
        return { blocked: false, reason: null, cohort_ctr: cohortCtr, global_ctr: globalCtr };
      }
      if (cohortCtr < GUARDRAIL_RATIO * globalCtr) {
        return {
          blocked: true,
          reason: `cohort CTR ${(cohortCtr * 100).toFixed(2)}% < ${(GUARDRAIL_RATIO * 100).toFixed(0)}% of global ${(globalCtr * 100).toFixed(2)}% (24h)`,
          cohort_ctr: cohortCtr,
          global_ctr: globalCtr,
        };
      }
      return { blocked: false, reason: null, cohort_ctr: cohortCtr, global_ctr: globalCtr };
    }

    /**
     * Phase 33 — total-traffic per cohort in the guardrail window. Used to
     * suppress micro-cohorts (e.g. <40 imps/24h across all variants combined)
     * that would otherwise generate noisy winners; runtime falls back to the
     * global elected winner until traffic builds up.
     */
    const cohortTrafficTally = new Map<string, number>(); // key: placement::mode::hook_family
    for (const row of guardrailRows ?? []) {
      if (row.event_name !== "lp_cta_impression") continue;
      const placement = row.placement as Placement;
      const mode = row.cta_copy_mode as Mode;
      const hookFamily = row.hook_family as string | null | undefined;
      if (!hookFamily) continue;
      if (!PLACEMENTS.includes(placement) || !MODES.includes(mode)) continue;
      const k = `${placement}::${mode}::${hookFamily}`;
      cohortTrafficTally.set(k, (cohortTrafficTally.get(k) ?? 0) + 1);
    }

    if (!dryRun) {
      for (const e of elections) {
        if (!e.winning_label) continue;
        const cohortKey = `${e.placement}::${e.mode}::${e.hook_family}`;
        if (pinnedKeys.has(cohortKey)) {
          skippedPinned.push(cohortKey);
          continue;
        }
        let guard = evaluateGuardrail(e.placement, e.mode, e.hook_family, e.winning_label);
        // Phase 33 — min-traffic gate. Even if CTR looks fine, a cohort with
        // <MIN_COHORT_TRAFFIC_24H impressions in the last 24h is too thin to
        // trust; force a guardrail block so runtime falls back to global.
        const cohortTraffic = cohortTrafficTally.get(cohortKey) ?? 0;
        if (!guard.blocked && cohortTraffic < MIN_COHORT_TRAFFIC_24H) {
          guard = {
            blocked: true,
            reason: `low_traffic (${cohortTraffic} imps in 24h < ${MIN_COHORT_TRAFFIC_24H} threshold)`,
            cohort_ctr: guard.cohort_ctr,
            global_ctr: guard.global_ctr,
          };
        }
        const { error: upErr } = await supabase
          .from("cta_copy_winners_by_hook")
          .upsert(
            {
              placement: e.placement,
              mode: e.mode,
              hook_family: e.hook_family,
              winning_label: e.winning_label,
              ctr_pct: e.ctr_pct,
              confidence_score: e.confidence_score,
              impressions: e.impressions,
              clicks: e.clicks,
              window_hours: WINDOW_HOURS,
              evaluated_at: new Date().toISOString(),
              notes: `auto-elected (cohort, wilson-lb); ${e.candidates.length} candidates`,
              guardrail_blocked: guard.blocked,
              guardrail_reason: guard.reason,
              guardrail_evaluated_at: new Date().toISOString(),
            },
            { onConflict: "placement,mode,hook_family" },
          );
        if (!upErr) {
          promoted.push(`${e.placement}/${e.mode}/${e.hook_family}=${e.winning_label}`);
          if (guard.blocked) {
            guardrailBlocked.push(`${e.placement}/${e.mode}/${e.hook_family}`);
            await supabase.from("cohort_copy_pin_history").insert({
              action: "guardrail",
              placement: e.placement,
              mode: e.mode,
              hook_family: e.hook_family,
              winning_label: e.winning_label,
              actor: "system",
              reason: guard.reason,
            });
          }
        }
      }

      // Clear guardrail on cohorts that have recovered (no longer underperforming).
      const { data: blockedRows } = await supabase
        .from("cta_copy_winners_by_hook")
        .select("placement, mode, hook_family, winning_label")
        .eq("guardrail_blocked", true);
      for (const r of blockedRows ?? []) {
        const key = `${r.placement}/${r.mode}/${r.hook_family}`;
        if (guardrailBlocked.includes(key)) continue; // re-blocked this run
        const guard = evaluateGuardrail(
          r.placement as Placement, r.mode as Mode, r.hook_family as string,
          r.winning_label as string,
        );
        const cohortTraffic =
          cohortTrafficTally.get(`${r.placement}::${r.mode}::${r.hook_family}`) ?? 0;
        const lowTraffic = cohortTraffic < MIN_COHORT_TRAFFIC_24H;
        if (!guard.blocked && !lowTraffic) {
          await supabase.from("cta_copy_winners_by_hook")
            .update({
              guardrail_blocked: false,
              guardrail_reason: null,
              guardrail_evaluated_at: new Date().toISOString(),
            })
            .eq("placement", r.placement).eq("mode", r.mode).eq("hook_family", r.hook_family);
          guardrailCleared.push(key);
          await supabase.from("cohort_copy_pin_history").insert({
            action: "guardrail_clear",
            placement: r.placement, mode: r.mode, hook_family: r.hook_family,
            winning_label: r.winning_label, actor: "system",
            reason: `cohort CTR recovered (${(guard.cohort_ctr * 100).toFixed(2)}% vs global ${(guard.global_ctr * 100).toFixed(2)}%, 24h)`,
          });
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
        pin_ttl_days: PIN_TTL_DAYS,
        auto_unpinned: decayedKeys,
        promoted,
        skipped_pinned: skippedPinned,
        guardrail_blocked: guardrailBlocked,
        guardrail_cleared: guardrailCleared,
        guardrail_window_hours: GUARDRAIL_WINDOW_HOURS,
        guardrail_ratio: GUARDRAIL_RATIO,
        min_cohort_traffic_24h: MIN_COHORT_TRAFFIC_24H,
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