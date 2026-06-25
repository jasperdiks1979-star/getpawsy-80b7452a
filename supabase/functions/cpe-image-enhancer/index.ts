import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { claimJobs, finishJob, withinBudget, isInternalAuthed } from "../_shared/cpe-helpers.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/images/generations";
const VISION = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RESTORE_PROMPT = "Restore this product image to premium e-commerce quality. Sharpen edges, denoise compression artifacts, balance white balance, neutralize any tinted background, repair clipped highlights, remove any Chinese text overlays or supplier watermarks if present. Keep the product identical in shape, color, and proportions. Do not invent new objects.";

async function enhance(srcUrl: string, apiKey: string): Promise<string | null> {
  // We can't pass a source image with images.generations directly across all models;
  // use Gemini image editing via OpenRouter-style chat-completions image shape.
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: RESTORE_PROMPT },
            { type: "image_url", image_url: { url: srcUrl } },
          ],
        }],
        modalities: ["image", "text"],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch { return null; }
}

async function scoreQuality(url: string, apiKey: string): Promise<number> {
  try {
    const r = await fetch(VISION, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Rate this product image 0-100 for e-commerce premium quality. Reply with ONLY the number." },
            { type: "image_url", image_url: { url } },
          ],
        }],
      }),
    });
    if (!r.ok) return 0;
    const j = await r.json();
    const txt = String(j?.choices?.[0]?.message?.content ?? "0");
    const n = parseInt(txt.match(/\d+/)?.[0] ?? "0", 10);
    return Math.max(0, Math.min(100, n));
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return jsonResp({ error: "missing_lovable_api_key" }, 500);

  let body: any = {}; try { body = await req.json(); } catch {}
  const dry = body?.dry_run === true;
  const limit = Math.min(Number(body?.limit ?? 3), 10);

  const jobs = await claimJobs(sb, "enhance", "cpe-image-enhancer", limit);
  let processed = 0, succeeded = 0, spent = 0;

  for (const j of jobs) {
    const { product_id, source_url } = j.payload as any;
    const budget = await withinBudget(sb, 0.05);
    if (!budget.ok) { await finishJob(sb, j.id, false, "budget_exhausted"); continue; }

    if (dry) {
      await sb.from("cpe_enhanced_images").insert({ product_id, original_url: source_url, status: "dry_run", model: "google/gemini-3.1-flash-image" });
      await finishJob(sb, j.id, true);
      processed++; succeeded++; continue;
    }

    const dataUrl = await enhance(source_url, apiKey);
    if (!dataUrl) { await finishJob(sb, j.id, false, "enhance_failed"); processed++; continue; }
    // Upload to cpe-enhanced bucket
    const b64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${product_id}/${Date.now()}.png`;
    const up = await sb.storage.from("cpe-enhanced").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (up.error) { await finishJob(sb, j.id, false, up.error.message); processed++; continue; }
    const { data: signed } = await sb.storage.from("cpe-enhanced").createSignedUrl(path, 60 * 60 * 24 * 365);
    const enhancedUrl = signed?.signedUrl ?? null;
    const score = enhancedUrl ? await scoreQuality(enhancedUrl, apiKey) : 0;
    await sb.from("cpe_enhanced_images").insert({
      product_id, original_url: source_url, enhanced_url: enhancedUrl,
      quality_score: score, model: "google/gemini-3.1-flash-image",
      cost_usd: 0.05, status: "succeeded", scored_at: new Date().toISOString(),
    });
    spent += 0.05;
    await finishJob(sb, j.id, true);
    processed++; succeeded++;
  }

  return jsonResp({ ok: true, processed, succeeded, spent_usd: spent });
});