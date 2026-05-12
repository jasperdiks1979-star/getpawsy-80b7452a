import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Rec = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  confidence: number;
  evidence_refs: any[];
};

function readinessScore(opts: {
  recipeScore: number;
  trendMomentum: number;
  confidence: number;
  hasImage: boolean;
  hasPrice: boolean;
  isActive: boolean;
}): number {
  let s = 0;
  s += Math.min(1, opts.recipeScore) * 30;
  s += Math.min(1, opts.trendMomentum / 100) * 20;
  s += Math.min(1, opts.confidence / 100) * 20;
  if (opts.hasImage) s += 10;
  if (opts.hasPrice) s += 10;
  if (opts.isActive) s += 10;
  return Math.round(s);
}

function buildPinTitle(productName: string, hookFamily: string | null): string {
  const hf = (hookFamily || "").toLowerCase();
  if (hf.includes("curiosity")) return `Why pet parents love ${productName}`;
  if (hf.includes("benefit")) return `${productName} — calmer pets, happier homes`;
  if (hf.includes("pain")) return `Solve it with ${productName}`;
  return `${productName} — pet parent favorite`;
}

function buildCaption(productName: string, body: string): string {
  const trimmed = (body || "").slice(0, 140);
  return `${productName}\n${trimmed}\n#pets #petparents #petsoftiktok`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const minReadiness = Number(body?.min_readiness ?? 60);
  const maxPromote = Math.min(20, Number(body?.max_promote ?? 8));
  const dryRun = Boolean(body?.dry_run);

  const { data: recs, error: recErr } = await sb
    .from("mi_recommendations")
    .select("id,title,body,category,confidence,evidence_refs")
    .eq("market", "US")
    .eq("status", "new")
    .order("confidence", { ascending: false })
    .limit(50);
  if (recErr) {
    return new Response(JSON.stringify({ ok: false, traceId, message: recErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates: Array<{ rec: Rec; ev: any; score: number; product: any; recipe: any; trend: any }> = [];

  for (const rec of (recs ?? []) as Rec[]) {
    const ev = (rec.evidence_refs ?? [])[0] || {};
    if (!ev.product_id || !ev.recipe_id) continue;

    const [{ data: product }, { data: recipe }, { data: trend }] = await Promise.all([
      sb.from("products").select("id,name,slug,image_url,price,active").eq("id", ev.product_id).maybeSingle(),
      sb.from("mi_creative_recipes").select("id,name,hook_family,score").eq("id", ev.recipe_id).maybeSingle(),
      ev.trend_id
        ? sb.from("mi_trends").select("id,term,momentum,category").eq("id", ev.trend_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    if (!product || !recipe) continue;

    const score = readinessScore({
      recipeScore: Number(recipe.score) || 0,
      trendMomentum: Number(trend?.momentum) || 0,
      confidence: Number(rec.confidence) || 0,
      hasImage: Boolean(product.image_url),
      hasPrice: product.price != null && Number(product.price) > 0,
      isActive: Boolean(product.active),
    });

    candidates.push({ rec, ev, score, product, recipe, trend });
  }

  candidates.sort((a, b) => b.score - a.score);
  const ready = candidates.filter((c) => c.score >= minReadiness).slice(0, maxPromote);

  const results: any[] = [];

  for (const c of ready) {
    const dest = `https://getpawsy.pet/products/${c.product.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=mi_promote`;
    const pinTitle = buildPinTitle(c.product.name, c.recipe.hook_family).slice(0, 100);
    const pinDesc = (c.rec.body || c.product.name).slice(0, 480);
    const caption = buildCaption(c.product.name, c.rec.body);

    const promotion: any = {
      recommendation_id: c.rec.id,
      product_id: c.product.id,
      readiness_score: c.score,
    };

    if (!dryRun) {
      const { data: pin, error: pinErr } = await sb.from("pinterest_pin_queue").insert({
        product_id: c.product.id,
        product_slug: c.product.slug,
        product_name: c.product.name,
        pin_variant: "mi_promote",
        pin_title: pinTitle,
        pin_description: pinDesc,
        pin_image_url: c.product.image_url,
        destination_link: dest,
        status: "draft",
        priority: "high",
        hook_group: c.recipe.hook_family,
        category_key: c.trend?.category ?? null,
        meta: { source: "mi_promote", recipe_id: c.recipe.id, trend_id: c.trend?.id, recommendation_id: c.rec.id, readiness: c.score },
      }).select("id").maybeSingle();
      promotion.pinterest_pin_id = pin?.id ?? null;
      promotion.pinterest_error = pinErr?.message ?? null;

      const { data: tk, error: tkErr } = await sb.from("tiktok_post_queue").insert({
        product_id: c.product.id,
        product_slug: c.product.slug,
        product_name: c.product.name,
        post_variant: c.recipe.hook_family || "hook",
        caption,
        hashtags: ["pets", "petparents", "petsoftiktok"],
        destination_link: dest,
        status: "draft",
        priority: "high",
        tracking_params: { source: "mi_promote", recipe_id: c.recipe.id, trend_id: c.trend?.id, recommendation_id: c.rec.id, readiness: c.score },
      }).select("id").maybeSingle();
      promotion.tiktok_post_id = tk?.id ?? null;
      promotion.tiktok_error = tkErr?.message ?? null;

      await sb.from("mi_recommendations").update({ status: "promoted" }).eq("id", c.rec.id);
    }

    results.push(promotion);
  }

  return new Response(JSON.stringify({
    ok: true, traceId,
    message: dryRun ? "dry-run readiness preview" : "promotion complete",
    evaluated: candidates.length,
    promoted: results.length,
    min_readiness: minReadiness,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});