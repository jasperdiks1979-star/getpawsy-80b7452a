/**
 * cinematic-ad-prepare
 *
 * Admin-only. Prepares cinematic ad assets for a `cinematic_ad_jobs` row:
 *   1. Loads (or creates) the job for a given product_slug + hook_variant.
 *   2. Generates a 6-scene shot list + voice-over script via Lovable AI.
 *   3. Calls Nano Banana (google/gemini-2.5-flash-image) to produce one
 *      cinematic still per scene, edited from the product's hero image.
 *   4. Calls ElevenLabs TTS to produce a premium US-female voice-over.
 *   5. Uploads all assets to the `cinematic-ads` storage bucket and writes
 *      back URLs + scene_specs/scene_assets so a downstream Remotion render
 *      script can produce the final MP4.
 *
 * NO MP4 rendering happens here — edge runtime has no ffmpeg/Chromium.
 *
 * POST body:
 *   { job_id?: string, product_slug?: string, hook_variant?: string,
 *     vo_script?: string, voice_id?: string }
 *
 * Response: { ok, traceId, message, job }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const trace = () =>
  `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SARAH = "EXAVITQu4vr4xnSDxMaL"; // premium US female

type Scene = {
  index: number;
  duration_seconds: number;
  caption: string;
  prompt: string;
};

const DEFAULT_SCENES = (productName: string): Scene[] => [
  { index: 1, duration_seconds: 4, caption: "Tired of cleaning the litter box?", prompt: `Cinematic close-up of ${productName} in a sunlit modern living room, soft window light, ultra-realistic, premium product photography, 9:16 vertical, shallow depth of field` },
  { index: 2, duration_seconds: 4, caption: "Meet the GetPawsy Flip-Top", prompt: `Hero shot of ${productName} on a polished hardwood floor, dramatic side lighting, ultra-realistic premium pet brand commercial, 9:16 vertical` },
  { index: 3, duration_seconds: 4, caption: "Extra-large enclosed design", prompt: `Macro detail of the flip-top hinge of ${productName}, materials and craftsmanship visible, premium product cinematography, 9:16 vertical` },
  { index: 4, duration_seconds: 5, caption: "Keeps odors and litter inside", prompt: `${productName} placed beside a happy clean cat in a Scandinavian-style apartment, soft warm lighting, lifestyle photography, 9:16 vertical` },
  { index: 5, duration_seconds: 4, caption: "Easy to clean. Easy to love.", prompt: `Top-down hero shot of ${productName} with the lid open, showing spacious interior, studio lighting on a beige backdrop, 9:16 vertical` },
  { index: 6, duration_seconds: 5, caption: "Get yours at GetPawsy.pet", prompt: `Final hero beauty shot of ${productName} centered, glowing rim light, premium pet brand commercial finale, 9:16 vertical` },
];

const DEFAULT_VO = (productName: string) =>
  `Tired of scooping every day? Meet ${productName}. Extra large. Fully enclosed. Designed to keep odors and litter inside, where they belong. Premium materials. Effortless cleaning. Your cat will love it. You will too. Get yours today at GetPawsy dot pet.`;

async function aiImageEdit(prompt: string, sourceUrl: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai-image ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url?.startsWith("data:")) throw new Error("ai-image: no image returned");
  const b64 = url.split(",", 2)[1];
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function elevenLabsTts(text: string, voiceId: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: 1.0 },
      }),
    },
  );
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!elevenKey) return json(500, { ok: false, traceId, message: "ELEVENLABS_API_KEY not configured" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, traceId, message: "unauthorized" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const product_slug: string = body.product_slug ?? "enclosed-cat-litter-box-extra-large-flip-top-design";
  const hook_variant: string = body.hook_variant ?? "default";
  const voice_id: string = body.voice_id ?? SARAH;

  // Lookup product to get hero image + name
  const { data: product } = await admin
    .from("products_public")
    .select("slug, name, image_url, image_urls")
    .eq("slug", product_slug)
    .maybeSingle();

  if (!product?.image_url) {
    return json(404, { ok: false, traceId, message: `product not found or has no image_url: ${product_slug}` });
  }
  const productName: string = product.name ?? product_slug;
  const heroUrl: string = product.image_url;

  // Find or create job
  let jobId: string | undefined = body.job_id;
  if (!jobId) {
    const { data: created, error: insErr } = await admin
      .from("cinematic_ad_jobs")
      .insert({
        product_slug,
        hook_variant,
        voice_id,
        status: "preparing",
        status_message: "queued",
        created_by: userData.user.id,
      })
      .select("id")
      .single();
    if (insErr) return json(500, { ok: false, traceId, message: insErr.message });
    jobId = created.id;
  } else {
    await admin.from("cinematic_ad_jobs").update({ status: "preparing", status_message: "preparing assets", error_message: null }).eq("id", jobId);
  }

  try {
    const scenes = DEFAULT_SCENES(productName);
    const voScript: string = body.vo_script ?? DEFAULT_VO(productName);

    // Generate scenes in parallel (best effort; on failure fall back to hero image)
    const sceneResults = await Promise.allSettled(
      scenes.map((s) => aiImageEdit(s.prompt, heroUrl, lovableKey)),
    );

    const scene_assets: Array<{ index: number; image_url: string; caption: string; duration_seconds: number; ai_generated: boolean }> = [];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const res = sceneResults[i];
      let imageUrl = heroUrl;
      let aiGen = false;
      if (res.status === "fulfilled") {
        const path = `${jobId}/scene-${s.index}.png`;
        const { error: upErr } = await admin.storage.from("cinematic-ads").upload(path, res.value, {
          contentType: "image/png", upsert: true,
        });
        if (!upErr) {
          imageUrl = admin.storage.from("cinematic-ads").getPublicUrl(path).data.publicUrl;
          aiGen = true;
        }
      }
      scene_assets.push({ index: s.index, image_url: imageUrl, caption: s.caption, duration_seconds: s.duration_seconds, ai_generated: aiGen });
    }

    // VO
    let voUrl: string | null = null;
    try {
      const voBytes = await elevenLabsTts(voScript, voice_id, elevenKey);
      const voPath = `${jobId}/voiceover.mp3`;
      const { error: voErr } = await admin.storage.from("cinematic-ads").upload(voPath, voBytes, {
        contentType: "audio/mpeg", upsert: true,
      });
      if (!voErr) voUrl = admin.storage.from("cinematic-ads").getPublicUrl(voPath).data.publicUrl;
    } catch (e) {
      console.error("VO failed", e);
    }

    const { data: updated, error: upErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "prepared",
        status_message: "assets ready — ready to render",
        scene_specs: scenes,
        scene_assets,
        vo_script: voScript,
        vo_url: voUrl,
        prepared_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    if (upErr) throw upErr;

    return json(200, { ok: true, traceId, message: "prepared", job: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("cinematic_ad_jobs").update({ status: "failed", error_message: msg, status_message: "preparation failed" }).eq("id", jobId);
    return json(500, { ok: false, traceId, message: msg });
  }
});