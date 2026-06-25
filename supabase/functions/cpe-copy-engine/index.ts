import { admin, jsonResp, cors, BANNED_PHRASES } from "../_shared/creative-helpers.ts";
import { claimJobs, finishJob, withinBudget, isInternalAuthed } from "../_shared/cpe-helpers.ts";

const CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function gen(prompt: string, key: string): Promise<any | null> {
  try {
    const r = await fetch(CHAT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  } catch { return null; }
}

function passesCompliance(txt: string): boolean {
  const l = txt.toLowerCase();
  return !BANNED_PHRASES.some((p) => l.includes(p));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return jsonResp({ error: "missing_lovable_api_key" }, 500);
  const jobs = await claimJobs(sb, "copy", "cpe-copy", 5);
  let made = 0;
  for (const j of jobs) {
    const { product_id } = j.payload as any;
    const budget = await withinBudget(sb, 0.01);
    if (!budget.ok) { await finishJob(sb, j.id, false, "budget_exhausted"); continue; }
    const { data: prod } = await sb.from("products").select("name,category,description").eq("id", product_id).maybeSingle();
    if (!prod) { await finishJob(sb, j.id, false, "no_product"); continue; }
    const prompt = `Generate Pinterest+SEO copy for a US pet-product e-commerce listing.
Product: ${prod.name}. Category: ${prod.category}.
Output JSON: {"pinterest_title":"<=100ch","pinterest_description":"<=500ch","seo_title":"<=60ch","meta_description":"<=160ch","hooks":["emotional","problem","curiosity","urgency","question","benefit"],"ctas":["CTA1","CTA2","CTA3"]}.
Rules: premium tone, no fluff, no "vet-approved", "eco-friendly", "stop scooping", no fake reviews, no price anchoring.`;
    const out = await gen(prompt, key);
    if (!out) { await finishJob(sb, j.id, false, "ai_failed"); continue; }
    const text = JSON.stringify(out);
    if (!passesCompliance(text)) { await finishJob(sb, j.id, false, "banned_phrase"); continue; }
    await sb.from("creative_assets").insert({
      product_id, status: "draft", qa_status: "pending", creative_type: "copy",
      copy_payload: out,
    } as any);
    made++;
    await finishJob(sb, j.id, true);
  }
  return jsonResp({ ok: true, made });
});