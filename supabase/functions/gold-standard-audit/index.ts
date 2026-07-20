// gold-standard-audit
// Scores every cinematic_ad_jobs row with the Gold Standard rubric,
// persists creative_score* + tier, and returns aggregate counts.
// Also flags the active benchmark.
// Admin-only (verified via JWT + has_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { scoreCreative } from "../_shared/gold-standard-scorer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trace = () => `gsa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json(401, { ok: false, traceId, message: "auth required" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json(403, { ok: false, traceId, message: "admin only" });

    const { data: settings } = await admin
      .from("cinematic_ad_settings")
      .select("gold_standard_min_score, gold_standard_priority_score, gold_standard_reference_slug")
      .eq("id", true).maybeSingle();
    const minScore = Number(settings?.gold_standard_min_score ?? 80);
    const priority = Number(settings?.gold_standard_priority_score ?? 90);
    const refSlug = String(settings?.gold_standard_reference_slug ?? "cat-scratching-bed");

    const { data: benchmark } = await admin
      .from("pinterest_creative_benchmarks")
      .select("*")
      .eq("product_slug", refSlug).eq("is_active", true).maybeSingle();

    // Score recent + un-tiered jobs (cap 1500 / call)
    const { data: jobs } = await admin
      .from("cinematic_ad_jobs")
      .select("id, status, media_type, final_creative_score, hook_score, voice_score, ctr_prediction_score, qa_composite_score, realism_score, camera_motion_score, engagement_pacing_score, scene_change_count, product_fidelity_score, validation_v4_passed, meta, creative_quality_tier, output_mp4_url")
      .not("output_mp4_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1500);

    let scanned = 0, gold = 0, medium = 0, low = 0;
    const updates: any[] = [];
    for (const j of jobs ?? []) {
      scanned++;
      const res = scoreCreative(j as any, { minScore, priorityScore: priority });
      if (res.tier === "gold") gold++;
      else if (res.tier === "medium") medium++;
      else low++;
      updates.push({
        id: (j as any).id,
        creative_score: res.creative_score,
        creative_score_voice: res.voice,
        creative_score_motion: res.motion,
        creative_score_product_visibility: res.product_visibility,
        creative_score_conversion: res.conversion,
        creative_score_brand: res.brand,
        creative_quality_tier: res.tier,
        gold_standard_benchmark_id: benchmark?.id ?? null,
      });
    }
    // Batch update in chunks of 100.
    for (let i = 0; i < updates.length; i += 100) {
      const chunk = updates.slice(i, i + 100);
      await admin.from("cinematic_ad_jobs").upsert(chunk, { onConflict: "id" });
    }

    return json(200, {
      ok: true, traceId,
      benchmark: benchmark ? { id: benchmark.id, name: benchmark.name, product_slug: benchmark.product_slug } : null,
      thresholds: { min: minScore, priority },
      scanned, gold, medium, low,
      gold_pct: scanned ? Math.round((gold / scanned) * 100) : 0,
    });
  } catch (e) {
    console.error("[gold-standard-audit]", e);
    return json(200, { ok: false, traceId, message: (e as Error).message });
  }
});