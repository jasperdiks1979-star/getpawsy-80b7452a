import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { resolvePinterestBoardId, validatePinterestExternalUrl } from "../_shared/pinterest.ts";
import { runPinQa, PINTEREST_ALLOWED_SLUGS } from "../_shared/pinterest-qa.ts";
import { computeUsAudienceScore } from "../_shared/pinterest-copy.ts";
import { sanitizeAndValidatePinterestPayload } from "../_shared/pinterest-payload-safety.ts";

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

  // Load admin-pinned active board (overrides per-pin board_name routing)
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
    let q = sb
      .from("pinterest_pin_queue")
      .select("*")
      .eq("status", "queued")
      .or("profit_state.is.null,profit_state.neq.kill")
      .lte("scheduled_at", new Date().toISOString())
      .lt("retries", MAX_RETRIES);
    if (!autoApproveQueue) {
      q = q.not("approved_at", "is", null);
    }
    if (!dominationActive) {
      q = q.in("product_slug", Array.from(PINTEREST_ALLOWED_SLUGS));
    }
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
      .select("production_publish_verified, production_trial_detected, verified_client_id_prefix")
      .eq("id", 1)
      .maybeSingle();
    const currentPrefix = clientIdPrefix(Deno.env.get("PINTEREST_CLIENT_ID"));
    const verifiedPrefix = guardSettings?.verified_client_id_prefix || null;
    const clientIdMatches = !verifiedPrefix || verifiedPrefix === currentPrefix;
    const approvedClientActive = activeClientIdMatchesApproved();
    const guardOk = approvedClientActive && Boolean(guardSettings?.production_publish_verified) && !guardSettings?.production_trial_detected && clientIdMatches;
    if (!guardOk) {
      const reason = !approvedClientActive
        ? "Active PINTEREST_CLIENT_ID does not exactly match approved Standard Access App ID 1567611 — cron publishing blocked."
        : guardSettings?.production_trial_detected
        ? "Pinterest trial-access detected — cron publishing blocked. Update PINTEREST_CLIENT_ID/SECRET to the Standard-Access app and reconnect."
        : "Production publishing locked — run Direct Pin Test once before cron can publish.";
      await sb.from("pinterest_post_logs").insert({
        action: "cron_tick",
        status: "skipped",
        error_message: reason,
        response_data: { code: "PINTEREST_PRODUCTION_GUARD", approved_client_id: APPROVED_PINTEREST_CLIENT_ID, verified_client_id_prefix: verifiedPrefix, current_client_id_prefix: currentPrefix },
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
      .select("scale_unlocked, daily_pin_cap, min_gap_minutes, warmup_until, us_score_threshold")
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
    for (const p of pins as any[]) {
      if (p.us_audience_score == null) {
        p.us_audience_score = computeUsAudienceScore(p);
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

      // 🛡️ Pre-publish QA gate — last line of defense before Pinterest API call.
      const qaReasons = runPinQa(pin);
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

      try {
        let boardId: string;
        if (activeBoardOverride) {
          boardId = activeBoardOverride.id;
        } else {
          const boardRef = pin.board_name || "";
          boardId = boardIdCache.has(boardRef)
            ? boardIdCache.get(boardRef)!
            : await resolvePinterestBoardId(accessToken, boardRef, PINTEREST_PRODUCTION_API_BASE);
          if (!boardIdCache.has(boardRef)) boardIdCache.set(boardRef, boardId);
        }
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
        // Inject board-level UTM attribution so analytics can attribute traffic
        // to the specific Pinterest board (Phase 2 — traffic quality tracking).
        let destinationLink = pin.destination_link as string;
        try {
          const u = new URL(destinationLink);
          if (!u.searchParams.get("utm_source")) u.searchParams.set("utm_source", "pinterest");
          if (!u.searchParams.get("utm_medium")) u.searchParams.set("utm_medium", "social");
          u.searchParams.set("utm_content", `board_${boardId}`);
          destinationLink = u.toString();
        } catch {
          // leave destination as-is if URL parsing fails — QA gate already validates
        }
        const requestPayload = {
          title: pin.pin_title,
          description: pin.pin_description,
          board_id: boardId,
          media_source: { source_type: "image_url", url: pin.pin_image_url },
          link: destinationLink,
        };
        const safePayload = await preparePinterestPayload(sb, requestPayload, { endpoint: "/pins", function: "pinterest-cron-worker", pin_id: pin.id });
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
              const retryRes = await fetch(
                `${apiBase}/pins`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    title: pin.pin_title,
                    description: pin.pin_description,
                    board_id: boardId,
                    media_source: {
                      source_type: "image_url",
                      url: pin.pin_image_url,
                    },
                    link: pin.destination_link,
                  }),
                },
              );
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                const externalUrlR = `https://www.pinterest.com/pin/${retryData.id}/`;
                const verificationR = await validatePinterestExternalUrl(accessToken, apiBase, externalUrlR, retryData.id);
                console.log("[pinterest] verify", { pin_id: retryData.id, ...verificationR });
                await markPosted(sb, pin, retryData.id, verificationR);
                results.push({
                  pinId: pin.id,
                  status: "posted",
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
        const verification = await validatePinterestExternalUrl(accessToken, apiBase, externalUrl, pinData.id);
        console.log("[pinterest] verify", { pin_id: pinData.id, ...verification });
        await markPosted(sb, pin, pinData.id, verification);
        await sb.from("pinterest_publish_logs").insert({
          pin_queue_id: pin.id,
          attempt: (pin.publish_attempts || 0) + 1,
          status: verification.ok ? "success" : "warning",
          board_id: boardId,
          image_url: pin.pin_image_url,
          pin_title: pin.pin_title,
          destination_link: pin.destination_link,
          request_payload: requestPayload,
          response_payload: { ...pinData, pin_verified: verification.ok, pin_verification_reason: verification.reason, external_url: externalUrl },
          duration_ms: Date.now() - publishStartedAt,
        });
        results.push({
          pinId: pin.id,
          status: "posted",
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
    if (results.some((r) => r.status === "posted") && conn) {
      await sb
        .from("pinterest_connection")
        .update({ last_publish_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);
    }

    {
      const failedCount = results.filter((r) => r.status !== "posted").length;
      const postedCount = results.filter((r) => r.status === "posted").length;
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
    })
    .eq("id", pin.id);

  await sb
    .from("products")
    .update({ pinterest_last_posted_at: now, pinterest_status: "posted" })
    .eq("id", pin.product_id);

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
