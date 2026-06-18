// Cinematic V5: Single-product UGC story pipeline.
// Picks the niche template, generates 5 lifestyle scene images via Lovable AI
// (no raw product photos as full-screen slides), synthesizes 5 voice-over MP3
// clips with ElevenLabs, runs the V5 quality gate, and (if pass) creates a
// pinterest_video_queue row at status='awaiting_render'. Never publishes.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const BUCKET = "cinematic-ads-v5";

function detectNiche(slug: string, title: string): string {
  const s = `${slug || ""} ${title || ""}`.toLowerCase();
  if (/(litter|scoop)/.test(s)) return "litter-box";
  if (/(bed|mattress|cushion|sofa|orthop)/.test(s)) return "dog-bed";
  if (/(toy|laser|teaser|ball|wand|chase|interactive)/.test(s)) return "cat-toy";
  return "generic-pet";
}

async function genSceneImage(prompt: string): Promise<Uint8Array | null> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [{ role: "user", content: `${prompt}. Pinterest-quality 9:16 vertical lifestyle photograph. Soft natural light. Magazine quality. No text, no logos, no watermarks, no UI overlays. Authentic real home, real pet, real owner. Editorial composition.` }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) { console.error("[cv5] image gen failed", r.status, (await r.text()).slice(0, 200)); return null; }
  const j = await r.json();
  const data = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = data?.match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function genVoBeat(text: string, voiceId: string, prev?: string, next?: string): Promise<Uint8Array | null> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      previous_text: prev,
      next_text: next,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.0 },
    }),
  });
  if (!r.ok) { console.error("[cv5] vo failed", r.status, (await r.text()).slice(0, 200)); return null; }
  return new Uint8Array(await r.arrayBuffer());
}

function countWords(s: string) { return (s || "").trim().split(/\s+/).filter(Boolean).length; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const { product_id, product_slug, product_title } = body;
    if (!product_id) throw new Error("product_id required");

    const niche = detectNiche(product_slug || "", product_title || "");
    const { data: tpl } = await sb.from("cv5_story_templates").select("beats, voice_id").eq("niche", niche).maybeSingle();
    const fallback = await sb.from("cv5_story_templates").select("beats, voice_id").eq("niche", "generic-pet").maybeSingle();
    const template = tpl || fallback.data;
    if (!template) throw new Error("no story template available");
    const beats: any[] = template.beats;
    const voiceId: string = template.voice_id;

    // Caption guard: any beat caption > 5 words is a hard reject before we spend money.
    const captionViolations = beats.filter((b) => countWords(b.caption) > 5).map((b) => `caption_over_5_words:${b.role}`);

    const { data: row, error: insErr } = await sb.from("cv5_storyboards").insert({
      product_id, product_slug, product_title, niche, status: "generating",
      beats,
    }).select().single();
    if (insErr) throw insErr;
    const sb_id = row.id;

    if (captionViolations.length > 0) {
      await sb.from("cv5_storyboards").update({ status: "rejected", quality_breakdown: { reasons: captionViolations } }).eq("id", sb_id);
      return new Response(JSON.stringify({ ok: false, storyboard_id: sb_id, reasons: captionViolations, traceId: trace_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) Generate 5 lifestyle scenes (sequential to stay under rate limits).
    const sceneUrls: string[] = [];
    const sceneFailures: string[] = [];
    for (let i = 0; i < beats.length; i++) {
      const bytes = await genSceneImage(beats[i].scene);
      if (!bytes) { sceneFailures.push(`scene_gen_failed:beat_${i}`); continue; }
      const path = `scenes/${sb_id}/beat_${i}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
      if (up.error) { sceneFailures.push(`scene_upload_failed:beat_${i}:${up.error.message}`); continue; }
      const signed = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      sceneUrls.push(signed.data?.signedUrl || "");
    }

    // 2) Generate 5 VO clips with stitching.
    const voUrls: string[] = [];
    const voFailures: string[] = [];
    let totalVoDur = 0;
    for (let i = 0; i < beats.length; i++) {
      const prev = beats[i - 1]?.vo_line;
      const next = beats[i + 1]?.vo_line;
      const bytes = await genVoBeat(beats[i].vo_line, voiceId, prev, next);
      if (!bytes) { voFailures.push(`vo_gen_failed:beat_${i}`); continue; }
      const path = `vo/${sb_id}/beat_${i}.mp3`;
      const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (up.error) { voFailures.push(`vo_upload_failed:beat_${i}:${up.error.message}`); continue; }
      const signed = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      voUrls.push(signed.data?.signedUrl || "");
      // Rough duration estimate from byte size at 128kbps. Will be reconciled in renderer.
      totalVoDur += bytes.length / (128_000 / 8);
    }

    // 3) Quality gate.
    const reasons: string[] = [...sceneFailures, ...voFailures];
    if (sceneUrls.length < 5) reasons.push(`scene_count:${sceneUrls.length}`);
    if (voUrls.length < 5) reasons.push(`vo_count:${voUrls.length}`);
    const sceneVariety = new Set(beats.map((b: any) => b.role)).size;
    if (sceneVariety < 5) reasons.push(`scene_variety:${sceneVariety}`);
    for (const b of beats) {
      if (countWords(b.caption) > 5) reasons.push(`caption_words:${b.role}`);
    }
    const score = Math.max(0, 100 - reasons.length * 20);
    const pass = reasons.length === 0 && score >= 80;

    const updatePayload: any = {
      scene_image_urls: sceneUrls,
      vo_audio_url: voUrls.length === beats.length ? voUrls : null,
      vo_total_duration_s: totalVoDur,
      quality_score: score,
      quality_breakdown: { reasons, scene_variety: sceneVariety, scene_count: sceneUrls.length, vo_count: voUrls.length },
      status: pass ? "awaiting_render" : "rejected",
      rejected_reason: pass ? null : reasons.join("|"),
    };
    await sb.from("cv5_storyboards").update(updatePayload).eq("id", sb_id);

    // Queue row (no auto-publish; awaiting_review path after render).
    if (pass) {
      await sb.from("pinterest_video_queue").insert({
        product_id, status: "awaiting_render", engine_version: "v5", storyboard_id: sb_id,
      });
    }

    return new Response(JSON.stringify({ ok: pass, traceId: trace_id, storyboard_id: sb_id, score, reasons }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cv5-generate]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});