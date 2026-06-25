import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { claimJobs, finishJob, withinBudget, SCENE_FAMILIES, sha256Hex, isInternalAuthed, loadCpeSettings } from "../_shared/cpe-helpers.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/images/generations";

function scenePrompt(family: string, productName: string, category: string): string {
  const base = `Premium editorial lifestyle photograph featuring "${productName}" in a ${family.replace(/_/g, " ")} setting for ${category}. Real pets with correct anatomy, natural fur, four limbs, no mutations, no extra paws. Natural soft lighting, correct shadows and reflections, realistic depth of field. Magazine-quality composition, on-brand calm color palette, Scandinavian beige/cream tones. Product placed naturally in scene. No text, no watermarks, no logos.`;
  return base;
}

async function generate(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    return b64 ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return jsonResp({ error: "missing_lovable_api_key" }, 500);
  let body: any = {}; try { body = await req.json(); } catch {}
  const dry = body?.dry_run === true;

  const settings = await loadCpeSettings(sb);
  const jobs = await claimJobs(sb, "lifestyle", "cpe-lifestyle", 3);
  let made = 0, spent = 0;

  for (const j of jobs) {
    const { product_id } = j.payload as any;
    const { data: prod } = await sb.from("products").select("name,category").eq("id", product_id).maybeSingle();
    if (!prod) { await finishJob(sb, j.id, false, "product_missing"); continue; }

    const { count: existing } = await sb
      .from("cpe_lifestyle_scenes").select("id", { count: "exact", head: true }).eq("product_id", product_id);
    if ((existing ?? 0) >= settings.max_lifestyle_per_product) { await finishJob(sb, j.id, true); continue; }

    const used = new Set<string>();
    const { data: prev } = await sb.from("cpe_lifestyle_scenes").select("scene_family").eq("product_id", product_id);
    (prev ?? []).forEach((r: any) => used.add(r.scene_family));
    const families = SCENE_FAMILIES.filter((f) => !used.has(f)).slice(0, 2);

    for (const family of families) {
      const budget = await withinBudget(sb, 0.08);
      if (!budget.ok) break;
      const prompt = scenePrompt(family, prod.name ?? "product", prod.category ?? "pet");
      const hash = await sha256Hex(prompt);
      if (dry) {
        await sb.from("cpe_lifestyle_scenes").insert({ product_id, scene_family: family, prompt, prompt_hash: hash, status: "dry_run" }).select();
        continue;
      }
      const b64 = await generate(prompt, apiKey);
      if (!b64) continue;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${product_id}/${family}_${Date.now()}.png`;
      const up = await sb.storage.from("cpe-lifestyle").upload(path, bytes, { contentType: "image/png" });
      if (up.error) continue;
      const { data: signed } = await sb.storage.from("cpe-lifestyle").createSignedUrl(path, 60 * 60 * 24 * 365);
      await sb.from("cpe_lifestyle_scenes").insert({
        product_id, scene_family: family, prompt, prompt_hash: hash,
        image_url: signed?.signedUrl, status: "succeeded",
        model: "google/gemini-3.1-flash-image", cost_usd: 0.08,
      });
      spent += 0.08; made++;
    }
    await finishJob(sb, j.id, true);
  }
  return jsonResp({ ok: true, scenes_made: made, spent_usd: spent });
});