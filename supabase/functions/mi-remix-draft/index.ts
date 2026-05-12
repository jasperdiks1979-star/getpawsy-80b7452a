import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Compliance: banned phrases (high-risk marketing terminology + clone-flagging)
const BANNED = [
  "vet-approved", "vet approved", "veterinarian approved",
  "eco-friendly", "eco friendly",
  "best in the world", "guaranteed cure", "100% guaranteed",
  "miracle", "clinically proven",
];

function complianceCheck(text: string): string[] {
  const flags: string[] = [];
  const lower = text.toLowerCase();
  for (const b of BANNED) if (lower.includes(b)) flags.push(`banned_phrase:${b}`);
  if (text.length > 4000) flags.push("too_long");
  return flags;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authn: require admin user
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, message: "Admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const recipe_id: string | undefined = body.recipe_id;
    const product_id: string | undefined = body.product_id;
    if (!recipe_id) {
      return new Response(JSON.stringify({ ok: false, message: "recipe_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: recipe, error: recErr } = await admin
      .from("mi_creative_recipes").select("*").eq("id", recipe_id).maybeSingle();
    if (recErr || !recipe) throw new Error("Recipe not found");

    let product: { id: string; name: string; category: string | null; description: string | null; slug: string } | null = null;
    if (product_id) {
      const { data: p } = await admin
        .from("products").select("id,name,category,description,slug").eq("id", product_id).maybeSingle();
      product = (p ?? null) as typeof product;
    }

    const systemPrompt = `You are a senior US-market pet brand copywriter for GetPawsy.
Generate ORIGINAL Pinterest/TikTok creative copy + a TEXT-ONLY visual brief inspired by a creative pattern recipe.
STRICT RULES:
- Never copy competitor wording. Produce fully original copy.
- US English, premium friendly tone, no hype, no medical claims.
- BANNED words: "vet-approved", "eco-friendly", "miracle", "clinically proven", "guaranteed cure".
- No price anchoring, no fake reviews, no pet-influencer endorsements.
- Output JSON only.`;

    const userPrompt = `Recipe pattern (inspiration only — never reproduce verbatim):
${JSON.stringify(recipe, null, 2)}

Product context:
${product ? JSON.stringify(product, null, 2) : "Generic GetPawsy catalog (cat trees, dog beds, pet essentials)"}

Return JSON: { "headline": string (max 60 chars), "subhead": string (max 90 chars), "body_copy": string (max 300 chars), "cta": string (max 25 chars), "visual_brief": string (text-only description of the original visual to produce, no asset references), "compliance_self_check": string }`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ ok: false, message: "AI rate-limited, try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ ok: false, message: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${aiResp.status} ${t}`);
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, string> = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { body_copy: raw }; }

    const generated_copy = [parsed.headline, parsed.subhead, parsed.body_copy, parsed.cta]
      .filter(Boolean).join("\n");
    const generated_brief = parsed.visual_brief ?? "";

    const flags = [
      ...complianceCheck(generated_copy),
      ...complianceCheck(generated_brief),
    ];

    const status = flags.length > 0 ? "needs_review" : "draft";

    const { data: inserted, error: insErr } = await admin.from("mi_remix_drafts").insert({
      recipe_id,
      product_id: product?.id ?? null,
      generated_copy,
      generated_brief,
      compliance_flags: flags,
      status,
    }).select().maybeSingle();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      ok: true,
      traceId: crypto.randomUUID(),
      message: status === "draft" ? "Draft created" : "Draft created with compliance flags",
      draft: inserted,
      parsed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("mi-remix-draft error:", msg);
    return new Response(JSON.stringify({ ok: false, message: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});