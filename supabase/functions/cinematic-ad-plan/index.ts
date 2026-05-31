// cinematic-ad-plan
// Generates a 4-scene professional ad script (hook + problem + solution + CTA)
// for a cinematic_ad_jobs row. Uses Lovable AI (cheap Gemini Flash). Writes
// creative_plan jsonb. Does NOT render. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Category-aware angle hints. Keep concise — sent as system context.
const CATEGORY_ANGLES: Record<string, { pains: string[]; benefits: string[] }> = {
  litter_box: { pains: ["smell","mess on the floor","cat refusing the box","privacy"], benefits: ["odor control","easy clean","more privacy for the cat"] },
  cat_tree:   { pains: ["bored indoor cat","scratched furniture","no climbing space"], benefits: ["enrichment","vertical territory","scratching outlet"] },
  pet_bed:    { pains: ["restless sleep","joint discomfort","anxious pets"], benefits: ["calmer sleep","orthopedic support","cozy retreat"] },
  dog_toy:    { pains: ["destructive chewing","boredom","short attention"], benefits: ["mental stimulation","durable play","focused energy"] },
  training:   { pains: ["pulling on leash","poor recall","reactive behavior"], benefits: ["control","safety","confident training"] },
  small_pet:  { pains: ["bare habitat","stress","under-enrichment"], benefits: ["enrichment","habitat comfort","hiding spaces"] },
  generic:    { pains: ["everyday pet pain point"], benefits: ["quality of life upgrade"] },
};

function detectCategory(s: string): keyof typeof CATEGORY_ANGLES {
  const h = s.toLowerCase();
  if (/litter|toilet/.test(h)) return "litter_box";
  if (/cat[- ]?tree|scratch|climb|condo|catio/.test(h)) return "cat_tree";
  if (/bed|sofa|mat|cushion/.test(h)) return "pet_bed";
  if (/(dog|puppy).*(toy|chew|ball)|chew toy/.test(h)) return "dog_toy";
  if (/harness|leash|collar|training|fence|clipper/.test(h)) return "training";
  if (/rabbit|hamster|small pet|guinea/.test(h)) return "small_pet";
  return "generic";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, traceId, message: "unauthorized" });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const jobId = body.job_id;
  if (!jobId) return json(400, { ok: false, traceId, message: "job_id required" });

  const { data: job } = await admin
    .from("cinematic_ad_jobs").select("id, product_slug, product_name, pin_title, pin_description")
    .eq("id", jobId).maybeSingle();
  if (!job) return json(404, { ok: false, traceId, message: "job not found" });

  const { data: product } = await admin
    .from("products").select("name, category, image_url, primary_keyword")
    .eq("slug", job.product_slug).maybeSingle();

  const productTitle = product?.name ?? job.product_name ?? job.product_slug;
  const category = detectCategory(`${productTitle} ${product?.category ?? ""}`);
  const angles = CATEGORY_ANGLES[category];

  // Fallback plan (used when AI call is unavailable). Always returns a valid plan.
  const fallback = {
    category,
    total_duration_seconds: 15,
    hook: { duration_seconds: 2, overlay_text: angles.pains[0] ? `Tired of ${angles.pains[0]}?` : "Stop scrolling.", visual: "tight problem framing of the cat/dog environment", camera: "quick zoom in" },
    scene_1: { duration_seconds: 3, role: "problem", overlay_text: `The ${angles.pains[0] ?? "problem"} most pet owners ignore`, visual: "before-state of the problem", camera: "handheld pan" },
    scene_2: { duration_seconds: 4, role: "solution", overlay_text: `Meet the ${productTitle}`, visual: "clean hero shot of product in use", camera: "slow orbital reveal", product_benefit: angles.benefits[0] ?? "everyday upgrade" },
    scene_3: { duration_seconds: 4, role: "proof", overlay_text: angles.benefits[1] ? `${angles.benefits[1]} in 1 day` : "Real results, fast", visual: "happy pet using the product", camera: "static mid-shot, then push-in" },
    cta: { duration_seconds: 2, overlay_text: "Tap to shop →", visual: "product + price card", camera: "static hold", cta_url: `https://getpawsy.pet/products/${job.product_slug}` },
    generated_by: "fallback_template",
  };

  let plan: any = fallback;

  if (LOVABLE_API_KEY) {
    try {
      const sys = `You are a senior US e-commerce video ad director. Write a 15-second vertical 9:16 Pinterest/TikTok ad script for one pet product. Follow the strict JSON schema. US English. No medical claims. No "vet-approved" or "eco-friendly". No price anchoring. Brand voice: warm, practical, premium. Scenes must contain meaningful visual variation — NEVER a single static photo with zoom/pan.`;
      const usr = `Product: ${productTitle}\nCategory: ${category}\nKnown pains: ${angles.pains.join("; ")}\nKnown benefits: ${angles.benefits.join("; ")}\nProduct URL: https://getpawsy.pet/products/${job.product_slug}`;

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
          tools: [{
            type: "function",
            function: {
              name: "emit_plan",
              parameters: {
                type: "object",
                properties: {
                  hook:    { type: "object", properties: { duration_seconds:{type:"number"}, overlay_text:{type:"string"}, visual:{type:"string"}, camera:{type:"string"} }, required:["duration_seconds","overlay_text","visual","camera"] },
                  scene_1: { type: "object", properties: { duration_seconds:{type:"number"}, role:{type:"string"}, overlay_text:{type:"string"}, visual:{type:"string"}, camera:{type:"string"} }, required:["duration_seconds","role","overlay_text","visual","camera"] },
                  scene_2: { type: "object", properties: { duration_seconds:{type:"number"}, role:{type:"string"}, overlay_text:{type:"string"}, visual:{type:"string"}, camera:{type:"string"}, product_benefit:{type:"string"} }, required:["duration_seconds","role","overlay_text","visual","camera","product_benefit"] },
                  scene_3: { type: "object", properties: { duration_seconds:{type:"number"}, role:{type:"string"}, overlay_text:{type:"string"}, visual:{type:"string"}, camera:{type:"string"} }, required:["duration_seconds","role","overlay_text","visual","camera"] },
                  cta:     { type: "object", properties: { duration_seconds:{type:"number"}, overlay_text:{type:"string"}, visual:{type:"string"}, camera:{type:"string"} }, required:["duration_seconds","overlay_text","visual","camera"] },
                },
                required: ["hook","scene_1","scene_2","scene_3","cta"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "emit_plan" } },
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args) {
          const parsed = typeof args === "string" ? JSON.parse(args) : args;
          plan = {
            category,
            total_duration_seconds: 15,
            ...parsed,
            cta: { ...parsed.cta, cta_url: `https://getpawsy.pet/products/${job.product_slug}` },
            generated_by: "lovable_ai_gemini_2_5_flash",
          };
        }
      } else if (r.status === 429) {
        plan.generated_by = "fallback_template_ai_rate_limited";
      } else if (r.status === 402) {
        plan.generated_by = "fallback_template_ai_credits_exhausted";
      }
    } catch (e) {
      console.error(`[plan] ${traceId} ai error`, e);
    }
  }

  await admin.from("cinematic_ad_jobs").update({
    creative_plan: plan,
    status_message: `Creative plan generated (${plan.generated_by})`,
  }).eq("id", jobId);

  return json(200, { ok: true, traceId, plan });
});