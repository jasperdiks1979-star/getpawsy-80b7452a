// Generate ElevenLabs voiceover for a Runway pipeline job and upload to bucket.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah — warm conversational US female

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

    const { job_id } = await req.json();
    const { data: job } = await admin
      .from("cinematic_runway_jobs").select("*").eq("id", job_id).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const voText = job.script?.vo_text;
    if (!voText) throw new Error("script.vo_text missing");

    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVEN_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: voText,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true },
        }),
      },
    );
    if (!r.ok) throw new Error(`elevenlabs: ${r.status} ${await r.text()}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const path = `jobs/${job.id}/voiceover.mp3`;
    const { error: upErr } = await admin.storage
      .from("cinematic-runway")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error(upErr.message);
    const url = admin.storage.from("cinematic-runway").getPublicUrl(path).data.publicUrl;

    await admin
      .from("cinematic_runway_jobs")
      .update({
        voiceover_url: url,
        cost_cents: (job.cost_cents ?? 0) + 30,
      })
      .eq("id", job.id);

    return new Response(JSON.stringify({ ok: true, traceId, voiceover_url: url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});