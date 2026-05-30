// Accept client-uploaded final MP4 path, run QA checks, mark job ready_for_review.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleData } = await admin
      .from("user_roles").select("role")
      .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { job_id, final_video_url, duration_s, byte_size, captions } = body;
    const { data: job } = await admin
      .from("cinematic_runway_jobs").select("*").eq("id", job_id).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scenes: any[] = Array.isArray(job.scenes) ? job.scenes : [];
    const distinctScenes = new Set(scenes.filter((s) => s.clip_url).map((s) => s.key)).size;
    const checks: Record<string, { pass: boolean; detail: string }> = {
      four_scenes: { pass: distinctScenes === 4, detail: `distinct scenes with clips: ${distinctScenes}` },
      voiceover: { pass: !!job.voiceover_url, detail: job.voiceover_url ? "present" : "missing" },
      cta_present: { pass: !!job.script?.cta, detail: job.script?.cta ?? "missing" },
      duration_in_range: {
        pass: typeof duration_s === "number" && duration_s >= 14 && duration_s <= 22,
        detail: `duration ${duration_s}s (target 15-20s)`,
      },
      file_real_video: {
        pass: typeof byte_size === "number" && byte_size > 500_000,
        detail: `final file ${byte_size} bytes (must be >500KB to avoid moving-image renders)`,
      },
      final_url: { pass: !!final_video_url, detail: final_video_url ?? "missing" },
    };
    const passed = Object.values(checks).filter((c) => c.pass).length;
    const total = Object.keys(checks).length;
    const score = Math.round((passed / total) * 100);
    const ok = passed === total;

    await admin
      .from("cinematic_runway_jobs")
      .update({
        final_video_url,
        captions,
        qa_score: score,
        qa_report: checks,
        status: ok ? "ready_for_review" : "failed",
        error: ok ? null : "QA failed — see qa_report",
      })
      .eq("id", job.id);

    return new Response(
      JSON.stringify({ ok, traceId, qa_score: score, qa_report: checks }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});