import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

// Multi-armed bandit (Thompson sampling on Beta posteriors of composite_score-derived "successes")
function gammaSample(shape: number): number {
  if (shape < 1) {
    const u = Math.random();
    return gammaSample(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do { const u1 = Math.random(), u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function betaSample(a: number, b: number): number {
  const x = gammaSample(a), y = gammaSample(b);
  return x / (x + y);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const roasWeight = Number(body?.roas_weight ?? 1.0); // 0 disables, 1 = balanced, >1 favors ROAS
    const cohortWeight = Number(body?.cohort_weight ?? 0.6); // boost top-arms within cohorts

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Aggregate metrics by hook_family across BOTH channels
    const { data: metrics, error } = await supabase
      .from("mi_channel_metrics")
      .select("channel, hook_family, impressions, clicks, saves, views, composite_score");
    if (error) throw error;

    // Pull per-arm ROAS for blended ranking
    const { data: revenueRows } = await supabase
      .from("mi_arm_revenue")
      .select("hook_family, roas, revenue, conversions");
    const roasByHook: Record<string, { roas: number; revenue: number; conversions: number }> = {};
    for (const r of revenueRows ?? []) {
      const k = r.hook_family ?? "unknown";
      const cur = roasByHook[k] ?? { roas: 0, revenue: 0, conversions: 0 };
      cur.roas = Math.max(cur.roas, Number(r.roas ?? 0));
      cur.revenue += Number(r.revenue ?? 0);
      cur.conversions += Number(r.conversions ?? 0);
      roasByHook[k] = cur;
    }

    // Pull cohort top-arm shares (Phase 21 cohort-aware boost). For every
    // (cohort, hook) winner-arm we sum its `share` so hooks that dominate
    // multiple cohorts get a stronger boost.
    const { data: cohortRows } = await supabase
      .from("mi_audience_clusters")
      .select("cohort_key, hook_family, share, conversions, revenue");
    type CohortHit = { cohorts: Set<string>; share_sum: number; revenue: number; conversions: number };
    const cohortByHook: Record<string, CohortHit> = {};
    // Determine the top hook per cohort.
    const topByCohort = new Map<string, { hook: string; share: number }>();
    for (const r of cohortRows ?? []) {
      const cohort = r.cohort_key as string;
      const hook = (r.hook_family ?? "unknown") as string;
      const share = Number(r.share ?? 0);
      const cur = topByCohort.get(cohort);
      if (!cur || share > cur.share) topByCohort.set(cohort, { hook, share });
    }
    for (const [cohort, top] of topByCohort) {
      const hit = cohortByHook[top.hook] ?? { cohorts: new Set<string>(), share_sum: 0, revenue: 0, conversions: 0 };
      hit.cohorts.add(cohort);
      hit.share_sum += top.share;
      cohortByHook[top.hook] = hit;
    }
    // Add aggregate revenue/conversions across cohorts for transparency.
    for (const r of cohortRows ?? []) {
      const hook = (r.hook_family ?? "unknown") as string;
      if (!cohortByHook[hook]) continue;
      cohortByHook[hook].revenue += Number(r.revenue ?? 0);
      cohortByHook[hook].conversions += Number(r.conversions ?? 0);
    }

    const byHook: Record<string, { trials: number; successes: number; samples: number[] }> = {};
    for (const m of metrics ?? []) {
      const hk = m.hook_family ?? "unknown";
      if (!byHook[hk]) byHook[hk] = { trials: 0, successes: 0, samples: [] };
      const trials = Number(m.impressions ?? 0) + Number(m.views ?? 0);
      const successes = Number(m.clicks ?? 0) + Number(m.saves ?? 0);
      byHook[hk].trials += trials;
      byHook[hk].successes += successes;
    }

    // Thompson sampling: draw a sample per arm; rank arms by
    // CTR * (1 + roas_weight*log(1+ROAS)) * (1 + cohort_weight * share_sum)
    const arms = Object.entries(byHook).map(([hook, s]) => {
      const a = s.successes + 1;
      const b = Math.max(1, s.trials - s.successes) + 1;
      const draws = Array.from({ length: 200 }, () => betaSample(a, b));
      const expected = draws.reduce((x, y) => x + y, 0) / draws.length;
      const rev = roasByHook[hook] ?? { roas: 0, revenue: 0, conversions: 0 };
      const roasMultiplier = 1 + roasWeight * Math.log(1 + Math.max(0, rev.roas));
      const cohortHit = cohortByHook[hook];
      const cohortShareSum = cohortHit?.share_sum ?? 0;
      const cohortMultiplier = 1 + cohortWeight * cohortShareSum;
      const score = expected * roasMultiplier * cohortMultiplier;
      return {
        hook,
        trials: s.trials,
        successes: s.successes,
        expected_ctr: expected,
        roas: rev.roas,
        revenue: rev.revenue,
        conversions: rev.conversions,
        cohort_count: cohortHit?.cohorts.size ?? 0,
        cohort_share_sum: Number(cohortShareSum.toFixed(4)),
        cohort_multiplier: Number(cohortMultiplier.toFixed(3)),
        score,
      };
    }).sort((a, b) => b.score - a.score);

    if (arms.length === 0) {
      return new Response(JSON.stringify({ ok: true, traceId, message: "no metrics yet", arms: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign priorities: top tertile → high, middle → medium, bottom → low
    const n = arms.length;
    const priorityFor = (idx: number) =>
      idx < Math.ceil(n / 3) ? "high" : idx < Math.ceil((2 * n) / 3) ? "medium" : "low";

    const assignments = arms.map((a, i) => ({ ...a, priority: priorityFor(i) }));

    let pinUpdated = 0, ttUpdated = 0;
    if (!dryRun) {
      for (const a of assignments) {
        const { count: pc } = await supabase
          .from("pinterest_pin_queue")
          .update({ priority: a.priority })
          .in("status", ["queued", "draft"])
          .eq("hook_group", a.hook)
          .select("id", { count: "exact", head: true });
        pinUpdated += pc ?? 0;
        const { count: tc } = await supabase
          .from("tiktok_post_queue")
          .update({ priority: a.priority })
          .in("status", ["queued", "draft"])
          .eq("post_variant", a.hook)
          .select("id", { count: "exact", head: true });
        ttUpdated += tc ?? 0;
      }

      // Persist as tuning state
      await supabase.from("mi_tuning_state").upsert(
        assignments.map((a) => ({
          scope: "bandit_arm",
          key: a.hook,
          value: a.score,
          metadata: {
            priority: a.priority,
            trials: a.trials,
            successes: a.successes,
            expected_ctr: a.expected_ctr,
            roas: a.roas,
            revenue: a.revenue,
            conversions: a.conversions,
            cohort_count: a.cohort_count,
            cohort_share_sum: a.cohort_share_sum,
            cohort_multiplier: a.cohort_multiplier,
          },
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "scope,key" },
      );
    }

    return new Response(JSON.stringify({
      ok: true, traceId, dry_run: dryRun,
      arms: assignments,
      pinterest_updated: pinUpdated,
      tiktok_updated: ttUpdated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});