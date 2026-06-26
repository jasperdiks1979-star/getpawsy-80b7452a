// PCIE2 Wave 1 — Product Classifier
// Classifies active products into functional classes + psychology model.
// Admin-only. Writes pcie2_product_understanding. Idempotent (upsert).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FUNCTIONAL_CLASSES = [
  "entertainment", "comfort", "health", "safety", "training",
  "cleaning", "technology", "travel", "furniture", "feeding",
  "hydration", "enrichment", "behavior", "monitoring", "grooming",
];

type Product = {
  id: string;
  name: string | null;
  title?: string | null;
  description: string | null;
  category: string | null;
  tags?: string[] | null;
};

function ruleClassify(p: Product): { fc: string; sub: string | null; conf: number } {
  const hay = `${p.name ?? p.title ?? ""} ${p.category ?? ""} ${(p.tags ?? []).join(" ")} ${p.description ?? ""}`.toLowerCase();
  const rules: Array<[RegExp, string, string | null]> = [
    [/litter|scoop|waste/, "cleaning", "litter"],
    [/camera|monitor|cam\b/, "monitoring", "camera"],
    [/fountain|water/, "hydration", "fountain"],
    [/feeder|bowl|food dispenser|automatic feed/, "feeding", "feeder"],
    [/bed|cushion|mattress|hammock/, "comfort", "bed"],
    [/tree|condo|tower|scratcher|shelf/, "furniture", "cat-tree"],
    [/harness|leash|collar|seat belt/, "safety", "harness"],
    [/carrier|backpack|stroller|travel/, "travel", "carrier"],
    [/brush|groom|nail|shampoo|deshed/, "grooming", null],
    [/treat|chew|dental|supplement|vitamin/, "health", null],
    [/toy|laser|ball|wand|teaser|puzzle|enrichment/, "entertainment", "toy"],
    [/train|clicker|deterrent/, "training", null],
    [/gps|tracker|smart|app|wifi|bluetooth/, "technology", null],
  ];
  for (const [re, fc, sub] of rules) {
    if (re.test(hay)) return { fc, sub, conf: 0.82 };
  }
  return { fc: "entertainment", sub: null, conf: 0.4 };
}

async function aiClassify(p: Product, apiKey: string) {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: `You classify pet products. Reply ONLY JSON: {"functional_class":"<one of ${FUNCTIONAL_CLASSES.join("|")}>","sub_class":"<short>","primary_purpose":"<1 sentence>","use_cases":["..."],"pain_points":["..."],"audience":{"species":"cat|dog|both","persona":"..."},"psychology_model":{"primary_emotion":"...","drivers":["..."],"objections":["..."]},"banned_hook_patterns":["..."],"confidence":0.0}` },
          { role: "user", content: `Name: ${p.name ?? p.title}\nCategory: ${p.category}\nDescription: ${(p.description ?? "").slice(0, 600)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const txt = j?.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE = Deno.env.get("LOVABLE_API_KEY");

  // admin gate
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 50), 200);
  const useAI = !!LOVABLE && body.useAI !== false;
  const onlyMissing = body.onlyMissing !== false;

  const { data: run } = await admin.from("pcie2_runs").insert({ run_type: "classify", status: "running" }).select().single();

  // Pull active products missing classification
  let q = admin.from("products").select("id,name,title,description,category,tags").eq("status", "active").limit(limit);
  const { data: products, error } = await q;
  if (error) {
    await admin.from("pcie2_runs").update({ status: "error", notes: error.message, finished_at: new Date().toISOString() }).eq("id", run!.id);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let processed = 0, ai = 0, ruled = 0, skipped = 0, errors = 0;
  for (const p of products ?? []) {
    if (onlyMissing) {
      const { data: existing } = await admin.from("pcie2_product_understanding").select("id").eq("product_id", p.id).maybeSingle();
      if (existing) { skipped++; continue; }
    }
    let payload: any = null;
    if (useAI) {
      payload = await aiClassify(p as Product, LOVABLE!);
      if (payload) ai++;
    }
    if (!payload) {
      const r = ruleClassify(p as Product);
      payload = {
        functional_class: r.fc, sub_class: r.sub, primary_purpose: null,
        use_cases: [], pain_points: [], audience: {}, psychology_model: {},
        banned_hook_patterns: [], confidence: r.conf,
      };
      ruled++;
    }
    const fc = FUNCTIONAL_CLASSES.includes(String(payload.functional_class)) ? payload.functional_class : "entertainment";
    const { error: upErr } = await admin.from("pcie2_product_understanding").upsert({
      product_id: p.id,
      functional_class: fc,
      sub_class: payload.sub_class ?? null,
      primary_purpose: payload.primary_purpose ?? null,
      use_cases: payload.use_cases ?? [],
      pain_points: payload.pain_points ?? [],
      audience: payload.audience ?? {},
      psychology_model: payload.psychology_model ?? {},
      banned_hook_patterns: payload.banned_hook_patterns ?? [],
      classifier_model: useAI && ai > ruled ? "google/gemini-2.5-flash-lite" : "rule",
      confidence: Number(payload.confidence ?? 0.5),
    }, { onConflict: "product_id" });
    if (upErr) errors++; else processed++;
  }

  const totals = { processed, ai, ruled, skipped, errors, candidates: products?.length ?? 0 };
  await admin.from("pcie2_runs").update({ status: "complete", totals, finished_at: new Date().toISOString() }).eq("id", run!.id);

  return new Response(JSON.stringify({ ok: true, totals }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});