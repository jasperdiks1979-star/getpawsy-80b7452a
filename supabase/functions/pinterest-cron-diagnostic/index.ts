// pinterest-cron-diagnostic — read-only inspector for the cron publisher.
// Reproduces the exact selection query of pinterest-cron-worker and reports
// why the next eligible queued pin would or would not be auto-published.
//
// Response shape:
// {
//   ok: true,
//   ready_to_publish: number,
//   queued_total: number,
//   warmup: { active, daily_cap_used, daily_cap_max, min_gap_minutes,
//             last_posted_at, minutes_remaining_for_gap, next_allowed_publish_at,
//             us_score_threshold },
//   gating: { blocked: boolean, reason: string|null },
//   flags: { auto_approve_queue, domination_mode, scale_unlocked,
//            production_publish_verified, deploy_verify_fresh },
//   next_eligible_pin: { id, status, approved_at, board_id, scheduled_at,
//                        destination_url, destination_url_ok, image_url,
//                        image_url_ok, us_score, rejection_reason, eligible }
//                       | null
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { PINTEREST_ALLOWED_SLUGS } from "../_shared/pinterest-qa.ts";
import { computeUsAudienceScore } from "../_shared/pinterest-copy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_RETRIES = 2;
const HERO_DAILY_CAP = 3;
const MAX_PINS_PER_HOUR = 50;

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: rt } = await sb
      .from("pinterest_runtime_settings")
      .select(
        "scale_unlocked, daily_pin_cap, min_gap_minutes, warmup_until, us_score_threshold, auto_approve_queue, domination_mode, production_publish_verified, production_trial_detected, deploy_verified_at, deploy_verification_window_minutes",
      )
      .eq("id", 1)
      .maybeSingle();

    const now = Date.now();
    const scaleUnlocked = !!rt?.scale_unlocked;
    const warmupActive = rt?.warmup_until
      ? new Date(rt.warmup_until).getTime() > now
      : false;
    const dailyCap: number = warmupActive
      ? Number(rt?.daily_pin_cap ?? 4)
      : (scaleUnlocked ? MAX_PINS_PER_HOUR * 24 : HERO_DAILY_CAP);
    const minGapMinutes: number = warmupActive ? Number(rt?.min_gap_minutes ?? 90) : 0;
    const usScoreThreshold: number = Number(rt?.us_score_threshold ?? 0.55);
    const verifyWindowMin = Number(rt?.deploy_verification_window_minutes ?? 60);
    const verifiedAt = rt?.deploy_verified_at ? new Date(rt.deploy_verified_at as string).getTime() : 0;
    const deployVerifyFresh = verifiedAt > 0 && (now - verifiedAt) <= verifyWindowMin * 60 * 1000;

    // Daily cap usage (rolling 24h, matches cron)
    const oneDayAgo = new Date(now - 86400000).toISOString();
    const { count: postedToday } = await sb
      .from("pinterest_pin_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("posted_at", oneDayAgo);
    const dailyCapUsed = postedToday || 0;

    // Last posted pin → min-gap state
    const { data: lastPosted } = await sb
      .from("pinterest_pin_queue")
      .select("posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastTs = lastPosted?.posted_at ? new Date(lastPosted.posted_at).getTime() : 0;
    const gapElapsedMin = lastTs ? Math.floor((now - lastTs) / 60000) : null;
    const gapRemainingMin = minGapMinutes > 0 && lastTs
      ? Math.max(0, minGapMinutes - (gapElapsedMin ?? 0))
      : 0;
    const nextAllowedPublishAt = minGapMinutes > 0 && lastTs
      ? new Date(lastTs + minGapMinutes * 60000).toISOString()
      : new Date(now).toISOString();

    // Gating reasons (mirror cron-worker order)
    let blocked = false;
    let reason: string | null = null;
    if (!rt?.production_publish_verified || rt?.production_trial_detected) {
      blocked = true;
      reason = "production_publish_verified=false or trial_detected — cron guard closed";
    } else if (!deployVerifyFresh) {
      blocked = true;
      reason = `Post-deploy verification stale (window ${verifyWindowMin}m). Call POST /functions/v1/deploy-verify.`;
    } else if (dailyCapUsed >= dailyCap) {
      blocked = true;
      reason = `Daily cap reached: ${dailyCapUsed}/${dailyCap} pins in the last 24h`;
    } else if (gapRemainingMin > 0) {
      blocked = true;
      reason = `Warm-up min-gap: wait ${gapRemainingMin}m (last pin ${gapElapsedMin}m ago)`;
    }

    // Reproduce the cron selection
    const autoApprove = !!rt?.auto_approve_queue;
    const domination = !!rt?.domination_mode;
    let q = sb
      .from("pinterest_pin_queue")
      .select(
        "id, status, approved_at, board_id, board_name, scheduled_at, destination_link, pin_image_url, us_audience_score, rejection_reason, last_publish_error, profit_state, retries, product_slug, priority",
      )
      .eq("status", "queued")
      .or("profit_state.is.null,profit_state.neq.kill")
      .lte("scheduled_at", new Date(now).toISOString())
      .lt("retries", MAX_RETRIES);
    if (!autoApprove) q = q.not("approved_at", "is", null);
    if (!domination) q = q.in("product_slug", Array.from(PINTEREST_ALLOWED_SLUGS));
    const { data: candidates, error } = await q
      .order("priority", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(10);
    if (error) throw error;

    // Score US-audience for any row missing it
    for (const p of candidates || []) {
      if ((p as any).us_audience_score == null) {
        (p as any).us_audience_score = computeUsAudienceScore(p as any);
      }
    }

    const { count: queuedTotal } = await sb
      .from("pinterest_pin_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "queued");

    const readyToPublish = (candidates || []).filter((p: any) => {
      const us = Number(p.us_audience_score ?? 0);
      return (
        us >= usScoreThreshold &&
        typeof p.pin_image_url === "string" && p.pin_image_url.startsWith("https://") &&
        typeof p.destination_link === "string" && p.destination_link.startsWith("https://getpawsy.pet/")
      );
    }).length;

    const top: any = (candidates || [])[0] || null;
    let nextEligible: Record<string, unknown> | null = null;
    if (top) {
      const usScore = Number(top.us_audience_score ?? 0);
      const destOk = typeof top.destination_link === "string" && top.destination_link.startsWith("https://getpawsy.pet/");
      const imgOk = typeof top.pin_image_url === "string" && top.pin_image_url.startsWith("https://");
      const usOk = usScore >= usScoreThreshold;
      const reasons: string[] = [];
      if (!destOk) reasons.push("destination_url_invalid");
      if (!imgOk) reasons.push("image_url_invalid");
      if (!usOk) reasons.push(`us_score_below_threshold (${usScore.toFixed(2)}<${usScoreThreshold})`);
      if (blocked) reasons.push(reason!);
      nextEligible = {
        id: top.id,
        status: top.status,
        approved_at: top.approved_at,
        board_id: top.board_id,
        board_name: top.board_name,
        scheduled_at: top.scheduled_at,
        destination_url: top.destination_link,
        destination_url_ok: destOk,
        image_url: top.pin_image_url,
        image_url_ok: imgOk,
        us_score: usScore,
        rejection_reason: top.rejection_reason || top.last_publish_error || null,
        eligible: reasons.length === 0,
        ineligibility_reasons: reasons,
      };
    }

    return j({
      ok: true,
      now: new Date(now).toISOString(),
      ready_to_publish: readyToPublish,
      queued_total: queuedTotal || 0,
      candidate_count: (candidates || []).length,
      warmup: {
        active: warmupActive,
        warmup_until: rt?.warmup_until || null,
        daily_cap_used: dailyCapUsed,
        daily_cap_max: dailyCap,
        min_gap_minutes: minGapMinutes,
        last_posted_at: lastPosted?.posted_at || null,
        minutes_since_last_post: gapElapsedMin,
        minutes_remaining_for_gap: gapRemainingMin,
        next_allowed_publish_at: nextAllowedPublishAt,
        us_score_threshold: usScoreThreshold,
      },
      gating: { blocked, reason },
      flags: {
        auto_approve_queue: autoApprove,
        domination_mode: domination,
        scale_unlocked: scaleUnlocked,
        production_publish_verified: !!rt?.production_publish_verified,
        production_trial_detected: !!rt?.production_trial_detected,
        deploy_verify_fresh: deployVerifyFresh,
        deploy_verified_at: rt?.deploy_verified_at || null,
      },
      next_eligible_pin: nextEligible,
    });
  } catch (e) {
    return j({ ok: false, error: (e as Error).message }, 200);
  }
});