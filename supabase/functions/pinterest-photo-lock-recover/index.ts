// pinterest-photo-lock-recover
// Deterministic product-photo-locked recovery for a fixed set of queue IDs.
// Uses the actual product catalog image, extends to Pinterest 2:3 with a
// premium neutral background via Gemini image-edit, and flips the queue rows
// to approved so the standard cron worker publishes them. Never regenerates
// the product itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash-image";
const BUCKET = "pinterest-ads";

const EDIT_INSTRUCTION = [
  "Extend this photo into a vertical 2:3 (1000x1500) Pinterest pin.",
  "Do NOT change the product itself: keep the exact product shape, color, size ratio, materials, parts, and accessories identical to the source.",
  "No product replacement. No new product. No new animals. No text overlays.",
  "Only enrich the background: soft premium neutral cream/beige/oat interior tone, gentle natural light, subtle contact shadow.",
  "Keep the product centered, occupying 25–45% of the canvas. Photorealistic, US home lifestyle, clean and mobile-legible.",
].join(" ");

async function fetchImageBase64(url: string): Promise<{ data: string; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image_fetch_failed_${res.status}`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return { data: btoa(bin), mime };
}

async function editImage(apiKey: string, sourceB64: string, sourceMime: string): Promise<Uint8Array> {
  const body = {
    model: AI_MODEL,
    modalities: ["image", "text"],
    messages: [{
      role: "user",
      content: [
        { type: "text", text: EDIT_INSTRUCTION },
        { type: "image_url", image_url: { url: `data:${sourceMime};base64,${sourceB64}` } },
      ],
    }],
  };
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`ai_edit_failed_${res.status}:${txt.slice(0, 400)}`);
  const json = JSON.parse(txt);
  const msg = json?.choices?.[0]?.message;
  const images: any[] = msg?.images || [];
  const first = images[0]?.image_url?.url as string | undefined;
  if (!first || !first.startsWith("data:")) throw new Error("ai_edit_no_image");
  const b64 = first.split(",", 2)[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function boardForSlug(slug: string, name: string): { id: string; name: string } {
  const s = `${slug} ${name}`.toLowerCase();
  if (/litter|potty/.test(s)) return { id: "1117103951261719235", name: "Cat Litter Solutions" };
  if (/toy|laser|puzzle|entertainment|wand|ball/.test(s)) return { id: "1117103951261719232", name: "Cat Toys & Play" };
  if (/tree|scratch|climb|tower|shelf|wall-mount|floor-to-ceiling|condo/.test(s)) return { id: "1117103951261719219", name: "Best Cat Trees 2026" };
  return { id: "1117103951261719219", name: "Best Cat Trees 2026" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const queueIds: string[] = Array.isArray(body?.queue_ids) ? body.queue_ids : [];
  const dryRun: boolean = !!body?.dry_run;
  const triggerCron: boolean = body?.trigger_cron !== false;
  if (queueIds.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "queue_ids required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: rows, error: rowsErr } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_id, product_slug, product_name, destination_link, status, meta")
    .in("id", queueIds);
  if (rowsErr) {
    return new Response(JSON.stringify({ ok: false, error: rowsErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const productIds = Array.from(new Set((rows ?? []).map((r: any) => r.product_id)));
  const { data: products } = await sb
    .from("products").select("id, slug, image_url, is_active").in("id", productIds);
  const productById = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));

  const results: any[] = [];
  let composed = 0;

  for (const row of (rows ?? []) as any[]) {
    const rep: any = { id: row.id, slug: row.product_slug };
    try {
      if (row.status === "posted") { rep.skipped = "already_posted"; results.push(rep); continue; }
      const prod = productById.get(row.product_id);
      if (!prod?.image_url) throw new Error("no_product_image");
      if (prod.is_active === false) throw new Error("product_inactive");
      rep.source_image = prod.image_url;
      rep.method = "safe_background_extension";

      if (dryRun) { rep.dry_run = true; results.push(rep); continue; }

      const { data: src, mime } = await fetchImageBase64(prod.image_url);
      const outBytes = await editImage(LOVABLE_API_KEY, src, mime);
      composed++;

      const path = `creative-factory/photolock/${row.product_slug}/${Date.now()}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, outBytes, {
        contentType: "image/png", upsert: true,
      });
      if (up.error) throw new Error(`upload_failed:${up.error.message}`);
      const pub = sb.storage.from(BUCKET).getPublicUrl(path);
      const imageUrl = pub.data.publicUrl;
      rep.pin_image_url = imageUrl;

      const board = boardForSlug(row.product_slug, row.product_name);
      const now = new Date().toISOString();
      const meta = {
        ...(row.meta ?? {}),
        creative_source: "creative_factory_v1",
        photo_lock: true,
        photo_lock_source: prod.image_url,
        photo_lock_method: "safe_background_extension",
        photo_lock_at: now,
      };
      const { error: updErr } = await sb.from("pinterest_pin_queue").update({
        pin_image_url: imageUrl,
        board_id: board.id,
        board_name: board.name,
        status: "approved",
        approved_at: now,
        priority: "high",
        publish_attempts: 0,
        publishing_started_at: null,
        scheduled_at: now,
        rejection_reason: null,
        error_message: null,
        last_publish_error: null,
        qa_reasons: [],
        meta,
        updated_at: now,
      }).eq("id", row.id);
      if (updErr) throw new Error(`queue_update:${updErr.message}`);

      rep.board = board.name;
      rep.status = "approved_for_publish";
    } catch (e: any) {
      rep.error = String(e?.message ?? e);
      rep.status = "failed";
      await sb.from("pinterest_pin_queue").update({
        last_publish_error: `photo_lock:${rep.error}`.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
    results.push(rep);
  }

  let cron: any = null;
  if (triggerCron && !dryRun && results.some((r) => r.status === "approved_for_publish")) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "photo_lock_recover" }),
      });
      cron = { status: r.status, body: (await r.text()).slice(0, 1000) };
    } catch (e: any) {
      cron = { error: String(e?.message ?? e) };
    }
  }

  return new Response(JSON.stringify({
    ok: true, processed: results.length, composed, results, cron,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});