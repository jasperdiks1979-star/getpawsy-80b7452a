// Cinematic V3 — Retry Voiceover.
// Re-runs ElevenLabs TTS for an existing job using its saved transcript,
// uploads the new mp3, updates the job, and dispatches the GitHub Actions
// render workflow. Use after fixing the ElevenLabs key on a failed job.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO");
const BUCKET = "cinematic-v3";
const DEFAULT_VOICE = "cgSgspJ2msm6clMCkdW9";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function tts(text: string, voiceId: string): Promise<Uint8Array> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY missing");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.0 },
      }),
    },
  );
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // admin auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdmin) return json({ ok: false, traceId, message: "admin required" }, 403);

    const body = await req.json().catch(() => ({} as any));
    const jobId = String(body?.job_id ?? "").trim();
    if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);

    const { data: job, error: jobErr } = await admin
      .from("cinematic_v3_jobs")
      .select("id, voice_id, voiceover_transcript, scenes")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    const transcript =
      job.voiceover_transcript?.trim() ||
      (Array.isArray(job.scenes) ? job.scenes.map((s: any) => s?.vo ?? "").join(" ").trim() : "");
    if (!transcript) return json({ ok: false, traceId, message: "no transcript on job" }, 422);

    const voiceId = String(job.voice_id || DEFAULT_VOICE);

    await admin.from("cinematic_v3_jobs").update({
      status: "voiceover",
      failure_reasons: [],
    }).eq("id", jobId);

    let voPath: string;
    try {
      const mp3 = await tts(transcript, voiceId);
      voPath = `jobs/${jobId}/voiceover.mp3`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(voPath, mp3, {
        contentType: "audio/mpeg", upsert: true,
      });
      if (upErr) throw new Error(upErr.message);
    } catch (e: any) {
      await admin.from("cinematic_v3_jobs").update({
        status: "failed",
        failure_reasons: [`voiceover_retry_failed: ${String(e?.message ?? e)}`],
      }).eq("id", jobId);
      return json({ ok: false, traceId, jobId, message: `voiceover: ${e?.message ?? e}` }, 500);
    }

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(voPath, 60 * 60 * 24 * 7);
    const voUrl = signed?.signedUrl ?? "";

    await admin.from("cinematic_v3_jobs").update({
      status: "rendering",
      voiceover_url: voUrl,
    }).eq("id", jobId);

    if (GH_PAT && GH_REPO) {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/workflows/render-cinematic-v3.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GH_PAT}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
        },
      );
      if (!dispatchRes.ok) {
        const txt = await dispatchRes.text();
        await admin.from("cinematic_v3_jobs").update({
          status: "failed",
          failure_reasons: [`dispatch_failed: ${dispatchRes.status} ${txt.slice(0, 200)}`],
        }).eq("id", jobId);
        return json({ ok: false, traceId, jobId, message: `dispatch: ${dispatchRes.status}` }, 500);
      }
    }

    return json({ ok: true, traceId, jobId, voiceover_url: voUrl });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});