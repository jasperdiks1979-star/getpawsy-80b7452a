// Generate script + 4 scenes + starting frames, kick off Runway image-to-video tasks.
// Manual trigger only. Costs ~$5 per run; rejects re-runs on the same job.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY")!;
const RUNWAY_VERSION = "2024-11-06";

const SCENE_KEYS = ["hook", "problem", "solution", "cta"] as const;

// Threshold required for a generated ad to be eligible for publish.
const PRODUCT_MATCH_THRESHOLD = 95;

/**
 * PRODUCT LOCK — pre-generation fingerprint.
 *
 * Given the real PDP reference images, ask Gemini to extract a strict,
 * structured description of the product's locked attributes. This
 * fingerprint is then attached to every downstream prompt so the model
 * cannot invent a different SKU.
 */
async function buildProductFingerprint(
  productName: string,
  productDescription: string,
  referenceUrls: string[],
): Promise<Record<string, unknown>> {
  const sys =
    "You build strict product fingerprints used as locked references for ad generation. Output JSON only. Describe ONLY what is visible in the reference photos. Do not guess.";
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        `Product: ${productName}\n` +
        `Description: ${productDescription || "(none)"}\n\n` +
        `Study the reference photos and return JSON with EXACT visible attributes:\n` +
        `{\n` +
        `  "shape": "concise shape description (e.g. dome / cylindrical / rectangular box)",\n` +
        `  "proportions": "height-to-width feel and key proportional cues",\n` +
        `  "color": ["primary color", "secondary color"],\n` +
        `  "materials": ["plastic", "matte finish", ...],\n` +
        `  "opening": "describe entry/door/lid placement, shape and size",\n` +
        `  "controls": "describe visible buttons, screens, dials, indicator lights — locations & count",\n` +
        `  "branding": "describe any visible logos / wordmarks / badges and their placement",\n` +
        `  "distinctive_features": ["list every distinctive visible feature that defines this SKU"],\n` +
        `  "must_not_change": ["short rules: 'one circular front opening', 'single top button', 'no side LEDs', ...]\n` +
        `}`,
    },
    ...referenceUrls.slice(0, 4).map((u) => ({
      type: "image_url" as const,
      image_url: { url: u },
    })),
  ];
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`fingerprint failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

/**
 * PROMPT LOCK — text-level validation BEFORE any image/video render.
 *
 * Reject scene prompts that would alter the locked product geometry,
 * opening, color, controls or branding. Returns { ok, violations[] }.
 */
async function validateScenePromptAgainstLock(
  scenePrompt: string,
  fingerprint: Record<string, unknown>,
): Promise<{ ok: boolean; violations: string[] }> {
  const sys =
    "You audit ad scene prompts to make sure they do not alter a locked product. Output JSON only.";
  const user =
    `Locked product fingerprint:\n${JSON.stringify(fingerprint)}\n\n` +
    `Scene prompt to audit:\n"""${scenePrompt}"""\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "alters_shape": boolean,\n` +
    `  "alters_opening": boolean,\n` +
    `  "alters_color": boolean,\n` +
    `  "alters_controls": boolean,\n` +
    `  "alters_branding": boolean,\n` +
    `  "omits_required_feature": boolean,\n` +
    `  "violations": ["short reason for each true flag"]\n` +
    `}\n` +
    `Be strict. If the prompt redescribes the product's shape/color/opening/controls in a way that conflicts with the fingerprint, flag it. ` +
    `Describing the cat, environment, lighting or camera is fine.`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    // Soft-pass on validator outage — fidelity-check still gates publish.
    return { ok: true, violations: [`validator_unavailable:${r.status}`] };
  }
  const j = await r.json();
  let parsed: any = {};
  try { parsed = JSON.parse(j.choices[0].message.content); } catch { parsed = {}; }
  const flags = [
    "alters_shape", "alters_opening", "alters_color",
    "alters_controls", "alters_branding", "omits_required_feature",
  ];
  const failing = flags.filter((k) => parsed[k] === true);
  const violations: string[] = Array.isArray(parsed.violations)
    ? parsed.violations.map(String)
    : [];
  return { ok: failing.length === 0, violations: [...failing, ...violations] };
}

async function generateScript(productName: string, productDescription: string) {
  const sys =
    "You write 15-second UGC-style Pinterest video ads for premium pet products. Output strict JSON.";
  const user = `Product: ${productName}
Description: ${productDescription || "(no description)"}

Write a 4-scene script. Each scene is ~5 seconds. Return JSON:
{
  "hook": "spoken hook line under 12 words",
  "problem": "spoken problem line under 12 words",
  "solution": "spoken solution line under 12 words",
  "cta": "spoken CTA line under 12 words",
  "vo_text": "full voice-over text combining all four lines, natural cadence, under 50 words"
}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`script gen failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

async function generateScenePrompts(productName: string, script: any) {
  const sys =
    "You direct cinematic UGC pet-product ads. Output strict JSON. No text overlays, no captions in the video. The product itself is FIXED — you only describe the scene, environment, lighting, camera and cat behavior AROUND the product. NEVER describe the product's shape, color, controls, opening, materials or branding — those are locked to the source image.";
  const user = `Product: ${productName}
Script: ${JSON.stringify(script)}

For each of the 4 scenes, write a Runway Gen-3 video prompt describing real-looking cat footage in a modern home. The PRODUCT in every frame must be the exact same physical unit shown in the source product photo — same shape, dimensions, opening, controls, color, materials and branding. Describe only the scene context AROUND it (room, lighting, cat action, camera move). Avoid any on-screen text. Cinematic UGC handheld style, natural lighting, shallow depth of field, 9:16 portrait composition. The frame_prompt should describe the SCENE CONTEXT only — the product itself will be composited in from the real source image, so do not re-describe its appearance. Return JSON:
{
  "hook":     { "video_prompt": "...", "frame_prompt": "photorealistic still that this clip animates from..." },
  "problem":  { "video_prompt": "...", "frame_prompt": "..." },
  "solution": { "video_prompt": "...", "frame_prompt": "..." },
  "cta":      { "video_prompt": "...", "frame_prompt": "..." }
}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`scene prompts failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

async function generateStartingFrame(
  scenePrompt: string,
  sourceProductImageUrls: string[],
  fingerprint: Record<string, unknown> | null,
): Promise<string> {
  // PRODUCT LOCK (V8): the starting frame MUST preserve the exact product
  // from the source PDP images. We pass ALL real product images as multimodal
  // input plus a structured fingerprint and instruct Gemini to compose a scene
  // AROUND the locked product. The product is treated as a rigid prop.
  const imageRefs = sourceProductImageUrls
    .slice(0, 4)
    .map((u) => ({ type: "image_url" as const, image_url: { url: u } }));
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Compose a photorealistic 9:16 portrait still, cinematic UGC style, natural lighting, no text overlays.\n\n" +
                "HARD CONSTRAINT — PRODUCT LOCK:\n" +
                "The product shown in the reference images MUST appear in the output IDENTICAL to the references. " +
                "Preserve EXACTLY: shape, dimensions, opening, controls, color, materials, branding, logos, button placement, display, entry. " +
                "Do NOT redesign, restyle, reinterpret, simplify, reimagine, recolor or invent features. " +
                "Do NOT change the product's silhouette or proportions. Treat the product as a fixed prop to be placed in the scene.\n\n" +
                (fingerprint
                  ? `LOCKED PRODUCT FINGERPRINT (do not deviate):\n${JSON.stringify(fingerprint)}\n\n`
                  : "") +
                "SCENE CONTEXT (everything AROUND the product is yours to direct):\n" +
                scenePrompt,
            },
            ...imageRefs,
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) throw new Error(`frame gen failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const img = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!img) throw new Error("no image returned by frame gen");
  return img; // data:image/png;base64,...
}

async function uploadDataUrl(
  supabase: any,
  jobId: string,
  key: string,
  dataUrl: string,
): Promise<string> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("invalid data url");
  const contentType = m[1];
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = `jobs/${jobId}/frames/${key}.${ext}`;
  const { error } = await supabase.storage
    .from("cinematic-runway")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return supabase.storage.from("cinematic-runway").getPublicUrl(path).data.publicUrl;
}

async function kickRunwayTask(promptImage: string, promptText: string): Promise<string> {
  const r = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gen3a_turbo",
      promptImage,
      promptText: promptText.slice(0, 990),
      duration: 5,
      ratio: "768:1280",
    }),
  });
  if (!r.ok) throw new Error(`runway kick failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.id as string;
}

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
      .from("user_roles")
      .select("role")
      .eq("user_id", ures.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { product_slug } = await req.json();
    if (!product_slug || typeof product_slug !== "string") {
      return new Response(JSON.stringify({ ok: false, traceId, message: "product_slug required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: product, error: pErr } = await admin
      .from("products")
      .select("slug,name,description,image_url,images")
      .eq("slug", product_slug)
      .maybeSingle();
    if (pErr || !product) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lock all available PDP images as immutable product references.
    const referenceUrls: string[] = [
      ...(product.image_url ? [String(product.image_url)] : []),
      ...(Array.isArray((product as any).images) ? (product as any).images.map(String) : []),
    ]
      .filter((u) => /^https?:\/\//.test(u))
      // dedupe, preserve order
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 6);
    if (referenceUrls.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "product has no PDP images to lock against" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: job, error: jErr } = await admin
      .from("cinematic_runway_jobs")
      .insert({
        product_slug: product.slug,
        product_name: product.name,
        product_image_url: product.image_url,
        product_reference_urls: referenceUrls,
        product_lock_enabled: true,
        status: "scripting",
        created_by: ures.user.id,
      })
      .select()
      .single();
    if (jErr) throw new Error(`job insert: ${jErr.message}`);

    // Background work (kept inline; pipeline is short)
    (async () => {
      try {
        // 1. Lock the product before anything else is generated.
        const fingerprint = await buildProductFingerprint(
          product.name,
          product.description ?? "",
          referenceUrls,
        );
        await admin
          .from("cinematic_runway_jobs")
          .update({ product_lock: fingerprint })
          .eq("id", job.id);

        const script = await generateScript(product.name, product.description ?? "");
        await admin
          .from("cinematic_runway_jobs")
          .update({ script, status: "rendering_scenes" })
          .eq("id", job.id);

        let scenePrompts = await generateScenePrompts(product.name, script);
        // 2. Validate every scene prompt against the lock BEFORE we render.
        //    Try up to 2 rewrites; if still violating, fail the job rather
        //    than burn Runway credits on a guaranteed-bad render.
        const violationsLog: Record<string, string[]> = {};
        for (let attempt = 0; attempt < 2; attempt++) {
          let anyViolation = false;
          for (const key of SCENE_KEYS) {
            const sp = scenePrompts[key];
            if (!sp) continue;
            const combined = `${sp.frame_prompt ?? ""}\n${sp.video_prompt ?? ""}`;
            const v = await validateScenePromptAgainstLock(combined, fingerprint);
            if (!v.ok) {
              anyViolation = true;
              violationsLog[key] = v.violations;
            }
          }
          if (!anyViolation) break;
          // Rewrite prompts knowing what to avoid.
          scenePrompts = await generateScenePrompts(product.name, script);
        }
        await admin
          .from("cinematic_runway_jobs")
          .update({ prompt_lock_violations: violationsLog })
          .eq("id", job.id);

        const scenes: any[] = [];
        for (const key of SCENE_KEYS) {
          const sp = scenePrompts[key];
          if (!sp?.video_prompt || !sp?.frame_prompt) {
            throw new Error(`missing prompt for scene ${key}`);
          }
          const frameDataUrl = await generateStartingFrame(
            sp.frame_prompt,
            referenceUrls,
            fingerprint,
          );
          const frameUrl = await uploadDataUrl(admin, job.id, key, frameDataUrl);
          // Prepend product-fidelity guardrail to every Runway prompt so motion
          // generation cannot drift the product appearance away from the frame.
          const guardedVideoPrompt =
            "PRODUCT LOCK: keep the product IDENTICAL to the starting frame at all times — same shape, color, controls, opening, materials and branding. Do not morph, restyle, recolor, resize or reinterpret the product. The product is a rigid prop. " +
            sp.video_prompt;
          const taskId = await kickRunwayTask(frameUrl, guardedVideoPrompt);
          scenes.push({
            key,
            video_prompt: sp.video_prompt,
            frame_prompt: sp.frame_prompt,
            starting_frame_url: frameUrl,
            runway_task_id: taskId,
            status: "rendering",
            duration_s: 5,
          });
          await admin
            .from("cinematic_runway_jobs")
            .update({ scenes })
            .eq("id", job.id);
        }
        // Each Gen-3 Turbo 5s clip ≈ $0.25 (5 credits @ $0.01 each is incorrect — turbo is 5 credits/s = $0.05/s)
        // Actual gen3a_turbo: 5 credits/sec → 25 credits per 5s clip → 100 credits total ≈ $1.00
        await admin
          .from("cinematic_runway_jobs")
          .update({ status: "rendering_scenes", cost_cents: 100 })
          .eq("id", job.id);
      } catch (err: any) {
        await admin
          .from("cinematic_runway_jobs")
          .update({ status: "failed", error: String(err?.message ?? err) })
          .eq("id", job.id);
      }
    })();

    return new Response(JSON.stringify({ ok: true, traceId, job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});