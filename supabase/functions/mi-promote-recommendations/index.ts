import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

// === Inline compliance gate (mirrored from mi-compliance-gate) ===
const BANNED_TERMS: RegExp[] = [
  /\bvet[-\s]?approved\b/i, /\bclinically\s+proven\b/i, /\bguaranteed\b/i,
  /\b#\s*1\b/i, /\beco[-\s]?friendly\b/i, /\bsustainable\b/i,
  /\bdropship(ping)?\b/i, /\bcures?\b/i,
  /\btreats?\s+(anxiety|depression|disease)\b/i, /\bmiracle\b/i,
  /\b100%\s+(safe|natural|organic)\b/i, /\bnext[-\s]?day\s+delivery\b/i,
];
function fingerprint(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).slice(0, 12).join(" ");
}
function bannedHits(text: string): string[] {
  const hits: string[] = [];
  for (const r of BANNED_TERMS) { const m = text.match(r); if (m) hits.push(m[0]); }
  return hits;
}
async function checkImage(url: string | null | undefined) {
  if (!url) return { ok: false, reason: "missing_image" };
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: "invalid_protocol" };
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return { ok: false, reason: `image_status_${r.status}` };
    const ct = r.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return { ok: false, reason: "not_image_content_type" };
    return { ok: true };
  } catch (e: any) { return { ok: false, reason: `image_fetch_error` }; }
}
async function runGate(sb: any, input: { product: any; pin_title: string; pin_description: string; caption: string }) {
  const reasons: string[] = [];
  if (!input.product.active) reasons.push("product_inactive");
  if (input.product.price == null || Number(input.product.price) <= 0) reasons.push("invalid_price");
  const banned = bannedHits(`${input.pin_title}\n${input.pin_description}\n${input.caption}`);
  if (banned.length) reasons.push(`banned_terms:${banned.join("|")}`);
  if (input.pin_title.length < 8) reasons.push("title_too_short");
  if (input.pin_description.length < 20) reasons.push("description_too_short");
  const img = await checkImage(input.product.image_url);
  if (!img.ok) reasons.push(img.reason || "image_invalid");
  const pinFp = fingerprint(`${input.pin_title} ${input.pin_description}`);
  const tkFp = fingerprint(input.caption);
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [{ data: pinDup }, { data: tkDup }] = await Promise.all([
    sb.from("pinterest_pin_queue").select("id,pin_title,pin_description,created_at").eq("product_id", input.product.id).gte("created_at", since).limit(50),
    sb.from("tiktok_post_queue").select("id,caption,created_at").eq("product_id", input.product.id).gte("created_at", since).limit(50),
  ]);
  if ((pinDup ?? []).some((r: any) => fingerprint(`${r.pin_title} ${r.pin_description}`) === pinFp)) reasons.push("duplicate_pin_fingerprint_14d");
  if ((tkDup ?? []).some((r: any) => fingerprint(r.caption) === tkFp)) reasons.push("duplicate_tiktok_fingerprint_14d");
  return { pass: reasons.length === 0, reasons };
}

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

    // Compliance & QA gate (banned terms, image validity, dedup fingerprint)
    const gate = await runGate(sb, {
      product: c.product,
      pin_title: pinTitle,
      pin_description: pinDesc,
      caption,
    });
    promotion.gate_pass = gate.pass;
    promotion.gate_reasons = gate.reasons;

    if (!gate.pass) {
      if (!dryRun) {
        await sb.from("mi_recommendations")
          .update({ status: "blocked", evidence_refs: [...(c.rec.evidence_refs ?? []), { gate_blocked: gate.reasons }] })
          .eq("id", c.rec.id);
      }
      results.push(promotion);
      continue;
    }

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
        qa_reasons: ["mi_gate_passed"],
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