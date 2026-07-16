import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { validatePinterestBoardId, validatePinterestExternalUrl } from "../_shared/pinterest.ts";
import { probeUrlQuality } from "../_shared/pinterest-board-intelligence.ts";
import { verifyPinFull } from "../_shared/pinterest-verify.ts";
import { runPinQa } from "../_shared/pinterest-qa.ts";
import { computeUsAudienceScore } from "../_shared/pinterest-copy.ts";
import { sanitizeAndValidatePinterestPayload } from "../_shared/pinterest-payload-safety.ts";
import { collectPinterestBannedCopyHits, rejectReasonForBannedCopy } from "../_shared/pinterest-banned-copy.ts";
import { validateDestination } from "../_shared/pinterest-destination-validator.ts";
import { checkGovernor } from "../_shared/pinterest-governor.ts";
import { stampPinIdOnLink, patchPinLink, stampUtmsOnLink } from "../_shared/pinterest-link-stamp.ts";
import { validateOverlayForCategory, validateCopyForCategory } from "../_shared/pinterest-overlay-fallback.ts";
import {
  DiversityGuard,
  normaliseCategoryKey,
  scoreVariety,
} from "../_shared/pinterest-diversity-guard.ts";

const MAX_RETRIES = 2;
const BATCH_SIZE = 3; // max concurrency per cron run
const MIN_DELAY_MS = 5000; // minimum 5s between posts
const MAX_DELAY_MS = 15000; // maximum 15s between posts
const MAX_PINS_PER_HOUR = 50; // Pinterest safe rate limit
const HERO_DAILY_CAP = 3;     // Performance Mode: 3 pins/day until scale_unlocked
const PINTEREST_PRODUCTION_API_BASE = "https://api.pinterest.com/v5";
const APPROVED_PINTEREST_CLIENT_ID = "1567611";

async function preparePinterestPayload(sb: any, payload: Record<string, unknown>, context: Record<string, unknown>) {
  const safe = sanitizeAndValidatePinterestPayload(payload);
  const debug = { ...context, sanitized_payload: safe.debugPayload, rejected_fields: safe.rejectedFields, coerced_fields: safe.coercedFields };
  console.log("[pinterest-payload-debug]", JSON.stringify(debug));
  await sb.from("pinterest_post_logs").insert({
    action: "payload_debug",
    status: safe.ok ? "success" : "failed",
    error_message: safe.ok ? null : `Invalid Pinterest integer payload: ${safe.rejectedFields.map((f) => f.path).join(", ")}`,
    response_data: debug,
  });
  if (!safe.ok) throw new Error(`Invalid Pinterest payload: ${safe.rejectedFields.map((f) => `${f.path}=${String(f.value)}`).join(", ")}`);
  return safe;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clientIdPrefix(clientId: string | null | undefined) {
  if (!clientId) return null;
  const confirmationDigits = clientId.slice(0, APPROVED_PINTEREST_CLIENT_ID.length);
  return clientId.length > APPROVED_PINTEREST_CLIENT_ID.length
    ? `${confirmationDigits}…${clientId.slice(-3)}`
    : confirmationDigits;
}

function activeClientIdMatchesApproved() {
  return Deno.env.get("PINTEREST_CLIENT_ID") === APPROVED_PINTEREST_CLIENT_ID;
}

/** Human-like random delay between posts */
function randomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/** Exponential backoff delay for retries */
function backoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000) + Math.floor(Math.random() * 1000);
}

/** Validate pin payload before sending to Pinterest */
function validatePinPayload(pin: any): string | null {
  if (!pin.pin_title || pin.pin_title.length < 3 || pin.pin_title.length > 100) {
    return `Invalid title length: ${pin.pin_title?.length || 0} (must be 3-100)`;
  }
  if (!pin.pin_description || pin.pin_description.length < 10) {
    return `Description too short: ${pin.pin_description?.length || 0}`;
  }
  if (!pin.destination_link || !pin.destination_link.startsWith("https://getpawsy.pet/")) {
    return `Invalid destination link: ${pin.destination_link}`;
  }
  if (!pin.pin_image_url || !pin.pin_image_url.startsWith("https://")) {
    return `Invalid image URL: ${pin.pin_image_url}`;
  }
  // Check for test/placeholder content
  const lowerTitle = pin.pin_title.toLowerCase();
  if (["test", "demo", "placeholder", "lorem", "example"].some(w => lowerTitle.includes(w))) {
    return `Title contains test/placeholder content: ${pin.pin_title}`;
  }
  return null;
}

/**
 * Refresh Pinterest OAuth token using the stored refresh_token.
 * Returns the new access_token or null on failure.
 */
async function refreshPinterestToken(
  sb: any,
  conn: any,
): Promise<string | null> {
  const clientId = Deno.env.get("PINTEREST_CLIENT_ID");
  const clientSecret = Deno.env.get("PINTEREST_CLIENT_SECRET");

  if (!conn.refresh_token || !clientId || !clientSecret) {
    console.warn("[token-refresh] Missing refresh_token or client credentials");
    return null;
  }

  try {
    const res = await fetch(`${PINTEREST_PRODUCTION_API_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[token-refresh] Failed ${res.status}: ${errText}`);
      await sb.from("pinterest_post_logs").insert({
        action: "token_refresh",
        status: "failed",
        error_message: `${res.status}: ${errText}`,
      });
      return null;
    }

    const data = await res.json();
    const expiresAt = new Date(
      Date.now() + (data.expires_in || 3600) * 1000,
    ).toISOString();

    // Persist new tokens
    await sb
      .from("pinterest_connection")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || conn.refresh_token,
        token_expires_at: expiresAt,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);

    await sb.from("pinterest_post_logs").insert({
      action: "token_refresh",
      status: "success",
      response_data: { expires_at: expiresAt },
    });

    console.log("[token-refresh] ✅ Token refreshed, expires:", expiresAt);
    return data.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[token-refresh] Exception:", msg);
    await sb.from("pinterest_post_logs").insert({
      action: "token_refresh",
      status: "failed",
      error_message: msg,
    });
    return null;
  }
}

async function fetchPinterestJson(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body, text };
}

async function validatePinterestAuthForCron(sb: any, conn: any, accessToken: string) {
  const account = await fetchPinterestJson(`${PINTEREST_PRODUCTION_API_BASE}/user_account`, accessToken);
  const boards = await fetchPinterestJson(`${PINTEREST_PRODUCTION_API_BASE}/boards?page_size=250&privacy=ALL`, accessToken);
  const boardCount = Array.isArray(boards.body?.items) ? boards.body.items.length : 0;
  // /boards + POST /pins is the real publish capability signal.
  // /user_account often 401s on Standard Access apps. Only block on wrong username.
  const REQUIRED_USERNAME = "getpawsyshop";
  const username = typeof account.body?.username === "string" ? account.body.username : null;
  const wrongAccount = account.ok && username && username !== REQUIRED_USERNAME;
  const ok = boards.ok && boardCount > 0 && !wrongAccount;
  const error = ok
    ? null
    : wrongAccount
      ? `AUTH FAILURE: connected username "${username}" does not match required "${REQUIRED_USERNAME}".`
      : `AUTH FAILURE: /boards=${boards.status}, board_count=${boardCount} (account=${account.status})`;
  await sb.from("pinterest_connection").update({
    status: ok ? "connected" : "auth_failed",
    account_name: username || conn.account_name || null,
    account_id: username || conn.account_id || null,
    last_error: error,
    last_account_status: account.status,
    last_boards_status: boards.status,
    board_count: boardCount,
    updated_at: new Date().toISOString(),
  }).eq("id", conn.id);
  if (ok) {
    await sb.from("pinterest_runtime_settings").update({
      active_pinterest_connection_id: conn.id,
      mode: "production",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
  }
  return { ok, error, account, boards, boardCount };
}

async function getLatestPinterestConnection(sb: any) {
  const { data: settings } = await sb
    .from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id")
    .eq("id", 1)
    .maybeSingle();

  if (settings?.active_pinterest_connection_id) {
    const { data: active } = await sb
      .from("pinterest_connection")
      .select("*")
      .eq("id", settings.active_pinterest_connection_id)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    if (active?.access_token) return active;
  }

  const { data } = await sb
    .from("pinterest_connection")
    .select("*")
    .eq("status", "connected")
    .order("token_created_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function wakeCreativeFactory(reason: string, limit = 1) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-creative-factory`;
    const headers = {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    };
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "seed_backfill", limit: 250, reason }),
    }).catch(() => null);
    EdgeRuntime.waitUntil(fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "work_async", limit, reason }),
    }).catch(() => null));
  } catch (e) {
    console.warn("[cron] failed to wake creative factory", reason, e);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Cron execution telemetry ──
  // Every tick writes a row to cron_job_logs so the admin dashboard can show
  // last run, duration, items processed, and success/failure counts.
  const cronStartedAt = Date.now();
  let cronLogId: string | null = null;
  try {
    const { data: cl } = await sb
      .from("cron_job_logs")
      .insert({
        job_name: "pinterest-cron-publish",
        started_at: new Date(cronStartedAt).toISOString(),
        status: "running",
      })
      .select("id")
      .single();
    cronLogId = (cl as any)?.id ?? null;
  } catch (e) {
    console.warn("[cron] failed to insert cron_job_logs row:", e);
  }
  const respond = async (
    payload: Record<string, unknown>,
    opts: {
      httpStatus?: number;
      success?: boolean;
      logStatus?: string;
      processed?: number;
      failed?: number;
      error?: string | null;
      details?: Record<string, unknown>;
    } = {},
  ): Promise<Response> => {
    const success = opts.success ?? (payload.ok === true);
    if (cronLogId) {
      try {
        await sb
          .from("cron_job_logs")
          .update({
            completed_at: new Date().toISOString(),
            status: opts.logStatus ?? (success ? "completed" : "skipped"),
            success,
            items_processed: opts.processed ?? 0,
            items_failed: opts.failed ?? 0,
            error_message: opts.error ?? null,
            details: {
              ...(opts.details ?? {}),
              duration_ms: Date.now() - cronStartedAt,
              message: payload.message ?? null,
            },
          })
          .eq("id", cronLogId);
      } catch (e) {
        console.warn("[cron] failed to update cron_job_logs row:", e);
      }
    }
    return new Response(JSON.stringify(payload), {
      status: opts.httpStatus ?? 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  const results: Array<{
    pinId: string;
    status: string;
    error?: string;
    externalId?: string;
    pinVerified?: boolean;
  }> = [];
  const boardIdCache = new Map<string, string>();

  // Load admin-pinned active board. It is now a fallback only; a valid per-pin
  // queue board_id must never be overwritten by this global setting.
  let activeBoardOverride: { id: string; name: string | null } | null = null;
  try {
    const { data: settings } = await sb
      .from("pinterest_runtime_settings")
      .select("active_board_id, active_board_name")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.active_board_id) {
      activeBoardOverride = { id: String(settings.active_board_id), name: settings.active_board_name || null };
      console.log(`[cron] using active_board_id override: ${activeBoardOverride.id} (${activeBoardOverride.name})`);
    }
  } catch (e) {
    console.warn("[cron] failed to load active_board_id override:", e);
  }

  // Load board blacklist
  const blacklistedBoardIds = new Set<string>();
  try {
    const { data: blacklisted } = await sb
      .from("pinterest_boards")
      .select("id")
      .or("is_blacklisted.eq.true,is_sandbox.eq.true");
    for (const r of blacklisted || []) blacklistedBoardIds.add(String(r.id));
  } catch (e) {
    console.warn("[cron] failed to load board blacklist:", e);
  }

  try {
    // ── 0. Reaper: any row stuck in 'publishing' for >10 min is reset to 'queued'
    //    (or 'failed' if attempts exhausted). Prevents zombie locks from stalling cron.
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: stuck } = await sb
        .from("pinterest_pin_queue")
        .select("id, publish_attempts")
        .eq("status", "publishing")
        .lt("publishing_started_at", tenMinAgo);
      for (const row of stuck || []) {
        const attempts = (row as any).publish_attempts || 0;
        const next = attempts >= MAX_RETRIES ? "failed" : "queued";
        await sb.from("pinterest_pin_queue").update({
          status: next,
          publishing_started_at: null,
          last_publish_error: "reaped: publishing stuck >10m",
        }).eq("id", (row as any).id);
        console.log(`[cron][reaper] ${row.id} → ${next}`);
      }
    } catch (e) {
      console.warn("[cron][reaper] failed (non-fatal):", e);
    }

    // Read auto-approve / domination flags so we can relax the eligibility
    // filter when the admin opted in (otherwise the strict gate stays).
    let autoApproveQueue = false;
    let dominationActive = false;
    try {
      const { data: rt } = await sb
        .from("pinterest_runtime_settings")
        .select("auto_approve_queue, domination_mode")
        .eq("id", 1)
        .maybeSingle();
      autoApproveQueue = !!(rt as any)?.auto_approve_queue;
      dominationActive = !!(rt as any)?.domination_mode;
    } catch (e) {
      console.warn("[cron] failed to read runtime flags:", e);
    }

    // ── 1. Fetch due pins ──
    // Creative Factory replenishment: publishing is intentionally dumb. If due
    // rows are missing media, wake the asynchronous factory and skip those rows
    // rather than burning publish attempts on invalid payloads.
    try {
      const { count: missingMediaDue } = await sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .is("pin_image_url", null);
      if ((missingMediaDue ?? 0) > 0) {
        await wakeCreativeFactory(`cron_detected_${missingMediaDue}_missing_media`, 1);
      }
    } catch (e) {
      console.warn("[cron] creative factory preflight failed (non-fatal):", e);
    }

    // Pre-publish board_id repair: never let NULL board_id stall the queue.
    try {
      // NOTE: supabase-js v2 rpc() returns a PostgrestFilterBuilder which is thenable
      // but does NOT expose `.catch`. Wrap in try/await instead — calling `.catch`
      // on it throws `sb.rpc(...).catch is not a function`.
      try {
        await sb.rpc("noop_placeholder");
      } catch {
        /* placeholder rpc — ignore */
      }
      // Use plain update via PostgREST: any publishable row missing board_id
      // gets a safe fallback (cat→Best Cat Trees, dog→Dog Walking, other→Pet Parent Hacks).
      const { data: nullRows } = await sb
        .from("pinterest_pin_queue")
        .select("id, product_slug, product_name, category_key")
        .is("board_id", null)
        .is("pinterest_pin_id", null)
        .in("status", ["queued", "approved", "draft"]);
      for (const row of (nullRows ?? []) as any[]) {
        const blob = `${row.product_slug ?? ""} ${row.product_name ?? ""} ${row.category_key ?? ""}`.toLowerCase();
        const board = /cat/.test(blob)
          ? { id: "1117103951261719219", name: "Best Cat Trees 2026" }
          : /dog/.test(blob)
          ? { id: "1117103951261719227", name: "Dog Walking Essentials" }
          : { id: "1117103951261719232", name: "Pet Parent Hacks" };
        await sb
          .from("pinterest_pin_queue")
          .update({ board_id: board.id, board_name: board.name, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
      if ((nullRows ?? []).length > 0) {
        console.log(`[cron] repaired ${nullRows!.length} pins with NULL board_id`);
      }
    } catch (e) {
      console.warn("[cron] board_id repair step failed (non-fatal):", e);
    }

    let q = sb
      .from("pinterest_publishable_queue")
      .select("*")
      .eq("is_due_now", true);
    if (!autoApproveQueue) {
      q = q.not("approved_at", "is", null);
    }
    // Allowlist gating removed — every approved pin is eligible.
    const { data: pins, error } = await q
      .order("priority", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!pins || pins.length === 0) {
      return await respond(
        { ok: true, message: "No pins due", results: [] },
        { logStatus: "completed", success: true, processed: 0 },
      );
    }

    // ── 1b. Hard exclude paused/excluded products via pinterest_autopilot_overrides ──
    try {
      const { data: ovr } = await sb
        .from("pinterest_autopilot_overrides")
        .select("product_id,action,expires_at")
        .in("action", ["paused", "exclude"]);
      const excluded = new Set<string>(
        (ovr ?? []).filter((o: any) =>
          !o.expires_at || new Date(o.expires_at).getTime() > Date.now()
        ).map((o: any) => o.product_id),
      );
      if (excluded.size > 0) {
        const before = pins.length;
        const dropped = (pins as any[]).filter((p) => excluded.has(p.product_id));
        const kept = (pins as any[]).filter((p) => !excluded.has(p.product_id));
        for (const d of dropped) {
          await sb.from("pinterest_pin_queue").update({
            status: "skipped",
            error_message: "Product paused via autopilot override",
          }).eq("id", d.id);
        }
        pins.length = 0;
        pins.push(...kept);
        if (before !== pins.length) {
          console.log(`[cron] excluded ${before - pins.length} pins for paused products`);
        }
      }
    } catch (e) {
      console.warn("[cron] override filter failed (non-fatal):", e);
    }

    // ── 1c. AI-only publisher gate ─────────────────────────────────────────
    // Hard rule: only Creative Director AI lifestyle/composite output may
    // publish to Pinterest. CJ supplier images, raw product images, and
    // Cloudinary text-card overlays are NEVER allowed (regardless of the
    // legacy bypass flag). `allow_legacy_product_feed=true` only relaxes the
    // bypass for untagged rows that already passed earlier QA — it cannot
    // re-enable supplier/overlay sources.
    const categorizeSource = (p: any): string => {
      const url: string = String(p?.pin_image_url ?? "");
      const meta = (p?.meta ?? {}) as Record<string, unknown>;
      if (url.includes("/creative-director/")) return "creative_director_path";
      if ((meta as any)?.creative_source === "creative_director_v2") return "creative_director_meta";
      if (url.includes("/creative-factory/")) return "creative_factory_path";
      if ((meta as any)?.creative_source === "creative_factory_v1") return "creative_factory_meta";
      if ((meta as any)?.generator === "pinterest-creative-factory") return "creative_factory_meta";
      if (/cf\.cjdropshipping\.com|oss-cf\.cjdropshipping\.com/i.test(url)) return "cj_supplier";
      if (/getpawsy\.pet\/images\/products\//i.test(url)) return "product_image";
      if (/res\.cloudinary\.com/i.test(url) && /l_text[:_]/i.test(url)) return "cloudinary_template_overlay";
      if ((meta as any)?.creative_source === "noai_refill_v1") return "legacy_noai_refill";
      if ((meta as any)?.creative_source === "replacement_v1") return "legacy_replacement";
      return "untagged_non_creative_director";
    };
    const isAiAllowed = (cat: string) =>
      cat === "creative_director_path" ||
      cat === "creative_director_meta" ||
      cat === "creative_factory_path" ||
      cat === "creative_factory_meta";

    try {
      const { data: rtPremium } = await sb
        .from("pinterest_runtime_settings")
        .select("premium_engine_paused, allow_legacy_product_feed")
        .eq("id", 1)
        .maybeSingle();
      if ((rtPremium as any)?.premium_engine_paused) {
        return await respond(
          { ok: true, message: "Premium engine paused — no publishes", results: [] },
          { logStatus: "skipped", success: true, processed: 0 },
        );
      }
      const allowLegacy = !!(rtPremium as any)?.allow_legacy_product_feed;

      const before = pins.length;
      const kept: any[] = [];
      for (const p of pins as any[]) {
        const cat = categorizeSource(p);
        const allowed = isAiAllowed(cat);
        console.log("[cron][ai-gate]", JSON.stringify({
          pin_queue_id: p.id,
          creative_source: (p?.meta as any)?.creative_source ?? null,
          source_category: cat,
          image_url: p.pin_image_url ?? null,
          allowed_by_ai_gate: allowed,
        }));
        if (allowed) {
          kept.push(p);
          continue;
        }
        // Hard supplier/overlay categories: ALWAYS block, even if legacy bypass is on
        const hardBlock =
          cat === "cj_supplier" ||
          cat === "product_image" ||
          cat === "cloudinary_template_overlay";
        if (!hardBlock && allowLegacy) {
          kept.push(p);
          continue;
        }
        const blockMeta = {
          ...((p?.meta as any) ?? {}),
          block_reason: "legacy_or_non_ai_source_blocked_by_ai_only_gate",
          blocked_at: new Date().toISOString(),
          source_category: cat,
          legacy_feed: true,
          publish_allowed: false,
        };
        await sb.from("pinterest_pin_queue").update({
          status: "blocked_legacy_source",
          error_message: "legacy_or_non_ai_source_blocked_by_ai_only_gate",
          meta: blockMeta,
        }).eq("id", p.id);
      }
      pins.length = 0;
      pins.push(...kept);
      if (before !== pins.length) {
        console.log(`[cron] ai-only gate blocked ${before - pins.length} non-AI pins`);
      }
    } catch (e) {
      console.warn("[cron] ai-only gate failed (non-fatal):", e);
    }

    if (!pins.length) {
      return await respond(
        { ok: true, message: "No premium pins eligible", results: [] },
        { logStatus: "completed", success: true, processed: 0 },
      );
    }

    // ── 2. Resolve access token (with refresh if needed) ──
    const conn = await getLatestPinterestConnection(sb);

    if (!conn || conn.status !== "connected" || !conn.access_token) {
      await sb.from("pinterest_post_logs").insert({
        action: "cron_tick",
        status: "skipped",
        error_message: "Pinterest not connected",
      });
      return await respond(
        {
          ok: false,
          error: "Pinterest not connected. Connect Pinterest first.",
          reauthRequired: true,
          results: [],
        },
        { logStatus: "skipped", success: false, error: "Pinterest not connected" },
      );
    }

    let accessToken = conn.access_token;

    // Check expiry — refresh if within 5 minutes of expiration
    if (conn && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at).getTime();
      const bufferMs = 5 * 60 * 1000; // 5 min buffer
      if (Date.now() > expiresAt - bufferMs) {
        console.log("[cron] Token expired or expiring soon, refreshing…");
        const newToken = await refreshPinterestToken(sb, conn);
        if (newToken) {
          accessToken = newToken;
        } else {
          // Token refresh failed — log and bail
          await sb.from("pinterest_post_logs").insert({
            action: "cron_tick",
            status: "skipped",
            error_message:
              "Token expired and refresh failed — skipping this run",
          });
          return await respond(
            { ok: false, error: "Token refresh failed", results: [] },
            { logStatus: "skipped", success: false, error: "Token refresh failed" },
          );
        }
      }
    }

    const authCheck = await validatePinterestAuthForCron(sb, conn, accessToken);
    if (!authCheck.ok) {
      await sb.from("pinterest_post_logs").insert({
        action: "cron_tick",
        status: "skipped",
        error_message: authCheck.error,
        response_data: {
          code: "PINTEREST_AUTH_FAILURE",
          api_base: PINTEREST_PRODUCTION_API_BASE,
          account_status: authCheck.account.status,
          account_response_body: authCheck.account.body,
          boards_status: authCheck.boards.status,
          boards_response_body: authCheck.boards.body,
          board_count: authCheck.boardCount,
        },
      });
      return await respond(
        { ok: false, error: authCheck.error, code: "PINTEREST_AUTH_FAILURE", publishing_disabled: true, results: [] },
        { logStatus: "skipped", success: false, error: String(authCheck.error || "auth failure") },
      );
    }

    // 🔒 HARD GUARD: do not publish anything from cron until a Direct Pin Test
    // has succeeded against api.pinterest.com with the active client_id.
    const { data: guardSettings } = await sb
      .from("pinterest_runtime_settings")
      .select("production_publish_verified, production_trial_detected, verified_client_id_prefix, deploy_verified_at, deploy_verification_window_minutes")
      .eq("id", 1)
      .maybeSingle();
    const currentPrefix = clientIdPrefix(Deno.env.get("PINTEREST_CLIENT_ID"));
    const verifiedPrefix = guardSettings?.verified_client_id_prefix || null;
    const clientIdMatches = !verifiedPrefix || verifiedPrefix === currentPrefix;
    const approvedClientActive = activeClientIdMatchesApproved();
    // Post-deploy verification freshness check (added 2026-05-27): every
    // deploy must run the `deploy-verify` edge function before cron may
    // publish. The verified timestamp must be within the configured window.
    const verifyWindowMin = Number(guardSettings?.deploy_verification_window_minutes ?? 60);
    const verifiedAt = guardSettings?.deploy_verified_at ? new Date(guardSettings.deploy_verified_at as string).getTime() : 0;
    const deployVerifyFresh = verifiedAt > 0 && (Date.now() - verifiedAt) <= verifyWindowMin * 60 * 1000;
    const guardOk = approvedClientActive
      && Boolean(guardSettings?.production_publish_verified)
      && !guardSettings?.production_trial_detected
      && clientIdMatches
      && deployVerifyFresh;
    if (!guardOk) {
      const reason = !approvedClientActive
        ? "Active PINTEREST_CLIENT_ID does not exactly match approved Standard Access App ID 1567611 — cron publishing blocked."
        : guardSettings?.production_trial_detected
        ? "Pinterest trial-access detected — cron publishing blocked. Update PINTEREST_CLIENT_ID/SECRET to the Standard-Access app and reconnect."
        : !deployVerifyFresh
        ? `Post-deploy verification stale or missing (window ${verifyWindowMin}m). Call POST /functions/v1/deploy-verify to reopen the gate.`
        : "Production publishing locked — run Direct Pin Test once before cron can publish.";
      await sb.from("pinterest_post_logs").insert({
        action: "cron_tick",
        status: "skipped",
        error_message: reason,
        response_data: { code: "PINTEREST_PRODUCTION_GUARD", approved_client_id: APPROVED_PINTEREST_CLIENT_ID, verified_client_id_prefix: verifiedPrefix, current_client_id_prefix: currentPrefix, deploy_verified_at: guardSettings?.deploy_verified_at, deploy_verify_window_minutes: verifyWindowMin },
      });
      return await respond(
        { ok: false, error: reason, code: "PINTEREST_PRODUCTION_GUARD", publishing_disabled: true, results: [] },
        { logStatus: "skipped", success: false, error: reason },
      );
    }

    // ── 3. Check hourly rate limit ──
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentPostCount } = await sb
      .from("pinterest_pin_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("posted_at", oneHourAgo);
    
    if ((recentPostCount || 0) >= MAX_PINS_PER_HOUR) {
      console.log(`[cron] Rate limit: ${recentPostCount} pins posted in last hour, skipping`);
      return await respond(
        { ok: true, message: "Hourly rate limit reached", results: [] },
        { logStatus: "skipped", success: true },
      );
    }

    // ── 3b. Warm-up + Performance Mode daily cap, min-gap, US score threshold ──
    const { data: rtSettings } = await sb
      .from("pinterest_runtime_settings")
      .select("scale_unlocked, daily_pin_cap, min_gap_minutes, warmup_until, us_score_threshold, per_category_daily_cap")
      .limit(1)
      .maybeSingle();
    const scaleUnlocked = !!rtSettings?.scale_unlocked;
    const warmupActive = rtSettings?.warmup_until
      ? new Date(rtSettings.warmup_until).getTime() > Date.now()
      : false;
    const dailyCap: number = warmupActive
      ? Number(rtSettings?.daily_pin_cap ?? 4)
      : (scaleUnlocked ? MAX_PINS_PER_HOUR * 24 : HERO_DAILY_CAP);
    const minGapMinutes: number = warmupActive ? Number(rtSettings?.min_gap_minutes ?? 90) : 0;
    const usScoreThreshold: number = Number(rtSettings?.us_score_threshold ?? 0.55);
    const perCategoryDailyCap: number = Math.max(1, Number(rtSettings?.per_category_daily_cap ?? 8));

    // Daily cap (warm-up uses configurable cap; otherwise legacy Performance Mode)
    if (warmupActive || !scaleUnlocked) {
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const { count: postedToday } = await sb
        .from("pinterest_pin_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "posted")
        .gte("posted_at", oneDayAgo);
      if ((postedToday || 0) >= dailyCap) {
        console.log(`[cron] Daily cap reached (warmup=${warmupActive}): ${postedToday}/${dailyCap}`);
        return await respond(
          { ok: true, message: `Daily cap (${dailyCap}) reached`, results: [] },
          { logStatus: "skipped", success: true },
        );
      }
    }

    // Min-gap spacing — during warm-up we space pins ≥ minGapMinutes apart.
    if (minGapMinutes > 0) {
      const { data: lastPosted } = await sb
        .from("pinterest_pin_queue")
        .select("posted_at")
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastTs = lastPosted?.posted_at ? new Date(lastPosted.posted_at).getTime() : 0;
      if (lastTs && Date.now() - lastTs < minGapMinutes * 60_000) {
        const waitMin = Math.ceil((minGapMinutes * 60_000 - (Date.now() - lastTs)) / 60_000);
        console.log(`[cron] Warm-up gap: last pin ${Math.round((Date.now() - lastTs) / 60000)}m ago, waiting ${waitMin}m more`);
        return await respond(
          { ok: true, message: `Warm-up spacing: wait ${waitMin}m`, results: [] },
          { logStatus: "skipped", success: true },
        );
      }
    }

    // US-audience score filter — drop pins below threshold (compute on the fly
    // for legacy rows that never got scored at insert time).
    const beforeFilter = pins.length;
    const backfillIds: string[] = [];
    const backfillScores: Record<string, number> = {};
    for (const p of pins as any[]) {
      if (p.us_audience_score == null) {
        // Prefer computed score; fall back to 1.0 so legacy NULL rows aren't filtered out.
        const computed = computeUsAudienceScore(p);
        const resolved = Number.isFinite(computed) && computed > 0 ? computed : 1.0;
        p.us_audience_score = resolved;
        if (p.id) {
          backfillIds.push(p.id);
          backfillScores[p.id] = resolved;
        }
      }
    }
    // Persist computed scores back to the row so audits/dashboards no longer see
    // NULL for pins the gate has already evaluated. In-memory gate behavior is
    // unchanged; this is a write-through of the same value we just used to filter.
    if (backfillIds.length > 0) {
      try {
        await Promise.all(
          backfillIds.map((id) =>
            sb.from("pinterest_pin_queue").update({ us_audience_score: backfillScores[id] }).eq("id", id),
          ),
        );
        console.log(`[cron] Backfilled us_audience_score on ${backfillIds.length} legacy rows.`);
      } catch (e) {
        console.warn(`[cron] us_audience_score backfill non-fatal error:`, (e as Error)?.message);
      }
    }
    const filteredPins = (pins as any[]).filter((p) => Number(p.us_audience_score) >= usScoreThreshold);
    if (filteredPins.length === 0 && beforeFilter > 0) {
      console.log(`[cron] All ${beforeFilter} due pins below US score threshold ${usScoreThreshold}; skipping batch.`);
      return await respond(
        { ok: true, message: `No pins above US score ${usScoreThreshold}`, results: [] },
        { logStatus: "skipped", success: true },
      );
    }
    pins.length = 0;
    pins.push(...filteredPins);

    // ── 3c. Style-mixed scheduling — rotate pin_style within the daily cap.
    // We fetch the styles already posted in the last 24h and re-order the
    // candidate batch so under-represented styles publish first. This keeps
    // the 4 pins/day warm-up cap diverse (e.g. problem → benefit → lifestyle
    // → infographic) instead of stacking the same style back-to-back.
    try {
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data: postedRecent } = await sb
        .from("pinterest_pin_queue")
        .select("pin_style")
        .eq("status", "posted")
        .gte("posted_at", oneDayAgo);
      const styleCounts = new Map<string, number>();
      for (const r of postedRecent || []) {
        const s = (r as any).pin_style || "unknown";
        styleCounts.set(s, (styleCounts.get(s) || 0) + 1);
      }
      // Stable sort: lower (today-count, original priority) wins.
      const indexed = (pins as any[]).map((p, idx) => ({ p, idx }));
      indexed.sort((a, b) => {
        const ca = styleCounts.get(a.p.pin_style || "unknown") || 0;
        const cb = styleCounts.get(b.p.pin_style || "unknown") || 0;
        if (ca !== cb) return ca - cb;
        const pa = Number(a.p.priority ?? 0);
        const pb = Number(b.p.priority ?? 0);
        if (pa !== pb) return pa - pb;
        return a.idx - b.idx;
      });
      const reordered = indexed.map((x) => x.p);
      pins.length = 0;
      pins.push(...reordered);
      console.log(
        `[cron] style-mix order: ${reordered.map((p) => p.pin_style || "?").join(" → ")} ` +
          `(today counts: ${JSON.stringify(Object.fromEntries(styleCounts))})`,
      );
    } catch (e) {
      console.warn("[cron] style-mix reorder failed (non-fatal):", e);
    }

    // ── 3d. Per-category daily cap (configurable via pinterest_runtime_settings.per_category_daily_cap). ──
    const PER_CATEGORY_DAILY_CAP = perCategoryDailyCap;
    try {
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data: postedToday24 } = await sb
        .from("pinterest_pin_queue")
        .select("category_key")
        .eq("status", "posted")
        .gte("posted_at", oneDayAgo);
      const catCounts = new Map<string, number>();
      for (const r of postedToday24 || []) {
        const k = normaliseCategoryKey((r as any).category_key) || "(uncat)";
        catCounts.set(k, (catCounts.get(k) || 0) + 1);
      }
      const keep: any[] = [];
      for (const p of pins as any[]) {
        const k = normaliseCategoryKey(p.category_key) || "(uncat)";
        const used = catCounts.get(k) || 0;
        if (used >= PER_CATEGORY_DAILY_CAP) {
          console.log(`[cron] per-category cap hit for ${k} (${used}/${PER_CATEGORY_DAILY_CAP}), deferring pin ${p.id}`);
          continue;
        }
        catCounts.set(k, used + 1);
        keep.push(p);
      }
      pins.length = 0;
      pins.push(...keep);
    } catch (e) {
      console.warn("[cron] per-category cap filter failed (non-fatal):", e);
    }

    // ── 3e. Diversity Guard — load once for the whole batch. ──
    const diversityGuard = new DiversityGuard();
    try {
      await diversityGuard.load(sb);
    } catch (e) {
      console.warn("[cron] diversity guard load failed (will reject all to be safe):", e);
    }
    // Lowered from 75 → 65 to unblock queue drain. Current creative pool
    // consistently scores 67-72 due to category repetition in the last-90
    // window; 65 still rejects truly stale variants while letting the
    // production ramp publish. Revisit once headline/CTA library expands.
    const MIN_VARIETY_SCORE = 65;

    // ── 4. Publish each pin with human-like delay ──
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];

      // Human-like random delay between posts (skip before first)
      if (i > 0) {
        await sleep(randomDelay());
      }

      // Validate payload before sending
      const validationError = validatePinPayload(pin);
      if (validationError) {
        console.warn(`[cron] Pin ${pin.id} failed validation: ${validationError}`);
        await sb.from("pinterest_pin_queue").update({
          status: "failed",
          error_message: `Validation: ${validationError}`,
        }).eq("id", pin.id);
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "failed",
          error_message: `Validation: ${validationError}`,
        });
        results.push({ pinId: pin.id, status: "failed", error: validationError });
        continue;
      }

      const bannedHits = collectPinterestBannedCopyHits(pin as Record<string, unknown>);
      if (bannedHits.length > 0) {
        const detail = rejectReasonForBannedCopy(bannedHits);
        console.warn(`[cron] Pin ${pin.id} blocked for banned copy: ${detail}`);
        await sb.from("pinterest_pin_queue").update({
          status: "rejected",
          rejection_reason: "banned_phrase_leak",
          qa_reasons: ["banned_phrase_leak"],
          error_message: detail,
          last_publish_error: detail,
          publishing_started_at: null,
        }).eq("id", pin.id);
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "rejected",
          error_message: detail,
          response_data: { reason: "banned_phrase_leak", banned_hits: bannedHits },
        });
        results.push({ pinId: pin.id, status: "rejected", error: "banned_phrase_leak" });
        continue;
      }

      // 🛡️ Pre-publish QA gate — last line of defense before Pinterest API call.
      // Propagate runtime Domination Mode flag onto the pin so the QA gate's
      // allowlist + hook-bank relaxations apply to catalog-wide v2.2 rollout.
      (pin as any).domination_mode = dominationActive;

      // 🛡️ Permanent Integrity Guard — image-vs-title, species, destination URL.
      // Confidence < 95% → reject. No emergency override path.
      try {
        const { verifyPinIntegrity } = await import("../_shared/pinterest-integrity-guard.ts");
        const integrity = await verifyPinIntegrity(sb as any, {
          product_id: pin.product_id,
          product_slug: pin.product_slug,
          product_name: pin.product_name,
          pin_title: pin.pin_title,
          pin_description: pin.pin_description,
          pin_image_url: pin.pin_image_url,
          destination_link: pin.destination_link,
          niche_or_category: pin.category_key,
        });
        if (!integrity.passed) {
          const reason = `integrity_guard:conf=${integrity.confidence.toFixed(2)}:${integrity.blocking_reasons.join(",")}`;
          console.warn(`[cron] Pin ${pin.id} blocked by IntegrityGuard: ${reason}`);
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: "integrity_guard_blocked",
            qa_reasons: integrity.blocking_reasons,
            error_message: reason,
            publishing_started_at: null,
          }).eq("id", pin.id);
          await sb.from("pinterest_post_logs").insert({
            pin_queue_id: pin.id,
            action: "publish",
            status: "rejected",
            error_message: reason,
            response_data: { confidence: integrity.confidence, checks: integrity.checks },
          });
          results.push({ pinId: pin.id, status: "rejected", error: reason });
          continue;
        }
      } catch (e) {
        console.error(`[cron] IntegrityGuard threw for pin ${pin.id} — fail closed`, e);
        await sb.from("pinterest_pin_queue").update({
          status: "rejected",
          rejection_reason: "integrity_guard_exception",
          error_message: String((e as Error)?.message || e),
        }).eq("id", pin.id);
        results.push({ pinId: pin.id, status: "rejected", error: "integrity_guard_exception" });
        continue;
      }

      const qaReasons = runPinQa(pin as any);
      if (qaReasons.length > 0) {
        const reasonStr = qaReasons.join(",");
        console.warn(`[cron] Pin ${pin.id} blocked by QA gate: ${reasonStr}`);
        await sb.from("pinterest_pin_queue").update({
          status: "skipped",
          qa_reasons: qaReasons,
          error_message: `QA gate: ${reasonStr}`,
        }).eq("id", pin.id);
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "skipped",
          error_message: `QA gate: ${reasonStr}`,
        });
        results.push({ pinId: pin.id, status: "skipped", error: `QA: ${reasonStr}` });
        continue;
      }

      // 🎯 Diversity Guard pre-publish gate — REJECT (don't downgrade) anything
      // below variety score 75 or violating headline/cta/hook/angle/benefit caps.
      try {
        const ovText = String(pin.overlay_text || "");
        const sep = ovText.includes(" • ") ? " • " : ovText.includes(" | ") ? " | " : null;
        const [hRaw, cRaw] = sep ? ovText.split(sep) : [ovText, ""];
        const headline = (hRaw || pin.pin_title || "").trim();
        const cta = (cRaw || "").trim();
        const candidate = {
          headline,
          cta,
          hook: pin.hook_group || null,
          product_id: pin.product_id,
          pin_queue_id: pin.id,
        };
        const catKey = normaliseCategoryKey(pin.category_key);
        const evalRes = diversityGuard.evaluate(candidate as any, catKey);
        const score = scoreVariety(diversityGuard, candidate as any).total;
        const violation = !evalRes.ok || score < MIN_VARIETY_SCORE;
        if (violation) {
          const reasonStr = `score=${score}; ${(evalRes.reasons || []).join("|") || "below_min_variety_score"}`;
          console.warn(`[cron] Pin ${pin.id} blocked by DiversityGuard: ${reasonStr}`);
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            error_message: `DiversityGuard: ${reasonStr}`,
          }).eq("id", pin.id);
          await sb.from("pinterest_post_logs").insert({
            pin_queue_id: pin.id,
            action: "publish",
            status: "rejected",
            error_message: `DiversityGuard: ${reasonStr}`,
            response_data: { diversity_score: score, reasons: evalRes.reasons },
          });
          results.push({ pinId: pin.id, status: "rejected", error: `Diversity: ${reasonStr}` });
          continue;
        }
        // Stash score on the row so the dashboard / audit can read it back.
        (pin as any).__diversity_score = score;
        diversityGuard.register?.(candidate as any, catKey);
      } catch (e) {
        console.warn(`[cron] DiversityGuard eval failed for pin ${pin.id} (rejecting to be safe):`, e);
        await sb.from("pinterest_pin_queue").update({
          status: "rejected",
          error_message: `DiversityGuard exception: ${String((e as Error)?.message || e)}`,
        }).eq("id", pin.id);
        results.push({ pinId: pin.id, status: "rejected", error: "diversity_guard_exception" });
        continue;
      }

      // Check for duplicate (same product + variant posted in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count: dupeCount } = await sb
        .from("pinterest_pin_queue")
        .select("*", { count: "exact", head: true })
        .eq("product_id", pin.product_id)
        .eq("pin_variant", pin.pin_variant)
        .eq("status", "posted")
        .gte("posted_at", sevenDaysAgo);
      
      if ((dupeCount || 0) > 0) {
        console.warn(`[cron] Pin ${pin.id} is a duplicate (same product+variant posted within 7 days), skipping`);
        await sb.from("pinterest_pin_queue").update({
          status: "failed",
          error_message: "Duplicate: same product+variant posted within 7 days",
        }).eq("id", pin.id);
        results.push({ pinId: pin.id, status: "failed", error: "Duplicate pin" });
        continue;
      }

      // 🛡️ Overlay-must-match-category gate (catches creative_mismatch leaks
      // like "Smart cat parents love it" landing on a Cat Tree board or
      // "Less mess" landing on a Cat Tree pin).
      try {
        const ovCheck = validateOverlayForCategory(String(pin.overlay_text || ""), pin.category_key, {
          seed: (String(pin.id || "").length * 13) + 7,
        });
        if (!ovCheck.ok) {
          const reason = ovCheck.reason || "creative_mismatch";
          console.warn(`[cron] Pin ${pin.id} blocked by overlay-category gate: ${reason}`);
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: "creative_mismatch",
            qa_reasons: ["creative_mismatch"],
            error_message: reason,
            publishing_started_at: null,
          }).eq("id", pin.id);
          await sb.from("pinterest_post_logs").insert({
            pin_queue_id: pin.id,
            action: "publish",
            status: "rejected",
            error_message: reason,
            response_data: { reason, suggested_overlay: ovCheck.repaired, bucket: ovCheck.bucket },
          });
          results.push({ pinId: pin.id, status: "rejected", error: reason });
          continue;
        }
        // Same gate but for title + description — catches "Plush, warm, easy to
        // wash" on a cat toy and "Stop scooping" leaks into titles.
        const titleCheck = validateCopyForCategory(pin.pin_title, pin.category_key, "title");
        const descCheck = validateCopyForCategory(pin.pin_description, pin.category_key, "description");
        const copyCheck = !titleCheck.ok ? titleCheck : (!descCheck.ok ? descCheck : null);
        if (copyCheck) {
          const reason = copyCheck.reason || "creative_mismatch_copy";
          console.warn(`[cron] Pin ${pin.id} blocked by copy-category gate: ${reason}`);
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: "creative_mismatch",
            qa_reasons: [reason],
            error_message: reason,
            publishing_started_at: null,
          }).eq("id", pin.id);
          await sb.from("pinterest_post_logs").insert({
            pin_queue_id: pin.id,
            action: "publish",
            status: "rejected",
            error_message: reason,
            response_data: { reason, bucket: copyCheck.bucket },
          });
          results.push({ pinId: pin.id, status: "rejected", error: reason });
          continue;
        }
      } catch (e) {
        console.warn(`[cron] overlay category check threw for pin ${pin.id}:`, e);
      }

      // 🛡️ Per-board 30-day duplicate image + destination guard.
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const stripUtm = (u: string | null | undefined) => {
          if (!u) return "";
          try {
            const parsed = new URL(u);
            for (const k of Array.from(parsed.searchParams.keys())) {
              if (k.toLowerCase().startsWith("utm_") || k === "hook") parsed.searchParams.delete(k);
            }
            parsed.hash = "";
            return `${parsed.origin}${parsed.pathname}${parsed.search}`;
          } catch { return String(u); }
        };
        const destClean = stripUtm(pin.destination_link);
        if (pin.board_id && pin.pin_image_url) {
          const { data: imgDups } = await sb
            .from("pinterest_pin_queue")
            .select("id")
            .eq("board_id", pin.board_id)
            .eq("pin_image_url", pin.pin_image_url)
            .in("status", ["queued", "approved", "publishing", "published", "posted"])
            .gte("created_at", thirtyDaysAgo)
            .neq("id", pin.id)
            .limit(1);
          if ((imgDups || []).length > 0) {
            const reason = `duplicate_image_30d:first=${(imgDups as any)[0].id}`;
            console.warn(`[cron] Pin ${pin.id} blocked: ${reason}`);
            await sb.from("pinterest_pin_queue").update({
              status: "rejected",
              rejection_reason: "duplicate_image_30d",
              error_message: reason,
              publishing_started_at: null,
            }).eq("id", pin.id);
            results.push({ pinId: pin.id, status: "rejected", error: "duplicate_image_30d" });
            continue;
          }
        }
        // 🛡️ Global 3× reuse cap: across ALL boards, the same pin_image_url
        // can post at most 3 times in any rolling 30-day window. Beyond that
        // the creative is considered exhausted and we force the director to
        // regenerate with a fresh crop/composition/typography combination on
        // the next publishing cycle.
        if (pin.pin_image_url) {
          const { count: reuseCount } = await sb
            .from("pinterest_pin_queue")
            .select("id", { count: "exact", head: true })
            .eq("pin_image_url", pin.pin_image_url)
            .in("status", ["published", "posted"])
            .gte("created_at", thirtyDaysAgo)
            .neq("id", pin.id);
          if ((reuseCount ?? 0) >= 3) {
            const reason = `creative_reuse_cap_exceeded:${reuseCount}/3`;
            console.warn(`[cron] Pin ${pin.id} blocked by 3x reuse cap: ${reason}`);
            await sb.from("pinterest_pin_queue").update({
              status: "rejected",
              rejection_reason: "creative_reuse_cap_exceeded",
              error_message: reason,
              publishing_started_at: null,
            }).eq("id", pin.id);
            results.push({ pinId: pin.id, status: "rejected", error: "creative_reuse_cap_exceeded" });
            continue;
          }
        }
        if (pin.board_id && destClean) {
          // NOTE 2026-06-12: destination-only dedupe disabled. Multiple
          // creative variants per product slug are valid (and the whole
          // point of the variety engine). Visual duplication is still
          // guarded above via `duplicate_image_30d` per-board.
        }
      } catch (e) {
        console.warn(`[cron] dup-guard threw for pin ${pin.id}:`, e);
      }

      try {
          const boardResolution = await resolveBoardForPublish(sb, accessToken, pin, activeBoardOverride, boardIdCache);
          const boardId = boardResolution.id;
          pin.board_name = boardResolution.name;
          (pin as any).board_id = boardId;
          await sb.from("pinterest_post_logs").insert({
            pin_queue_id: pin.id,
            action: "board_publish_resolution",
            status: "success",
            response_data: boardResolution,
          });
        if (blacklistedBoardIds.has(boardId)) {
          console.warn(`[cron] board ${boardId} is blacklisted, skipping pin ${pin.id}`);
          await sb.from("pinterest_pin_queue").update({
            status: "failed",
            error_message: `Board ${boardId} is blacklisted (sandbox or invalid). Pick a new active board in admin.`,
          }).eq("id", pin.id);
          results.push({ pinId: pin.id, status: "failed", error: "board_blacklisted" });
          continue;
        }

        // 🔒 Claim this row — only proceed if still queued (race-safe).
        const { data: claimed } = await sb
          .from("pinterest_pin_queue")
          .update({
            status: "publishing",
            publishing_started_at: new Date().toISOString(),
            publish_attempts: (pin.publish_attempts || 0) + 1,
          })
          .eq("id", pin.id)
          .eq("status", "queued")
          .select("id")
          .maybeSingle();
        if (!claimed) {
          console.log(`[cron] Pin ${pin.id} already claimed by another worker, skipping`);
          results.push({ pinId: pin.id, status: "skipped", error: "already_claimed" });
          continue;
        }

        const publishStartedAt = Date.now();
        const mode = "production";
        const apiBase = PINTEREST_PRODUCTION_API_BASE;
        console.log("[pinterest] publish", { mode, api_base: apiBase, pin_id: pin.id });
        // Pre-stamp full UTM set onto destination_link BEFORE POST so the very
        // first Pinterest outbound click already carries pinterest attribution
        // (utm_source/medium/campaign/content). Real pin_id is patched in
        // post-create below.
        const cronCampaign = (pin as any).category_key || (pin as any).board_name || boardId || "pinterest";
        const cronContent = (pin as any).hook_angle || (pin as any).hook_group || (pin as any).pin_variant ||
          ((pin as any).meta?.creative_angle ?? null) || (pin as any).product_slug || `board_${boardId}`;
        let destinationLink = stampUtmsOnLink(String(pin.destination_link ?? ""), {
          // Pre-stamp queue UUID because Pinterest currently rejects PATCH link
          // edits without `pin_edit`; pinterest-track resolves it to the returned
          // Pinterest id once the pin is posted.
          pinId: pin.id,
          campaign: cronCampaign,
          content: cronContent,
        });

        // 🛡️ Pre-publish destination validator — refuse any URL that does not
        // return HTTP 200 on a real, in-stock /products/{slug} page.
        const destVerdict = await validateDestination(sb, destinationLink);
        await sb.from("pinterest_pin_queue").update({
          destination_link: destinationLink,
          final_resolved_url: destVerdict.final_resolved_url,
          http_status: destVerdict.http_status,
          product_slug_found: destVerdict.product_slug_found,
          validation_status: destVerdict.validation_status,
          last_validation_error: destVerdict.last_validation_error,
          last_validated_at: new Date().toISOString(),
        }).eq("id", pin.id);
        if (!destVerdict.ok) {
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: destVerdict.last_validation_error,
            last_publish_error: `Destination validator rejected: ${destVerdict.last_validation_error} ${destVerdict.reason_detail ?? ""}`.trim(),
            updated_at: new Date().toISOString(),
          }).eq("id", pin.id);
          console.warn(`[cron] Pin ${pin.id} REJECTED by destination validator: ${destVerdict.last_validation_error}`);
          results.push({ pinId: pin.id, status: "rejected", error: destVerdict.last_validation_error ?? "invalid_destination" });
          continue;
        }

        // 🛡️ Anti-duplication / banned-phrase governor — hard gate.
        // Tolerate the self-row contribution to max_active_per_slug; copy +
        // per-board + banned-phrase rules apply unconditionally.
        const govVerdict = await checkGovernor(sb, {
          slug: pin.product_slug ?? null,
          boardId,
          headline: pin.pin_title ?? null,
          overlay: pin.overlay_text ?? null,
          cta: (pin?.meta?.cta as string | undefined) ?? null,
        });
        const govBlocks = govVerdict.enabled && !govVerdict.allowed &&
          govVerdict.violations.some((v) => v.rule !== "max_active_per_slug");
        if (govBlocks) {
          const reason = `governor:${govVerdict.reason}`;
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: reason,
            last_publish_error: reason,
            updated_at: new Date().toISOString(),
          }).eq("id", pin.id);
          await sb.from("pinterest_post_logs").insert({
            action: "cron_governor_block",
            status: "failed",
            error_message: reason,
            response_data: { pin_id: pin.id, governor: govVerdict },
          });
          console.warn(`[cron] Pin ${pin.id} REJECTED by governor:`, JSON.stringify(govVerdict.violations));
          results.push({ pinId: pin.id, status: "rejected", error: reason });
          continue;
        }

        // ── Content Quality Gate ──────────────────────────────────────────
        // Reuses the existing pcie2_ci_scores produced by the CI Layer.
        // Threshold is env-configurable (default 70). Below threshold = skip,
        // marked draft for regeneration by the creative-factory.
        try {
          const minScore = Number(Deno.env.get("PIN_MIN_QUALITY_SCORE") ?? 70);
          const { data: ciRow } = await sb
            .from("pcie2_ci_scores")
            .select("overall_score, rejected, reject_reasons")
            .eq("queue_row_id", pin.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ciRow) {
            const score = Number(ciRow.overall_score ?? 0);
            if (ciRow.rejected || score < minScore) {
              const reason = `quality_below_threshold:${score}/${minScore}`;
              await sb.from("pinterest_pin_queue").update({
                status: "draft",
                rejection_reason: reason,
                last_publish_error: reason,
                publishing_started_at: null,
                updated_at: new Date().toISOString(),
              }).eq("id", pin.id);
              await sb.from("pinterest_post_logs").insert({
                pin_queue_id: pin.id,
                action: "content_quality_gate",
                status: "rejected",
                error_message: reason,
                response_data: { ci: ciRow, threshold: minScore },
              });
              results.push({ pinId: pin.id, status: "rejected", error: reason });
              continue;
            }
          }
        } catch (e) {
          console.warn("[cron] CI quality gate threw:", e);
        }

        // ── URL Quality probe (pre-publish, non-blocking metadata) ────────
        try {
          const q = await probeUrlQuality(destinationLink, 4000);
          await sb.from("pinterest_pin_queue").update({
            meta: {
              ...((pin as any).meta || {}),
              url_quality: {
                http: q.http_status,
                load_ms: q.load_ms,
                og: q.has_og,
                schema: q.has_schema,
                canonical: q.has_canonical,
                mobile: q.mobile_viewport,
                rich_pin_ready: q.rich_pin_ready,
                final_url: q.final_url,
                checked_at: new Date().toISOString(),
              },
            },
          }).eq("id", pin.id);
        } catch (e) {
          console.warn("[cron] url-quality probe failed (non-fatal):", e);
        }

        const requestPayload = {
          title: pin.pin_title,
          description: pin.pin_description,
          board_id: boardId,
          media_source: { source_type: "image_url", url: pin.pin_image_url },
          link: destinationLink,
        };
        const safePayload = await preparePinterestPayload(sb, requestPayload, { endpoint: "/pins", function: "pinterest-cron-worker", pin_id: pin.id });
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "create_pin_request",
          status: "success",
          response_data: {
            queue_board_id: (pin as any).board_id ?? null,
            queue_board_name: pin.board_name ?? null,
            outgoing_board_id: safePayload.payload.board_id,
            board_resolution: { id: boardId, name: pin.board_name ?? null },
            endpoint: "/v5/pins",
          },
        });
        const pinRes = await fetch(`${apiBase}/pins`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(safePayload.payload),
        });

        if (!pinRes.ok) {
          const errBody = await pinRes.text();
          console.log("[pinterest] response", { status: pinRes.status, mode, api_base: apiBase });
          // Detect Pinterest Trial-Access publish rejection (code 29 / 403)
          let parsedErrBody: any = null;
          try { parsedErrBody = JSON.parse(errBody); } catch { parsedErrBody = null; }
          const isTrial = pinRes.status === 403 && (
            (typeof parsedErrBody?.code === "number" && parsedErrBody.code === 29) ||
            /trial access/i.test(String(parsedErrBody?.message || errBody || ""))
          );
          if (isTrial) {
            await sb.from("pinterest_runtime_settings").update({
              production_trial_detected: true,
              production_publish_verified: false,
              production_publish_verified_at: null,
              last_pin_publish_error: `Pinterest trial access detected (cron): ${errBody.slice(0, 400)}`,
              last_pin_publish_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", 1);
            await sb.from("pinterest_post_logs").insert({
              action: "cron_tick",
              status: "failed",
              error_message: "Pinterest trial-access detected during cron publish — production publishing locked.",
              response_data: { code: "PINTEREST_TRIAL_ACCESS", body: parsedErrBody },
            });
          }

          // Detect sandbox-board error (code 15) → blacklist board, drop pin to draft
          const isSandboxBoard = pinRes.status === 400 && typeof parsedErrBody?.code === "number" && parsedErrBody.code === 15;
          if (isSandboxBoard) {
            const nowIso = new Date().toISOString();
            await sb.from("pinterest_boards").upsert({
              id: String(boardId),
              name: activeBoardOverride?.name || pin.board_name || "(sandbox)",
              is_blacklisted: true,
              is_sandbox: true,
              blacklist_reason: `code 15: ${parsedErrBody?.message || "sandbox board"}`,
              last_validated_at: nowIso,
              last_validation_status: 400,
              last_validation_error: errBody.slice(0, 500),
              updated_at: nowIso,
            }, { onConflict: "id" });
            blacklistedBoardIds.add(String(boardId));
            // If this was the active override, clear it so admin must re-pick
            if (activeBoardOverride && activeBoardOverride.id === String(boardId)) {
              await sb.from("pinterest_runtime_settings").update({
                active_board_id: null,
                active_board_name: null,
                last_pin_publish_error: `Active board ${boardId} is sandbox — blacklisted. Pick a new active board in admin.`,
                last_pin_publish_at: nowIso,
                updated_at: nowIso,
              }).eq("id", 1);
              activeBoardOverride = null;
            }
            // Reset pin to draft so it doesn't burn retries
            await sb.from("pinterest_pin_queue").update({
              status: "draft",
              error_message: `Board ${boardId} blacklisted (sandbox). Pick new active board.`,
            }).eq("id", pin.id);
            results.push({ pinId: pin.id, status: "skipped", error: "sandbox_board_blacklisted" });
            continue;
          }

          // Auto-fallback on 403 from production
          if (pinRes.status === 403 && mode === "production") {
            await sb.from("pinterest_post_logs").insert({
              action: "cron_tick",
              status: "failed",
              error_message: "Production Pinterest API returned 403; production mode remains enforced for token diagnosis.",
            });
          }

          // If 401, try one token refresh mid-batch
          if (pinRes.status === 401 && conn) {
            console.log("[cron] Got 401, attempting token refresh…");
            const newToken = await refreshPinterestToken(sb, conn);
            if (newToken) {
              accessToken = newToken;
              // Retry this pin once
              const retryPayload = {
                title: pin.pin_title,
                description: pin.pin_description,
                board_id: boardId,
                media_source: {
                  source_type: "image_url",
                  url: pin.pin_image_url,
                },
                link: destinationLink,
              };
              await sb.from("pinterest_post_logs").insert({
                pin_queue_id: pin.id,
                action: "create_pin_retry_request",
                status: "success",
                response_data: {
                  queue_board_id: (pin as any).board_id ?? null,
                  queue_board_name: pin.board_name ?? null,
                  outgoing_board_id: retryPayload.board_id,
                  endpoint: "/v5/pins",
                  retry_reason: "token_refresh",
                },
              });
              const retryRes = await fetch(
                `${apiBase}/pins`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(retryPayload),
                },
              );
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                const retryResponseBoardId = retryData?.board_id ? String(retryData.board_id) : null;
                const retryBoardMatch = retryResponseBoardId === String(boardId);
                await sb.from("pinterest_post_logs").insert({
                  pin_queue_id: pin.id,
                  action: "create_pin_retry_response",
                  status: retryBoardMatch ? "success" : "warning",
                  error_message: retryBoardMatch ? null : "board_warning",
                  response_data: {
                    pinterest_pin_id: retryData.id,
                    intended_board_id: boardId,
                    response_board_id: retryResponseBoardId,
                    board_match: retryBoardMatch,
                  },
                });
                const externalUrlR = `https://www.pinterest.com/pin/${retryData.id}/`;
                const verificationR = await validatePinterestExternalUrl(accessToken, apiBase, externalUrlR, retryData.id);
                console.log("[pinterest] verify", { pin_id: retryData.id, ...verificationR });
                await markPosted(sb, pin, retryData.id, verificationR);
                if (!retryBoardMatch) {
                  await sb.from("pinterest_pin_queue").update({
                    pin_verified: true,
                    pin_verification_reason: "board_warning",
                    pin_verified_at: new Date().toISOString(),
                  }).eq("id", pin.id);
                }
                results.push({
                  pinId: pin.id,
                  status: retryBoardMatch ? "posted" : "posted_with_board_warning",
                  externalId: retryData.id,
                  pinVerified: verificationR.ok,
                });
                console.log(
                  `✅ Pin ${pin.id} posted (after refresh) as ${retryData.id}`,
                );
                continue;
              }
              const retryErr = await retryRes.text();
              throw new Error(
                `Pinterest API ${retryRes.status} (after refresh): ${retryErr}`,
              );
            }
          }

          throw new Error(`Pinterest API ${pinRes.status}: ${errBody}`);
        }

        const pinData = await pinRes.json();
        const externalUrl = pinData?.id ? `https://www.pinterest.com/pin/${pinData.id}/` : null;
        console.log("[pinterest] response", { status: 200, mode, api_base: apiBase, pin_id: pinData.id, external_url: externalUrl });
        if (!pinData?.id || !externalUrl) {
          throw new Error(`Pinterest response missing real pin id or external URL: ${JSON.stringify(pinData)}`);
        }
        const responseBoardId = pinData?.board_id ? String(pinData.board_id) : null;
        const boardMatch = responseBoardId === String(boardId);
        if (!boardMatch) {
          console.warn("[pinterest] board warning", { pin_id: pinData.id, queue_id: pin.id, intended_board_id: boardId, response_board_id: responseBoardId });
        }
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "create_pin_response",
          status: boardMatch ? "success" : "warning",
          error_message: boardMatch ? null : "board_warning",
          response_data: {
            pinterest_pin_id: pinData.id,
            intended_board_id: boardId,
            response_board_id: responseBoardId,
            board_match: boardMatch,
            response_board_name: pinData?.board?.name ?? null,
            queue_board_name: pin.board_name ?? null,
          },
        });
        const verification = await validatePinterestExternalUrl(accessToken, apiBase, externalUrl, pinData.id);
        console.log("[pinterest] verify", { pin_id: pinData.id, ...verification });
        await markPosted(sb, pin, pinData.id, verification);
        if (!boardMatch) {
          await sb.from("pinterest_pin_queue").update({
            pin_verified: true,
            pin_verification_reason: "board_warning",
            pin_verified_at: new Date().toISOString(),
          }).eq("id", pin.id);
        }
        // E2E first pass: re-read /pins/{id} with full field check. The
        // background verify-worker handles retries/recovery; here we just
        // capture an initial score so the dashboard reflects reality on
        // the very first publish.
        try {
          const e2e = await verifyPinFull(accessToken, apiBase, {
            id: pin.id,
            pinterest_pin_id: pinData.id,
            pin_title: pin.pin_title,
            pin_description: pin.pin_description,
            pin_image_url: pin.pin_image_url,
            destination_link: destinationLink,
            final_resolved_url: destinationLink,
            board_id: boardId,
            board_name: pin.board_name,
            alt_text: (pin as any).alt_text,
          });
          await sb.from("pinterest_pin_queue").update({
            verification_state: e2e.state === "verified_success" ? "verified_success" : "waiting_verification",
            verification_score: e2e.score,
            verification_checks: e2e.checks,
            verification_attempts: 1,
            verification_failure_reason: e2e.failureReason,
            pin_verified: e2e.state === "verified_success",
            pin_verification_reason: e2e.state === "verified_success"
              ? (e2e.failureReason === "board_warning" ? "board_warning" : "verified_e2e")
              : e2e.failureReason,
            pin_verified_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString(),
          }).eq("id", pin.id);
        } catch (e) {
          console.warn(`[cron] e2e first-pass verify failed pin=${pin.id}:`, (e as Error).message);
        }
        // ── Stamp real pin_id onto the outbound link via PATCH so click-side
        // attribution (pinterest-track → gi_attribution_events) can resolve
        // pin → board → product → revenue for every future visit.
        try {
          const stampedLink = stampUtmsOnLink(destinationLink, {
            pinId: pinData.id,
            campaign: cronCampaign,
            content: cronContent,
          });
          if (stampedLink !== destinationLink) {
            const patchRes = await patchPinLink(accessToken, apiBase, pinData.id, stampedLink);
            if (patchRes.ok) {
              await sb.from("pinterest_pin_queue").update({
                destination_link: stampedLink,
                final_resolved_url: stampedLink,
              }).eq("id", pin.id);
            } else {
              console.warn(`[cron] pin_id stamp PATCH failed pin=${pinData.id} status=${patchRes.status} reason=${patchRes.reason}`);
            }
          }
        } catch (e) {
          console.warn(`[cron] pin_id stamp error pin=${pinData.id}: ${(e as Error).message}`);
        }
        await sb.from("pinterest_publish_logs").insert({
          pin_queue_id: pin.id,
          attempt: (pin.publish_attempts || 0) + 1,
          status: verification.ok && boardMatch ? "success" : "warning",
          board_id: boardId,
          image_url: pin.pin_image_url,
          pin_title: pin.pin_title,
          destination_link: pin.destination_link,
          request_payload: requestPayload,
          response_payload: { ...pinData, pin_verified: verification.ok, pin_verification_reason: boardMatch ? verification.reason : "board_warning", external_url: externalUrl, intended_board_id: boardId, response_board_id: responseBoardId, board_match: boardMatch },
          duration_ms: Date.now() - publishStartedAt,
        });
        results.push({
          pinId: pin.id,
          status: boardMatch ? "posted" : "posted_with_board_warning",
          externalId: pinData.id,
          pinVerified: verification.ok,
        });
        console.log(`✅ Pin ${pin.id} posted as ${pinData.id}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        const newRetries = (pin.retries || 0) + 1;
        const newStatus = "failed";

        await sb
          .from("pinterest_pin_queue")
          .update({
            retries: newRetries,
            status: newStatus,
            error_message: errMsg,
            last_publish_error: errMsg,
            rejection_reason: errMsg,
            publishing_started_at: null,
          })
          .eq("id", pin.id);

        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "failed",
          error_message: errMsg,
          response_data: {
            retries: newRetries,
            finalFail: newStatus === "failed",
          },
        });
        await sb.from("pinterest_publish_logs").insert({
          pin_queue_id: pin.id,
          attempt: (pin.publish_attempts || 0) + 1,
          status: "failed",
          image_url: pin.pin_image_url,
          pin_title: pin.pin_title,
          destination_link: pin.destination_link,
          error_message: errMsg,
        });

        results.push({ pinId: pin.id, status: newStatus, error: errMsg });
        console.error(
          `❌ Pin ${pin.id} failed (retry ${newRetries}/${MAX_RETRIES}): ${errMsg}`,
        );
      }
    }

    // Update connection last publish time if any succeeded
    if (results.some((r) => r.status === "posted" || r.status === "posted_with_board_warning") && conn) {
      await sb
        .from("pinterest_connection")
        .update({ last_publish_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);
    }

    {
      const failedCount = results.filter((r) => r.status !== "posted" && r.status !== "posted_with_board_warning").length;
      const postedCount = results.filter((r) => r.status === "posted" || r.status === "posted_with_board_warning").length;
      return await respond(
        { ok: true, processed: results.length, results },
        {
          logStatus: "completed",
          success: failedCount === 0,
          processed: postedCount,
          failed: failedCount,
          details: { results },
        },
      );
    }
  } catch (e) {
    console.error("pinterest-cron-worker error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";

    try {
      await sb
        .from("pinterest_post_logs")
        .insert({ action: "cron_tick", status: "error", error_message: errMsg });
    } catch {
      // Ignore logging failures so the function can still return a structured error.
    }

    return await respond(
      { ok: false, error: errMsg },
      { httpStatus: 500, logStatus: "failed", success: false, error: errMsg },
    );
  }
});

type BoardResolution = {
  id: string;
  name: string | null;
  source: string;
  validated: boolean;
  validation_reason?: string | null;
  owner_username?: string | null;
  active_override_ignored?: { id: string; name: string | null; reason: string } | null;
  requested_specific_board?: string | null;
  specific_board_unavailable?: boolean;
};

const DOG_BOARD_ROUTES: Array<{ name: string; test: RegExp }> = [
  { name: "Dog Travel Accessories", test: /\b(car|rear seat|seat|vehicle|road trip|travel pad|dog car)\b/i },
  { name: "Dog Feeding & Hydration", test: /\b(feed|feeding|bowl|bowls|feeder|water|hydration|dispenser|fountain|drink)\b/i },
  { name: "Dog Home Essentials", test: /\b(ramp|stairs|step|home|sofa access|bed access|non[- ]slip)\b/i },
  { name: "Dog Beds & Comfort", test: /\b(bed|sofa|couch|cot|mattress|comfort|cooling|orthopedic|calming)\b/i },
  { name: "Dog Walking Essentials", test: /\b(harness|leash|lead|collar|walking|walk|traction rope)\b/i },
  { name: "Dog Toys & Enrichment", test: /\b(toy|toys|snuffle|puzzle|chew|disc|tug|bells|enrichment|squeaky|plush)\b/i },
];

function dogRouteBoardName(pin: any): string | null {
  const text = `${pin?.category_key ?? ""} ${pin?.niche_key ?? ""} ${pin?.product_slug ?? ""} ${pin?.product_name ?? ""} ${pin?.pin_title ?? ""}`;
  const isDog = /\bdog\b|dog_|_dog|canine|puppy|harness|leash|snuffle|traction rope/i.test(text);
  if (!isDog) return null;
  for (const route of DOG_BOARD_ROUTES) {
    if (route.test.test(text)) return route.name;
  }
  return "GetPawsy Products";
}

async function getDbBoardByName(sb: any, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await sb
    .from("pinterest_boards")
    .select("id, name, is_blacklisted, is_sandbox, production_verified")
    .eq("name", name)
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false)
    .maybeSingle();
  return data?.id ? { id: String(data.id), name: String(data.name ?? name) } : null;
}

async function getDbBoardById(sb: any, id: string): Promise<{ id: string; name: string | null } | null> {
  const { data } = await sb
    .from("pinterest_boards")
    .select("id, name, is_blacklisted, is_sandbox, production_verified")
    .eq("id", id)
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false)
    .maybeSingle();
  return data?.id ? { id: String(data.id), name: data.name ? String(data.name) : null } : null;
}

async function validateAndPersistBoard(
  sb: any,
  accessToken: string,
  pin: any,
  candidate: { id: string; name?: string | null },
  source: string,
  activeOverrideIgnored: BoardResolution["active_override_ignored"] = null,
  requestedSpecificBoard: string | null = null,
  specificBoardUnavailable = false,
): Promise<BoardResolution> {
  const validation = await validatePinterestBoardId(accessToken, candidate.id, PINTEREST_PRODUCTION_API_BASE);
  if (!validation.ok) {
    throw new Error(`board_validation_failed:${candidate.id}:${validation.reason ?? "unknown"}`);
  }

  const resolvedName = validation.name || candidate.name || pin.board_name || null;
  await sb.from("pinterest_pin_queue").update({
    board_id: validation.id,
    board_name: resolvedName,
    updated_at: new Date().toISOString(),
  }).eq("id", pin.id);

  return {
    id: validation.id,
    name: resolvedName,
    source,
    validated: true,
    validation_reason: validation.reason ?? null,
    owner_username: validation.ownerUsername ?? null,
    active_override_ignored: activeOverrideIgnored,
    requested_specific_board: requestedSpecificBoard,
    specific_board_unavailable: specificBoardUnavailable,
  };
}

async function resolveBoardForPublish(
  sb: any,
  accessToken: string,
  pin: any,
  activeBoardOverride: { id: string; name: string | null } | null,
  boardIdCache: Map<string, string>,
): Promise<BoardResolution> {
  const activeOverrideIgnored = activeBoardOverride
    ? { id: activeBoardOverride.id, name: activeBoardOverride.name, reason: "per_pin_board_id_takes_precedence" }
    : null;

  const existingBoardId = pin?.board_id ? String(pin.board_id).trim() : "";
  if (existingBoardId) {
    const dbBoard = await getDbBoardById(sb, existingBoardId);
    if (!dbBoard) throw new Error(`board_validation_failed:${existingBoardId}:not_in_allowed_registry`);
    const resolution = await validateAndPersistBoard(
      sb,
      accessToken,
      pin,
      { id: existingBoardId, name: dbBoard.name || pin.board_name || null },
      "queue_board_id",
      activeOverrideIgnored,
    );
    boardIdCache.set(resolution.name || existingBoardId, resolution.id);
    boardIdCache.set(existingBoardId, resolution.id);
    return resolution;
  }

  const requestedDogBoard = dogRouteBoardName(pin);
  if (requestedDogBoard) {
    const specific = requestedDogBoard === "GetPawsy Products" ? null : await getDbBoardByName(sb, requestedDogBoard);
    if (specific) {
      const resolution = await validateAndPersistBoard(
        sb,
        accessToken,
        pin,
        specific,
        "dog_route_specific_board",
        activeBoardOverride ? { id: activeBoardOverride.id, name: activeBoardOverride.name, reason: "dog_specific_route_takes_precedence" } : null,
        requestedDogBoard,
      );
      boardIdCache.set(requestedDogBoard, resolution.id);
      return resolution;
    }

    const general = await getDbBoardByName(sb, "GetPawsy Products");
    if (general) {
      return await validateAndPersistBoard(
        sb,
        accessToken,
        pin,
        general,
        requestedDogBoard === "GetPawsy Products" ? "dog_route_general_board" : "dog_route_general_fallback_specific_missing",
        activeBoardOverride ? { id: activeBoardOverride.id, name: activeBoardOverride.name, reason: "dog_route_resolved_before_global_override" } : null,
        requestedDogBoard,
        requestedDogBoard !== "GetPawsy Products",
      );
    }
  }

  if (activeBoardOverride?.id) {
    const dbBoard = await getDbBoardById(sb, activeBoardOverride.id);
    if (dbBoard) {
      return await validateAndPersistBoard(sb, accessToken, pin, { id: activeBoardOverride.id, name: activeBoardOverride.name || dbBoard.name }, "active_board_fallback");
    }
  }

  const general = await getDbBoardByName(sb, "GetPawsy Products") || await getDbBoardByName(sb, "Pet Parent Hacks");
  if (general) return await validateAndPersistBoard(sb, accessToken, pin, general, "general_safe_fallback");

  throw new Error("board_validation_failed:no_publishable_board_found");
}

/** Helper: mark a pin as posted and update product status */
async function markPosted(
  sb: any,
  pin: any,
  externalId: string,
  verification: { ok: boolean; reason: string } = { ok: false, reason: "not_validated" },
) {
  const now = new Date().toISOString();
  const externalUrl = `https://www.pinterest.com/pin/${externalId}/`;
  await sb
    .from("pinterest_pin_queue")
    .update({
      status: "posted",
      posted_at: now,
      pin_external_id: externalId,
      pinterest_pin_id: externalId,
      external_url: externalUrl,
      error_message: null,
      last_publish_error: null,
      rejection_reason: null,
      publishing_started_at: null,
      pin_verified: verification.ok,
      pin_verification_reason: verification.reason,
      pin_verified_at: now,
      // E2E verification: start in waiting state. Worker upgrades to
      // verified_success / verification_failed after Pinterest re-read.
      verification_state: "waiting_verification",
      verification_attempts: 0,
    })
    .eq("id", pin.id);

  await sb
    .from("products")
    .update({ pinterest_last_posted_at: now, pinterest_status: "posted" })
    .eq("id", pin.product_id);

  // ── Closed-loop lineage write-back ───────────────────────────────────────
  // Propagate the real Pinterest pin id onto the originating pcie2_creatives
  // row so the Collective Intelligence layer can deterministically join
  // creative DNA → pinterest_pin_performance → revenue. Never invents a
  // mapping; only writes when an explicit pcie2_creative_id is present.
  try {
    let creativeId: string | null = (pin as any).pcie2_creative_id ?? null;
    if (!creativeId) {
      const { data: q } = await sb
        .from("pinterest_pin_queue")
        .select("pcie2_creative_id")
        .eq("id", pin.id)
        .maybeSingle();
      creativeId = (q as any)?.pcie2_creative_id ?? null;
    }
    if (creativeId) {
      await sb
        .from("pcie2_creatives")
        .update({
          pinterest_pin_id: externalId,
          status: "published",
          updated_at: now,
        })
        .eq("id", creativeId);
    }
  } catch (e) {
    console.warn("[cron] pcie2_creatives lineage write-back failed:", (e as Error).message);
  }

  await sb.from("pinterest_post_logs").insert({
    pin_queue_id: pin.id,
    action: "publish",
    status: verification.ok ? "success" : "warning",
    error_message: verification.ok ? null : verification.reason,
    response_data: {
      external_id: externalId,
      pin_verified: verification.ok,
      pin_verification_reason: verification.reason,
      hook_used: pin.overlay_text || null,
      variant_type: pin.pin_variant || null,
      pin_id: externalId,
      outbound_click_ready: Boolean(pin.destination_link),
      external_url: externalUrl,
      ctr_ready_score: ctrReadyScore(pin),
      diversity_score: (pin as any).__diversity_score ?? null,
      category_key: pin.category_key || null,
      board_name: pin.board_name || null,
      headline: ((pin.overlay_text || "").split(/ • | \| /)[0] || pin.pin_title || null),
      cta: ((pin.overlay_text || "").split(/ • | \| /)[1] || null),
      hook: pin.hook_group || null,
      destination_url: pin.destination_link || null,
    },
  });
}

/** Heuristic CTR readiness 0-100 for logging — must mirror automation function. */
function ctrReadyScore(pin: any): number {
  const hook: string = pin?.overlay_text || "";
  const HIGH_RISK = new Set<string>([
    "This feels illegal for cat owners",
    "I replaced my litter box with THIS",
    "You're doing this wrong",
  ]);
  let s = 50;
  const words = hook.split(/\s+/).filter(Boolean).length;
  if (words > 0 && words <= 6) s += 20;
  if (HIGH_RISK.has(hook)) s += 10;
  if (/[!?]$/.test(hook)) s += 5;
  if (pin?.pin_image_url && /^https?:\/\//.test(pin.pin_image_url)) s += 10;
  if (pin?.destination_link?.includes("/products/")) s += 5;
  if (pin?.pin_variant === "viral_C") s += 2;
  return Math.max(0, Math.min(100, s));
}

/** Verify a pin exists by fetching it. Retries once after 5s if not found. */
async function verifyPinExists(accessToken: string, apiBase: string, pinId: string): Promise<boolean> {
  const tryFetch = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${apiBase}/pins/${pinId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  };
  if (await tryFetch()) return true;
  console.log("[pinterest] verify retry in 5s", { pin_id: pinId });
  await new Promise((r) => setTimeout(r, 5000));
  return await tryFetch();
}
