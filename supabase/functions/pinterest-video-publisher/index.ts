// Pinterest Video Publisher — generates metadata, queues drafts, and publishes
// MP4s as native Pinterest Video Pins. Admin-only. Isolated from image queue.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";
import { generateVideoMeta, DEFAULT_DESTINATION_URL } from "../_shared/pinterest-video-meta.ts";
import type { VideoHook } from "../_shared/pinterest-video-hooks.ts";
import { createPvLogger } from "../_shared/pinterest-video-fn-logger.ts";
import { sanitizeAndValidatePinterestPayload } from "../_shared/pinterest-payload-safety.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(b: unknown) {
  return new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function logStage(sb: any, queue_id: string | null, stage: string, status: string, payload: unknown, trace_id: string) {
  try {
    await sb.from("pinterest_video_publish_log").insert({ queue_id, stage, status, payload, trace_id });
  } catch (e) { console.error("[pvp] log failed", e); }
}

// ── Media URL resolution + validation ─────────────────────────────────
// Pinterest /media uploads require a real, publicly fetchable MP4. The
// previous implementation streamed from `sb.storage.download(...)`, which
// silently failed (DOWNLOAD_FAILED) whenever the storage path no longer
// matched the file that Remotion uploaded. We now resolve the URL from
// cinematic_ad_jobs.output_mp4_url (the canonical render output) and only
// fall back to asset.public_url if no linked job exists.
const PUBLIC_STORAGE_MARKER = "/storage/v1/object/public/";

async function resolveMediaUrl(sb: any, asset: any, trace_id: string): Promise<string | null> {
  try {
    const { data: job } = await sb
      .from("cinematic_ad_jobs")
      .select("output_mp4_url, status")
      .eq("pinterest_asset_id", asset.id)
      .not("output_mp4_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (job?.output_mp4_url) {
      console.log(`[pvp ${trace_id}] media_url from cinematic_ad_jobs=${job.output_mp4_url}`);
      return job.output_mp4_url as string;
    }
  } catch (e) {
    console.warn(`[pvp ${trace_id}] cinematic_ad_jobs lookup failed`, (e as Error).message);
  }
  if (asset?.public_url) {
    console.log(`[pvp ${trace_id}] media_url from asset.public_url=${asset.public_url}`);
    return asset.public_url as string;
  }
  return null;
}

function isPublicMp4Url(url: string): { ok: boolean; reason?: string } {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: "not a valid URL" }; }
  if (u.protocol !== "https:") return { ok: false, reason: `protocol must be https, got ${u.protocol}` };
  if (u.pathname.startsWith("/functions/v1/")) return { ok: false, reason: "edge function path, not a public storage URL" };
  if (!u.pathname.includes(PUBLIC_STORAGE_MARKER)) return { ok: false, reason: `missing ${PUBLIC_STORAGE_MARKER}` };
  if (!/\.mp4(\?|$)/i.test(u.pathname)) return { ok: false, reason: "URL does not end in .mp4" };
  return { ok: true };
}

async function validateAndFetchMp4(
  sb: any,
  queue_id: string,
  url: string,
  trace_id: string,
): Promise<{ ok: true; bytes: Uint8Array; contentType: string; size: number } | { ok: false; code: string; message: string }> {
  const fmt = isPublicMp4Url(url);
  if (!fmt.ok) {
    await logStage(sb, queue_id, "media_url_validate", "fail", { url, reason: fmt.reason }, trace_id);
    return { ok: false, code: "MEDIA_URL_INVALID", message: `${fmt.reason}: ${url}` };
  }

  // HEAD probe — validate status, content-type, content-length without pulling bytes.
  let headStatus = 0; let headType = ""; let headLen = 0;
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow" });
    headStatus = head.status;
    headType = head.headers.get("content-type") || "";
    headLen = Number(head.headers.get("content-length") || "0");
  } catch (e) {
    await logStage(sb, queue_id, "media_url_head", "fail", { url, error: (e as Error).message }, trace_id);
    return { ok: false, code: "DOWNLOAD_FAILED", message: `HEAD threw: ${(e as Error).message}` };
  }
  console.log(`[pvp ${trace_id}] HEAD url=${url} status=${headStatus} type=${headType} len=${headLen}`);
  await logStage(sb, queue_id, "media_url_head", headStatus === 200 ? "ok" : "fail",
    { url, status: headStatus, content_type: headType, content_length: headLen }, trace_id);
  if (headStatus !== 200) return { ok: false, code: "MEDIA_URL_INVALID", message: `HEAD status ${headStatus}` };
  if (headType && !/video\/mp4|application\/octet-stream/i.test(headType)) {
    return { ok: false, code: "MEDIA_URL_INVALID", message: `unexpected content-type ${headType}` };
  }

  // GET — pull bytes so we can hand them to Pinterest's S3 upload as a Blob.
  let getStatus = 0; let getType = ""; let bytes: Uint8Array;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    getStatus = res.status;
    getType = res.headers.get("content-type") || headType;
    if (getStatus !== 200) {
      await logStage(sb, queue_id, "media_url_get", "fail", { url, status: getStatus, content_type: getType }, trace_id);
      return { ok: false, code: "DOWNLOAD_FAILED", message: `GET status ${getStatus}` };
    }
    const ab = await res.arrayBuffer();
    bytes = new Uint8Array(ab);
  } catch (e) {
    await logStage(sb, queue_id, "media_url_get", "fail", { url, error: (e as Error).message }, trace_id);
    return { ok: false, code: "DOWNLOAD_FAILED", message: `GET threw: ${(e as Error).message}` };
  }
  if (!bytes.byteLength) {
    await logStage(sb, queue_id, "media_url_get", "fail", { url, reason: "0 bytes" }, trace_id);
    return { ok: false, code: "MEDIA_URL_INVALID", message: "empty body (0 bytes)" };
  }
  console.log(`[pvp ${trace_id}] GET url=${url} status=${getStatus} type=${getType} size=${bytes.byteLength}`);
  await logStage(sb, queue_id, "media_url_get", "ok",
    { url, status: getStatus, content_type: getType, size_bytes: bytes.byteLength }, trace_id);
  return { ok: true, bytes, contentType: getType || "video/mp4", size: bytes.byteLength };
}

async function getAdminClient(req: Request) {
  const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Service-mode: allow internal callers (cinematic-ad-render-webhook auto-publish chain)
  // to invoke this function without a user JWT, gated by RENDER_WORKER_SECRET.
  const renderSecret = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
  const headerSecret = req.headers.get("x-render-secret") ?? "";
  if (renderSecret && headerSecret && headerSecret === renderSecret) {
    return { sb: sbAdmin, user: { id: "service:render-worker", email: "service@render-worker" } as any, isAdmin: true, authError: null };
  }
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { sb: sbAdmin, user: null, isAdmin: false, authError: "MISSING_BEARER_TOKEN" };
  const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await sbUser.auth.getUser();
  if (error || !user) return { sb: sbAdmin, user: null, isAdmin: false, authError: error?.message || "INVALID_USER_TOKEN" };
  const { data: r, error: roleError } = await sbAdmin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return { sb: sbAdmin, user, isAdmin: !!r, authError: roleError?.message || null };
}

async function getPinterestToken(sb: any): Promise<string | null> {
  const { data: settings } = await sb.from("pinterest_runtime_settings").select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let q = sb.from("pinterest_connection").select("access_token").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) q = q.eq("id", settings.active_pinterest_connection_id);
  const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data?.access_token || null;
}

async function resolveBoardId(sb: any, _token: string): Promise<string | null> {
  const { data: settings } = await sb.from("pinterest_runtime_settings").select("active_board_id").eq("id", 1).maybeSingle();
  if (settings?.active_board_id) return settings.active_board_id;
  // Prefer a "Self-Cleaning Cat Litter Box" board, else first non-blacklisted production board
  const { data: b } = await sb.from("pinterest_boards")
    .select("id, name, priority")
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false)
    .order("priority", { ascending: false })
    .limit(25);
  if (!b?.length) return null;
  const preferred = b.find((x: any) => /self.?cleaning.*litter|litter.*box/i.test(x.name));
  return (preferred || b[0])?.id || null;
}

async function publishVideoPin(opts: {
  sb: any; queue_id: string; asset: any; queueRow: any; token: string; trace_id: string;
}): Promise<{ ok: true; pin_id: string; external_url: string } | { ok: false; code: string; message: string }> {
  const { sb, queue_id, asset, queueRow, token, trace_id } = opts;
  const apiBase = await getPinterestApiBase(sb);

  // Stage 1: register media
  console.log(`[pvp ${trace_id}] stage=register_media`);
  const reg = await fetch(`${apiBase}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "video" }),
  });
  const regBody = await reg.json().catch(() => ({}));
  await logStage(sb, queue_id, "register_media", reg.ok ? "ok" : "fail", { status: reg.status, body: regBody }, trace_id);
  if (!reg.ok || !regBody?.media_id) return { ok: false, code: "REGISTER_FAILED", message: `status ${reg.status}` };
  const mediaId = regBody.media_id as string;
  const uploadUrl = regBody.upload_url as string;
  const uploadParams = (regBody.upload_parameters || {}) as Record<string, string>;

  // Stage 2: stream MP4 from storage to Pinterest's S3 upload URL
  console.log(`[pvp ${trace_id}] stage=upload media_id=${mediaId}`);
  const { data: blob, error: dlErr } = await sb.storage.from(asset.storage_bucket).download(asset.storage_path);
  if (dlErr || !blob) {
    await logStage(sb, queue_id, "download", "fail", { error: dlErr?.message }, trace_id);
    return { ok: false, code: "DOWNLOAD_FAILED", message: dlErr?.message || "no blob" };
  }
  const fd = new FormData();
  for (const [k, v] of Object.entries(uploadParams)) fd.append(k, v);
  fd.append("file", blob, asset.filename);
  const upRes = await fetch(uploadUrl, { method: "POST", body: fd });
  await logStage(sb, queue_id, "upload", upRes.ok ? "ok" : "fail", { status: upRes.status }, trace_id);
  if (!upRes.ok) return { ok: false, code: "UPLOAD_FAILED", message: `s3 status ${upRes.status}` };

  // Stage 3: poll for media ready
  console.log(`[pvp ${trace_id}] stage=poll`);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${apiBase}/media/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const stBody = await st.json().catch(() => ({}));
    if (stBody?.status === "succeeded") { ready = true; break; }
    if (stBody?.status === "failed") {
      await logStage(sb, queue_id, "poll", "fail", { body: stBody }, trace_id);
      return { ok: false, code: "MEDIA_PROCESS_FAILED", message: "Pinterest rejected media" };
    }
  }
  if (!ready) return { ok: false, code: "MEDIA_TIMEOUT", message: "media not ready in 60s" };

  // Stage 4: create pin
  console.log(`[pvp ${trace_id}] stage=create_pin`);
  // Pinterest video pins REQUIRE one of: cover_image_url, cover_image_content_type+data,
  // or cover_image_key_frame_time. We always send key_frame_time as a baseline (Pinterest
  // extracts the frame for us) and prefer an explicit cover_image_url when available.
  // On failure we walk a fallback ladder of frame times and persist the working value.
  const baseSecond = Number(asset.key_frame_second ?? 1.5);
  const frameLadder = Array.from(new Set([baseSecond, 1.5, 0.8, 2.0, 3.0])).filter((n) => n > 0);

  let pinBody: any = null;
  let pinRes: Response | null = null;
  let chosenSecond: number | null = null;

  for (const second of frameLadder) {
    const mediaSource: Record<string, unknown> = {
      source_type: "video_id",
      media_id: mediaId,
      cover_image_key_frame_time: second,
    };
    if (asset.cover_image_url) {
      // Explicit cover URL takes precedence over key-frame extraction.
      mediaSource.cover_image_url = asset.cover_image_url;
    }
    const pinPayload = {
      title: queueRow.title,
      description: queueRow.description,
      board_id: queueRow.board_id,
      link: queueRow.destination_url,
      media_source: mediaSource,
    };
    const safePayload = sanitizeAndValidatePinterestPayload(pinPayload);
    console.log(`[pvp ${trace_id}] sanitized Pinterest payload`, { payload: safePayload.debugPayload, rejectedFields: safePayload.rejectedFields, coercedFields: safePayload.coercedFields });
    await logStage(sb, queue_id, "payload_debug", safePayload.ok ? "ok" : "fail", {
      endpoint: "/pins",
      sanitized_payload: safePayload.debugPayload,
      rejected_fields: safePayload.rejectedFields,
      coerced_fields: safePayload.coercedFields,
    }, trace_id);
    if (!safePayload.ok) {
      return { ok: false, code: "INVALID_PINTEREST_PAYLOAD", message: `Invalid integer fields: ${safePayload.rejectedFields.map((f) => f.path).join(", ")}` };
    }
    pinRes = await fetch(`${apiBase}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(safePayload.payload),
    });
    pinBody = await pinRes.json().catch(() => ({}));
    await logStage(sb, queue_id, "create_pin", pinRes.ok ? "ok" : "fail",
      { status: pinRes.status, body: pinBody, key_frame_second: second, used_cover_url: !!asset.cover_image_url }, trace_id);
    if (pinRes.ok && pinBody?.id) { chosenSecond = second; break; }
    // Only retry the ladder for cover-related failures; fail fast otherwise.
    const msg = (pinBody?.message || "").toString().toLowerCase();
    const coverIssue = msg.includes("cover") || msg.includes("key_frame") || msg.includes("media_timeout");
    if (!coverIssue || asset.cover_image_url) break;
  }
  if (!pinRes?.ok || !pinBody?.id) {
    // Mark for retry queue if Pinterest reported a media timeout.
    const msg = (pinBody?.message || "").toString().toLowerCase();
    if (msg.includes("media_timeout")) {
      const attempts = (asset.cover_attempts || 0) + 1;
      const delaySec = attempts === 1 ? 90 : attempts === 2 ? 180 : 360;
      await sb.from("pinterest_video_assets").update({
        thumbnail_status: "awaiting_media_ready",
        cover_attempts: attempts,
        cover_last_error: pinBody?.message || `status ${pinRes?.status}`,
        next_retry_at: new Date(Date.now() + delaySec * 1000).toISOString(),
      }).eq("id", asset.id);
    } else {
      await sb.from("pinterest_video_assets").update({
        thumbnail_status: "failed",
        cover_last_error: pinBody?.message || `status ${pinRes?.status}`,
      }).eq("id", asset.id);
    }
    return { ok: false, code: "PIN_CREATE_FAILED", message: pinBody?.message || `status ${pinRes?.status}` };
  }
  // Persist the working frame time so subsequent publishes skip the ladder.
  if (chosenSecond != null && chosenSecond !== baseSecond) {
    await sb.from("pinterest_video_assets").update({
      key_frame_second: chosenSecond,
      thumbnail_status: "published",
    }).eq("id", asset.id);
  } else {
    await sb.from("pinterest_video_assets").update({
      thumbnail_status: "published",
    }).eq("id", asset.id);
  }

  return { ok: true, pin_id: pinBody.id, external_url: `https://www.pinterest.com/pin/${pinBody.id}/` };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  const sbBoot = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = createPvLogger(sbBoot, "pinterest-video-publisher", trace_id);
  try {
    await log.info("entered handler");
    const { sb, user, isAdmin, authError } = await getAdminClient(req);
    if (!user) {
      await log.warn("unauthenticated", { auth_error: authError });
      return json({ ok: false, code: "UNAUTHENTICATED", traceId: trace_id, message: authError || "Missing authenticated admin JWT" }, 401);
    }
    if (!isAdmin) {
      await log.warn("forbidden", { user_id: user.id, email: user.email, auth_error: authError });
      return json({ ok: false, code: "FORBIDDEN", traceId: trace_id, message: "Admin authorization required", user_id: user.id, email: user.email }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = (body.action || "queue_draft") as
      | "queue_draft" | "publish" | "reroll" | "queue_all_drafts" | "retry" | "__health_check__";
    await log.info("action received", { action, queue_id: body.queue_id ?? null }, { queue_id: body.queue_id ?? null });
    if (action === "__health_check__") {
      const token = await getPinterestToken(sb);
      const board_id = token ? await resolveBoardId(sb, token) : null;
      return ok({ ok: true, traceId: trace_id, function: "pinterest-video-publisher", admin: true, pinterest_connected: !!token, board_id });
    }

    // ── queue_draft / queue_all_drafts ──────────────────────────────
    if (action === "queue_draft" || action === "queue_all_drafts") {
      const ids: string[] = action === "queue_all_drafts"
        ? (await sb.from("pinterest_video_assets").select("id").eq("is_active", true)).data?.map((r: any) => r.id) || []
        : (body.asset_ids || (body.asset_id ? [body.asset_id] : []));
      if (!ids.length) return ok({ ok: false, code: "NO_ASSETS", traceId: trace_id });

      const created: string[] = [];
      for (const asset_id of ids) {
        const { data: asset } = await sb.from("pinterest_video_assets").select("*").eq("id", asset_id).maybeSingle();
        if (!asset) continue;
        // try up to 5 variations to satisfy unique (asset_id, variation_hash)
        let inserted = false;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
          const meta = generateVideoMeta({ asset_id, hook: asset.hook_type as VideoHook, attempt });
          const { data, error } = await sb.from("pinterest_video_queue").insert({
            asset_id,
            status: "draft",
            title: meta.title,
            description: meta.description,
            hashtags: meta.hashtags,
            cta_text: meta.cta_text,
            destination_url: DEFAULT_DESTINATION_URL,
            variation_hash: meta.variation_hash,
          }).select("id").maybeSingle();
          if (!error && data) { created.push(data.id); inserted = true; }
        }
      }
      return ok({ ok: true, traceId: trace_id, created_count: created.length, queue_ids: created });
    }

    // ── reroll ──────────────────────────────────────────────────────
    if (action === "reroll") {
      const queue_id = body.queue_id;
      if (!queue_id) return ok({ ok: false, code: "MISSING_QUEUE_ID", traceId: trace_id });
      const { data: row } = await sb.from("pinterest_video_queue").select("*").eq("id", queue_id).maybeSingle();
      if (!row) return ok({ ok: false, code: "QUEUE_NOT_FOUND", traceId: trace_id });
      const { data: asset } = await sb.from("pinterest_video_assets").select("*").eq("id", row.asset_id).maybeSingle();
      if (!asset) return ok({ ok: false, code: "ASSET_NOT_FOUND", traceId: trace_id });
      for (let attempt = 1; attempt < 8; attempt++) {
        const meta = generateVideoMeta({ asset_id: row.asset_id, hook: asset.hook_type as VideoHook, attempt });
        if (meta.variation_hash === row.variation_hash) continue;
        const { error } = await sb.from("pinterest_video_queue").update({
          title: meta.title, description: meta.description, hashtags: meta.hashtags,
          cta_text: meta.cta_text, variation_hash: meta.variation_hash,
        }).eq("id", queue_id);
        if (!error) return ok({ ok: true, traceId: trace_id, ...meta });
      }
      return ok({ ok: false, code: "REROLL_EXHAUSTED", traceId: trace_id });
    }

    // ── retry ──────────────────────────────────────────────────────
    // Resets a failed item, increments attempt, and re-runs publish.
    // Respects max_retries (default 3) and writes a `retried` status entry
    // so the per-item history shows the retry transition.
    if (action === "retry") {
      const queue_id = body.queue_id;
      if (!queue_id) return ok({ ok: false, code: "MISSING_QUEUE_ID", traceId: trace_id });
      const { data: row } = await sb.from("pinterest_video_queue").select("*").eq("id", queue_id).maybeSingle();
      if (!row) return ok({ ok: false, code: "QUEUE_NOT_FOUND", traceId: trace_id });
      if (row.status === "published") return ok({ ok: true, traceId: trace_id, message: "already_published" });
      const max = row.max_retries ?? 3;
      if ((row.attempt_count || 0) >= max) {
        return ok({ ok: false, code: "MAX_RETRIES_EXCEEDED", traceId: trace_id, message: `cap=${max}` });
      }
      // Mark a transient `retried` state so history shows the retry click.
      await sb.from("pinterest_video_queue").update({
        status: "retried",
        last_retry_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", queue_id);
      // Recursively reuse the publish branch by re-fetching with cleared state.
      const { data: asset } = await sb.from("pinterest_video_assets").select("*").eq("id", row.asset_id).maybeSingle();
      if (!asset) return ok({ ok: false, code: "ASSET_NOT_FOUND", traceId: trace_id });
      const token = await getPinterestToken(sb);
      if (!token) return ok({ ok: false, code: "PINTEREST_NOT_CONNECTED", traceId: trace_id });
      const board_id = row.board_id || await resolveBoardId(sb, token);
      if (!board_id) return ok({ ok: false, code: "NO_BOARD", traceId: trace_id });
      await sb.from("pinterest_video_queue").update({
        status: "publishing",
        board_id,
        attempt_count: (row.attempt_count || 0) + 1,
      }).eq("id", queue_id);
      const result = await publishVideoPin({ sb, queue_id, asset, queueRow: { ...row, board_id }, token, trace_id });
      if (result.ok) {
        await sb.from("pinterest_video_queue").update({
          status: "published", pin_id: result.pin_id, external_url: result.external_url, error_message: null,
        }).eq("id", queue_id);
        await sb.from("pinterest_video_assets").update({
          last_publish_at: new Date().toISOString(),
          publish_count: (asset.publish_count || 0) + 1,
        }).eq("id", asset.id);
        await log.info("retry published", { pin_id: result.pin_id }, { queue_id, asset_id: asset.id });
        return ok({ ok: true, traceId: trace_id, pin_id: result.pin_id, pin_url: result.external_url, external_url: result.external_url, title: row.title, media_url: asset.public_url, board: board_id });
      }
      await sb.from("pinterest_video_queue").update({
        status: "failed", error_message: `${result.code}: ${result.message}`,
      }).eq("id", queue_id);
      await log.error("retry failed", { code: result.code, message: result.message }, { queue_id, asset_id: asset.id });
      return ok({ ok: false, traceId: trace_id, code: result.code, message: result.message });
    }

    // ── publish ─────────────────────────────────────────────────────
    if (action === "publish") {
      const queue_id = body.queue_id;
      if (!queue_id) return ok({ ok: false, code: "MISSING_QUEUE_ID", traceId: trace_id });
      const { data: row } = await sb.from("pinterest_video_queue").select("*").eq("id", queue_id).maybeSingle();
      if (!row) return ok({ ok: false, code: "QUEUE_NOT_FOUND", traceId: trace_id });
      if (row.pin_id) return ok({ ok: true, traceId: trace_id, pin_id: row.pin_id, pin_url: row.external_url, external_url: row.external_url, title: row.title, media_url: null, board: row.board_id, message: "already_published" });
      const { data: asset } = await sb.from("pinterest_video_assets").select("*").eq("id", row.asset_id).maybeSingle();
      if (!asset) return ok({ ok: false, code: "ASSET_NOT_FOUND", traceId: trace_id });

      const token = await getPinterestToken(sb);
      if (!token) return ok({ ok: false, code: "PINTEREST_NOT_CONNECTED", traceId: trace_id });
      const board_id = row.board_id || await resolveBoardId(sb, token);
      if (!board_id) return ok({ ok: false, code: "NO_BOARD", traceId: trace_id });

      await sb.from("pinterest_video_queue").update({
        status: "publishing",
        board_id,
        attempt_count: (row.attempt_count || 0) + 1,
      }).eq("id", queue_id);

      const result = await publishVideoPin({ sb, queue_id, asset, queueRow: { ...row, board_id }, token, trace_id });

      if (result.ok) {
        await sb.from("pinterest_video_queue").update({
          status: "published",
          pin_id: result.pin_id,
          external_url: result.external_url,
          error_message: null,
        }).eq("id", queue_id);
        await sb.from("pinterest_video_assets").update({
          last_publish_at: new Date().toISOString(),
          publish_count: (asset.publish_count || 0) + 1,
        }).eq("id", asset.id);
        await log.info("published", { pin_id: result.pin_id }, { queue_id, asset_id: asset.id });
        return ok({ ok: true, traceId: trace_id, pin_id: result.pin_id, pin_url: result.external_url, external_url: result.external_url, title: row.title, media_url: asset.public_url, board: board_id });
      } else {
        await sb.from("pinterest_video_queue").update({
          status: "failed",
          error_message: `${result.code}: ${result.message}`,
        }).eq("id", queue_id);
        await log.error("publish failed", { code: result.code, message: result.message }, { queue_id, asset_id: asset.id });
        return ok({ ok: false, traceId: trace_id, code: result.code, message: result.message });
      }
    }

    return ok({ ok: false, code: "UNKNOWN_ACTION", traceId: trace_id });
  } catch (e) {
    console.error(`[pvp ${trace_id}] fatal`, e);
    try { await log.error("fatal", { message: (e as Error)?.message, stack: (e as Error)?.stack?.slice(0, 800) }); } catch (_) {}
    return ok({ ok: false, code: "UNEXPECTED_ERROR", traceId: trace_id, message: (e as Error)?.message, stack: (e as Error)?.stack?.slice(0, 800) });
  }
});