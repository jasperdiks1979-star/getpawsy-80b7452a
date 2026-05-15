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

/**
 * Cinematic shot blueprint. Each scene MUST be visually distinct: unique
 * camera framing, environment, lighting, subject action, crop and emotional
 * tone. Nano Banana otherwise gravitates toward replicating the source
 * hero image, which produced 6 nearly-identical scenes.
 */
type SceneBlueprint = {
  index: number;
  duration_seconds: number;
  caption: (productName: string) => string;
  objective: string;
  framing: string;        // shot type: macro, wide, top-down, low-angle, OTS...
  angle: string;          // camera angle
  environment: string;    // setting
  lighting: string;       // lighting design
  action: string;         // subject + action
  emotion: string;        // emotional tone
  productAngle: string;   // how the product is presented
  lens: string;           // focal length / lens character
};

const SHOT_BLUEPRINTS: Omit<SceneBlueprint, "index">[] = [
  {
    duration_seconds: 4,
    caption: () => "Stop settling for less.",
    objective: "Hook the viewer with a relatable everyday problem the product solves",
    framing: "wide interior establishing shot",
    angle: "eye-level, slight low angle from the floor",
    environment: "bright modern American living room with hardwood floors, large window, sheer curtains, indoor plants",
    lighting: "soft golden-hour window light from camera left, warm rim, gentle bounce",
    action: "a pet (or pet owner) interacts naturally with the product as part of a real daily moment",
    emotion: "everyday, relatable, slight frustration before relief",
    productAngle: "three-quarter front view at floor level, product on the right third",
    lens: "35mm full-frame, f/4, deep but cinematic depth of field",
  },
  {
    duration_seconds: 4,
    caption: (name) => `Meet the ${name}.`,
    objective: "Reveal the product as the hero solution",
    framing: "low-angle hero product shot, product fills 70% of frame",
    angle: "low 15-degree upward angle",
    environment: "minimal Scandinavian studio set with cream backdrop and soft floor reflection",
    lighting: "dramatic side key light from camera right, deep shadow on the left, subtle teal kicker",
    action: "no people, no pets — pure product reveal with a slow implied push-in",
    emotion: "premium, confident, brand-defining",
    productAngle: "front-facing hero pose in its primary closed/at-rest configuration, brand details visible",
    lens: "50mm, f/2.8, shallow depth of field",
  },
  {
    duration_seconds: 4,
    caption: () => "Built for real life.",
    objective: "Show scale, build quality, and how the product fits real homes",
    framing: "wide side-profile shot showing full silhouette",
    angle: "perfect 90-degree side profile at product mid-height",
    environment: "Scandinavian apartment corner, light oak floor, white wall, woven basket beside it for scale reference",
    lighting: "bright diffused daylight from a softbox camera left, very even, editorial",
    action: "the product sits in a styled home setting with subtle scale references nearby; a pet may appear naturally beside it",
    emotion: "spacious, reassuring, premium",
    productAngle: "full side silhouette in its primary at-rest configuration, oriented facing camera-right",
    lens: "50mm, f/5.6, sharp throughout",
  },
  {
    duration_seconds: 5,
    caption: () => "Crafted in every detail.",
    objective: "Communicate quality and craftsmanship via macro detail of a key feature",
    framing: "extreme macro close-up of the product's most distinctive feature (seam, hinge, stitch, texture, or mechanism)",
    angle: "tight 45-degree macro, product fills entire frame",
    environment: "out-of-focus warm bokeh of a kitchen background",
    lighting: "moody chiaroscuro key light, rim highlight tracing the feature edge",
    action: "subtle micro-motion of the highlighted feature, showcasing its build quality",
    emotion: "engineered, premium, trustworthy",
    productAngle: "macro detail of the signature feature, no full product silhouette visible",
    lens: "100mm macro, f/4, razor-thin depth of field on the hinge",
  },
  {
    duration_seconds: 4,
    caption: () => "Effortless. Every day.",
    objective: "Show effortless daily use and a happy lifestyle moment around the product",
    framing: "top-down overhead lifestyle shot",
    angle: "directly overhead, 90-degree top-down",
    environment: "clean light-oak floor with tasteful lifestyle props arranged beside the product",
    lighting: "bright soft overhead daylight, no harsh shadows, airy and clean",
    action: "a person's hand (no face) interacts with the product in its in-use state; a calm pet relaxes nearby",
    emotion: "effortless, satisfying, calm",
    productAngle: "top-down view in its in-use / open / active configuration, key inner details visible",
    lens: "24mm wide, f/5.6, everything in focus",
  },
  {
    duration_seconds: 5,
    caption: () => "Get yours at GetPawsy.pet",
    objective: "Closing premium beauty shot for brand recall",
    framing: "centered cinematic hero beauty shot, product isolated",
    angle: "dead-center front, very slight 5-degree downward tilt",
    environment: "deep matte charcoal seamless backdrop with subtle vignette",
    lighting: "dual rim lights (cool blue camera-left, warm amber camera-right), dark moody key, glowing edge light",
    action: "no people, no pets — pure product as a sculpted object, faint atmospheric haze",
    emotion: "iconic, premium, aspirational, finale",
    productAngle: "three-quarter hero pose in its primary at-rest configuration, slight pedestal feel",
    lens: "85mm, f/2.8, cinematic anamorphic feel",
  },
];

function buildScenePrompt(b: Omit<SceneBlueprint, "index">, productName: string, idx: number): string {
  // Order matters: lead with the unique scene-specific creative direction so
  // Nano Banana does not default to replicating the source hero composition.
  return [
    `Scene ${idx} of 6 — ${b.objective}.`,
    `Shot: ${b.framing}, ${b.angle}.`,
    `Lens: ${b.lens}.`,
    `Environment: ${b.environment}.`,
    `Lighting: ${b.lighting}.`,
    `Subject & action: ${b.action}.`,
    `Product presentation: ${b.productAngle} of the ${productName}.`,
    `Emotional tone: ${b.emotion}.`,
    `Style: ultra-realistic premium TikTok / Pinterest pet-brand commercial still, cinematic color grade, photoreal, no text, no logos overlay, no watermark, 9:16 vertical 1080x1920.`,
    `IMPORTANT: re-imagine the composition completely for this scene — do NOT copy the framing or background of the source reference image. Use the reference only to preserve the exact product design, colors, and proportions of the ${productName}. Each of the 6 scenes must look visually distinct from the others.`,
  ].join(" ");
}

const DEFAULT_SCENES = (productName: string): Scene[] => {
  const scenes: Scene[] = SHOT_BLUEPRINTS.map((b, i) => {
    const index = i + 1;
    const prompt = buildScenePrompt(b, productName, index);
    return {
      index,
      duration_seconds: b.duration_seconds,
      caption: b.caption(productName),
      prompt,
    };
  });

  // Hard uniqueness enforcement — guarantees no two scenes share the same
  // prompt, framing, or environment. If a collision somehow appears, append a
  // disambiguator so Nano Banana cannot collapse them into the same image.
  const seenPrompts = new Set<string>();
  const seenFraming = new Set<string>();
  const seenEnv = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    const b = SHOT_BLUEPRINTS[i];
    if (seenFraming.has(b.framing) || seenEnv.has(b.environment) || seenPrompts.has(scenes[i].prompt)) {
      scenes[i].prompt += ` Unique-variant-token: scene-${i + 1}-${Math.random().toString(36).slice(2, 8)}.`;
    }
    seenPrompts.add(scenes[i].prompt);
    seenFraming.add(b.framing);
    seenEnv.add(b.environment);
  }

  for (const s of scenes) {
    console.log(`[scene-${s.index}-prompt]`, s.prompt);
  }

  return scenes;
};

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

  const product_slug: string = body.product_slug ?? "enclosed-cat-litter-box-extra-large-flip-top";
  const hook_variant: string = body.hook_variant ?? "default";
  const voice_id: string = body.voice_id ?? SARAH;

  // Lookup product to get hero image + name
  const { data: product, error: prodErr } = await admin
    .from("products_public")
    .select("slug, name, image_url")
    .eq("slug", product_slug)
    .maybeSingle();

  console.log("[cinematic-ad-prepare]", traceId, { product_slug, found: !!product, prodErr: prodErr?.message });
  if (!product?.image_url) {
    return json(404, { ok: false, traceId, message: `product not found or has no image_url: ${product_slug}${prodErr ? ` (${prodErr.message})` : ""}` });
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