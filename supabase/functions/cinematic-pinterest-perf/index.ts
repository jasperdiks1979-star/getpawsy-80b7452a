// Pinterest Performance Engine — predicts ad performance before render.
// Scores stop-scroll, retention, save-rate, CTR. Informational only — does NOT add reject rules.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

function scoreStopScroll(job: any): number {
  const sb = Array.isArray(job.motion_storyboard) ? job.motion_storyboard : [];
  const firstScene = sb[0] || {};
  const motionFirst = Number(firstScene.motion_intensity ?? 0.4);
  const hookLen = (job.hook_text || "").trim().split(/\s+/).filter(Boolean).length;
  const motionRatio = Number(job.motion_ratio ?? 0.4);
  let s = 50;
  s += motionFirst * 35;                              // strong first-frame motion → stop scroll
  s += motionRatio >= 0.7 ? 12 : motionRatio * 8;
  s += hookLen >= 3 && hookLen <= 8 ? 8 : 0;          // ideal hook length
  if (/\?|!|stop|wait|new|secret/i.test(job.hook_text || "")) s += 6;
  return clamp(s);
}

function scoreRetention(job: any): number {
  const sb = Array.isArray(job.motion_storyboard) ? job.motion_storyboard : [];
  const avgDuration = sb.length ? sb.reduce((a: number, s: any) => a + (s.duration_ms || 1600), 0) / sb.length : 1800;
  const cadenceOk = avgDuration <= 1800;
  const camMoves = new Set(sb.map((s: any) => s.camera_move)).size;
  let s = 45;
  s += cadenceOk ? 22 : 6;
  s += Math.min(camMoves, 5) * 5;                     // variety
  s += Number(job.motion_ratio ?? 0) >= 0.7 ? 8 : 0;
  return clamp(s);
}

function scoreSaveRate(job: any): number {
  const cat = (job.category || job.product_name || "").toLowerCase();
  let s = 50;
  if (/cat\s*tree|bed|orthopedic|furniture/.test(cat)) s += 18; // aspirational/utility blend
  if (/diy|guide|tip|how/.test((job.hook_text||"").toLowerCase())) s += 10;
  const emotional = /love|cozy|happy|relax|peace|calm|finally/i.test(job.hook_text || "");
  if (emotional) s += 10;
  return clamp(s);
}

function scoreCtr(job: any): number {
  let s = 45;
  const cta = (job.cta_text || "").toLowerCase();
  if (/shop|get|try|see/.test(cta)) s += 15;
  if (job.product_price) s += 10;
  if ((job.pin_destination_url || "").includes("/products/")) s += 12;
  if ((job.hook_text || "").length > 0) s += 8;
  return clamp(s);
}

function composite(scores: { stop_scroll: number; retention: number; save_rate: number; ctr: number }) {
  return Math.round(
    scores.stop_scroll * 0.35 +
    scores.retention   * 0.25 +
    scores.save_rate   * 0.20 +
    scores.ctr         * 0.20
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const { job_id } = await req.json();
    if (!job_id) return new Response(JSON.stringify({ ok: false, traceId, message: "job_id required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: job, error } = await supabase.from("cinematic_ad_jobs").select("*").eq("id", job_id).maybeSingle();
    if (error || !job) return new Response(JSON.stringify({ ok: false, traceId, message: "job not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const scores = {
      stop_scroll: scoreStopScroll(job),
      retention:   scoreRetention(job),
      save_rate:   scoreSaveRate(job),
      ctr:         scoreCtr(job),
    };
    const comp = composite(scores);
    const breakdown = { ...scores, composite: comp, version: "v1", computed_at: new Date().toISOString() };

    const upd = await supabase.from("cinematic_ad_jobs").update({
      pinterest_perf_score: comp,
      pinterest_perf_breakdown: breakdown,
    }).eq("id", job_id);
    if (upd.error) throw upd.error;

    return new Response(JSON.stringify({ ok: true, traceId, message: `Pinterest perf scored ${comp}/100`, breakdown }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});