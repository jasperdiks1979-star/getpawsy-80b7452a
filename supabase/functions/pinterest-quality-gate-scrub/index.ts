// ─────────────────────────────────────────────────────────────────────────────
// pinterest-quality-gate-scrub
// ─────────────────────────────────────────────────────────────────────────────
// ALWAYS-ON Quality Gate enforcement:
//   1) Disable direct CJ Video → Pinterest publishing (autopilot off).
//   2) Scan pinterest_pin_queue (status in queued/draft/scheduled/processing)
//      for supplier marketing / certificate / manual / CJK / AliExpress /
//      cjdropshipping content. Reject with QUALITY_GATE_BLOCKED.
//   3) Scan pinterest_video_queue (status in draft/queued/scheduled/processing)
//      joined with pinterest_video_assets for the same banned terms. Reject.
//
// POST body:
//   { dryRun?: boolean, disableDirectCjVideo?: boolean }
// Default: dryRun = false, disableDirectCjVideo = true.
//
// Returns: { ok, traceId, pin_hits, video_hits, rejected_pins, rejected_videos,
//            autopilot_disabled, dryRun, top_terms }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  collectSupplierBannedHits,
  QUALITY_GATE_REJECT_REASON,
  rejectReasonFromHits,
  type SupplierBannedHit,
} from "../_shared/pinterest-supplier-banned.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  let body: { dryRun?: boolean; disableDirectCjVideo?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const dryRun = body.dryRun === true;
  const disableDirectCjVideo = body.disableDirectCjVideo !== false;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // 1) Disable direct CJ Video → Pinterest publishing.
  let autopilotDisabled = false;
  if (disableDirectCjVideo && !dryRun) {
    const { error } = await supabase
      .from("pinterest_video_autopilot_settings")
      .update({ enabled: false, mode: "drafts_only", updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (!error) autopilotDisabled = true;
    else console.warn("[scrub]", traceId, "autopilot off failed:", error.message);
  }

  // 2) Pin queue scan.
  const { data: pinRows, error: pinErr } = await supabase
    .from("pinterest_pin_queue")
    .select("id,pin_title,pin_description,overlay_text,pin_image_url,destination_link,meta,status,category_key")
    .in("status", ["queued", "draft", "scheduled", "processing", "ready"])
    .limit(5000);
  if (pinErr) return json(500, { ok: false, traceId, message: `pin scan failed: ${pinErr.message}` });

  const pinHits: Array<{ id: string; hits: SupplierBannedHit[] }> = [];
  for (const row of pinRows ?? []) {
    const hits = collectSupplierBannedHits(row as Record<string, unknown>);
    if (hits.length) pinHits.push({ id: (row as { id: string }).id, hits });
  }

  let rejectedPins = 0;
  if (!dryRun && pinHits.length) {
    for (const { id, hits } of pinHits) {
      const reason = rejectReasonFromHits(hits);
      const { error } = await supabase
        .from("pinterest_pin_queue")
        .update({
          status: "rejected",
          rejection_reason: reason,
          error_message: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (!error) rejectedPins += 1;
    }
  }

  // 3) Video queue scan (join asset metadata).
  const { data: videoRows, error: videoErr } = await supabase
    .from("pinterest_video_queue")
    .select(
      "id,title,description,cta_text,destination_url,status,asset_id," +
        "pinterest_video_assets(filename,storage_path,public_url,cover_image_url,last_skip_reason,product_slug)",
    )
    .in("status", ["draft", "queued", "scheduled", "processing", "ready"])
    .limit(5000);
  if (videoErr) return json(500, { ok: false, traceId, message: `video scan failed: ${videoErr.message}` });

  const videoHits: Array<{ id: string; hits: SupplierBannedHit[] }> = [];
  for (const row of videoRows ?? []) {
    const r = row as Record<string, unknown>;
    const asset = (r.pinterest_video_assets ?? {}) as Record<string, unknown>;
    const merged = { ...r, ...asset };
    const hits = collectSupplierBannedHits(merged);
    if (hits.length) videoHits.push({ id: (row as { id: string }).id, hits });
  }

  let rejectedVideos = 0;
  if (!dryRun && videoHits.length) {
    for (const { id, hits } of videoHits) {
      const reason = rejectReasonFromHits(hits);
      const { error } = await supabase
        .from("pinterest_video_queue")
        .update({
          status: "rejected",
          error_message: reason,
          archived: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (!error) rejectedVideos += 1;
    }
  }

  // Top-term roll-up for the admin dashboard.
  const termCounts = new Map<string, number>();
  for (const { hits } of [...pinHits, ...videoHits]) {
    for (const h of hits) termCounts.set(h.term, (termCounts.get(h.term) ?? 0) + 1);
  }
  const top_terms = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));

  return json(200, {
    ok: true,
    traceId,
    dryRun,
    autopilot_disabled: autopilotDisabled,
    pin_hits: pinHits.length,
    video_hits: videoHits.length,
    rejected_pins: rejectedPins,
    rejected_videos: rejectedVideos,
    reason_code: QUALITY_GATE_REJECT_REASON,
    top_terms,
    samples: {
      pins: pinHits.slice(0, 5),
      videos: videoHits.slice(0, 5),
    },
  });
});