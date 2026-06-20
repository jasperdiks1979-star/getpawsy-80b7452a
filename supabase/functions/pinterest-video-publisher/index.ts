// Pinterest Video Publisher — generates metadata, queues drafts, and publishes
// MP4s as native Pinterest Video Pins. Admin-only. Isolated from image queue.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";
import { generateVideoMeta, buildDestinationUrl, validateCategoryMatch, validateTextSafeArea, type ProductContext } from "../_shared/pinterest-video-meta.ts";
import type { VideoHook } from "../_shared/pinterest-video-hooks.ts";
import { createPvLogger } from "../_shared/pinterest-video-fn-logger.ts";
import { sanitizeAndValidatePinterestPayload } from "../_shared/pinterest-payload-safety.ts";
import { stampUtmsOnLink, patchPinLink } from "../_shared/pinterest-link-stamp.ts";
import { resolveWarehouse, fallbackCopyTags } from "../_shared/warehouse-availability.ts";

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

// ── Canonical guard ────────────────────────────────────────────────
// Rejects publish if the destination URL would resolve to the homepage
// canonical bucket, is missing/invalid, or carries a numeric-variant slug
// (`-2`, `-3`, …) that Pinterest's dedupe always rejects.
const DUPLICATE_SLUG_RE = /-(?:[2-9]|\d{2,})$/;
export function validateCanonicalDestination(rawUrl: string | null | undefined):
  | { ok: true; slug: string; canonical: string }
  | { ok: false; code: string; message: string } {
  if (!rawUrl) return { ok: false, code: "CANONICAL_MISSING", message: "destination_url empty" };
  let u: URL;
  try { u = new URL(rawUrl); } catch { return { ok: false, code: "CANONICAL_INVALID", message: `unparseable url: ${rawUrl}` }; }
  const path = u.pathname.replace(/\/+$/, "").toLowerCase();
  if (path === "" || path === "/") return { ok: false, code: "CANONICAL_HOMEPAGE", message: "destination resolves to homepage" };
  const m = path.match(/^\/products\/([a-z0-9][a-z0-9-]*)$/);
  if (!m) return { ok: false, code: "CANONICAL_NON_PDP", message: `not a /products/{slug} path: ${path}` };
  const slug = m[1];
  if (DUPLICATE_SLUG_RE.test(slug)) {
    return { ok: false, code: "CANONICAL_DUPLICATE_SLUG", message: `numeric variant slug "${slug}" — Pinterest dedupe always rejects` };
  }
  return { ok: true, slug, canonical: `${u.origin}${u.pathname}` };
}

// Test/fixture slugs must never reach the live publisher.
export function isTestFixtureSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = String(slug).trim().toLowerCase();
  return s.startsWith("_") || s.includes("e2e-test") || s.includes("smoke-test");
}

// ── Product context loader ────────────────────────────────────────
async function loadProductContext(sb: any, slug: string | null | undefined): Promise<ProductContext | undefined> {
  const s = (slug || "").trim();
  if (!s) return undefined;
  try {
    const { data } = await sb.from("products")
      .select("slug, name, category, benefit_angle, primary_keyword, seo_keywords, us_stock, eu_stock, cn_stock, stock, is_active")
      .eq("slug", s).maybeSingle();
    if (!data) return { slug: s };
    const warehouse = resolveWarehouse(data as any);
    return {
      slug: data.slug,
      name: data.name,
      category: data.category,
      benefit_angle: data.benefit_angle,
      primary_keyword: data.primary_keyword,
      tags: Array.isArray(data.seo_keywords) ? data.seo_keywords : null,
      // @ts-ignore — augment ProductContext with warehouse hints for copy injection
      warehouseSource: warehouse.source,
      // @ts-ignore
      isFallback: warehouse.isFallback,
    };
  } catch { return { slug: s }; }
}

// Sanitize description for fallback products. Strip any forbidden
// "out of stock" mention and append fallback tags (Item 14).
function sanitizeFallbackDescription(desc: string | null | undefined, source: "US" | "EU" | "CN" | "NONE"): string {
  const base = (desc ?? "").replace(/\bout\s*of\s*stock\b/gi, "Available Again");
  const tags = fallbackCopyTags(source);
  if (tags.length === 0) return base;
  const append = tags.filter((t) => !new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(base)).join(" • ");
  return append ? `${base}${base.endsWith(".") || base.endsWith("!") || base.endsWith("?") ? " " : ". "}${append}`.trim() : base;
}

// ── 30-day copy de-duplication ────────────────────────────────────
async function isCopyUsedRecently(sb: any, variation_hash: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data } = await sb.from("pinterest_video_copy_history")
      .select("id").eq("variation_hash", variation_hash).gte("used_at", since).limit(1).maybeSingle();
    return !!data;
  } catch { return false; }
}

async function recordCopyHistory(sb: any, asset_id: string, meta: {
  variation_hash: string; title: string; description: string; hook_variant: string; copy_variant: string; cta_variant: string;
}) {
  try {
    await sb.from("pinterest_video_copy_history").insert({
      asset_id,
      variation_hash: meta.variation_hash,
      title: meta.title,
      description: meta.description,
      hook_variant: meta.hook_variant,
      copy_variant: meta.copy_variant,
      cta_variant: meta.cta_variant,
    });
  } catch (e) { console.warn("[pvp] copy history insert failed", (e as Error).message); }
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

async function isVideoAutoPublishDisabled(sb: any): Promise<boolean> {
  const envValue = (Deno.env.get("PINTEREST_VIDEO_AUTO_PUBLISH") ?? "").trim().toLowerCase();
  if (["false", "0", "off", "no", "disabled"].includes(envValue)) return true;
  try {
    const { data } = await sb
      .from("app_config")
      .select("key,value")
      .in("key", ["PINTEREST_VIDEO_AUTO_PUBLISH", "pinterest_video_auto_publish"]);
    return (data ?? []).some((cfg: any) => {
      const raw = typeof cfg.value === "string" ? cfg.value : JSON.stringify(cfg.value);
      const v = String(raw ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
      return ["false", "0", "off", "no", "disabled"].includes(v);
    });
  } catch {
    return false;
  }
}

async function assertPublishAllowed(sb: any, row: any, queue_id: string, trace_id: string): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (await isVideoAutoPublishDisabled(sb)) {
    await logStage(sb, queue_id, "publish_blocked_kill_switch", "fail", { engine_version: row?.engine_version }, trace_id);
    return { ok: false, code: "AUTO_PUBLISH_DISABLED", message: "PINTEREST_VIDEO_AUTO_PUBLISH kill switch active" };
  }
  const payload = row?.failure_payload ?? {};
  const markers = [row?.status, row?.error_message, payload?.preview_mode, payload?.voiceover_status, payload?.render_mode]
    .filter(Boolean).map((v) => String(v).toLowerCase());
  if (markers.includes("silent_preview") || markers.some((v) => v.includes("silent_preview"))) {
    await logStage(sb, queue_id, "publish_blocked_silent_preview", "fail", { engine_version: row?.engine_version }, trace_id);
    return { ok: false, code: "SILENT_PREVIEW_BLOCKED", message: "silent_preview videos are review-only and cannot publish" };
  }
  if (row?.engine_version === "v4" && (!row.approved_at || row.status !== "pending")) {
    await logStage(sb, queue_id, "publish_blocked_v4_unapproved", "fail",
      { storyboard_id: row.storyboard_id, status: row.status, approved_at: row.approved_at }, trace_id);
    return { ok: false, code: "V4_NOT_APPROVED", message: `V4 row requires approved_at + status='pending' (got status=${row.status}, approved_at=${row.approved_at})` };
  }

  // V3 hard pause — once cinematic_v4_jobs is in production, V3 must not publish.
  if (row?.engine_version === "v3" || row?.engine_version === "v3.cinematic") {
    const { data: rt } = await sb.from("pinterest_runtime_settings").select("v3_publish_paused").eq("id", 1).maybeSingle();
    if (rt?.v3_publish_paused === true) {
      await logStage(sb, queue_id, "publish_blocked_v3_paused", "fail", { engine_version: row.engine_version }, trace_id);
      return { ok: false, code: "V3_PUBLISH_PAUSED", message: "V3 publishing is paused while V4 quality gate is active" };
    }
  }

  // V4 hard quality gate — must have an approved cinematic_v4_jobs row with quality_score >= 90 and final_mp4_url.
  if (row?.engine_version === "v4") {
    const slug = (row?.product_slug || row?.slug || "").trim();
    if (slug) {
      const { data: v4 } = await sb
        .from("cinematic_v4_jobs")
        .select("status, quality_score, final_mp4_url, rejection_reasons")
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!v4) {
        await logStage(sb, queue_id, "publish_blocked_v4_no_job", "fail", { slug }, trace_id);
        return { ok: false, code: "V4_NO_JOB", message: `No cinematic_v4_jobs row for slug=${slug}` };
      }
      if (v4.status !== "approved" || (v4.quality_score ?? 0) < 90 || !v4.final_mp4_url) {
        await logStage(sb, queue_id, "publish_blocked_v4_quality_gate", "fail", {
          slug, status: v4.status, quality_score: v4.quality_score, has_mp4: !!v4.final_mp4_url,
          rejection_reasons: v4.rejection_reasons,
        }, trace_id);
        return { ok: false, code: "V4_QUALITY_GATE", message: `V4 quality gate failed (status=${v4.status}, score=${v4.quality_score}, mp4=${!!v4.final_mp4_url})` };
      }
    }
  }

  return { ok: true };
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

  // Stage 0: canonical guard — reject up-front if the destination URL would
  // collapse into the homepage canonical bucket (Pinterest dedupe → "this
  // site doesn't allow you to save Pins") or carries a numeric-variant slug.
  const guard = validateCanonicalDestination(queueRow?.destination_url);
  if (!guard.ok) {
    await logStage(sb, queue_id, "canonical_guard", "fail", {
      destination_url: queueRow?.destination_url,
      product_slug: (queueRow as any)?.product_slug ?? null,
      asset_product_id: asset?.product_id ?? null,
      code: guard.code,
      message: guard.message,
    }, trace_id);
    return { ok: false, code: guard.code, message: guard.message };
  }

  // Stage 0b: product integrity guard — the video must point to its own
  // product page. Block + mark publish_blocked otherwise. Hard rule.
  const assetSlug = String(asset?.product_slug ?? "").trim().toLowerCase();
  const destSlug = String(guard.slug ?? "").trim().toLowerCase();
  if (!assetSlug || assetSlug !== destSlug) {
    await logStage(sb, queue_id, "product_integrity_guard", "fail", {
      asset_id: asset?.id,
      video_product_slug: assetSlug,
      destination_slug: destSlug,
      destination_url: queueRow?.destination_url,
    }, trace_id);
    try {
      await sb.from("pinterest_video_queue").update({
        status: "publish_blocked",
        error_message: `DESTINATION_PRODUCT_MISMATCH: video=${assetSlug} dest=${destSlug}`,
      }).eq("id", queue_id);
    } catch (_) { /* trigger may also flip status */ }
    return { ok: false, code: "DESTINATION_PRODUCT_MISMATCH", message: `video product '${assetSlug}' != destination product '${destSlug}'` };
  }

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
  const mediaUrl = await resolveMediaUrl(sb, asset, trace_id);
  if (!mediaUrl) {
    await logStage(sb, queue_id, "media_url_resolve", "fail", { asset_id: asset.id }, trace_id);
    return { ok: false, code: "MEDIA_URL_INVALID", message: "no output_mp4_url and no asset.public_url" };
  }
  const fetched = await validateAndFetchMp4(sb, queue_id, mediaUrl, trace_id);
  if (!fetched.ok) return fetched;
  const blob = new Blob([fetched.bytes], { type: fetched.contentType });
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

  // 🔗 Pre-stamp UTMs + queue-UUID pin_id onto destination_url BEFORE POST so
  // every Pinterest video outbound click carries full attribution. pinterest-track
  // resolves the queue UUID to the real Pinterest pin id.
  const _vpCampaign = (queueRow as any).category_key || (queueRow as any).board_name || queueRow.board_id || "pinterest";
  const _vpContent = (queueRow as any).hook_angle || (queueRow as any).hook_group || (queueRow as any).pin_variant || (queueRow as any).product_slug || "video";
  const preStampedVideoLink = stampUtmsOnLink(String(queueRow.destination_url ?? ""), {
    pinId: queue_id,
    campaign: _vpCampaign,
    content: _vpContent,
  });
  try {
    await sb.from("pinterest_video_queue").update({ destination_url: preStampedVideoLink }).eq("id", queue_id);
  } catch { /* non-fatal */ }
  queueRow.destination_url = preStampedVideoLink;

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
      description: sanitizeFallbackDescription(
        queueRow.description,
        // @ts-ignore — productContext augmented at load time
        (queueRow as any)._warehouseSource ?? "US",
      ),
      board_id: queueRow.board_id,
      link: preStampedVideoLink,
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

  // Best-effort: PATCH the live link with the real Pinterest pin id so future
  // outbound clicks resolve directly. Failure is non-fatal — the pre-stamped
  // queue UUID still flows through pinterest-track for attribution.
  try {
    const realStamped = stampUtmsOnLink(preStampedVideoLink, {
      pinId: pinBody.id,
      campaign: _vpCampaign,
      content: _vpContent,
    });
    await patchPinLink(token, apiBase, pinBody.id, realStamped);
    await sb.from("pinterest_video_queue").update({ destination_url: realStamped }).eq("id", queue_id);
  } catch { /* ignore */ }

  return { ok: true, pin_id: pinBody.id, external_url: `https://www.pinterest.com/pin/${pinBody.id}/` };
}

// Retry the publish flow on transient download/network failures with
// exponential backoff. Pinterest API errors (REGISTER_FAILED, UPLOAD_FAILED,
// MEDIA_PROCESS_FAILED, PIN_CREATE_FAILED, INVALID_PINTEREST_PAYLOAD) are
// surfaced immediately so the operator can act on them; only the storage/HTTP
// fetch layer is auto-retried. DOWNLOAD_FAILED gets the longest ladder because
// it is typically a storage-propagation race after a fresh Remotion upload.
type AttemptRecord = { n: number; code: string; message: string; at: string; next_delay_ms: number };

const RETRY_LADDERS: Record<string, number[]> = {
  // 5 attempts total: initial + 4 backoffs (5s, 10s, 20s, 40s) — ~75s window
  DOWNLOAD_FAILED: [5_000, 10_000, 20_000, 40_000],
  MEDIA_TIMEOUT: [2_000, 4_000, 8_000],
};

async function publishWithRetry(opts: {
  sb: any; queue_id: string; asset: any; queueRow: any; token: string; trace_id: string;
}): Promise<
  | { ok: true; pin_id: string; external_url: string; attempts: AttemptRecord[] }
  | { ok: false; code: string; message: string; attempts: AttemptRecord[] }
> {
  const attempts: AttemptRecord[] = [];
  let last: Awaited<ReturnType<typeof publishVideoPin>> | null = null;
  let attempt = 0;
  // Loop until: success, non-transient failure, or ladder exhausted.
  // We always run at least one attempt; the ladder controls retries after that.
  while (true) {
    attempt += 1;
    console.log(`[pvp ${opts.trace_id}] publish attempt #${attempt}`);
    last = await publishVideoPin(opts);
    if (last.ok) return { ...last, attempts };
    const ladder = RETRY_LADDERS[last.code];
    const retryIdx = attempt - 1; // 0-based index into the delay ladder
    const nextDelay = ladder?.[retryIdx];
    attempts.push({
      n: attempt,
      code: last.code,
      message: last.message,
      at: new Date().toISOString(),
      next_delay_ms: nextDelay ?? 0,
    });
    if (!nextDelay) {
      // Either non-transient or ladder exhausted.
      return { ok: false, code: last.code, message: last.message, attempts };
    }
    await logStage(opts.sb, opts.queue_id, "publish_retry", "backoff",
      { attempt, next_attempt_in_ms: nextDelay, code: last.code, message: last.message }, opts.trace_id);
    await new Promise((r) => setTimeout(r, nextDelay));
  }
}

async function recordFinalFailure(
  sb: any,
  queue_id: string,
  asset: any,
  code: string,
  message: string,
  attempts: AttemptRecord[],
) {
  const failure_payload = {
    code,
    message,
    attempts,
    attempt_count: attempts.length,
    finalized_at: new Date().toISOString(),
  };
  // 1. Persist structured failure record on the queue row itself.
  try {
    await sb.from("pinterest_video_queue").update({ failure_payload }).eq("id", queue_id);
  } catch (e) {
    console.warn("[pvp] recordFinalFailure queue update failed", (e as Error).message);
  }
  // 2. Mirror final failure reason onto the cinematic_ad_jobs row when the
  //    asset originated from a cinematic render — one place to diagnose
  //    end-to-end pipeline failures.
  try {
    await sb.from("cinematic_ad_jobs").update({
      pinterest_publish_error: `${code}: ${message}`,
      last_pinterest_attempt_at: new Date().toISOString(),
    }).eq("pinterest_asset_id", asset.id);
  } catch (e) {
    console.warn("[pvp] recordFinalFailure cinematic update failed", (e as Error).message);
  }
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
        if (isTestFixtureSlug(asset.product_slug)) {
          await logStage(sb, null, "queue_draft_blocked_test_fixture", "fail",
            { asset_id, product_slug: asset.product_slug }, trace_id);
          continue;
        }
        const product = await loadProductContext(sb, asset.product_slug);
        // try up to 8 variations: unique vs queue (variation_hash) + 30-day copy history
        let inserted = false;
        for (let attempt = 0; attempt < 8 && !inserted; attempt++) {
          const meta = generateVideoMeta({ asset_id, hook: asset.hook_type as VideoHook, attempt, product });
          if (await isCopyUsedRecently(sb, meta.variation_hash)) continue;
          // Category-match hard gate — block mismatched copy from ever entering the queue.
          if (product) {
            const cm = validateCategoryMatch({ product, title: meta.title, description: meta.description });
            if (!cm.ok) {
              await logStage(sb, null, "queue_draft_category_mismatch", "fail",
                { asset_id, attempt, title: meta.title, reason: cm.reason }, trace_id);
              continue; // try next variation
            }
          }
          // Text safe-area hard gate
          const sa = validateTextSafeArea({ pin_title: meta.title, cta_text: meta.cta_text });
          if (!sa.ok) {
            await logStage(sb, null, "queue_draft_safe_area_fail", "fail",
              { asset_id, attempt, violations: sa.violations }, trace_id);
            continue;
          }
          const destination_url = buildDestinationUrl(asset.product_slug);
          const { data, error } = await sb.from("pinterest_video_queue").insert({
            asset_id,
            status: "draft",
            title: meta.title,
            description: meta.description,
            hashtags: meta.hashtags,
            cta_text: meta.cta_text,
            destination_url,
            variation_hash: meta.variation_hash,
            hook_variant: meta.hook_variant,
            copy_variant: meta.copy_variant,
            cta_variant: meta.cta_variant,
          }).select("id").maybeSingle();
          if (!error && data) {
            created.push(data.id);
            await recordCopyHistory(sb, asset_id, meta);
            inserted = true;
          }
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
      const product = await loadProductContext(sb, asset.product_slug);
      for (let attempt = 1; attempt < 12; attempt++) {
        const meta = generateVideoMeta({ asset_id: row.asset_id, hook: asset.hook_type as VideoHook, attempt, product });
        if (meta.variation_hash === row.variation_hash) continue;
        if (await isCopyUsedRecently(sb, meta.variation_hash)) continue;
        const { error } = await sb.from("pinterest_video_queue").update({
          title: meta.title, description: meta.description, hashtags: meta.hashtags,
          cta_text: meta.cta_text, variation_hash: meta.variation_hash,
          hook_variant: meta.hook_variant, copy_variant: meta.copy_variant, cta_variant: meta.cta_variant,
        }).eq("id", queue_id);
        if (!error) {
          await recordCopyHistory(sb, row.asset_id, meta);
          return ok({ ok: true, traceId: trace_id, ...meta });
        }
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
      const allowed = await assertPublishAllowed(sb, row, queue_id, trace_id);
      if (!allowed.ok) return ok({ ok: false, traceId: trace_id, code: allowed.code, message: allowed.message });
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
      const result = await publishWithRetry({ sb, queue_id, asset, queueRow: { ...row, board_id }, token, trace_id });
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
      await recordFinalFailure(sb, queue_id, asset, result.code, result.message, result.attempts);
      await log.error("retry failed", { code: result.code, message: result.message }, { queue_id, asset_id: asset.id });
      return ok({ ok: false, traceId: trace_id, code: result.code, message: result.message, attempts: result.attempts });
    }

    // ── publish ─────────────────────────────────────────────────────
    if (action === "publish") {
      const queue_id = body.queue_id;
      if (!queue_id) return ok({ ok: false, code: "MISSING_QUEUE_ID", traceId: trace_id });
      const { data: row } = await sb.from("pinterest_video_queue").select("*").eq("id", queue_id).maybeSingle();
      if (!row) return ok({ ok: false, code: "QUEUE_NOT_FOUND", traceId: trace_id });
      if (row.pin_id) return ok({ ok: true, traceId: trace_id, pin_id: row.pin_id, pin_url: row.external_url, external_url: row.external_url, title: row.title, media_url: null, board: row.board_id, message: "already_published" });
      const allowed = await assertPublishAllowed(sb, row, queue_id, trace_id);
      if (!allowed.ok) return ok({ ok: false, traceId: trace_id, code: allowed.code, message: allowed.message });
      if (row.status === "awaiting_review" || row.status === "awaiting_render") {
        return ok({ ok: false, code: "AWAITING_REVIEW", traceId: trace_id, message: `row in status=${row.status}` });
      }
      const { data: asset } = await sb.from("pinterest_video_assets").select("*").eq("id", row.asset_id).maybeSingle();
      if (!asset) return ok({ ok: false, code: "ASSET_NOT_FOUND", traceId: trace_id });

      // ── Pre-publish creative QA (last line of defense) ──────────────
      if (isTestFixtureSlug(asset.product_slug)) {
        await sb.from("pinterest_video_queue").update({
          status: "blocked_test_fixture",
          error_message: `test_fixture_slug:${asset.product_slug}`,
        }).eq("id", queue_id);
        await logStage(sb, queue_id, "publish_blocked_test_fixture", "fail",
          { product_slug: asset.product_slug }, trace_id);
        return ok({ ok: false, code: "TEST_FIXTURE_BLOCKED", traceId: trace_id, message: `test fixture slug ${asset.product_slug}` });
      }
      const product = await loadProductContext(sb, asset.product_slug);
      if (product) {
        const cm = validateCategoryMatch({ product, title: row.title, description: row.description, hook: row.hook_variant });
        if (!cm.ok) {
          await sb.from("pinterest_video_queue").update({
            status: "creative_rejected",
            error_message: `category_mismatch: ${cm.reason}`,
          }).eq("id", queue_id);
          await logStage(sb, queue_id, "publish_blocked_category_mismatch", "fail",
            { product_slug: asset.product_slug, title: row.title, reason: cm.reason }, trace_id);
          return ok({ ok: false, code: "CATEGORY_MISMATCH", traceId: trace_id, message: cm.reason });
        }
      }
      const sa = validateTextSafeArea({ pin_title: row.title, cta_text: row.cta_text });
      if (!sa.ok) {
        await sb.from("pinterest_video_queue").update({
          status: "creative_rejected",
          error_message: `text_safe_area_failed: ${sa.violations.slice(0, 2).join("|")}`,
        }).eq("id", queue_id);
        await logStage(sb, queue_id, "publish_blocked_safe_area", "fail",
          { violations: sa.violations }, trace_id);
        return ok({ ok: false, code: "TEXT_SAFE_AREA_FAIL", traceId: trace_id, message: sa.violations.join("; ") });
      }

      const token = await getPinterestToken(sb);
      if (!token) return ok({ ok: false, code: "PINTEREST_NOT_CONNECTED", traceId: trace_id });
      const board_id = row.board_id || await resolveBoardId(sb, token);
      if (!board_id) return ok({ ok: false, code: "NO_BOARD", traceId: trace_id });

      await sb.from("pinterest_video_queue").update({
        status: "publishing",
        board_id,
        attempt_count: (row.attempt_count || 0) + 1,
      }).eq("id", queue_id);

      const result = await publishWithRetry({ sb, queue_id, asset, queueRow: { ...row, board_id }, token, trace_id });

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
        await recordFinalFailure(sb, queue_id, asset, result.code, result.message, result.attempts);
        await log.error("publish failed", { code: result.code, message: result.message }, { queue_id, asset_id: asset.id });
        return ok({ ok: false, traceId: trace_id, code: result.code, message: result.message, attempts: result.attempts });
      }
    }

    return ok({ ok: false, code: "UNKNOWN_ACTION", traceId: trace_id });
  } catch (e) {
    console.error(`[pvp ${trace_id}] fatal`, e);
    try { await log.error("fatal", { message: (e as Error)?.message, stack: (e as Error)?.stack?.slice(0, 800) }); } catch (_) {}
    return ok({ ok: false, code: "UNEXPECTED_ERROR", traceId: trace_id, message: (e as Error)?.message, stack: (e as Error)?.stack?.slice(0, 800) });
  }
});