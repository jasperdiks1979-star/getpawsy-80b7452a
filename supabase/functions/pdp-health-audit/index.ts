import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Audit = {
  product_id: string;
  title_score: number; trust_score: number; mobile_score: number;
  urgency_score: number; cta_score: number; reviews_score: number;
  faq_score: number; seo_score: number; cwv_score: number;
  overall_score: number;
  issues: string[]; suggestions: string[];
};

function auditProduct(p: any, cwv: number): Audit {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const titleLen = (p.name || "").length;
  const title_score = titleLen >= 30 && titleLen <= 70 ? 100 : titleLen > 0 ? 60 : 0;
  if (title_score < 100) { issues.push("Title length not optimal"); suggestions.push("Aim for 30-70 chars in product name"); }

  const imgCount = Array.isArray(p.images) ? p.images.length : 0;
  const trust_score = (p.cost_price ? 25 : 0) + (imgCount >= 3 ? 25 : 0) + (p.is_fast_shipping ? 25 : 0) + (p.shipping_days_max ? 25 : 0);
  if (trust_score < 75) { issues.push("Missing trust signals"); suggestions.push("Add 3+ images & shipping data"); }

  const mobile_score = (imgCount > 0 ? 50 : 0) + (p.image_url ? 50 : 0);

  const stock = Number(p.effective_stock ?? p.stock ?? 0);
  const urgency_score = stock > 0 && stock < 20 ? 100 : stock >= 20 ? 70 : 30;
  const cta_score = p.is_active && stock > 0 ? 100 : 40;
  const reviews_score = 50; // placeholder until reviews table joined

  const faq_score = 50; // PDP renders shared FAQ; per-product FAQ optional

  const seo_score = (p.meta_title ? 30 : 0) + (p.meta_description ? 30 : 0) + (p.seo_keywords ? 20 : 0) + (p.image_alt_text ? 20 : 0);
  if (seo_score < 80) { issues.push("Incomplete SEO metadata"); suggestions.push("Fill meta_title, meta_description, alt text"); }

  const cwv_score = cwv;

  const overall = Math.round(
    title_score * 0.1 + trust_score * 0.15 + mobile_score * 0.1 + urgency_score * 0.05 +
    cta_score * 0.1 + reviews_score * 0.15 + faq_score * 0.1 + seo_score * 0.15 + cwv_score * 0.1
  );

  return {
    product_id: p.id,
    title_score, trust_score, mobile_score, urgency_score, cta_score,
    reviews_score, faq_score, seo_score, cwv_score,
    overall_score: overall, issues, suggestions,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "top"; // top | full
    const limit = mode === "full" ? 1000 : 100;

    let q = supabase.from("products")
      .select("id, name, image_url, images, cost_price, is_fast_shipping, shipping_days_max, effective_stock, stock, meta_title, meta_description, seo_keywords, image_alt_text, is_active, revenue_priority_score_v2")
      .eq("is_active", true)
      .order("revenue_priority_score_v2", { ascending: false, nullsFirst: false })
      .limit(limit);
    const { data: products, error } = await q;
    if (error) throw error;

    // Average CWV last 7d
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: vitals } = await supabase.from("web_vitals").select("lcp").gte("created_at", since).limit(500);
    const avgLcp = (vitals ?? []).reduce((s: number, v: any) => s + Number(v.lcp || 0), 0) / Math.max(1, vitals?.length ?? 1);
    const cwvScore = avgLcp > 0 && avgLcp < 2500 ? 100 : avgLcp < 4000 ? 60 : 30;

    let inserted = 0;
    const rows = (products ?? []).map((p: any) => auditProduct(p, cwvScore));
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("pdp_health_audits").insert(rows);
      if (!insErr) inserted = rows.length;
    }

    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.overall_score, 0) / rows.length) : 0;
    return new Response(JSON.stringify({ ok: true, mode, audited: inserted, average_score: avg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});