import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin check via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "no_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [
      elig,
      replacements,
      winners,
      ctrPins,
      videoJobs,
    ] = await Promise.all([
      sb.from("pinterest_eligibility_log").select("reason, eligible, media_score").gte("checked_at", since),
      sb.from("pinterest_replacement_log").select("id, created_at").gte("created_at", since),
      sb.from("pinterest_creative_winners").select("id, composite_score").order("composite_score", { ascending: false }).limit(20),
      sb.from("pinterest_pin_performance").select("pin_id, ctr, outbound_clicks, saves, impressions").order("outbound_clicks", { ascending: false }).limit(20),
      sb.from("cinematic_ad_jobs").select("id, status, creative_source_tier, validation_v4_passed").gte("created_at", since),
    ]);

    const eligRows = elig.data ?? [];
    const blockedByInventory = eligRows.filter((r) =>
      ["out_of_stock", "missing_inventory", "inactive", "archived", "hidden_product", "cj_zero"].includes(r.reason)
    ).length;
    const blockedByMedia = eligRows.filter((r) => r.reason === "media_score_low").length;
    const avgMedia =
      eligRows.length === 0
        ? 0
        : eligRows.reduce((a, r) => a + (r.media_score ?? 0), 0) / eligRows.length;

    const v4Pass = videoJobs.data?.filter((j) => j.validation_v4_passed).length ?? 0;
    const v4Total = videoJobs.data?.length ?? 0;
    const sourceTiers = (videoJobs.data ?? []).reduce<Record<string, number>>((acc, j) => {
      const k = j.creative_source_tier ?? "unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    return new Response(
      JSON.stringify({
        ok: true,
        window_days: 7,
        blocked_by_inventory: blockedByInventory,
        blocked_by_media: blockedByMedia,
        avg_media_score: Math.round(avgMedia),
        creative_winners: winners.data ?? [],
        top_ctr_pins: ctrPins.data ?? [],
        replacements_generated: replacements.data?.length ?? 0,
        video_quality: { v4_pass: v4Pass, v4_total: v4Total, pass_rate: v4Total ? v4Pass / v4Total : 0 },
        creative_source_tiers: sourceTiers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});