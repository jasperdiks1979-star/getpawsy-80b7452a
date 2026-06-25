import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { claimJobs, finishJob, withinBudget, isInternalAuthed } from "../_shared/cpe-helpers.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RESTORE_PROMPT = "Edit this product photo for a premium e-commerce listing: place it on a clean pure-white studio background, improve sharpness and lighting, and keep the product itself exactly the same in shape, color, and proportions. Output the edited image.";

async function enhance(srcUrl: string, apiKey: string): Promise<{ url: string | null; err: string | null }> {
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
    const text = await r.text();
    if (!r.ok) return { url: null, err: `gateway_${r.status}: ${text.slice(0, 200)}` };
    let j: any = {}; try { j = JSON.parse(text); } catch { return { url: null, err: "bad_json" }; }
    const msg = j?.choices?.[0]?.message;
    const fromImages = msg?.images?.[0]?.image_url?.url;
    if (fromImages) return { url: fromImages, err: null };
    // fall back to data.[0].b64_json shape
    const b64 = j?.data?.[0]?.b64_json;
    if (b64) return { url: `data:image/png;base64,${b64}`, err: null };
    return { url: null, err: `no_image: ${JSON.stringify(j).slice(0, 1500)}` };
  } catch (e) { return { url: null, err: `exc: ${(e as Error).message}` }; }
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

    const { url: outUrl, err } = await enhance(source_url, apiKey);
    if (!outUrl) { await finishJob(sb, j.id, false, err ?? "enhance_failed"); processed++; continue; }
    // Materialize bytes from data URL or remote URL
    let bytes: Uint8Array;
    if (outUrl.startsWith("data:")) {
      const b64 = outUrl.split(",")[1];
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } else {
      const r2 = await fetch(outUrl);
      if (!r2.ok) { await finishJob(sb, j.id, false, `fetch_${r2.status}`); processed++; continue; }
      bytes = new Uint8Array(await r2.arrayBuffer());
    }
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