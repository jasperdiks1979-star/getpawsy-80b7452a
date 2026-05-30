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
    "You direct cinematic UGC pet-product ads. Output strict JSON. No text overlays, no logos, no captions in the video.";
  const user = `Product: ${productName}
Script: ${JSON.stringify(script)}

For each of the 4 scenes, write a Runway Gen-3 video prompt describing real-looking cat footage in a modern home. Use the product visually where relevant. Avoid any on-screen text. Cinematic UGC handheld style, natural lighting, shallow depth of field, 9:16 portrait composition. Return JSON:
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

async function generateStartingFrame(prompt: string): Promise<string> {
  // Use Lovable AI image generation. Returns a data URL or hosted URL.
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
          content: `Photorealistic 9:16 portrait still, cinematic UGC style, natural lighting, no text overlays: ${prompt}`,
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
      .select("slug,name,description,image_url")
      .eq("slug", product_slug)
      .maybeSingle();
    if (pErr || !product) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jErr } = await admin
      .from("cinematic_runway_jobs")
      .insert({
        product_slug: product.slug,
        product_name: product.name,
        product_image_url: product.image_url,
        status: "scripting",
        created_by: ures.user.id,
      })
      .select()
      .single();
    if (jErr) throw new Error(`job insert: ${jErr.message}`);

    // Background work (kept inline; pipeline is short)
    (async () => {
      try {
        const script = await generateScript(product.name, product.description ?? "");
        await admin
          .from("cinematic_runway_jobs")
          .update({ script, status: "rendering_scenes" })
          .eq("id", job.id);

        const scenePrompts = await generateScenePrompts(product.name, script);
        const scenes: any[] = [];
        for (const key of SCENE_KEYS) {
          const sp = scenePrompts[key];
          if (!sp?.video_prompt || !sp?.frame_prompt) {
            throw new Error(`missing prompt for scene ${key}`);
          }
          const frameDataUrl = await generateStartingFrame(sp.frame_prompt);
          const frameUrl = await uploadDataUrl(admin, job.id, key, frameDataUrl);
          const taskId = await kickRunwayTask(frameUrl, sp.video_prompt);
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