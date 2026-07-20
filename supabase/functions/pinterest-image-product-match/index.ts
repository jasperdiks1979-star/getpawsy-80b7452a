/**
 * pinterest-image-product-match — admin-only. For each pin in
 * pinterest_pin_queue, compute an overall image↔product consistency score
 * (0–100) by combining:
 *   - 40 pts: Lovable AI vision verdict comparing pin image vs product image
 *   - 25 pts: category alignment (pin's inferred niche vs product.category)
 *   - 20 pts: title keyword overlap (Jaccard)
 *   - 15 pts: tag/description keyword overlap (Jaccard)
 *
 * Verdict: exact_match (≥90), close_match (80–89), partial_match (60–79),
 * mismatch (<60). Results upserted into pinterest_pin_image_match. The
 * per-pin score is also mirrored to pinterest_pin_queue.image_match_score.
 *
 * Body: { batch_size?: number, max_pages?: number, status_in?: string[],
 *         rescore?: boolean }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const STOPWORDS = new Set([
  "the","a","an","and","or","but","for","with","in","on","at","to","of","is",
  "are","was","were","be","been","pet","pets","dog","cat","best","top","new",
  "premium","your","you","this","that","from","get","buy","shop","by",
]);

function tokens(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function verdictOf(score: number): string {
  if (score >= 90) return "exact_match";
  if (score >= 80) return "close_match";
  if (score >= 60) return "partial_match";
  return "mismatch";
}

async function visionCompare(pinImage: string, productImage: string, productName: string): Promise<{ verdict: string; score: number; reason: string }> {
  if (!pinImage || !productImage) {
    return { verdict: "unknown", score: 0, reason: "missing_image" };
  }
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You judge whether a Pinterest pin image shows the same product as a product reference image. Respond ONLY with strict JSON {\"verdict\":\"exact_match|close_match|partial_match|mismatch\",\"reason\":\"<short>\"}. Use 'mismatch' if species or product category differ (e.g. dog image vs cat product, generic lifestyle vs specific listing).",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Product: ${productName}. Compare pin (1) vs product reference (2). Return JSON only.` },
              { type: "image_url", image_url: { url: pinImage } },
              { type: "image_url", image_url: { url: productImage } },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      await r.text();
      return { verdict: "unknown", score: 0, reason: `ai_${r.status}` };
    }
    const json = await r.json();
    const txt = (json.choices?.[0]?.message?.content || "").trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { verdict: "unknown", score: 0, reason: "no_json" };
    const parsed = JSON.parse(m[0]);
    const v = String(parsed.verdict || "").toLowerCase();
    const score =
      v === "exact_match" ? 40 :
      v === "close_match" ? 32 :
      v === "partial_match" ? 20 : 0;
    return { verdict: v || "unknown", score, reason: String(parsed.reason || "") };
  } catch (e) {
    return { verdict: "unknown", score: 0, reason: `error:${(e as Error).message}` };
  }
}

function categoryScore(pinTitle: string, pinDesc: string, productCategory: string | null): number {
  if (!productCategory) return 0;
  const cat = productCategory.toLowerCase().replace(/[-_]/g, " ");
  const hay = `${pinTitle || ""} ${pinDesc || ""}`.toLowerCase();
  const catTokens = cat.split(/\s+/).filter((t) => t.length > 2);
  if (catTokens.length === 0) return 0;
  const hits = catTokens.filter((t) => hay.includes(t)).length;
  return Math.round((hits / catTokens.length) * 25);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roleCheck } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleCheck) return new Response(JSON.stringify({ ok: false, traceId, message: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: any = {}; try { body = await req.json(); } catch {}
  const batchSize = Math.min(Number(body.batch_size) || 25, 50);
  const maxPages = Math.min(Number(body.max_pages) || 8, 40);
  const statusIn: string[] = Array.isArray(body.status_in) && body.status_in.length
    ? body.status_in
    : ["posted", "queued", "draft", "publishing", "failed"];
  const rescore = !!body.rescore;

  const buckets: Record<string, number> = { exact_match: 0, close_match: 0, partial_match: 0, mismatch: 0, skipped: 0 };
  let processed = 0;

  for (let page = 0; page < maxPages; page++) {
    const from = page * batchSize;
    const to = from + batchSize - 1;
    const { data: pins } = await sb
      .from("pinterest_pin_queue")
      .select("id, product_id, pin_title, pin_description, pin_image_url, image_match_score")
      .in("status", statusIn)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (!pins || pins.length === 0) break;

    for (const pin of pins) {
      if (!rescore && pin.image_match_score != null) { buckets.skipped++; continue; }
      if (!pin.product_id || !pin.pin_image_url) { buckets.skipped++; continue; }

      const { data: product } = await sb
        .from("products")
        .select("name, description, category, image_url, slug")
        .eq("id", pin.product_id)
        .maybeSingle();
      if (!product) { buckets.skipped++; continue; }

      const vision = await visionCompare(pin.pin_image_url, product.image_url || "", product.name || "");
      const cat = categoryScore(pin.pin_title || "", pin.pin_description || "", product.category);
      const titleJ = jaccard(tokens(pin.pin_title || ""), tokens(product.name || ""));
      const titleScore = Math.round(titleJ * 20);
      const descJ = jaccard(tokens(pin.pin_description || ""), tokens(product.description || ""));
      const tagScore = Math.round(descJ * 15);

      const total = Math.min(100, vision.score + cat + titleScore + tagScore);
      const verdict = verdictOf(total);
      buckets[verdict] = (buckets[verdict] || 0) + 1;
      processed++;

      await sb.from("pinterest_pin_image_match").upsert({
        pin_queue_id: pin.id,
        score: total,
        verdict,
        vision_verdict: vision.verdict,
        category_score: cat,
        title_score: titleScore,
        tag_score: tagScore,
        reasons: [
          { kind: "vision", verdict: vision.verdict, reason: vision.reason, weight: vision.score },
          { kind: "category", score: cat },
          { kind: "title_jaccard", score: titleScore, j: titleJ.toFixed(2) },
          { kind: "desc_jaccard", score: tagScore, j: descJ.toFixed(2) },
        ],
        scored_at: new Date().toISOString(),
      }, { onConflict: "pin_queue_id" });
      await sb.from("pinterest_pin_queue").update({ image_match_score: total }).eq("id", pin.id);
    }
    if (pins.length < batchSize) break;
  }

  return new Response(JSON.stringify({ ok: true, traceId, processed, summary: buckets }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});