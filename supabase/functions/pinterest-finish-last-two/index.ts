// pinterest-finish-last-two
// Terminal processor for the final 2 queue rows of the premium wave:
//   A) 71db5fc4-ad37-42a4-b5e9-518fa7d5a8d5 (Automatic Rolling Cat Ball)
//      -> re-queue only (no new render), trigger cron worker.
//   B) 82dc5f85-77ad-4c55-9f9d-738aac246295 (Interactive Catnip Squirrel)
//      -> single deterministic photo-lock composite (no AI regen of product):
//         center the original catalog product on a cream/beige 2:3 canvas
//         at 55-70% width with a soft natural shadow, then add ONLY the
//         approved headline + CTA overlay. Update pin, trigger cron worker.
// No new pins, no product selection, no other backlog.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "pinterest-ads";
const BALL_ID = "71db5fc4-ad37-42a4-b5e9-518fa7d5a8d5";
const SQUIRREL_ID = "82dc5f85-77ad-4c55-9f9d-738aac246295";

const SQUIRREL_HEADLINE = "Interactive Catnip Toy";
const SQUIRREL_CTA = "View Product";

const FONT_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";

// 2:3 vertical canvas — cream/beige Scandinavian neutral.
const CANVAS_W = 1200;
const CANVAS_H = 1800;
const CREAM = 0xf5eddfff >>> 0; // warm cream

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}_${url}`);
  return new Uint8Array(await r.arrayBuffer());
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

async function buildSquirrelComposite(sourceUrl: string): Promise<Uint8Array> {
  const [srcBytes, fontBytes] = await Promise.all([
    fetchBytes(sourceUrl),
    fetchBytes(FONT_URL),
  ]);
  const decoded = await decode(srcBytes);
  if (!(decoded instanceof Image)) throw new Error("decode_not_image");
  const src = decoded as Image;

  // Cream/beige base canvas.
  const canvas = new Image(CANVAS_W, CANVAS_H).fill(CREAM);

  // Fit product to ~65% canvas width preserving aspect ratio; cap height to
  // 60% canvas height so overlays have clean space top and bottom.
  const targetW = Math.round(CANVAS_W * 0.65);
  const targetH = Math.round(CANVAS_H * 0.6);
  const scale = Math.min(targetW / src.width, targetH / src.height);
  const drawW = Math.max(1, Math.round(src.width * scale));
  const drawH = Math.max(1, Math.round(src.height * scale));
  const product = src.clone().resize(drawW, drawH);

  // Soft natural shadow: translucent dark ellipse under the product.
  const shadow = new Image(drawW, Math.round(drawH * 0.18));
  for (let y = 0; y < shadow.height; y++) {
    for (let x = 0; x < shadow.width; x++) {
      const nx = (x / shadow.width) * 2 - 1;
      const ny = (y / shadow.height) * 2 - 1;
      const d = nx * nx + ny * ny;
      if (d < 1) {
        const a = Math.round((1 - d) * 90);
        shadow.setPixelAt(x + 1, y + 1, ((0x000000 << 8) | a) >>> 0);
      }
    }
  }
  const productX = Math.round((CANVAS_W - drawW) / 2);
  const productY = Math.round((CANVAS_H - drawH) / 2);
  canvas.composite(shadow, productX, productY + drawH - Math.round(shadow.height * 0.4));
  canvas.composite(product, productX, productY);

  // Deterministic minimal overlay — headline top, CTA bottom, dark warm text.
  const cx = Math.round(CANVAS_W / 2);
  const headlineFont = Math.round(CANVAS_W * 0.072);
  const ctaFont = Math.round(CANVAS_W * 0.048);
  drawTextWithShadow(
    canvas,
    fontBytes,
    SQUIRREL_HEADLINE,
    headlineFont,
    cx,
    Math.round(CANVAS_H * 0.055),
    0xff1e1a15 >>> 0,
  );
  drawTextWithShadow(
    canvas,
    fontBytes,
    SQUIRREL_CTA,
    ctaFont,
    cx,
    Math.round(CANVAS_H * 0.9),
    0xff1e1a15 >>> 0,
  );

  return await canvas.encode();
}

async function triggerCron(
  supabaseUrl: string,
  serviceKey: string,
  reason: string,
  queueId: string,
): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/pinterest-cron-worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger: reason, queue_id: queueId }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 800) };
  } catch (e) {
    return { error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const report: Record<string, unknown> = {};

  try {
    // ── A. BALL: re-queue only, no new render. ──
    const ball: Record<string, unknown> = { queue_id: BALL_ID };
    const { data: ballBefore } = await sb
      .from("pinterest_pin_queue")
      .select("status, pin_image_url, destination_link, board_id, board_name, meta")
      .eq("id", BALL_ID)
      .single();
    ball.previous_status = ballBefore?.status;
    ball.pin_image_url = ballBefore?.pin_image_url;
    ball.destination_link = ballBefore?.destination_link;

    const nowIso = new Date().toISOString();
    const scheduledAt = new Date(Date.now() - 60_000).toISOString();

    const { error: ballUpdErr } = await sb
      .from("pinterest_pin_queue")
      .update({
        status: "queued",
        priority: "high",
        scheduled_at: scheduledAt,
        publish_attempts: 0,
        publishing_started_at: null,
        rejection_reason: null,
        error_message: null,
        last_publish_error: null,
        qa_reasons: [],
        updated_at: nowIso,
      })
      .eq("id", BALL_ID);
    if (ballUpdErr) ball.update_error = ballUpdErr.message;
    ball.cron = await triggerCron(SUPABASE_URL, SERVICE_KEY, "finish_last_two_ball", BALL_ID);
    report.ball = ball;

    // ── B. SQUIRREL: single deterministic photo-lock composite + overlay. ──
    const squirrel: Record<string, unknown> = { queue_id: SQUIRREL_ID };
    const { data: sqRow, error: sqErr } = await sb
      .from("pinterest_pin_queue")
      .select("status, meta, destination_link, board_id, board_name, product_slug")
      .eq("id", SQUIRREL_ID)
      .single();
    if (sqErr || !sqRow) throw new Error(`squirrel_load:${sqErr?.message ?? "not_found"}`);
    squirrel.previous_status = sqRow.status;
    const sourceUrl = (sqRow.meta as any)?.photo_lock_source as string | undefined;
    if (!sourceUrl) throw new Error("squirrel_missing_photo_lock_source");
    squirrel.photo_lock_source = sourceUrl;

    const composite = await buildSquirrelComposite(sourceUrl);
    const path = `creative-factory/photolock/${sqRow.product_slug}/final-mat-only-${Date.now()}.png`;
    const up = await sb.storage.from(BUCKET).upload(path, composite, {
      contentType: "image/png",
      upsert: true,
    });
    if (up.error) throw new Error(`squirrel_upload:${up.error.message}`);
    const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    squirrel.pin_image_url = publicUrl;

    const meta = {
      ...(sqRow.meta ?? {}),
      photo_lock: true,
      photo_lock_method: "product_center_composite_2x3",
      photo_lock_finalized_at: nowIso,
      overlay_headline: SQUIRREL_HEADLINE,
      overlay_cta: SQUIRREL_CTA,
      ai_image_edits_used: 0,
    };
    const { error: sqUpdErr } = await sb
      .from("pinterest_pin_queue")
      .update({
        pin_image_url: publicUrl,
        overlay_text: SQUIRREL_HEADLINE,
        status: "queued",
        priority: "high",
        scheduled_at: scheduledAt,
        publish_attempts: 0,
        publishing_started_at: null,
        rejection_reason: null,
        error_message: null,
        last_publish_error: null,
        qa_reasons: [],
        meta,
        updated_at: nowIso,
      })
      .eq("id", SQUIRREL_ID);
    if (sqUpdErr) throw new Error(`squirrel_update:${sqUpdErr.message}`);
    squirrel.cron = await triggerCron(
      SUPABASE_URL,
      SERVICE_KEY,
      "finish_last_two_squirrel",
      SQUIRREL_ID,
    );
    report.squirrel = squirrel;

    // ── Terminal state re-read. ──
    const { data: after } = await sb
      .from("pinterest_pin_queue")
      .select(
        "id, status, pinterest_pin_id, posted_at, qa_reasons, rejection_reason, error_message, last_publish_error, publish_attempts, board_id, board_name, destination_link, pin_image_url",
      )
      .in("id", [BALL_ID, SQUIRREL_ID]);
    report.final = after;

    return new Response(JSON.stringify({ ok: true, ...report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    report.error = String((e as Error).message ?? e);
    return new Response(JSON.stringify({ ok: false, ...report }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});