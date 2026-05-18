/**
 * cinematic-ad-autopilot
 *
 * One-click autopilot for cinematic ads. Given a product_slug:
 *   1. Run the AI decision layer (audience, angle, preset, voice, pacing,
 *      duration, motion profile, music mood).
 *   2. Call cinematic-ad-prepare with those decisions to build scenes + VO +
 *      creative kit + pin copy.
 *   3. Compute confidence_scores from the prepared job.
 *   4. If overall_score >= autopilot_threshold, mark auto_publish=true and
 *      forward to cinematic-ad-approve (which queues the render). The render
 *      webhook will then auto-publish once validation passes.
 *   5. Otherwise leave the job in `prepared` for admin review.
 *
 * POST body: { product_slug: string, autopilot_threshold?: number, dry_run?: boolean }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { analyzeProduct, computeConfidenceScores } from "../_shared/ai-decisions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const trace = () => `cap_auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, traceId, message: "unauthorized" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const product_slug: string = String(body.product_slug ?? "").trim();
  if (!product_slug) return json(400, { ok: false, traceId, message: "product_slug required" });
  const threshold = Math.max(0, Math.min(100, Math.round(Number(body.autopilot_threshold ?? 70))));
  const dryRun = Boolean(body.dry_run);

  const log: Array<{ step: string; at: string; meta?: any }> = [];
  const stamp = (step: string, meta?: any) => log.push({ step, at: new Date().toISOString(), meta });

  // ── 1. Decision layer ────────────────────────────────────────────────
  const { data: product, error: prodErr } = await admin
    .from("products_public")
    .select("slug, name, image_url, images, description, category, primary_species, primary_intent, price")
    .eq("slug", product_slug)
    .maybeSingle();
  if (prodErr || !product) return json(404, { ok: false, traceId, message: `product not found: ${product_slug}` });

  stamp("analyze_product");
  const decisions = await analyzeProduct(product as any, lovableKey);
  stamp("decisions_ready", decisions);

  if (dryRun) {
    return json(200, { ok: true, traceId, message: "dry-run", decisions, autopilot_log: log });
  }

  // ── 2. Prepare assets driven by the decisions ────────────────────────
  stamp("prepare_start");
  const prepRes = await fetch(`${url}/functions/v1/cinematic-ad-prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
    body: JSON.stringify({
      product_slug,
      voice_style: decisions.voice_style,
      hook_variant: decisions.angle,
    }),
  });
  const prepJson: any = await prepRes.json().catch(() => ({}));
  if (!prepRes.ok || !prepJson?.ok || !prepJson?.job?.id) {
    stamp("prepare_failed", prepJson);
    return json(500, { ok: false, traceId, message: prepJson?.message ?? `prepare failed (${prepRes.status})`, autopilot_log: log });
  }
  const jobId: string = prepJson.job.id;
  stamp("prepare_ok", { jobId });

  // ── 3. Confidence scoring ────────────────────────────────────────────
  const { data: job } = await admin.from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  const scores = computeConfidenceScores(job ?? {}, decisions);
  stamp("scores_computed", scores);

  await admin.from("cinematic_ad_jobs").update({
    ai_decisions: decisions,
    confidence_scores: scores,
    autopilot: true,
    autopilot_threshold: threshold,
    preset: decisions.platform_fit,
    output_duration_seconds: job?.output_duration_seconds ?? decisions.duration_seconds,
    autopilot_log: log,
  }).eq("id", jobId);

  // ── 4. Auto-approve + queue render if score clears threshold ─────────
  if (scores.overall < threshold) {
    stamp("hold_for_review", { reason: `overall ${scores.overall} < threshold ${threshold}` });
    await admin.from("cinematic_ad_jobs").update({
      status: "awaiting_approval",
      status_message: `autopilot held — confidence ${scores.overall}/${threshold}`,
      autopilot_log: log,
    }).eq("id", jobId);
    return json(200, { ok: true, traceId, message: "prepared — held for admin review", job_id: jobId, decisions, scores, autopilot_log: log });
  }

  // Mark auto_publish BEFORE approve so the render webhook will auto-publish
  // once validation passes.
  await admin.from("cinematic_ad_jobs").update({ auto_publish: true }).eq("id", jobId);

  stamp("approve_start");
  const apprRes = await fetch(`${url}/functions/v1/cinematic-ad-approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
    body: JSON.stringify({
      job_id: jobId,
      preset: decisions.platform_fit,
      pin_title: job?.pin_title,
      pin_description: job?.pin_description,
      hashtags: job?.hashtags,
    }),
  });
  const apprJson: any = await apprRes.json().catch(() => ({}));
  if (!apprRes.ok || apprJson?.ok === false) {
    stamp("approve_failed", apprJson);
    await admin.from("cinematic_ad_jobs").update({ autopilot_log: log }).eq("id", jobId);
    return json(500, { ok: false, traceId, message: apprJson?.message ?? `approve failed (${apprRes.status})`, job_id: jobId, decisions, scores, autopilot_log: log });
  }
  stamp("queued_for_render", apprJson?.queued ?? {});

  await admin.from("cinematic_ad_jobs").update({
    autopilot_log: log,
    status_message: `autopilot engaged — confidence ${scores.overall} ≥ ${threshold}, auto-publish armed`,
  }).eq("id", jobId);

  return json(200, {
    ok: true,
    traceId,
    message: `autopilot engaged — confidence ${scores.overall}/${threshold}`,
    job_id: jobId,
    decisions,
    scores,
    autopilot_log: log,
  });
});