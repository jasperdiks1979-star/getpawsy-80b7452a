import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const SYSTEM_PROMPT = `You are GetPawsy's premium copy chief, writing product headlines for US pet owners on a high-end DTC store.

RULES — non-negotiable:
- Output a SINGLE headline, plain text, no quotes, no emojis, no markdown.
- 50–65 characters strict. Count carefully.
- Title Case (capitalize main words). Never ALL CAPS, never lowercase.
- US English only. No Chinese, no broken English, no typos.
- Lead with the product noun + biggest benefit. Skip filler ("New", "Hot Sale", "1Pc").
- No brand-spam, no SKU codes, no "Suitable For", no "Pet Supplies", no random sizes inside the title.
- Never invent features, claims, ingredients, or medical/cleaning effects not in the source.
- Banned words: vet-approved, eco-friendly, stop scooping, miracle, guaranteed, FDA-approved, best ever.
- Never start with "Pet" alone — be specific: "Cat", "Dog", "Kitten", "Puppy", or the actual category.
- Allow brand names only if they appear cleanly in the source (e.g., PawHut).
- Output ONLY the headline. No explanation, no preface, no trailing punctuation.`;

type Product = { id: string; name: string; category: string | null; price: number };

async function rewriteOne(p: Product): Promise<string | null> {
  const userPrompt = `Original supplier title:\n"${p.name}"\n\nCategory: ${p.category ?? "Unknown"}\nPrice: $${p.price}\n\nWrite the 50–65 char US-shopper headline.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 80,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[sanitize] AI error for ${p.id}: ${res.status} ${txt.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  let out: string = data?.choices?.[0]?.message?.content ?? "";
  out = out.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ");
  // Safety: strict length & content gates
  if (out.length < 30 || out.length > 80) return null;
  if (/[\u4e00-\u9fff]/.test(out)) return null; // Chinese
  if (/\bvet[- ]approved|eco-friendly|stop scooping|FDA[- ]approved|miracle|guaranteed\b/i.test(out)) return null;
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  // Auth: either admin user JWT (via getUser) or internal secret header.
  const internalHeader = req.headers.get("x-internal-secret");
  const isInternal = INTERNAL_FUNCTION_SECRET && internalHeader === INTERNAL_FUNCTION_SECRET;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!isInternal) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ ok: false, traceId, message: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { productIds?: string[]; limit?: number; force?: boolean; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch (_) { /* empty body ok */ }

  const limit = Math.min(Math.max(body.limit ?? 40, 1), 100);
  const force = body.force === true;

  // Selection: explicit IDs first, else top in-stock active products whose title is "bad"
  // (length > 70 OR ALL-CAPS word fragments OR contains "suitable for") and not yet rewritten.
  let query = supabase
    .from("products")
    .select("id, name, category, price, name_clean, stock, is_active")
    .eq("is_active", true)
    .gt("stock", 0);

  if (body.productIds && body.productIds.length > 0) {
    query = query.in("id", body.productIds.slice(0, 100));
  } else {
    if (!force) query = query.is("name_clean", null);
    query = query.order("price", { ascending: false }).limit(limit);
  }

  const { data: products, error } = await query;
  if (error) {
    console.error("[sanitize] DB error", error);
    return new Response(JSON.stringify({ ok: false, traceId, message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates = (products ?? []) as Product[];
  console.log(`[sanitize] traceId=${traceId} candidates=${candidates.length} dryRun=${!!body.dryRun}`);

  let updated = 0;
  let skipped = 0;
  const results: Array<{ id: string; before: string; after: string | null }> = [];

  for (const p of candidates) {
    try {
      const cleaned = await rewriteOne(p);
      results.push({ id: p.id, before: p.name, after: cleaned });
      if (!cleaned) { skipped++; continue; }
      if (body.dryRun) { continue; }
      const { error: upErr } = await supabase
        .from("products")
        .update({ name_clean: cleaned, name_clean_updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (upErr) { console.error("[sanitize] update failed", p.id, upErr); skipped++; continue; }
      updated++;
    } catch (e) {
      console.error("[sanitize] exception", p.id, e);
      skipped++;
    }
    // gentle pacing — keep AI gateway happy
    await new Promise((r) => setTimeout(r, 250));
  }

  return new Response(JSON.stringify({
    ok: true,
    traceId,
    message: `Sanitized ${updated}/${candidates.length} (skipped ${skipped})`,
    updated,
    skipped,
    total: candidates.length,
    sample: results.slice(0, 10),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});