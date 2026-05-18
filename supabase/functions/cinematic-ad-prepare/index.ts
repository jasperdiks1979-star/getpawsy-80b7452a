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
import { resolveVoiceStyle, type VoiceStyle } from "../_shared/voice-styles.ts";
import { generateCreativeKit, type CreativeKit } from "../_shared/creative-kit.ts";

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

export const SHOT_BLUEPRINTS: Omit<SceneBlueprint, "index">[] = [
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

export const DEFAULT_SCENES = (productName: string): Scene[] => {
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

/**
 * Generate a per-product voiceover script + 6 scene captions from product
 * fields (name, description, category, species). The model returns strict
 * JSON; if anything fails we fall back to the static DEFAULT_VO + blueprint
 * captions so the pipeline never blocks on copy generation.
 */
type GeneratedCopy = { vo_script: string; captions: string[] };

/**
 * Multi-variant copy. `vo_scripts` = N alternative voice-over scripts.
 * `caption_variants` = 6 scenes × N alternative captions per scene.
 * Used so each render of the same product can rotate through different copy
 * to avoid campaign repetition / ad fatigue.
 */
export type GeneratedCopyVariants = {
  vo_scripts: string[];
  caption_variants: string[][]; // [sceneIdx][variantIdx]
};

export const DEFAULT_VARIANT_COUNT = 3;
const MAX_VARIANT_COUNT = 5;

async function generateProductCopy(
  product: { name: string; description?: string | null; category?: string | null; primary_species?: string | null; primary_intent?: string | null },
  apiKey: string,
): Promise<GeneratedCopy | null> {
  const sys = `You are a senior US-native direct-response copywriter for GetPawsy, a premium pet brand. Write a 6-scene short-form ad (TikTok / Pinterest, 9:16, ~25 seconds). Tone: confident, warm, US-native, premium-but-friendly. Strict compliance: NO health claims, NO "vet-approved", NO "eco-friendly", NO fake reviews, NO price anchoring, NO placeholder text. Always end with a clear call-to-action to GetPawsy.pet.`;
  const user = `Product:
- Name: ${product.name}
- Category: ${product.category ?? "pet product"}
- Species: ${product.primary_species ?? "pet"}
- Intent: ${product.primary_intent ?? "general"}
- Description: ${(product.description ?? "").slice(0, 600)}

Return STRICT JSON (no prose, no markdown) with this exact shape:
{
  "vo_script": "<one continuous voiceover, 45-65 words, natural spoken cadence, ends with: Get yours at GetPawsy dot pet>",
  "captions": [
    "<Scene 1 hook caption — 3-6 words, problem/curiosity>",
    "<Scene 2 reveal caption — 3-6 words, names the product>",
    "<Scene 3 benefit caption — 3-6 words, scale or fit>",
    "<Scene 4 craftsmanship caption — 3-6 words, quality detail>",
    "<Scene 5 lifestyle caption — 3-6 words, ease of use>",
    "<Scene 6 CTA caption — exactly: Get yours at GetPawsy.pet>"
  ]
}

Rules:
- Captions must be specific to THIS product (do not say "litter box" unless this is a litter box).
- All 6 captions must be unique.
- Scene 6 caption must be exactly: Get yours at GetPawsy.pet
- vo_script must mention the product name once, naturally.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[generate-copy] non-2xx", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.vo_script !== "string" || !Array.isArray(parsed?.captions) || parsed.captions.length !== 6) {
      console.error("[generate-copy] invalid shape", parsed);
      return null;
    }
    const captions = parsed.captions.map((c: unknown) => String(c ?? "").trim()).filter(Boolean);
    if (captions.length !== 6) return null;
    // Force CTA scene 6 to canonical brand string
    captions[5] = "Get yours at GetPawsy.pet";
    return { vo_script: String(parsed.vo_script).trim(), captions };
  } catch (e) {
    console.error("[generate-copy] failed", e);
    return null;
  }
}

/**
 * Generate N variants of voiceover + captions in a single AI call so the
 * model can deliberately diversify angle, hook, and rhythm across variants.
 */
async function generateProductCopyVariants(
  product: { name: string; description?: string | null; category?: string | null; primary_species?: string | null; primary_intent?: string | null },
  apiKey: string,
  n: number,
): Promise<GeneratedCopyVariants | null> {
  const variantCount = Math.max(1, Math.min(MAX_VARIANT_COUNT, Math.floor(n)));
  const sys = `You are a senior US-native direct-response copywriter for GetPawsy, a premium pet brand. You will write ${variantCount} clearly distinct variants of a 6-scene short-form ad (TikTok / Pinterest, 9:16, ~25 seconds). Each variant must use a DIFFERENT angle, hook, rhythm and word choice — no near-duplicates. Tone: confident, warm, US-native, premium-but-friendly. Strict compliance: NO health claims, NO "vet-approved", NO "eco-friendly", NO fake reviews, NO price anchoring, NO placeholder text. Always end with a clear call-to-action to GetPawsy.pet.`;
  const user = `Product:
- Name: ${product.name}
- Category: ${product.category ?? "pet product"}
- Species: ${product.primary_species ?? "pet"}
- Intent: ${product.primary_intent ?? "general"}
- Description: ${(product.description ?? "").slice(0, 600)}

Return STRICT JSON (no prose, no markdown) with this exact shape:
{
  "vo_scripts": [ ${Array(variantCount).fill('"<one continuous voiceover, 45-65 words, natural spoken cadence, ends with: Get yours at GetPawsy dot pet>"').join(", ")} ],
  "caption_variants": [
    [ ${Array(variantCount).fill('"<Scene 1 hook caption — 3-6 words, problem/curiosity>"').join(", ")} ],
    [ ${Array(variantCount).fill('"<Scene 2 reveal caption — 3-6 words, names the product>"').join(", ")} ],
    [ ${Array(variantCount).fill('"<Scene 3 benefit caption — 3-6 words, scale or fit>"').join(", ")} ],
    [ ${Array(variantCount).fill('"<Scene 4 craftsmanship caption — 3-6 words, quality detail>"').join(", ")} ],
    [ ${Array(variantCount).fill('"<Scene 5 lifestyle caption — 3-6 words, ease of use>"').join(", ")} ],
    [ ${Array(variantCount).fill('"<Scene 6 CTA caption — exactly: Get yours at GetPawsy.pet>"').join(", ")} ]
  ]
}

Rules:
- caption_variants must have exactly 6 sub-arrays (one per scene), each of length ${variantCount}.
- vo_scripts must have exactly ${variantCount} entries.
- Captions must be specific to THIS product (do not say "litter box" unless this is a litter box).
- Within each scene, the ${variantCount} captions must be meaningfully different (different wording, not just synonyms).
- Across vo_scripts the ${variantCount} variants must lead with a different hook angle.
- Every Scene 6 CTA caption must be exactly: Get yours at GetPawsy.pet
- Each vo_script must mention the product name once, naturally.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[generate-copy-variants] non-2xx", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const voScripts = Array.isArray(parsed?.vo_scripts)
      ? parsed.vo_scripts.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
      : [];
    const captionVariants = Array.isArray(parsed?.caption_variants)
      ? parsed.caption_variants.map((row: unknown) =>
          Array.isArray(row)
            ? row.map((c: unknown) => String(c ?? "").trim()).filter(Boolean)
            : [],
        )
      : [];

    if (voScripts.length === 0 || captionVariants.length !== 6 || captionVariants.some((row: string[]) => row.length === 0)) {
      console.error("[generate-copy-variants] invalid shape", { voScripts: voScripts.length, scenes: captionVariants.length });
      return null;
    }

    // Force every scene-6 variant to the canonical CTA string.
    captionVariants[5] = captionVariants[5].map(() => "Get yours at GetPawsy.pet");

    return { vo_scripts: voScripts, caption_variants: captionVariants };
  } catch (e) {
    console.error("[generate-copy-variants] failed", e);
    return null;
  }
}

/**
 * Pick variant index for this run. Caller-provided value wins; otherwise we
 * count existing prepared jobs for this product and rotate so successive
 * campaigns don't reuse the same copy.
 */
async function pickVariantIndex(
  admin: any,
  product_slug: string,
  override: unknown,
  totalVariants: number,
): Promise<number> {
  if (totalVariants <= 1) return 0;
  if (typeof override === "number" && Number.isFinite(override)) {
    return ((Math.floor(override) % totalVariants) + totalVariants) % totalVariants;
  }
  const { count } = await admin
    .from("cinematic_ad_jobs")
    .select("id", { count: "exact", head: true })
    .eq("product_slug", product_slug);
  return ((count ?? 0) % totalVariants + totalVariants) % totalVariants;
}

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

async function elevenLabsTts(text: string, voiceId: string, apiKey: string, settings?: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number }): Promise<Uint8Array> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: settings ?? { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: 1.0 },
      }),
    },
  );
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Pinterest pin copy. Separate from VO/captions so we can regenerate it
 * independently and so failures don't block the render pipeline.
 */
type PinCopy = {
  pin_title: string;
  pin_description: string;
  overlay_hook: string;
  cta: string;
  hashtags: string[];
};

async function generatePinCopy(
  product: { name: string; description?: string | null; category?: string | null; primary_species?: string | null; slug: string },
  voiceStyle: VoiceStyle,
  apiKey: string,
): Promise<PinCopy | null> {
  const sys = `You are a senior US-native Pinterest ad copywriter for GetPawsy, a premium pet brand. Voice persona for this ad: ${voiceStyle.persona}. Compliance: NO health claims, NO "vet-approved", NO "eco-friendly", NO fake reviews, NO price anchoring. Premium US tone.`;
  const user = `Product:
- Name: ${product.name}
- Category: ${product.category ?? "pet product"}
- Species: ${product.primary_species ?? "pet"}
- Description: ${(product.description ?? "").slice(0, 500)}

Return STRICT JSON, no markdown:
{
  "pin_title": "<<=100 chars, Pinterest pin title, US-native, specific, no clickbait>",
  "pin_description": "<<=480 chars, conversion-focused pin description, ends with: Shop now at GetPawsy.pet>",
  "overlay_hook": "<3-6 word on-screen hook text for the first scene>",
  "cta": "<<=20 char CTA button text>",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"]
}`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) { console.error("[pin-copy] non-2xx", res.status); return null; }
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const p = JSON.parse(cleaned);
    if (typeof p?.pin_title !== "string" || typeof p?.pin_description !== "string") return null;
    return {
      pin_title: String(p.pin_title).slice(0, 100),
      pin_description: String(p.pin_description).slice(0, 480),
      overlay_hook: String(p.overlay_hook ?? "Stop scrolling.").slice(0, 60),
      cta: String(p.cta ?? "Shop now").slice(0, 20),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((s: unknown) => String(s || "").trim()).filter(Boolean).slice(0, 8) : [],
    };
  } catch (e) {
    console.error("[pin-copy] failed", e);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
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
  const voiceStyle = resolveVoiceStyle(body.voice_style);
  const voice_id: string = body.voice_id ?? voiceStyle.voice_id;
  const regenerate: string | null = typeof body.regenerate === "string" ? body.regenerate : null;
  const requestedVariantCount: number = Math.max(
    1,
    Math.min(MAX_VARIANT_COUNT, Math.floor(Number(body.variant_count) || DEFAULT_VARIANT_COUNT)),
  );

  // Lookup product to get hero image + copy-generation fields
  const { data: product, error: prodErr } = await admin
    .from("products_public")
    .select("slug, name, image_url, images, description, category, primary_species, primary_intent, price")
    .eq("slug", product_slug)
    .maybeSingle();

  console.log("[cinematic-ad-prepare]", traceId, { product_slug, found: !!product, prodErr: prodErr?.message });
  if (!product?.image_url) {
    return json(404, { ok: false, traceId, message: `product not found or has no image_url: ${product_slug}${prodErr ? ` (${prodErr.message})` : ""}` });
  }
  const productName: string = product.name ?? product_slug;
  const heroUrl: string = product.image_url;
  const productImages: string[] = Array.isArray((product as any).images) ? (product as any).images.filter(Boolean) : [];
  const mediaWarnings: Array<{ code: string; message: string }> = [];
  if (productImages.length < 2) {
    mediaWarnings.push({ code: "thin_media", message: `Only ${productImages.length || 1} usable image — AI scene synth will be used to add motion.` });
  }

  // Find or create job
  let jobId: string | undefined = body.job_id;
  if (!jobId) {
    const { data: created, error: insErr } = await admin
      .from("cinematic_ad_jobs")
      .insert({
        product_slug,
        hook_variant,
        voice_id,
        voice_style: voiceStyle.id,
        status: "preparing",
        status_message: "queued",
        created_by: userData.user.id,
        media_warnings: mediaWarnings,
        approved_for_render: false,
        pin_destination_url: `https://getpawsy.pet/products/${product_slug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=cinematic`,
      })
      .select("id")
      .single();
    if (insErr) return json(500, { ok: false, traceId, message: insErr.message });
    jobId = created.id;
  } else {
    await admin.from("cinematic_ad_jobs").update({
      status: "preparing",
      status_message: regenerate ? `regenerating ${regenerate}` : "preparing assets",
      error_message: null,
      voice_style: voiceStyle.id,
      voice_id,
      media_warnings: mediaWarnings,
      approved_for_render: false,
    }).eq("id", jobId);
  }

  // ── Fast path: regenerate only voiceover or only pin copy ─────────────
  if (regenerate === "vo" && body.job_id) {
    try {
      const { data: existing } = await admin.from("cinematic_ad_jobs").select("vo_script").eq("id", jobId).single();
      const voScript = String(body.vo_script ?? existing?.vo_script ?? DEFAULT_VO(productName));
      const voBytes = await elevenLabsTts(voScript, voice_id, elevenKey, voiceStyle.settings);
      const voPath = `${jobId}/voiceover-${Date.now()}.mp3`;
      await admin.storage.from("cinematic-ads").upload(voPath, voBytes, { contentType: "audio/mpeg", upsert: true });
      const voUrl = admin.storage.from("cinematic-ads").getPublicUrl(voPath).data.publicUrl;
      const { data: u } = await admin.from("cinematic_ad_jobs").update({
        vo_url: voUrl, vo_script: voScript, voice_id, voice_style: voiceStyle.id,
        status: "prepared", status_message: "voiceover regenerated", approved_for_render: false,
      }).eq("id", jobId).select("*").single();
      return json(200, { ok: true, traceId, message: "voiceover regenerated", job: u });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(500, { ok: false, traceId, message: msg });
    }
  }

  if (regenerate === "copy" || regenerate === "hook") {
    try {
      const kit = await generateCreativeKit(product as any, voiceStyle, lovableKey);
      const topHook = kit.hook_variants[0];
      const topCta = kit.cta_variants[0];
      const { data: u } = await admin.from("cinematic_ad_jobs").update({
        pin_title: kit.pin_title,
        pin_description: kit.pin_description,
        hashtags: kit.hashtags,
        hook_variants_meta: kit.hook_variants,
        cta_variants_meta: kit.cta_variants,
        storyboard: kit.storyboard,
        selected_hook_index: 0,
        selected_cta_index: 0,
        hook_text: topHook?.text ?? null,
        cta_text: topCta?.text ?? null,
        hook_variant: topHook?.text ?? hook_variant,
        status_message: "creative kit regenerated",
        approved_for_render: false,
      }).eq("id", jobId).select("*").single();
      return json(200, { ok: true, traceId, message: "creative kit regenerated", job: u });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(500, { ok: false, traceId, message: msg });
    }
  }

  try {
    const scenes = DEFAULT_SCENES(productName);

    // ── Multi-variant copy generation ─────────────────────────────────────
    // Build N alternative voiceovers and N alternative captions per scene
    // so successive campaigns can rotate copy and avoid ad fatigue.
    let voScript: string = typeof body.vo_script === "string" ? body.vo_script : "";
    let voScriptVariants: string[] = [];
    let captionVariants: string[][] = scenes.map((s) => [s.caption]);

    const captionsOverride: string[] | null =
      Array.isArray(body.captions) && body.captions.length === 6
        ? body.captions.map((c: unknown) => String(c ?? ""))
        : null;

    const needAi = !voScript || !captionsOverride;
    if (needAi) {
      const generated = await generateProductCopyVariants(product as any, lovableKey, requestedVariantCount);
      if (generated) {
        voScriptVariants = generated.vo_scripts;
        captionVariants = generated.caption_variants;
        console.log("[cinematic-ad-prepare]", traceId, "ai-copy variants generated", {
          vo_variants: voScriptVariants.length,
          captions_per_scene: captionVariants.map((c) => c.length),
        });
      } else {
        console.warn("[cinematic-ad-prepare]", traceId, "variant ai-copy failed; trying single-variant fallback");
        const single = await generateProductCopy(product as any, lovableKey);
        if (single) {
          voScriptVariants = [single.vo_script];
          captionVariants = single.captions.map((c) => [c]);
        } else {
          console.warn("[cinematic-ad-prepare]", traceId, "ai-copy fallback to blueprint defaults");
          voScriptVariants = [DEFAULT_VO(productName)];
          captionVariants = scenes.map((s) => [s.caption]);
        }
      }
    }

    // Caller overrides win and become a single locked variant.
    if (voScript) voScriptVariants = [voScript];
    if (captionsOverride) {
      captionVariants = captionsOverride.map((c) => [c]);
    }

    // Pick which variant to use for this run.
    const totalVariants = Math.min(
      voScriptVariants.length,
      ...captionVariants.map((row) => row.length),
    );
    const variantIndex = await pickVariantIndex(admin, product_slug, body.variant_index, totalVariants);

    voScript = voScriptVariants[variantIndex] ?? voScriptVariants[0] ?? DEFAULT_VO(productName);
    for (let i = 0; i < scenes.length; i++) {
      const row = captionVariants[i] ?? [];
      scenes[i].caption = row[variantIndex] ?? row[0] ?? scenes[i].caption;
    }
    console.log("[cinematic-ad-prepare]", traceId, "variant selected", {
      variantIndex,
      totalVariants,
      vo_words: voScript.split(/\s+/).length,
      captions: scenes.map((s) => s.caption),
    });

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
    let voDuration: number | null = null;
    try {
      const voBytes = await elevenLabsTts(voScript, voice_id, elevenKey, voiceStyle.settings);
      const voPath = `${jobId}/voiceover.mp3`;
      const { error: voErr } = await admin.storage.from("cinematic-ads").upload(voPath, voBytes, {
        contentType: "audio/mpeg", upsert: true,
      });
      if (!voErr) voUrl = admin.storage.from("cinematic-ads").getPublicUrl(voPath).data.publicUrl;
      // Rough estimate: assume ~155 wpm spoken cadence for our presets
      const wordCount = voScript.trim().split(/\s+/).length;
      voDuration = Math.round((wordCount / 155) * 60);
    } catch (e) {
      console.error("VO failed", e);
    }

    // Creative kit (5 hooks + 3 CTAs + pin copy + storyboard, scored)
    const kit: CreativeKit = await generateCreativeKit(product as any, voiceStyle, lovableKey);
    const topHook = kit.hook_variants[0];
    const topCta = kit.cta_variants[0];

    const { data: updated, error: upErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "prepared",
        status_message: "assets ready — awaiting approval",
        scene_specs: scenes,
        scene_assets,
        vo_script: voScript,
        vo_url: voUrl,
        voice_id,
        voice_style: voiceStyle.id,
        output_duration_seconds: voDuration ?? undefined,
        vo_script_variants: voScriptVariants,
        caption_variants: captionVariants,
        variant_index: variantIndex,
        pin_title: kit.pin_title,
        pin_description: kit.pin_description,
        hashtags: kit.hashtags,
        hook_variants_meta: kit.hook_variants,
        cta_variants_meta: kit.cta_variants,
        storyboard: kit.storyboard,
        selected_hook_index: 0,
        selected_cta_index: 0,
        hook_text: topHook?.text ?? null,
        cta_text: topCta?.text ?? null,
        hook_variant: topHook?.text ?? hook_variant,
        media_warnings: mediaWarnings,
        approved_for_render: false,
        prepared_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    if (upErr) throw upErr;

    return json(200, { ok: true, traceId, message: "prepared — awaiting approval", job: updated, media_warnings: mediaWarnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("cinematic_ad_jobs").update({ status: "failed", error_message: msg, status_message: "preparation failed" }).eq("id", jobId);
    return json(500, { ok: false, traceId, message: msg });
  }
};

if (import.meta.main) {
  Deno.serve(handler);
}

export { handler };