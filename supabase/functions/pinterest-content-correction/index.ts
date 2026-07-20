import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  collectPinterestBannedCopyHits,
  sanitizePinterestBannedCopy,
} from "../_shared/pinterest-banned-copy.ts";
import {
  normalizeCategoryKey,
  pickCategoryOverlay,
  validateOverlayForCategory,
  validateCopyForCategory,
} from "../_shared/pinterest-overlay-fallback.ts";

const ACTIVE_STATUSES = ["draft", "approved", "queued", "publishing"];
const DUP_WINDOW_DAYS = 30;
const POSTED_CLEANUP_WINDOW_HOURS = 48;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripUtm(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    for (const k of Array.from(u.searchParams.keys())) {
      if (k.toLowerCase().startsWith("utm_") || k === "hook") u.searchParams.delete(k);
    }
    u.hash = "";
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return String(url);
  }
}

function imageContainsBannedText(url: string | null | undefined): boolean {
  if (!url) return false;
  let decoded = String(url);
  try { decoded = decodeURIComponent(decoded.replace(/%0A/gi, " ").replace(/\+/g, " ")); } catch { /* ignore */ }
  return /stop\s+scooping|shop\s+the\s+upgrade|discover\s+why|save\s+for\s+later|tired\s+of\s+litter|no\s+more\s+plastic\s+bag/i.test(decoded);
}

async function handle(req: Request, traceId: string) {
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  }
  const dryRun = body.dry_run === true;
  const includePosted = body.include_posted !== false; // default ON

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return jsonResponse({ ok: false, traceId, message: "backend_config_missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const cronSecret = req.headers.get("x-cron-secret") || "";
  let expectedCronSecret = Deno.env.get("PINTEREST_CRON_SECRET") || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Decode bearer JWT payload to see if it's a service_role token (covers
  // cron-issued tokens that may differ in string form from SERVICE_KEY).
  function decodeRole(tok: string): string | null {
    try {
      const parts = tok.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return typeof payload.role === "string" ? payload.role : null;
    } catch { return null; }
  }
  const role = bearerToken ? decodeRole(bearerToken) : null;

  // Fallback: load shared cron secret from app_config so pg_cron can call
  // this function without needing a deploy-time env secret.
  if (!expectedCronSecret) {
    try {
      const tmpAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: cfg } = await tmpAdmin
        .from("app_config")
        .select("value")
        .eq("key", "pinterest_cron_secret")
        .maybeSingle();
      const s = (cfg?.value as any)?.secret;
      if (typeof s === "string" && s.length > 16) expectedCronSecret = s;
    } catch { /* ignore */ }
  }

  const isServiceCaller =
    (expectedCronSecret && cronSecret && cronSecret === expectedCronSecret) ||
    (bearerToken && bearerToken === SERVICE_KEY) ||
    role === "service_role";

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!isServiceCaller) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return jsonResponse({ ok: false, traceId, message: "unauthorized" }, 401);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return jsonResponse({ ok: false, traceId, message: "forbidden_admin_only" }, 403);
  }

  // 1. Load all active pins.
  const { data: activeRows, error: loadErr } = await admin
    .from("pinterest_pin_queue")
    .select("id, status, product_slug, product_name, category_key, board_id, board_name, pin_title, pin_description, overlay_text, destination_link, pin_image_url, meta, hook_group, approved_at, scheduled_at, created_at")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (loadErr) throw new Error(`load_failed:${loadErr.message}`);

  // 2. Pull recent published+queued posts for 30-day duplicate detection per board.
  const since = new Date(Date.now() - DUP_WINDOW_DAYS * 86400_000).toISOString();
  const { data: historyRows } = await admin
    .from("pinterest_pin_queue")
    .select("id, status, board_id, pin_image_url, destination_link, created_at, posted_at")
    .in("status", ["queued", "approved", "publishing", "published"])
    .gte("created_at", since)
    .limit(5000);

  // Build seen-maps from historyRows ordered oldest-first, so the first occurrence wins.
  type SeenMap = Map<string, string>;
  const imagesByBoard = new Map<string, SeenMap>();
  const destsByBoard = new Map<string, SeenMap>();
  const ordered = [...(historyRows || [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const r of ordered) {
    const board = String((r as any).board_id || "");
    if (!board) continue;
    const img = String((r as any).pin_image_url || "");
    const dest = stripUtm((r as any).destination_link);
    if (!imagesByBoard.has(board)) imagesByBoard.set(board, new Map());
    if (!destsByBoard.has(board)) destsByBoard.set(board, new Map());
    const im = imagesByBoard.get(board)!;
    const dm = destsByBoard.get(board)!;
    if (img && !im.has(img)) im.set(img, String((r as any).id));
    if (dest && !dm.has(dest)) dm.set(dest, String((r as any).id));
  }

  const report: any[] = [];
  const samplesByBucket: Record<string, Set<string>> = {};
  let repaired = 0;
  let duplicatesImage = 0;
  let duplicatesDestination = 0;
  let rejected = 0;
  let untouched = 0;

  for (const raw of (activeRows || [])) {
    const row: any = { ...raw };
    const fixes: string[] = [];
    const reasons: string[] = [];
    let mustReject = false;
    let rejectReason: string | null = null;

    // 2a. Banned phrase in image URL — unrepairable, mark rejected.
    if (imageContainsBannedText(row.pin_image_url)) {
      mustReject = true;
      rejectReason = "banned_phrase_in_image_url";
      reasons.push(rejectReason);
    }

    // 2b. Banned phrase in copy fields — sanitize.
    const bannedHits = collectPinterestBannedCopyHits(row);
    const copyHits = bannedHits.filter((h) => h.field !== "image_url");
    if (copyHits.length > 0) {
      const fallback = pickCategoryOverlay(row.category_key, (row.id || "").length * 7 + 11, null);
      row.overlay_text = sanitizePinterestBannedCopy(row.overlay_text, fallback).slice(0, 32);
      row.pin_title = sanitizePinterestBannedCopy(row.pin_title, fallback).slice(0, 100);
      row.pin_description = sanitizePinterestBannedCopy(row.pin_description, `${fallback}. Free US shipping.`).slice(0, 500);
      if (row.meta && typeof row.meta === "object") {
        const meta = { ...row.meta } as Record<string, unknown>;
        meta.image_alt = sanitizePinterestBannedCopy(meta.image_alt ?? row.pin_title, row.pin_title);
        meta.cta = "Shop Now";
        meta.prompt = null;
        meta.image_prompt = null;
        meta.generated_image_prompt = null;
        row.meta = meta;
      }
      fixes.push("banned_copy_sanitised");
      reasons.push(...copyHits.map((h) => `banned:${h.field}:${h.phrase}`));
    }

    // 2c. Overlay must match the product category (positive + negative match).
    const overlayCheck = validateOverlayForCategory(row.overlay_text || "", row.category_key, { seed: (row.id || "x").length * 13 + 3 });
    if (!overlayCheck.ok) {
      row.overlay_text = (overlayCheck.repaired || pickCategoryOverlay(row.category_key, 1, null)).slice(0, 32);
      // Keep title aligned with overlay so the published pin actually reflects the category.
      row.pin_title = (row.overlay_text + (row.product_name ? ` — ${row.product_name}` : "")).slice(0, 100);
      fixes.push("overlay_category_rewritten");
      reasons.push(overlayCheck.reason || "creative_mismatch");
    }

    // 2d. Destination-only duplicates are NOT rejected anymore
    // (2026-06-12). The variety engine intentionally produces multiple
    // creative variants per product slug; only visual dupes are blocked
    // by the image-dup guard below.
    const board = String(row.board_id || "");

    // 2e. Duplicate image per board (rolling 30d).
    if (board && row.pin_image_url) {
      const im = imagesByBoard.get(board) || new Map<string, string>();
      const firstId = im.get(row.pin_image_url);
      if (firstId && firstId !== row.id) {
        mustReject = true;
        rejectReason = rejectReason || "duplicate_image_30d";
        duplicatesImage++;
        reasons.push(`duplicate_image_30d:first=${firstId}`);
      } else if (!firstId) {
        im.set(row.pin_image_url, row.id);
        imagesByBoard.set(board, im);
      }
    }

    // 2f. Track sample overlays per category bucket (post-repair).
    const bucket = normalizeCategoryKey(row.category_key, null);
    if (!samplesByBucket[bucket]) samplesByBucket[bucket] = new Set();
    if (row.overlay_text && samplesByBucket[bucket].size < 5) samplesByBucket[bucket].add(String(row.overlay_text));

    // 3. Apply mutations.
    if (mustReject) {
      if (!dryRun) {
        await admin.from("pinterest_pin_queue").update({
          status: "rejected",
          rejection_reason: rejectReason,
          qa_reasons: reasons.slice(0, 8),
          error_message: `content_correction: ${rejectReason}`,
          publishing_started_at: null,
        }).eq("id", row.id);
      }
      rejected++;
      report.push({ id: row.id, slug: row.product_slug, board_id: row.board_id, status: dryRun ? "would_reject" : "rejected", reason: rejectReason, reasons });
    } else if (fixes.length > 0) {
      if (!dryRun) {
        const { error: updErr } = await admin.from("pinterest_pin_queue").update({
          overlay_text: row.overlay_text,
          pin_title: row.pin_title,
          pin_description: row.pin_description,
          meta: row.meta,
        }).eq("id", row.id);
        if (updErr) {
          // Trigger may still reject — capture and mark rejected.
          await admin.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: "content_correction_trigger_block",
            error_message: updErr.message,
          }).eq("id", row.id);
          rejected++;
          report.push({ id: row.id, slug: row.product_slug, board_id: row.board_id, status: "rejected", reason: "content_correction_trigger_block", trigger_error: updErr.message, fixes, reasons });
          continue;
        }
      }
      repaired++;
      report.push({ id: row.id, slug: row.product_slug, board_id: row.board_id, status: dryRun ? "would_repair" : "repaired", fixes, reasons, overlay_text: row.overlay_text });
    } else {
      untouched++;
    }
  }

  const sample_overlays_per_category: Record<string, string[]> = {};
  for (const [bucket, set] of Object.entries(samplesByBucket)) {
    sample_overlays_per_category[bucket] = Array.from(set).slice(0, 5);
  }

  // Final live counts after run.
  const { count: activeCount } = await admin.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).in("status", ACTIVE_STATUSES);

  // 4. Posted (already-published) cleanup — scan last 48h, flag dirty pins,
  //    blocklist their images, and queue clean replacement drafts.
  const postedReport: any[] = [];
  let postedFlagged = 0;
  let blocklisted = 0;
  let replacementDraftsQueued = 0;
  if (includePosted) {
    const since = new Date(Date.now() - POSTED_CLEANUP_WINDOW_HOURS * 3600_000).toISOString();
    const { data: postedRows } = await admin
      .from("pinterest_pin_queue")
      .select("id, status, product_id, product_slug, product_name, category_key, board_id, board_name, pin_title, pin_description, overlay_text, destination_link, pin_image_url, image_hash, external_url, meta, hook_group, posted_at")
      .eq("status", "posted")
      .gte("posted_at", since)
      .limit(500);
    for (const raw of (postedRows || [])) {
      const row: any = raw;
      const reasons: string[] = [];
      const bannedHits = collectPinterestBannedCopyHits(row);
      if (bannedHits.length > 0) {
        reasons.push(...bannedHits.map((h) => `banned:${h.field}:${h.phrase}`));
      }
      const ovc = validateOverlayForCategory(row.overlay_text || "", row.category_key, { seed: 7 });
      if (!ovc.ok) reasons.push(ovc.reason || "overlay_mismatch");
      const tc = validateCopyForCategory(row.pin_title, row.category_key, "title");
      if (!tc.ok) reasons.push(tc.reason || "title_mismatch");
      const dc = validateCopyForCategory(row.pin_description, row.category_key, "description");
      if (!dc.ok) reasons.push(dc.reason || "description_mismatch");
      if (reasons.length === 0) continue;

      postedFlagged++;
      if (!dryRun) {
        const meta = (row.meta && typeof row.meta === "object") ? { ...row.meta } : {};
        (meta as any).bad_content = true;
        (meta as any).bad_content_reasons = reasons.slice(0, 12);
        (meta as any).bad_content_flagged_at = new Date().toISOString();
        await admin.from("pinterest_pin_queue")
          .update({ meta, rejection_reason: row.rejection_reason || "bad_content_posted" })
          .eq("id", row.id);

        // Blocklist the image so we never reuse it.
        if (row.pin_image_url) {
          const { error: blkErr } = await admin.from("pinterest_image_blocklist").insert({
            image_url: row.pin_image_url,
            image_hash: row.image_hash || null,
            reason: reasons[0] || "bad_content_posted",
            original_pin_id: row.id,
            external_pin_url: row.external_url || null,
            notes: reasons.slice(0, 5).join(" | "),
          });
          if (!blkErr) blocklisted++;
        }

        // Queue a clean replacement draft (no image — generator will pick a new one).
        try {
          const seed = (String(row.id).length * 17) + 5;
          const cleanOverlay = pickCategoryOverlay(row.category_key, seed, null);
          const cleanTitle = (row.product_name ? `${cleanOverlay} — ${row.product_name}` : cleanOverlay).slice(0, 100);
          const cleanDesc = `${cleanOverlay}. Free US shipping on getpawsy.pet.`.slice(0, 500);
          // GUARD: never insert a replacement draft without a valid Pinterest image.
          // Pull the product's primary image as a safe fallback so the publisher always has media.
          let replacementImage: string | null = null;
          try {
            const { data: prod } = await admin
              .from("products")
              .select("image_url")
              .eq("id", row.product_id)
              .maybeSingle();
            const candidate = String((prod as any)?.image_url || "").trim();
            if (/^https:\/\//i.test(candidate)) replacementImage = candidate;
          } catch (_) { /* non-fatal */ }
          if (!replacementImage) {
            // No usable image — skip the insert entirely instead of queueing a broken draft.
            continue;
          }
          const { data: ins, error: insErr } = await admin
            .from("pinterest_pin_queue")
            .insert({
              product_id: row.product_id,
              product_slug: row.product_slug,
              product_name: row.product_name,
              pin_variant: "replacement_v1",
              pin_title: cleanTitle,
              pin_description: cleanDesc,
              overlay_text: cleanOverlay.slice(0, 32),
              destination_link: row.destination_link,
              board_id: row.board_id,
              board_name: row.board_name,
              category_key: row.category_key,
              hook_group: row.hook_group,
              hashtags: [],
              priority: "high",
              status: "draft",
              replacement_for_pin_id: row.id,
              pin_image_url: replacementImage,
              validation_status: "valid",
              meta: { replacement_for: row.id, reasons: reasons.slice(0, 6) },
            })
            .select("id")
            .maybeSingle();
          if (!insErr && ins) replacementDraftsQueued++;
        } catch (_) { /* non-fatal */ }
      }
      postedReport.push({
        id: row.id,
        slug: row.product_slug,
        board: row.board_name,
        external_url: row.external_url,
        reasons,
      });
    }
  }

  return jsonResponse({
    ok: true,
    traceId,
    dry_run: dryRun,
    scanned: activeRows?.length ?? 0,
    repaired,
    duplicates_image: duplicatesImage,
    duplicates_destination: duplicatesDestination,
    rejected,
    untouched,
    active_after: activeCount ?? null,
    sample_overlays_per_category,
    report: report.slice(0, 200),
    posted_cleanup: {
      window_hours: POSTED_CLEANUP_WINDOW_HOURS,
      flagged: postedFlagged,
      blocklisted,
      replacement_drafts_queued: replacementDraftsQueued,
      sample: postedReport.slice(0, 50),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    // ── PCIE2_GLOBAL_STOP guard ──
    try {
      const { createClient: __c } = await import("https://esm.sh/@supabase/supabase-js@2.57.2?target=deno");
      const __sb = __c(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { checkPcie2Lock } = await import("../_shared/pcie2-publish-lock.ts");
      const __lock = await checkPcie2Lock(__sb, "pinterest-content-correction");
      if (__lock.blocked) {
        return jsonResponse({ ok: false, traceId, code: __lock.code, error_message: __lock.message, publishing_disabled: true, pipeline: "pcie2_only" }, 200);
      }
    } catch (e) {
      return jsonResponse({ ok: false, traceId, code: "PCIE2_GLOBAL_STOP_FAIL_CLOSED", error_message: String(e), publishing_disabled: true }, 200);
    }
    return await handle(req, traceId);
  } catch (e) {
    const error_message = e instanceof Error ? e.message : String(e);
    console.error("[pinterest-content-correction]", JSON.stringify({ traceId, error_message }));
    return jsonResponse({ ok: false, traceId, error_message }, 200);
  }
});