// pinterest-premium-wave-5
// Deterministic photo-locked premium Pinterest wave for a fixed set of 5 products.
// For each item: (1) AI edit-extends the real catalog photo to 2:3 with a premium
// neutral background (product itself untouched), (2) draws minimal headline + CTA
// overlay with soft shadow (no bars/badges), (3) uploads PNG, (4) inserts a
// pinterest_pin_queue row with all copy/SEO/board metadata, status=queued,
// priority=high, (5) triggers the cron worker for immediate publish.
// No product regeneration. No Shopify. No auto-retry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash-image";
const BUCKET = "pinterest-ads";
const FONT_URL = "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";

const EDIT_INSTRUCTION = [
  "Extend this product photo into a vertical 2:3 (1000x1500) Pinterest pin.",
  "Do NOT change the product itself: keep exact shape, color, materials, parts, proportions, and accessories identical to the source.",
  "No product replacement. No new product. No new animals. No text overlays. No badges. No logos.",
  "Only enrich the background: soft premium neutral cream / beige / oat / warm-white interior tone, subtle natural light from top-left, gentle contact shadow beneath the product.",
  "Keep the product centered, occupying 35-55% of the canvas. Leave clear negative space at the top ~12% and bottom ~12% for headline and CTA text.",
  "Photorealistic, US premium home lifestyle, mobile-legible, minimal, uncluttered.",
].join(" ");

interface Item {
  product_id: string;
  headline: string;         // ≤ 6 words, ≤ 32 chars
  benefit: string;          // ≤ 10 words
  cta: string;              // View Product | Shop the Look | Explore More | See Details | Discover Now
  seo_title: string;        // 45-70 chars
  seo_description: string;  // 250-450 chars
  keywords: string[];
  alt_text: string;
  board_id: string;
  board_name: string;
  category_key: string;
  utm_content: string;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function toBase64(buf: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return btoa(bin);
}

async function editImage(apiKey: string, sourceUrl: string): Promise<Uint8Array> {
  const r = await fetch(sourceUrl);
  if (!r.ok) throw new Error(`image_fetch_${r.status}`);
  const mime = r.headers.get("content-type") || "image/jpeg";
  const b64 = toBase64(new Uint8Array(await r.arrayBuffer()));
  const body = {
    model: AI_MODEL,
    modalities: ["image", "text"],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: EDIT_INSTRUCTION },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
      ],
    }],
  };
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`ai_${res.status}:${txt.slice(0, 300)}`);
  const json = JSON.parse(txt);
  const first = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
  if (!first?.startsWith("data:")) throw new Error("ai_no_image");
  const raw = first.split(",", 2)[1];
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function drawTextWithShadow(
  canvas: Image,
  font: Uint8Array,
  text: string,
  fontSize: number,
  centerX: number,
  topY: number,
  color: number,
): void {
  const shadow = Image.renderText(font, fontSize, text, 0x00000080);
  const main = Image.renderText(font, fontSize, text, color);
  const x = Math.round(centerX - main.width / 2);
  canvas.composite(shadow, x + 3, topY + 3);
  canvas.composite(main, x, topY);
}

async function overlayText(
  imgBytes: Uint8Array,
  fontBytes: Uint8Array,
  headline: string,
  cta: string,
): Promise<Uint8Array> {
  const decoded = await decode(imgBytes);
  if (!(decoded instanceof Image)) throw new Error("decode_not_image");
  const canvas = decoded as Image;
  const cx = Math.round(canvas.width / 2);
  const headlineFont = Math.round(canvas.width * 0.068);
  const ctaFont = Math.round(canvas.width * 0.044);
  const headlineTopY = Math.round(canvas.height * 0.045);
  const ctaTopY = Math.round(canvas.height * 0.905);
  drawTextWithShadow(canvas, fontBytes, headline, headlineFont, cx, headlineTopY, 0xff1e1a15 >>> 0);
  drawTextWithShadow(canvas, fontBytes, cta, ctaFont, cx, ctaTopY, 0xff1e1a15 >>> 0);
  return await canvas.encode();
}

async function runWave(
  sb: ReturnType<typeof createClient>,
  SUPABASE_URL: string,
  SERVICE_KEY: string,
  LOVABLE_API_KEY: string,
  items: Item[],
  waveId: string,
  triggerCron: boolean,
): Promise<void> {
  const fontBytes = await fetchBytes(FONT_URL);
  const productIds = items.map((i) => i.product_id);
  const { data: products } = await sb.from("products")
    .select("id, slug, name, image_url, stock, is_active, primary_species, category")
    .in("id", productIds);
  const productById = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));
  const results: any[] = [];
  for (const item of items) {
    const rep: any = { product_id: item.product_id };
    try {
      const prod = productById.get(item.product_id);
      if (!prod) throw new Error("product_not_found");
      if (!prod.is_active) throw new Error("product_inactive");
      if (!prod.stock || prod.stock <= 0) throw new Error("product_out_of_stock");
      if (!prod.image_url) throw new Error("no_product_image");
      rep.slug = prod.slug;
      const extBytes = await editImage(LOVABLE_API_KEY, prod.image_url);
      const finalBytes = await overlayText(extBytes, fontBytes, item.headline, item.cta);
      const path = `creative-factory/premium-wave/${prod.slug}/${Date.now()}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, finalBytes, {
        contentType: "image/png", upsert: true,
      });
      if (up.error) throw new Error(`upload:${up.error.message}`);
      const imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const destination =
        `https://getpawsy.pet/products/${prod.slug}` +
        `?utm_source=pinterest&utm_medium=organic&utm_campaign=${waveId}` +
        `&utm_content=${encodeURIComponent(item.utm_content)}`;
      const now = new Date().toISOString();
      const scheduledAt = new Date(Date.now() - 60_000).toISOString();
      const idempotencyKey = `premium_wave_${waveId}_${item.product_id}_${Date.now()}`;
      const insertRow: Record<string, unknown> = {
        product_id: prod.id,
        product_slug: prod.slug,
        product_name: prod.name,
        pin_variant: "photo_lock_premium_v1",
        pin_title: item.seo_title,
        pin_description: item.seo_description,
        pin_image_url: imageUrl,
        destination_link: destination,
        board_id: item.board_id,
        board_name: item.board_name,
        hashtags: item.keywords,
        priority: "high",
        status: "queued",
        scheduled_at: scheduledAt,
        hook_group: "premium_photo_lock",
        category_key: item.category_key,
        overlay_text: item.headline,
        content_type: "lifestyle",
        idempotency_key: idempotencyKey,
        creative_source_tracked: "premium_wave_5_2026_07_16",
        batch_id: waveId,
        source_type: "lifestyle_ai",
        meta: {
          creative_method: "safe_background_extension",
          photo_lock: true,
          photo_lock_source: prod.image_url,
          photo_lock_at: now,
          headline: item.headline,
          benefit: item.benefit,
          cta: item.cta,
          seo_keywords: item.keywords,
          alt_text: item.alt_text,
          wave_id: waveId,
        },
        qa_reasons: [],
        publish_attempts: 0,
      };
      const { error: insErr } = await sb.from("pinterest_pin_queue").insert(insertRow);
      if (insErr) throw new Error(`insert:${insErr.message}`);
      rep.status = "queued";
      console.log(`[wave] queued ${prod.slug} -> ${imageUrl}`);
    } catch (e: any) {
      rep.error = String(e?.message ?? e);
      rep.status = "failed";
      console.error(`[wave] failed ${item.product_id}: ${rep.error}`);
    }
    results.push(rep);
  }
  if (triggerCron && results.some((r) => r.status === "queued")) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "premium_wave_5" }),
      });
    } catch (e: any) {
      console.error("[wave] cron trigger failed", e?.message ?? e);
    }
  }
  console.log(`[wave] done. queued=${results.filter((r) => r.status === "queued").length} failed=${results.filter((r) => r.status === "failed").length}`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  return req.json().then((payload: { items: Item[]; wave_id?: string; trigger_cron?: boolean }) => {
    const items = payload.items || [];
    const waveId = payload.wave_id || "premium_pin_wave_2026_07_02";
    const triggerCron = payload.trigger_cron !== false;
    if (items.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "items[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // @ts-ignore EdgeRuntime is provided by Supabase Deno
    EdgeRuntime.waitUntil(runWave(sb, SUPABASE_URL, SERVICE_KEY, LOVABLE_API_KEY, items, waveId, triggerCron));
    return new Response(JSON.stringify({ ok: true, accepted: items.length, wave_id: waveId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  });
});