// cinematic-voiceover-generate
// ---------------------------------------------------------------------------
// Generates an MP3 voice-over for a cinematic_ad_jobs row using ElevenLabs.
//
// Input:  { job_id: string, voice_id?: string }
// Output: { ok, traceId, voiceover_url, voiceover_voice_id, voiceover_script }
//
// Flow:
//   1. Load job + its storyboard beats (HOOK→PROBLEM→SOLUTION→DEMO→BENEFIT→PROOF→CTA)
//   2. If beats are missing, pull lines from cinematic_voiceover_lines for the
//      job's content_type/archetype and stitch a script.
//   3. Pick an active voice profile (weighted) — or honor caller override.
//   4. Call ElevenLabs eleven_multilingual_v2 with request stitching for
//      smooth prosody between beats.
//   5. Upload final MP3 to Supabase storage bucket `cinematic-voiceovers`.
//   6. Patch the job row with voiceover_url/voice_id/script.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "cinematic-voiceovers";

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const trace = () => `vo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const BEATS = ["hook","problem","solution","demo","benefit","proof","cta"] as const;
type Beat = typeof BEATS[number];

function pickWeighted<T extends { weight: number }>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 1), 0);
  let r = Math.random() * total;
  for (const row of rows) { r -= (Number(row.weight) || 1); if (r <= 0) return row; }
  return rows[rows.length - 1];
}

function requireElevenLabsApiKey(): string {
  const key = (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");
  return key;
}

async function validateElevenLabsKey(): Promise<void> {
  const res = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: { "xi-api-key": requireElevenLabsApiKey() },
  });
  await res.text();
  if (!res.ok) throw new Error(`elevenlabs-user ${res.status}`);
}

async function elevenSay(text: string, voiceId: string, prev?: string, next?: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": requireElevenLabsApiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        previous_text: prev,
        next_text: next,
        voice_settings: { stability: 0.45, similarity_boost: 0.78, style: 0.35, use_speaker_boost: true, speed: 1.0 },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`elevenlabs ${res.status}: ${t.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Concatenate raw MP3 frame streams. ElevenLabs returns clean MP3s; naive
// byte-level concat plays correctly in browsers and ffmpeg downstream.
function concatMp3s(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  let body: { job_id?: string; voice_id?: string; validate_only?: boolean } = {};
  try { body = await req.json(); } catch {}
  try {
    if (body.validate_only) {
      await validateElevenLabsKey();
      return j(200, { ok: true, traceId, message: "ElevenLabs key accepted by /v1/user" });
    }
    requireElevenLabsApiKey();
  } catch (e) {
    return j(502, { ok: false, traceId, message: (e as Error).message });
  }
  if (!body.job_id) return j(400, { ok: false, traceId, message: "job_id required" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Ensure bucket exists (idempotent)
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // 2. Load job + storyboard
  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, content_type, hook_archetype, storyboard, voiceover_script")
    .eq("id", body.job_id).maybeSingle();
  if (jobErr || !job) return j(404, { ok: false, traceId, message: "job not found" });

  // 3. Build script: prefer existing storyboard.beats, fallback to seed lines
  const archetype = (job.content_type ?? "product_spotlight") as string;
  let script: { beat: Beat; text: string }[] = [];

  const sb = job.storyboard as { beats?: { name?: string; text?: string; vo?: string }[] } | null;
  if (sb?.beats?.length) {
    for (const b of sb.beats) {
      const name = (b.name ?? "").toLowerCase() as Beat;
      if (BEATS.includes(name)) {
        const text = (b.vo ?? b.text ?? "").trim();
        if (text) script.push({ beat: name, text });
      }
    }
  }
  if (script.length === 0) {
    const { data: lines = [] } = await admin
      .from("cinematic_voiceover_lines")
      .select("beat, text, weight, archetype")
      .eq("active", true)
      .in("archetype", [archetype, "product_spotlight"]);
    for (const beat of BEATS) {
      const pool = (lines ?? []).filter((l: any) => l.beat === beat);
      const picked = pickWeighted(pool as any);
      if (picked) script.push({ beat, text: (picked as any).text });
    }
  }
  if (script.length === 0) return j(422, { ok: false, traceId, message: "could not assemble script" });

  // 4. Pick voice
  let voiceId = body.voice_id;
  if (!voiceId) {
    const { data: voices = [] } = await admin
      .from("cinematic_voice_profiles").select("voice_id, weight").eq("active", true);
    const v = pickWeighted((voices ?? []) as any);
    voiceId = (v as any)?.voice_id ?? "EXAVITQu4vr4xnSDxMaL"; // Sarah fallback
  }

  // 5. Synthesize with stitched context
  const parts: Uint8Array[] = [];
  for (let i = 0; i < script.length; i++) {
    const prev = script[i - 1]?.text;
    const next = script[i + 1]?.text;
    parts.push(await elevenSay(script[i].text, voiceId!, prev, next));
  }
  const mp3 = concatMp3s(parts);

  // 6. Upload
  const path = `${job.id}/${voiceId}-${Date.now()}.mp3`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, mp3, {
    contentType: "audio/mpeg", upsert: true,
  });
  if (upErr) return j(500, { ok: false, traceId, message: `upload: ${upErr.message}` });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const voiceover_url = pub.publicUrl;

  // 7. Patch job
  await admin.from("cinematic_ad_jobs").update({
    voiceover_url,
    vo_url: voiceover_url,
    voiceover_voice_id: voiceId,
    voice_id: voiceId,
    voiceover_script: { beats: script },
  }).eq("id", job.id);

  return j(200, { ok: true, traceId, voiceover_url, voiceover_voice_id: voiceId, voiceover_script: { beats: script } });
});