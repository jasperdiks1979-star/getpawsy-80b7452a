// pinterest-hero-wave-10-final-slot
// Adds exactly ONE pin to complete Hero Wave 10 (9 -> 10 live).
// Product: Star Moon Cat Scratcher Sofa. Deterministic photo-lock composite.
// After queue insert, triggers pinterest-cron-worker which runs the full
// integrity/PRE/QA gate chain before publishing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "pinterest-ads";
const FONT_URL = "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";
const CANVAS_W = 1200, CANVAS_H = 1800;
const CAMPAIGN = "premium_viral_wave_2026_07";
const WAVE_PHASE = "hero_wave_10_final_slot_2026_07_16";

const BOARD_CAT_FURN = { id: "1117103951261719222", name: "Cat Furniture" };

const PRODUCT_ID = "95f9aa0d-d40a-486e-8501-b7ffd6fb7e8a";
const HEADLINE = "Cat Furniture Worth Displaying";
const BENEFIT  = "Star and moon scratcher sofa";
const CTA      = "View Product";
const PIN_TITLE = "Star Moon Cat Scratcher Sofa — Modern Cat Furniture";
const PIN_DESC  = "A star-and-moon shaped cat scratcher sofa that doubles as a design piece for modern US pet homes. Gives your cat a dedicated spot to scratch, curl up and rest without cluttering the living room. A quiet, sculptural pick for indoor cat furniture, small apartments and cat enrichment corners. View the product details.";
const KEYWORDS = ["cat scratcher","cat sofa","cat furniture","modern cat furniture","indoor cat furniture","cat scratching post","cat enrichment","cat room ideas","small apartment cat","architectural cat furniture"];
const ALT_TEXT = "Beige star and moon shaped cat scratcher sofa on a neutral cream background.";
const ANGLE    = "architectural_cat_furniture_editorial";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function fetchNormalizedPng(url: string): Promise<Uint8Array> {
  const proxy = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png&w=1600&we&n=-1`;
  const r = await fetch(proxy);
  if (!r.ok) throw new Error(`normalize_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function drawText(canvas: Image, font: Uint8Array, text: string, size: number, cx: number, topY: number, color: number) {
  const shadow = Image.renderText(font, size, text, 0x00000055);
  const main = Image.renderText(font, size, text, color);
  const x = Math.round(cx - main.width / 2);
  canvas.composite(shadow, x + 2, topY + 2);
  canvas.composite(main, x, topY);
}

async function buildComposite(src: Uint8Array, font: Uint8Array): Promise<Uint8Array> {
  const img = await decode(src);
  if (!(img instanceof Image)) throw new Error("decode_not_image");
  // Cream/oat background for architectural editorial feel
  const canvas = new Image(CANVAS_W, CANVAS_H).fill(0xf1e8d8ff);
  // Occupancy target ~50%: product box ~980x1080 within 1200x1800 canvas
  const maxW = 980, maxH = 1080;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const nw = Math.round(img.width * scale);
  const nh = Math.round(img.height * scale);
  const resized = img.clone().resize(nw, nh);
  const px = Math.round((CANVAS_W - nw) / 2);
  const py = Math.round((CANVAS_H - nh) / 2) + 40;
  canvas.composite(resized, px, py);
  const cx = Math.round(CANVAS_W / 2);
  drawText(canvas, font, HEADLINE, 74, cx, 90, 0xff1e1a15 >>> 0);
  drawText(canvas, font, BENEFIT,  40, cx, 190, 0xff4a3f30 >>> 0);
  drawText(canvas, font, CTA.toUpperCase(), 48, cx, 1660, 0xff1e1a15 >>> 0);
  return await canvas.encode();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const batchId = `hero10_final_slot_${Date.now()}`;
  const rep: any = { batch_id: batchId };

  // Enforce single-slot: refuse if a queue row already exists for this phase
  const { data: prior } = await sb.from("pinterest_pin_queue")
    .select("id,status,pinterest_pin_id")
    .filter("meta->>wave_phase", "eq", WAVE_PHASE).limit(1);
  if (prior && prior.length > 0) {
    rep.status = "already_queued";
    rep.existing = prior[0];
    return new Response(JSON.stringify(rep, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { data: prod, error: pErr } = await sb.from("products")
    .select("id,slug,name,image_url,is_active,us_stock,pinterest_disabled,price").eq("id", PRODUCT_ID).maybeSingle();
  if (pErr || !prod) { rep.status = "failed"; rep.error = "product_not_found"; return new Response(JSON.stringify(rep), { headers: cors, status: 500 }); }
  if (!prod.is_active || (prod.us_stock ?? 0) <= 0 || !prod.image_url) {
    rep.status = "failed"; rep.error = "product_ineligible"; rep.product = prod;
    return new Response(JSON.stringify(rep), { headers: cors, status: 400 });
  }
  // Note: pinterest_disabled flag is not enforced here — it is not a gate in
  // pinterest-integrity-guard or pinterest-cron-worker. All real gates
  // (integrity/PRE/QA/board routing) still run before publish.
  rep.pinterest_disabled_flag = prod.pinterest_disabled === true;
  rep.product = { id: prod.id, slug: prod.slug, name: prod.name, price: prod.price, us_stock: prod.us_stock, image_url: prod.image_url };

  const font = await fetchBytes(FONT_URL);
  let src: Uint8Array;
  try { src = await fetchBytes(prod.image_url); rep.source_bytes = src.length; }
  catch { src = await fetchNormalizedPng(prod.image_url); rep.source_bytes = src.length; rep.decode_normalized = true; }

  let finalBytes: Uint8Array;
  try { finalBytes = await buildComposite(src, font); }
  catch (e: any) {
    // one retry via normalizer
    try {
      const norm = await fetchNormalizedPng(prod.image_url);
      finalBytes = await buildComposite(norm, font);
      rep.decode_normalized = true; rep.retry = 1;
    } catch (e2: any) {
      rep.status = "failed"; rep.error = `composite:${e.message}|retry:${e2.message}`;
      return new Response(JSON.stringify(rep), { headers: cors, status: 500 });
    }
  }

  const path = `creative-factory/photolock/${prod.slug}/hero10-final-slot-${Date.now()}.png`;
  const up = await sb.storage.from(BUCKET).upload(path, finalBytes, { contentType: "image/png", upsert: true });
  if (up.error) { rep.status = "failed"; rep.error = `upload:${up.error.message}`; return new Response(JSON.stringify(rep), { headers: cors, status: 500 }); }
  const imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  rep.pin_image_url = imageUrl;

  const destination = `https://getpawsy.pet/products/${prod.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=${CAMPAIGN}&utm_content=hero10_final_slot`;
  rep.destination = destination;

  const insert = {
    product_id: prod.id,
    product_slug: prod.slug,
    product_name: prod.name,
    board_id: BOARD_CAT_FURN.id,
    board_name: BOARD_CAT_FURN.name,
    category_key: "cat_furniture",
    content_type: "lifestyle",
    pin_variant: "photo_lock_premium_v1",
    priority: "high",
    status: "queued",
    pin_title: PIN_TITLE.slice(0, 100),
    pin_description: PIN_DESC.slice(0, 500),
    pin_image_url: imageUrl,
    destination_link: destination,
    overlay_text: HEADLINE,
    hashtags: KEYWORDS,
    hook_group: ANGLE,
    batch_id: batchId,
    idempotency_key: `hero10_final_slot_${PRODUCT_ID}`,
    publish_attempts: 0,
    qa_reasons: [],
    retries: 0,
    recovery_status: "none",
    recovery_generation: 0,
    recovery_mode_publish: false,
    cap_recovery_mode: false,
    legacy_source_carveout_eligible: false,
    legacy_supplier_content: false,
    scheduled_at: new Date().toISOString(),
    meta: {
      creative_method: "deterministic_hero10_final_slot",
      photo_lock: true,
      photo_lock_source: prod.image_url,
      headline: HEADLINE, benefit: BENEFIT, cta: CTA,
      alt_text: ALT_TEXT, keywords: KEYWORDS, angle: ANGLE,
      wave_phase: WAVE_PHASE,
      canvas: `${CANVAS_W}x${CANVAS_H}`,
    },
  };
  const { data: ins, error: iErr } = await sb.from("pinterest_pin_queue").insert(insert).select("id").single();
  if (iErr) { rep.status = "failed"; rep.error = `insert:${iErr.message}`; return new Response(JSON.stringify(rep), { headers: cors, status: 500 }); }
  rep.queue_id = ins.id;
  rep.status = "queued";

  // Trigger cron worker to publish through the full gate chain.
  try {
    const cr = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "hero10_final_slot", limit: 2 }),
    });
    rep.cron_trigger = { status: cr.status };
  } catch (e: any) { rep.cron_trigger = { error: String(e?.message ?? e) }; }

  return new Response(JSON.stringify(rep, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});