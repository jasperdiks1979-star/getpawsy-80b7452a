// pinterest-replace-two-lite
// Deterministic (no-AI) photo-lock composite for the 2 replacement pins.
// Fits the untouched PDP hero onto a 1000x1500 cream canvas, adds minimal
// headline + CTA overlay, updates the existing queue row and re-queues it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "pinterest-ads";
const FONT_URL = "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";
const CANVAS_W = 1000;
const CANVAS_H = 1500;
const BG_COLOR = 0xf4ecdfffn as unknown as number; // warm cream

interface Item {
  queue_id: string;
  headline: string;
  cta: string;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function drawTextWithShadow(
  canvas: Image, font: Uint8Array, text: string, fontSize: number,
  centerX: number, topY: number, color: number,
): void {
  const shadow = Image.renderText(font, fontSize, text, 0x00000066);
  const main = Image.renderText(font, fontSize, text, color);
  const x = Math.round(centerX - main.width / 2);
  canvas.composite(shadow, x + 2, topY + 2);
  canvas.composite(main, x, topY);
}

async function buildComposite(sourceBytes: Uint8Array, font: Uint8Array, headline: string, cta: string): Promise<Uint8Array> {
  const src = await decode(sourceBytes);
  if (!(src instanceof Image)) throw new Error("decode_not_image");
  // Cream 1000x1500 canvas
  const canvas = new Image(CANVAS_W, CANVAS_H).fill(0xf4ecdfff);
  // Target product area: 800 wide x 900 tall centered vertically
  const maxW = 800; const maxH = 900;
  const scale = Math.min(maxW / src.width, maxH / src.height);
  const newW = Math.round(src.width * scale);
  const newH = Math.round(src.height * scale);
  const resized = src.clone().resize(newW, newH);
  const px = Math.round((CANVAS_W - newW) / 2);
  const py = Math.round((CANVAS_H - newH) / 2);
  canvas.composite(resized, px, py);
  const cx = Math.round(CANVAS_W / 2);
  const headlineFont = Math.round(CANVAS_W * 0.072);
  const ctaFont = Math.round(CANVAS_W * 0.046);
  drawTextWithShadow(canvas, font, headline, headlineFont, cx, Math.round(CANVAS_H * 0.045), 0xff1e1a15 >>> 0);
  drawTextWithShadow(canvas, font, cta, ctaFont, cx, Math.round(CANVAS_H * 0.905), 0xff1e1a15 >>> 0);
  return await canvas.encode();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const payload = await req.json() as { items: Item[]; trigger_cron?: boolean };
  const font = await fetchBytes(FONT_URL);
  const results: any[] = [];
  for (const item of payload.items) {
    const rep: any = { queue_id: item.queue_id };
    try {
      const { data: row, error } = await sb.from("pinterest_pin_queue")
        .select("id, product_id, product_slug, meta").eq("id", item.queue_id).maybeSingle();
      if (error || !row) throw new Error("queue_row_not_found");
      const { data: prod } = await sb.from("products")
        .select("id, slug, image_url").eq("id", row.product_id).maybeSingle();
      if (!prod?.image_url) throw new Error("no_product_image");
      const srcBytes = await fetchBytes(prod.image_url);
      const finalBytes = await buildComposite(srcBytes, font, item.headline, item.cta);
      const path = `creative-factory/photolock/${prod.slug}/lite-${Date.now()}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, finalBytes, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error(`upload:${up.error.message}`);
      const imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const meta = { ...(row.meta as Record<string, unknown> || {}), creative_method: "deterministic_lite_composite", photo_lock: true, photo_lock_source: prod.image_url, headline: item.headline, cta: item.cta, lite_at: new Date().toISOString() };
      const { error: upErr } = await sb.from("pinterest_pin_queue").update({
        pin_image_url: imageUrl,
        status: "queued",
        priority: "high",
        publish_attempts: 0,
        qa_reasons: [],
        rejection_reason: null,
        overlay_text: item.headline,
        meta,
      }).eq("id", item.queue_id);
      if (upErr) throw new Error(`update:${upErr.message}`);
      rep.status = "requeued";
      rep.image_url = imageUrl;
    } catch (e: any) {
      rep.status = "failed";
      rep.error = String(e?.message ?? e);
    }
    results.push(rep);
  }
  if (payload.trigger_cron !== false && results.some((r) => r.status === "requeued")) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "replace_two_lite" }),
      });
    } catch { /* ignore */ }
  }
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});