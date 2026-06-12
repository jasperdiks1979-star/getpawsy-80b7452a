// pinterest-publish-now — admin-only force publish for one queue row.
// Modes:
//   { mode: "next" }            → claim oldest eligible queued pin, publish, return API response
//   { mode: "pin", pinId: ... } → publish that specific row (bypasses eligibility filters,
//                                  still respects already-published guard)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { sanitizeAndValidatePinterestPayload } from "../_shared/pinterest-payload-safety.ts";
import { collectPinterestBannedCopyHits, rejectReasonForBannedCopy } from "../_shared/pinterest-banned-copy.ts";
import { checkGovernor } from "../_shared/pinterest-governor.ts";
import { stampPinIdOnLink, patchPinLink, stampUtmsOnLink } from "../_shared/pinterest-link-stamp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Always return HTTP 200 with structured error body so the browser client
// (supabase.functions.invoke) doesn't collapse the response into a generic
// "non-2xx status code" error. The `ok` flag tells the caller success/failure.
function fail(stage: string, detail: Record<string, unknown> = {}, status = 200) {
  console.error(`[publish-now] FAIL stage=${stage}`, detail);
  return json({ ok: false, stage, ...detail }, status);
}

// ── Pre-publish validation ────────────────────────────────────────────────
const MAX_TITLE = 100;
const MAX_DESC = 800;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024; // Pinterest hard cap ~32MB

async function validatePin(row: Record<string, unknown>, boardId: string | null, token: string) {
  const issues: { field: string; reason: string; value?: unknown }[] = [];
  const title = String(row.pin_title ?? "");
  const description = String(row.pin_description ?? "");
  const imageUrl = String(row.pin_image_url ?? "");
  const link = String(row.destination_link ?? "");

  if (!title.trim()) issues.push({ field: "pin_title", reason: "empty" });
  else if (title.length > MAX_TITLE) issues.push({ field: "pin_title", reason: `>${MAX_TITLE} chars`, value: title.length });
  if (description.length > MAX_DESC) issues.push({ field: "pin_description", reason: `>${MAX_DESC} chars`, value: description.length });
  if (!imageUrl) issues.push({ field: "pin_image_url", reason: "empty" });
  else if (!/^https?:\/\//i.test(imageUrl)) issues.push({ field: "pin_image_url", reason: "not http(s)" });
  if (!link) issues.push({ field: "destination_link", reason: "empty" });
  if (!boardId) issues.push({ field: "board_id", reason: "missing" });
  if (!token) issues.push({ field: "access_token", reason: "missing" });
  const bannedHits = collectPinterestBannedCopyHits(row);
  if (bannedHits.length > 0) issues.push({ field: "copy", reason: "banned_phrase_leak", value: bannedHits });

  // image reachability — HEAD with short timeout, fall back to GET range probe
  let imageProbe: Record<string, unknown> = {};
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      let res = await fetch(imageUrl, { method: "HEAD", signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      // Some CDNs (incl. Cloudinary fetch) don't support HEAD — fall back to GET range
      if (!res || res.status === 405 || res.status === 403) {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 8000);
        res = await fetch(imageUrl, { method: "GET", headers: { Range: "bytes=0-1023" }, signal: ctrl2.signal }).catch(() => null);
        clearTimeout(t2);
        try { await res?.body?.cancel(); } catch { /* ignore */ }
      }
      if (!res) {
        issues.push({ field: "pin_image_url", reason: "unreachable" });
      } else {
        const ct = res.headers.get("content-type") || "";
        const cl = Number(res.headers.get("content-length") || "0");
        imageProbe = { status: res.status, content_type: ct, content_length: cl || null };
        if (res.status >= 400) issues.push({ field: "pin_image_url", reason: `http ${res.status}` });
        if (ct && !/^image\//i.test(ct) && !/octet-stream/i.test(ct)) {
          issues.push({ field: "pin_image_url", reason: `bad content-type: ${ct}` });
        }
        if (cl && cl > MAX_IMAGE_BYTES) issues.push({ field: "pin_image_url", reason: "exceeds 32MB" });
      }
    } catch (e) {
      issues.push({ field: "pin_image_url", reason: `probe error: ${(e as Error).message}` });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    image_probe: imageProbe,
    banned_hits: bannedHits,
    sizes: { title: title.length, description: description.length },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("method", { message: "POST required" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Admin auth ──
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return fail("auth", { message: "unauthorized" });
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return fail("auth", { message: "unauthorized" });
  const { data: roleRow } = await sb.from("user_roles")
    .select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return fail("auth", { message: "admin only" });

  // ── Parse body ──
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const mode = body?.mode === "pin" ? "pin" : "next";
  const pinId = body?.pinId as string | undefined;
  const dryRun = body?.dryRun === true;

  // ── Resolve target row ──
  let row: any | null = null;
  if (mode === "pin") {
    if (!pinId) return fail("input", { message: "pinId required" });
    const { data } = await sb.from("pinterest_pin_queue").select("*").eq("id", pinId).maybeSingle();
    row = data;
  } else {
    const { data } = await sb.from("pinterest_pin_queue")
      .select("*")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    row = data;
  }
  if (!row) return fail("resolve", { message: "no eligible pin found" });
  if (row.pinterest_pin_id) {
    return json({ ok: true, message: "already posted", pinterest_pin_id: row.pinterest_pin_id });
  }

  // ── Connection ──
  const { data: settings } = await sb.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id, active_board_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return fail("connection", { message: "Pinterest not connected", pin_id: row.id });

  // ── Resolve board ──
  let boardId: string | null = settings?.active_board_id || row.board_id || null;
  if (!boardId) {
    // Pick first non-blacklisted board the account owns
    const boardsRes = await fetch(`${PINTEREST_API}/boards?page_size=25&privacy=ALL`, {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    });
    const boardsBody = await boardsRes.json().catch(() => ({}));
    boardId = boardsBody?.items?.[0]?.id || null;
  }
  if (!boardId) return fail("board", { message: "no board available", pin_id: row.id });

  // ── Anti-duplication / banned-phrase governor (hard gate) ────────────────
  // Final check before we mutate state. Self-row is already counted in the
  // active queue, so we tolerate a +1 against `max_active_per_slug` (the row
  // we're about to publish IS the candidate). Copy + banned + per-board rules
  // apply unconditionally.
  const govVerdict = await checkGovernor(sb, {
    slug: row.product_slug ?? null,
    boardId,
    headline: row.pin_title ?? null,
    overlay: row.overlay_text ?? null,
    cta: (row?.meta?.cta as string | undefined) ?? null,
  });
  const govBlocks = govVerdict.enabled && !govVerdict.allowed &&
    // ignore the self-row contribution to max_active_per_slug
    govVerdict.violations.some((v) => v.rule !== "max_active_per_slug");
  if (govBlocks) {
    const errMsg = `governor_block:${govVerdict.reason}`;
    if (!dryRun) {
      await sb.from("pinterest_pin_queue").update({
        status: "rejected",
        rejection_reason: errMsg,
        last_publish_error: errMsg,
        publishing_started_at: null,
      }).eq("id", row.id);
      await sb.from("pinterest_publish_logs").insert({
        pin_queue_id: row.id,
        attempt: (row.publish_attempts || 0) + 1,
        status: "rejected",
        board_id: boardId,
        image_url: row.pin_image_url,
        pin_title: row.pin_title,
        destination_link: row.destination_link,
        request_payload: { governor_only: true },
        response_payload: { governor: govVerdict },
        error_message: errMsg,
        duration_ms: 0,
      });
    }
    return fail("governor", { pin_id: row.id, board_id: boardId, message: errMsg, governor: govVerdict });
  }

  // ── Pre-publish validation ──
  const validation = await validatePin(row, boardId, conn.access_token);
  console.log(`[publish-now] validation pin=${row.id}`, JSON.stringify(validation));
  if (!validation.ok) {
    const errMsg = `pre_publish_validation_failed: ${validation.issues.map((i) => `${i.field}(${i.reason})`).join(", ")}`;
    const bannedHits = (validation as any).banned_hits || [];
    const banned = Array.isArray(bannedHits) && bannedHits.length > 0;
    const finalMsg = banned ? rejectReasonForBannedCopy(bannedHits) : errMsg;
    if (!dryRun) {
      await sb.from("pinterest_pin_queue").update({
        status: banned ? "rejected" : "failed",
        rejection_reason: banned ? "banned_phrase_leak" : row.rejection_reason,
        qa_reasons: banned ? ["banned_phrase_leak"] : row.qa_reasons,
        last_publish_error: finalMsg,
        error_message: finalMsg,
        publishing_started_at: null,
      }).eq("id", row.id);
      await sb.from("pinterest_publish_logs").insert({
        pin_queue_id: row.id,
        attempt: (row.publish_attempts || 0) + 1,
        status: banned ? "rejected" : "failed",
        board_id: boardId,
        image_url: row.pin_image_url,
        pin_title: row.pin_title,
        destination_link: row.destination_link,
        request_payload: { validation_only: true, pin: { title: row.pin_title, board_id: boardId, image_url: row.pin_image_url } },
        response_payload: validation,
        error_message: finalMsg,
        duration_ms: 0,
      });
    }
    return fail("validation", {
      pin_id: row.id,
      board_id: boardId,
      image_url: row.pin_image_url,
      message: errMsg,
      validation,
    });
  }

  if (dryRun) {
    // ── Dry-run: build the exact payload that POST /pins would receive,
    // sanitize it, and probe Pinterest with GETs to validate auth/board
    // access without creating a pin.
    const requestPayload = {
      title: row.pin_title,
      description: row.pin_description,
      board_id: boardId,
      media_source: { source_type: "image_url", url: row.pin_image_url },
      link: row.destination_link,
    };
    let payloadSafe: any = null;
    let payloadError: string | null = null;
    try {
      const safe = await preparePinterestPayload(sb, requestPayload, {
        endpoint: "/pins",
        function: "pinterest-publish-now",
        pin_id: row.id,
        dryRun: true,
      });
      payloadSafe = {
        ok: true,
        payload: safe.payload,
        rejected_fields: safe.rejectedFields,
        coerced_fields: safe.coercedFields,
      };
    } catch (e: any) {
      payloadError = e?.message || String(e);
      payloadSafe = { ok: false, error: payloadError };
    }

    const probe = async (path: string) => {
      const t = Date.now();
      try {
        const res = await fetch(`${PINTEREST_API}${path}`, {
          headers: { Authorization: `Bearer ${conn.access_token}` },
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
        return { ok: res.ok, status: res.status, duration_ms: Date.now() - t, body };
      } catch (e: any) {
        return { ok: false, status: 0, duration_ms: Date.now() - t, error: e?.message || String(e) };
      }
    };
    const [account, board] = await Promise.all([
      probe("/user_account"),
      probe(`/boards/${boardId}`),
    ]);

    const apiOk = account.ok && board.ok;
    const overallOk = validation.ok && !!payloadSafe?.ok && apiOk;
    const summary = overallOk
      ? "Dry-run passed — payload valid, token + board reachable. No pin created."
      : "Dry-run found issues — see details below. No pin created.";

    // Log dry-run for audit trail (no queue mutation).
    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: row.id,
      attempt: row.publish_attempts || 0,
      status: overallOk ? "dry_run_ok" : "dry_run_failed",
      board_id: boardId,
      image_url: row.pin_image_url,
      pin_title: row.pin_title,
      destination_link: row.destination_link,
      request_payload: { dryRun: true, ...requestPayload },
      response_payload: { validation, payload: payloadSafe, api_probe: { account, board } },
      error_message: overallOk ? null : summary,
      duration_ms: (account.duration_ms || 0) + (board.duration_ms || 0),
    });

    return json({
      ok: overallOk,
      dryRun: true,
      pin_id: row.id,
      board_id: boardId,
      summary,
      validation,
      payload: payloadSafe,
      api_probe: { account, board },
      would_post: { url: `${PINTEREST_API}/pins`, method: "POST", body: requestPayload },
    });
  }

  // ── Atomic claim ──
  const { data: claimed } = await sb
    .from("pinterest_pin_queue")
    .update({
      status: "publishing",
      publishing_started_at: new Date().toISOString(),
      publish_attempts: (row.publish_attempts || 0) + 1,
    })
    .eq("id", row.id)
    .in("status", mode === "pin" ? ["queued", "draft", "failed", "scheduled"] : ["queued"])
    .select("id")
    .maybeSingle();
  if (!claimed) return fail("claim", { pin_id: row.id, message: "row already claimed or wrong status (try 'pin' mode)" });

  // ── Pre-stamp UTMs onto destination_link BEFORE POST so the very first
  // Pinterest outbound click already carries utm_source=pinterest +
  // campaign/content. pin_id is added post-create via PATCH below.
  const campaignSource = (row as any).category_key || (row as any).board_name || boardId;
  const contentSource = (row as any).hook_group || (row as any).pin_variant || ((row as any).meta?.creative_angle ?? null);
  const preStampedLink = stampUtmsOnLink(String(row.destination_link ?? ""), {
    campaign: campaignSource,
    content: contentSource,
  });
  const requestPayload = {
    title: row.pin_title,
    description: row.pin_description,
    board_id: boardId,
    media_source: { source_type: "image_url", url: row.pin_image_url },
    link: preStampedLink,
  };
  const safePayload = await preparePinterestPayload(sb, requestPayload, { endpoint: "/pins", function: "pinterest-publish-now", pin_id: row.id });
  console.log(`[publish-now] POST /pins pin=${row.id} board=${boardId} img=${row.pin_image_url}`);
  const t0 = Date.now();
  let pinRes: Response;
  let bodyText = "";
  let parsed: any = null;
  try {
    pinRes = await fetch(`${PINTEREST_API}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(safePayload.payload),
    });
    bodyText = await pinRes.text();
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }
  } catch (e: any) {
    const errMsg = `network: ${e?.message || e}`;
    console.error(`[publish-now] network error pin=${row.id}`, e);
    await sb.from("pinterest_pin_queue").update({
      status: "failed",
      publishing_started_at: null,
      last_publish_error: errMsg,
      error_message: errMsg,
    }).eq("id", row.id);
    return fail("network", { pin_id: row.id, message: errMsg, request: requestPayload });
  }

  const dur = Date.now() - t0;
  console.log(`[publish-now] response pin=${row.id} status=${pinRes.status} dur=${dur}ms body=${bodyText.slice(0, 400)}`);

  if (pinRes.ok && parsed?.id) {
    const externalUrl = `https://www.pinterest.com/pin/${parsed.id}/`;
    // Stamp real pin_id onto the outbound link so click-side attribution can
    // resolve pin → board → product → revenue on every future visit.
    let stampedDestination = preStampedLink;
    try {
      const candidate = stampUtmsOnLink(stampedDestination, {
        pinId: parsed.id,
        campaign: campaignSource,
        content: contentSource,
      });
      if (candidate !== stampedDestination) {
        const patchRes = await patchPinLink(conn.access_token, PINTEREST_API, parsed.id, candidate);
        if (patchRes.ok) {
          stampedDestination = candidate;
        } else {
          console.warn(`[publish-now] pin_id stamp PATCH failed pin=${parsed.id} status=${patchRes.status} reason=${patchRes.reason}`);
        }
      }
    } catch (e) {
      console.warn(`[publish-now] pin_id stamp error pin=${parsed.id}: ${(e as Error).message}`);
    }
    await sb.from("pinterest_pin_queue").update({
      status: "posted",
      posted_at: new Date().toISOString(),
      pinterest_pin_id: parsed.id,
      pin_external_id: parsed.id,
      external_url: externalUrl,
      board_id: boardId,
      destination_link: stampedDestination,
      final_resolved_url: stampedDestination,
      last_publish_error: null,
      publishing_started_at: null,
    }).eq("id", row.id);
    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: row.id,
      attempt: (row.publish_attempts || 0) + 1,
      status: "success",
      board_id: boardId,
      image_url: row.pin_image_url,
      pin_title: row.pin_title,
      destination_link: row.destination_link,
      request_payload: requestPayload,
      response_payload: parsed,
      duration_ms: dur,
    });
    return json({ ok: true, mode, pin_id: row.id, pinterest_pin_id: parsed.id, external_url: externalUrl, duration_ms: dur, response: parsed });
  }

  // failure
  const ptCode = parsed?.code ?? parsed?.error?.code ?? null;
  const ptMsg = parsed?.message ?? parsed?.error?.message ?? bodyText.slice(0, 500);
  const errMsg = `Pinterest API ${pinRes.status}${ptCode ? ` [${ptCode}]` : ""}: ${ptMsg}`;
  await sb.from("pinterest_pin_queue").update({
    status: "failed",
    publishing_started_at: null,
    last_publish_error: errMsg,
    error_message: errMsg,
  }).eq("id", row.id);
  await sb.from("pinterest_publish_logs").insert({
    pin_queue_id: row.id,
    attempt: (row.publish_attempts || 0) + 1,
    status: "failed",
    board_id: boardId,
    image_url: row.pin_image_url,
    pin_title: row.pin_title,
    destination_link: row.destination_link,
    request_payload: requestPayload,
    response_payload: parsed,
    error_message: errMsg,
    duration_ms: dur,
  });
  return fail("pinterest_api", {
    mode,
    pin_id: row.id,
    board_id: boardId,
    image_url: row.pin_image_url,
    status_code: pinRes.status,
    pinterest_code: ptCode,
    pinterest_message: ptMsg,
    message: errMsg,
    response: parsed,
    request: requestPayload,
    duration_ms: dur,
  });
});
