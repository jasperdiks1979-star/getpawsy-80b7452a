// Cinematic V3 — admin entrypoint.
// 1. Validates product accuracy gate (RULE-1).
// 2. Generates 7-beat script via Lovable AI (RULE-7).
// 3. Generates voiceover via ElevenLabs (RULE-5: mandatory).
// 4. Uploads VO to cinematic-v3 bucket.
// 5. Persists job row and dispatches GitHub Actions render workflow.
//
// No AI animals are ever requested. No product geometry is ever modified.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO"); // "owner/repo"
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
const BUCKET = "cinematic-v3";
const DEFAULT_VOICE = "cgSgspJ2msm6clMCkdW9"; // Jessica

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Scene = {
  key: "hook" | "problem" | "agitate" | "solution" | "benefits" | "trust" | "cta";
  start: number;
  end: number;
  vo: string;
  caption: string;
  visual: "product_pan" | "product_parallax" | "authentic_clip" | "motion_graphic";
  asset_index: number;
};

async function generateScript(product: any): Promise<Scene[]> {
  const sys = `You are a senior US ecommerce video ad copywriter for Chewy/Petlibro-tier brands.
Write a 30s Pinterest ad script. Follow this EXACT 7-beat structure with timing:
- hook (0-4s), problem (4-8s), agitate (8-12s), solution (12-18s), benefits (18-24s), trust (24-28s), cta (28-30s).

HARD RULES:
- Voiceover (vo) lines: max 14 words each, natural spoken American English.
- Captions: max 8 words per line, max 2 lines. Use ALL CAPS only for hook and cta.
- Never describe an on-screen animal or person. Copy MAY say "your cat" or "your dog" but the visuals only show the product.
- Never invent product specs. Use only the product fields provided.

Return strictly JSON: { "scenes": Scene[7] } where each Scene has { key, start, end, vo, caption, visual, asset_index }.
visual must be one of: product_pan, product_parallax, authentic_clip, motion_graphic.
asset_index is a 0-based index into available product images.`;

  const user = `PRODUCT
Title: ${product.title}
Brand: ${product.brand ?? "GetPawsy"}
Category: ${product.category ?? ""}
Price: $${product.price}
Description: ${(product.description ?? "").slice(0, 800)}
Available product images: ${product.images?.length ?? 1}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`script gen failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  const scenes: Scene[] = parsed.scenes ?? [];
  if (scenes.length !== 7) throw new Error(`expected 7 scenes, got ${scenes.length}`);
  return scenes;
}

async function generateVoiceover(text: string, voiceId: string): Promise<Uint8Array> {
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
  if (!res.ok) throw new Error(`voiceover failed: ${res.status} ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const internalToken = req.headers.get("x-internal-secret") ?? "";
    let requesterId: string | null = null;
    if (INTERNAL_FUNCTION_SECRET && internalToken && internalToken === INTERNAL_FUNCTION_SECRET) {
      // pilot/automation bypass
      requesterId = null;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userRes?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
      if (!isAdmin) return json({ ok: false, traceId, message: "admin required" }, 403);
      requesterId = userRes.user.id;
    }

    const body = await req.json().catch(() => ({} as any));
    const slug = String(body?.product_slug ?? "").trim();
    const voiceId = String(body?.voice_id ?? DEFAULT_VOICE);
    if (!slug) return json({ ok: false, traceId, message: "product_slug required" }, 400);

    // RULE-1 gate
    const { data: product, error: prodErr } = await admin
      .from("products")
      .select("id, slug, name, description, image_url, images, price, brand, category")
      .eq("slug", slug)
      .maybeSingle();
    if (prodErr || !product) return json({ ok: false, traceId, message: "product not found" }, 404);
    const imgs: string[] = Array.isArray(product.images) ? product.images : (product.image_url ? [product.image_url] : []);
    const cleanImgs = imgs.filter((u) => typeof u === "string" && /^https?:/.test(u));
    if (cleanImgs.length < 2) {
      return json({
        ok: false, traceId,
        message: `RULE-1 failed: only ${cleanImgs.length} usable product images, need >= 2 for accuracy >= 95%`,
      }, 422);
    }

    const { data: job, error: jobErr } = await admin
      .from("cinematic_v3_jobs")
      .insert({
        product_id: product.id,
        product_slug: slug,
        status: "scripting",
        voice_id: voiceId,
        requested_by: requesterId,
      })
      .select("id")
      .single();
    if (jobErr || !job) return json({ ok: false, traceId, message: jobErr?.message ?? "insert failed" }, 500);
    const jobId = job.id;

    let scenes: Scene[];
    try {
      scenes = await generateScript({ ...product, title: (product as any).name ?? slug, images: cleanImgs });
    } catch (e: any) {
      await admin.from("cinematic_v3_jobs").update({
        status: "failed",
        failure_reasons: [`script_failed: ${String(e?.message ?? e)}`],
      }).eq("id", jobId);
      return json({ ok: false, traceId, jobId, message: `script: ${e?.message ?? e}` }, 500);
    }
    scenes = scenes.map((s) => ({ ...s, asset_index: Math.max(0, Math.min(cleanImgs.length - 1, s.asset_index | 0)) }));
    const transcript = scenes.map((s) => s.vo).join(" ");

    await admin.from("cinematic_v3_jobs").update({
      status: "voiceover",
      script: { transcript, voice_id: voiceId, product_images: cleanImgs },
      scenes,
      voiceover_transcript: transcript,
    }).eq("id", jobId);

    let voPath: string;
    try {
      const mp3 = await generateVoiceover(transcript, voiceId);
      voPath = `jobs/${jobId}/voiceover.mp3`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(voPath, mp3, {
        contentType: "audio/mpeg", upsert: true,
      });
      if (upErr) throw new Error(upErr.message);
    } catch (e: any) {
      await admin.from("cinematic_v3_jobs").update({
        status: "failed",
        failure_reasons: [`voiceover_failed: ${String(e?.message ?? e)}`],
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
    } else {
      await admin.from("cinematic_v3_jobs").update({
        failure_reasons: ["dispatch_skipped: GH_PAT/GH_REPO not configured"],
      }).eq("id", jobId);
    }

    return json({ ok: true, traceId, jobId, voiceover_url: voUrl, scene_count: scenes.length });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});
