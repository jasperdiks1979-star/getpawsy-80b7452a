import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, cache-control",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, init: ResponseInit, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...cors, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

/**
 * TikTok video test-upload edge function.
 *
 * Two operations (action field in body):
 *  - "publish": init a DIRECT_POST PHOTO/VIDEO upload via PULL_FROM_URL.
 *      body: { action: "publish", videoUrl: string, caption?: string, privacy?: string }
 *      returns: { ok, publishId, mode, account }
 *  - "status":  fetch publish status for a publishId.
 *      body: { action: "status", publishId: string }
 *      returns: { ok, status, publicaly_available_post_id?, fail_reason?, raw }
 *
 * Admin-only. Uses the most recently connected TikTok account from
 * tiktok_oauth_tokens (single-account model).
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Auth: require admin ------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, reason: "UNAUTHORIZED" }, { status: 200 }, cors);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ ok: false, reason: "INVALID_TOKEN" }, { status: 200 }, cors);
    }
    const userId = claims.claims.sub as string;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return json({ ok: false, reason: "ADMIN_REQUIRED" }, { status: 200 }, cors);
    }

    // ---- Pull connected TikTok account -------------------------------------
    const { data: tokenRow } = await supabase
      .from("tiktok_oauth_tokens")
      .select("access_token, expires_at, open_id, display_name, scope")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow) {
      return json(
        {
          ok: false,
          reason: "TIKTOK_NOT_CONNECTED",
          message:
            "Geen TikTok-account gekoppeld. Klik eerst op 'Connect TikTok Account'.",
        },
        { status: 200 },
        cors,
      );
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return json(
        {
          ok: false,
          reason: "TIKTOK_TOKEN_EXPIRED",
          message: "TikTok access token is verlopen. Verbind het account opnieuw.",
        },
        { status: 200 },
        cors,
      );
    }

    const TIKTOK_ACCESS_TOKEN = tokenRow.access_token as string;
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY") || "";
    const mode = clientKey.startsWith("sbaw")
      ? "sandbox"
      : clientKey.startsWith("aw")
      ? "production"
      : "unknown";

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action || "publish");

    // ---- Action: publish ---------------------------------------------------
    if (action === "publish") {
      const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
      const caption = typeof body.caption === "string" && body.caption.length > 0
        ? body.caption
        : "GetPawsy test upload 🐾";
      // TikTok requires SELF_ONLY for unaudited apps in sandbox.
      const privacy = typeof body.privacy === "string" && body.privacy
        ? body.privacy
        : "SELF_ONLY";

      if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
        return json(
          { ok: false, reason: "INVALID_VIDEO_URL", message: "videoUrl moet een publieke https URL zijn." },
          { status: 200 },
          cors,
        );
      }

      // Initialize a DIRECT_POST video publish via PULL_FROM_URL.
      // Reference: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
      const initResp = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({
            post_info: {
              title: caption.slice(0, 150),
              privacy_level: privacy,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
              video_cover_timestamp_ms: 1000,
            },
            source_info: {
              source: "PULL_FROM_URL",
              video_url: videoUrl,
            },
          }),
        },
      );

      const initData = await initResp.json().catch(() => ({}));
      const errCode = initData?.error?.code;
      const errMsg = initData?.error?.message;
      if (!initResp.ok || (errCode && errCode !== "ok")) {
        return json(
          {
            ok: false,
            reason: "TIKTOK_INIT_FAILED",
            httpStatus: initResp.status,
            errorCode: errCode || null,
            message: errMsg || `TikTok init failed (HTTP ${initResp.status})`,
            mode,
            raw: initData,
          },
          { status: 200 },
          cors,
        );
      }

      const publishId = initData?.data?.publish_id || null;
      return json(
        {
          ok: true,
          publishId,
          mode,
          privacy,
          account: {
            open_id: tokenRow.open_id,
            display_name: tokenRow.display_name,
            scope: tokenRow.scope,
          },
          raw: initData,
        },
        { status: 200 },
        cors,
      );
    }

    // ---- Action: status ----------------------------------------------------
    if (action === "status") {
      const publishId = typeof body.publishId === "string" ? body.publishId : "";
      if (!publishId) {
        return json(
          { ok: false, reason: "MISSING_PUBLISH_ID" },
          { status: 200 },
          cors,
        );
      }

      const statusResp = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        },
      );
      const statusData = await statusResp.json().catch(() => ({}));
      const errCode = statusData?.error?.code;
      const errMsg = statusData?.error?.message;
      if (!statusResp.ok || (errCode && errCode !== "ok")) {
        return json(
          {
            ok: false,
            reason: "TIKTOK_STATUS_FAILED",
            httpStatus: statusResp.status,
            errorCode: errCode || null,
            message: errMsg || `TikTok status failed (HTTP ${statusResp.status})`,
            raw: statusData,
          },
          { status: 200 },
          cors,
        );
      }

      const data = statusData?.data || {};
      return json(
        {
          ok: true,
          status: data.status || "UNKNOWN",
          publiclyAvailablePostId: data.publicaly_available_post_id || data.publicly_available_post_id || null,
          failReason: data.fail_reason || null,
          uploadedBytes: data.uploaded_bytes || null,
          raw: statusData,
        },
        { status: 200 },
        cors,
      );
    }

    return json({ ok: false, reason: "UNKNOWN_ACTION" }, { status: 200 }, cors);
  } catch (e) {
    console.error("tiktok-video-test-upload error:", e);
    return json(
      { ok: false, reason: "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e) },
      { status: 200 },
      cors,
    );
  }
});