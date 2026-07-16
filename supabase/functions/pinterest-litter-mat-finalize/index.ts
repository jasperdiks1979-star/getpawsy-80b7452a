// pinterest-litter-mat-finalize
// One-shot deterministic finalizer for queue ID
// c67b4f77-37e1-4280-9db9-8048ab483ce5 (Double-Layer Rice Cat Litter Mat).
// Loads the already-rendered mat-only composite, adds ONLY a minimal
// headline + CTA text overlay (dark text with soft shadow, no bars, no
// badges), uploads a new PNG, flips the queue row to queued/high, and
// invokes the cron worker to attempt a single publish. No AI, no product
// regeneration. Fail-closed on all standard gates (QA/PRE/integrity).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "pinterest-ads";
const QUEUE_ID = "c67b4f77-37e1-4280-9db9-8048ab483ce5";
const SOURCE_URL =
  "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/double-layer-rice-cat-litter-mat/final-mat-only-1784204244640.png";
const FONT_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";

const HEADLINE = "Double-Layer Litter Mat";
const CTA = "View Product";

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
  // Render shadow (semi-transparent black), offset a few pixels, then main text.
  const shadow = Image.renderText(font, fontSize, text, 0x00000080);
  const main = Image.renderText(font, fontSize, text, color);
  const x = Math.round(centerX - main.width / 2);
  canvas.composite(shadow, x + 3, topY + 3);
  canvas.composite(main, x, topY);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const report: Record<string, unknown> = { queue_id: QUEUE_ID };

  try {
    // 1. Load queue row
    const { data: row, error: rowErr } = await sb
      .from("pinterest_pin_queue")
      .select(
        "id, product_slug, product_name, destination_link, board_id, board_name, meta, status",
      )
      .eq("id", QUEUE_ID)
      .single();
    if (rowErr || !row) throw new Error(`queue_load:${rowErr?.message ?? "not_found"}`);
    report.previous_status = row.status;

    // 2. Load source composite + font in parallel
    const [imgBytes, fontBytes] = await Promise.all([
      fetchBytes(SOURCE_URL),
      fetchBytes(FONT_URL),
    ]);
    const decoded = await decode(imgBytes);
    if (!(decoded instanceof Image)) throw new Error("decode_not_image");
    const canvas = decoded as Image;
    report.canvas = { width: canvas.width, height: canvas.height };

    // 3. Draw headline top (well above centered product), CTA bottom.
    //    Dark warm text (#1E1A15) with soft black shadow — no bars, no badges.
    const cx = Math.round(canvas.width / 2);
    const headlineFont = Math.round(canvas.width * 0.072); // ~86px on 1200
    const ctaFont = Math.round(canvas.width * 0.048); // ~58px on 1200
    const headlineTopY = Math.round(canvas.height * 0.055);
    const ctaTopY = Math.round(canvas.height * 0.90);
    drawTextWithShadow(
      canvas,
      fontBytes,
      HEADLINE,
      headlineFont,
      cx,
      headlineTopY,
      0xff1e1a15 >>> 0,
    );
    drawTextWithShadow(
      canvas,
      fontBytes,
      CTA,
      ctaFont,
      cx,
      ctaTopY,
      0xff1e1a15 >>> 0,
    );

    // 4. Encode + upload
    const out = await canvas.encode();
    const path = `creative-factory/photolock/double-layer-rice-cat-litter-mat/final-with-overlay-${Date.now()}.png`;
    const up = await sb.storage.from(BUCKET).upload(path, out, {
      contentType: "image/png",
      upsert: true,
    });
    if (up.error) throw new Error(`upload:${up.error.message}`);
    const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    report.pin_image_url = publicUrl;

    // 5. Update queue row: queued + high, deterministic overlay copy,
    //    reset publish attempts so the cron worker picks it up cleanly.
    const now = new Date().toISOString();
    const scheduledAt = new Date(Date.now() - 60_000).toISOString();
    const meta = {
      ...(row.meta ?? {}),
      photo_lock: true,
      photo_lock_method: "mat_only_center_composite_with_text",
      photo_lock_source: SOURCE_URL,
      photo_lock_finalized_at: now,
      overlay_headline: HEADLINE,
      overlay_cta: CTA,
    };
    const { error: updErr } = await sb
      .from("pinterest_pin_queue")
      .update({
        pin_image_url: publicUrl,
        overlay_text: HEADLINE, // ≤32 chars, no `|` / `•`
        cta: CTA,
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
        updated_at: now,
      })
      .eq("id", QUEUE_ID);
    if (updErr) throw new Error(`queue_update:${updErr.message}`);

    // 6. Trigger cron worker (single attempt, no auto-retry).
    let cron: Record<string, unknown> = {};
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trigger: "litter_mat_finalize", queue_id: QUEUE_ID }),
      });
      cron = { status: r.status, body: (await r.text()).slice(0, 1500) };
    } catch (e) {
      cron = { error: String((e as Error).message ?? e) };
    }
    report.cron = cron;

    // 7. Re-read row for terminal state.
    const { data: after } = await sb
      .from("pinterest_pin_queue")
      .select(
        "status, pinterest_pin_id, posted_at, qa_reasons, rejection_reason, error_message, last_publish_error, publish_attempts",
      )
      .eq("id", QUEUE_ID)
      .single();
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