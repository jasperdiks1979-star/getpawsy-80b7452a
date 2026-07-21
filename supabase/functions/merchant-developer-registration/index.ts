// Merchant API developer registration control-plane. Read-only by default:
// GETs accounts/{account}/developerRegistration and reports state. When
// invoked with { action: "register", developerEmail }, calls the official
// registerGcp method exactly once. No product/feed/data-source writes.
//
// Safety rails:
//   - Requires an authenticated merchant admin (matches merchant_oauth_tokens.user_id).
//   - Uses the stored OAuth refresh token via MerchantApiClient (no new scopes).
//   - Never returns raw tokens or full Google response bodies.
//   - No API key / service account creation. No OAuth reconnection.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, MerchantApiClientError, mlog, redact, MERCHANT_API_HOST } from "../_shared/merchant-api.ts";

const API_VERSION = "accounts/v1beta";

type Action = "check" | "register";

interface Body {
  action?: Action;
  developerEmail?: string;
}

// Classify a Google response for developerRegistration GET/registerGcp.
function classify(status: number, body: unknown): {
  classification:
    | "ALREADY_REGISTERED_TO_5717571566"
    | "NOT_REGISTERED"
    | "REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT"
    | "CALLER_NOT_MERCHANT_ADMIN"
    | "INSUFFICIENT_EVIDENCE";
  reason?: string;
  gcpIds?: string[];
  merchantAccountFromName?: string;
} {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const err = (b.error && typeof b.error === "object" ? b.error : null) as Record<string, unknown> | null;
  const details = Array.isArray(err?.details) ? err!.details as Array<Record<string, unknown>> : [];
  let reason: string | undefined;
  for (const d of details) {
    const md = (d.metadata && typeof d.metadata === "object" ? d.metadata : {}) as Record<string, unknown>;
    if (typeof md.reason === "string") reason = md.reason;
    if (typeof md.REASON === "string") reason = md.REASON as string;
  }
  if (status === 200) {
    const name = typeof b.name === "string" ? b.name : "";
    const m = name.match(/^accounts\/(\d+)\/developerRegistration$/);
    const gcpIds = Array.isArray(b.gcpIds) ? (b.gcpIds as unknown[]).map(String) : [];
    if (m && m[1] === "5717571566") {
      return { classification: "ALREADY_REGISTERED_TO_5717571566", gcpIds, merchantAccountFromName: m[1] };
    }
    if (m) return { classification: "REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT", gcpIds, merchantAccountFromName: m[1] };
    return { classification: "INSUFFICIENT_EVIDENCE", reason: "no_name_in_body" };
  }
  if (status === 403) {
    if (reason && /PERMISSION|ADMIN|CALLER/i.test(reason)) {
      return { classification: "CALLER_NOT_MERCHANT_ADMIN", reason };
    }
    return { classification: "CALLER_NOT_MERCHANT_ADMIN", reason: reason ?? "permission_denied" };
  }
  if (status === 404) return { classification: "NOT_REGISTERED", reason: reason ?? "not_found" };
  return { classification: "INSUFFICIENT_EVIDENCE", reason: reason ?? `http_${status}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const probeId = (req.headers.get("x-client-probe-id") || "").slice(0, 64);
  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (probeId) headers["x-echo-probe-id"] = probeId;
  const json = (b: unknown, s = 200) => {
    const body = probeId && b && typeof b === "object" ? { ...(b as object), probeId } : b;
    return new Response(JSON.stringify(body), { status: s, headers });
  };

  const corrId = crypto.randomUUID();
  let stage = "init";
  try {
    stage = "auth";
    const authz = req.headers.get("Authorization");
    if (!authz) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (!bearer) return json({ ok: false, error: "invalid_auth" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );
    let userId: string;
    let userEmail: string | null = null;
    try {
      const { data: u, error: uerr } = await authClient.auth.getUser(bearer);
      if (uerr || !u?.user?.id) return json({ ok: false, error: "invalid_auth" }, 401);
      userId = u.user.id;
      userEmail = u.user.email ?? null;
    } catch {
      return json({ ok: false, error: "invalid_auth" }, 401);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "authorize_admin";
    // Only the connected merchant admin who owns the OAuth token may proceed.
    const { data: token } = await supabase
      .from("merchant_oauth_tokens")
      .select("id, merchant_center_id, is_connected, scopes")
      .eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "not_connected_or_not_merchant_admin", stage }, 403);
    if (String(token.merchant_center_id) !== "5717571566") {
      return json({ ok: false, error: "merchant_center_mismatch", stage, expected: "5717571566" }, 403);
    }

    const parsedBody = (async (): Promise<Body> => {
      if (req.method !== "POST") return { action: "check" };
      try { return (await req.json()) as Body; } catch { return { action: "check" }; }
    });
    const body = await parsedBody();
    const action: Action = body.action === "register" ? "register" : "check";

    const client = new MerchantApiClient({ supabase });
    stage = "get_access_token";
    const accessToken = await client.getAccessToken();
    stage = "resolve_account";
    const account = await client.resolveAccount(); // accounts/5717571566

    // Inventory snapshot (safe, redacted).
    const clientIdEnv = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
    const clientIdSuffix = clientIdEnv ? clientIdEnv.slice(-14) : null;
    const oauthClientProjectHint = clientIdEnv.split("-")[0] || null; // project number prefix
    const inventory = {
      merchantCenterId: "5717571566",
      oauthClientIdSuffix: clientIdSuffix ? `…${clientIdSuffix}` : null,
      oauthClientProjectNumberHint: oauthClientProjectHint,
      scopes: token.scopes,
      connectedIdentityRedacted: userEmail
        ? userEmail.replace(/^(.).*(@.*)$/, "$1***$2")
        : null,
    };

    stage = "check_registration";
    const checkUrl = `${MERCHANT_API_HOST}/${API_VERSION}/${account}/developerRegistration`;
    const checkResp = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const checkBodyText = await checkResp.text();
    let checkBody: unknown = null;
    try { checkBody = checkBodyText ? JSON.parse(checkBodyText) : null; } catch { /* keep null */ }
    const priorState = classify(checkResp.status, checkBody);
    mlog("dev_reg_check", { corrId, status: checkResp.status, classification: priorState.classification });

    // Sanitized (never full body). Just top-level shape.
    const safeCheck = {
      status: checkResp.status,
      classification: priorState.classification,
      reason: priorState.reason,
      gcpIds: priorState.gcpIds,
      merchantAccountFromName: priorState.merchantAccountFromName,
      preview: typeof checkBody === "object" && checkBody
        ? Object.keys(checkBody as object).slice(0, 12)
        : null,
    };

    // Phase 2 stops here on check.
    if (action === "check") {
      return json({
        ok: true,
        stage: "check_done",
        inventory,
        priorRegistration: safeCheck,
        verdict: priorState.classification,
      });
    }

    // ── Phase 3: registerGcp (mandatory one-time). Requires NOT_REGISTERED. ──
    stage = "register_gcp";
    if (priorState.classification === "ALREADY_REGISTERED_TO_5717571566") {
      return json({
        ok: true,
        stage: "no_action_needed",
        inventory,
        priorRegistration: safeCheck,
        verdict: "ALREADY_REGISTERED_TO_5717571566",
      });
    }
    if (priorState.classification === "REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT") {
      return json({
        ok: false,
        stage: "blocked_registered_elsewhere",
        inventory,
        priorRegistration: safeCheck,
        verdict: "REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT",
      }, 409);
    }
    if (priorState.classification === "CALLER_NOT_MERCHANT_ADMIN") {
      return json({
        ok: false,
        stage: "blocked_admin_required",
        inventory,
        priorRegistration: safeCheck,
        verdict: "CALLER_NOT_MERCHANT_ADMIN",
      }, 403);
    }
    if (priorState.classification !== "NOT_REGISTERED") {
      return json({
        ok: false,
        stage: "insufficient_evidence",
        inventory,
        priorRegistration: safeCheck,
        verdict: "INSUFFICIENT_EVIDENCE",
      }, 409);
    }

    const developerEmail = (body.developerEmail || "").trim();
    if (!developerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(developerEmail)) {
      return json({
        ok: false,
        stage: "developer_email_required",
        error: "developer_email_required",
        hint: "Provide a valid Google account email that will own this Merchant API developer registration.",
      }, 400);
    }

    const registerUrl = `${MERCHANT_API_HOST}/${API_VERSION}/${account}/developerRegistration:registerGcp`;
    const regResp = await fetch(registerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ developerEmail }),
    });
    const regBodyText = await regResp.text();
    let regBody: unknown = null;
    try { regBody = regBodyText ? JSON.parse(regBodyText) : null; } catch { /* keep null */ }
    mlog("dev_reg_register", { corrId, status: regResp.status });

    if (regResp.status === 200 || regResp.status === 201) {
      // Confirm by re-reading the registration.
      stage = "post_register_verify";
      const verifyResp = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      const verifyBodyText = await verifyResp.text();
      let verifyBody: unknown = null;
      try { verifyBody = verifyBodyText ? JSON.parse(verifyBodyText) : null; } catch { /* keep null */ }
      const post = classify(verifyResp.status, verifyBody);
      return json({
        ok: true,
        stage: "registered",
        inventory,
        registered: {
          status: regResp.status,
          gcpIds: (regBody && typeof regBody === "object" && Array.isArray((regBody as Record<string, unknown>).gcpIds))
            ? ((regBody as Record<string, unknown>).gcpIds as unknown[]).map(String)
            : post.gcpIds,
          nameFromVerify: post.merchantAccountFromName ? `accounts/${post.merchantAccountFromName}/developerRegistration` : null,
        },
        postRegistration: {
          status: verifyResp.status,
          classification: post.classification,
        },
        verdict:
          post.classification === "ALREADY_REGISTERED_TO_5717571566"
            ? "MERCHANT_PROJECT_REGISTERED_PROPAGATION_PENDING"
            : "MERCHANT_PROJECT_REGISTERED_PROPAGATION_PENDING",
        propagation: "wait_5_minutes_then_retest_listDataSources",
      });
    }

    // Non-2xx from registerGcp.
    const regErr = classify(regResp.status, regBody);
    return json({
      ok: false,
      stage: "register_failed",
      inventory,
      register: {
        status: regResp.status,
        classification: regErr.classification,
        reason: regErr.reason,
        preview: typeof regBody === "object" && regBody
          ? Object.keys(regBody as object).slice(0, 12)
          : redact(regBodyText).slice(0, 200),
      },
      verdict: regErr.classification,
    }, regResp.status);
  } catch (e) {
    if (e instanceof MerchantApiClientError) {
      mlog("dev_reg_merchant_error", { corrId, stage: e.stage ?? stage, status: e.status, code: e.code });
      if (e.code === "reauth_required") {
        return json({ ok: false, error: "merchant_reauth_required", stage, adminAction: "reconnect_google_merchant" }, 401);
      }
      return json({ ok: false, error: "merchant_api_error", stage: e.stage ?? stage, upstreamStatus: e.status || undefined }, 502);
    }
    const err = e as Error;
    mlog("dev_reg_unexpected", { corrId, stage, message: err?.message });
    return json({ ok: false, error: "internal_error", stage }, 500);
  }
});