import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";
import { sanitizeSecret } from "../_shared/tiktok-secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Stable error codes returned to the UI so it can show targeted messages
 * instead of leaking raw auth errors. Keep these names in sync with the
 * switch statement in TikTokConnectCard.handleInspectConfig().
 */
type InspectErrorCode =
  | "missing_authorization_header"
  | "invalid_auth_token"
  | "user_not_found"
  | "not_admin"
  | "internal_error";

function errorResponse(
  code: InspectErrorCode,
  message: string,
  status: number,
) {
  return new Response(
    JSON.stringify({ ok: false, code, error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Mask a secret so we can safely show it in the UI.
 *   "aw1234abcd5678efgh"  ->  "aw12…efgh  (len=18)"
 * Empty / missing values become "(not set)".
 */
function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  const v = value.trim();
  if (v.length <= 8) return `${"•".repeat(v.length)}  (len=${v.length})`;
  return `${v.slice(0, 4)}…${v.slice(-4)}  (len=${v.length})`;
}

/**
 * Deep validation of a stored secret. Returns a structured report so the
 * admin UI can render a precise alert (e.g. "trailing space U+0020 detected
 * at position 16") instead of a vague "looks weird" warning.
 *
 * The OAuth functions auto-sanitize at read time, but we still want a loud
 * pre-flight signal so the operator re-saves the secret cleanly — silent
 * sanitization can mask the underlying problem (e.g. a buggy paste flow
 * that keeps re-introducing whitespace).
 */
type ContaminationKind =
  | "trailing_whitespace"
  | "leading_whitespace"
  | "internal_whitespace"
  | "bom"
  | "zero_width"
  | "nbsp"
  | "control_char";

interface SecretValidationIssue {
  kind: ContaminationKind;
  position: number; // 0-based index in raw string; -1 if N/A
  char_code: number; // U+ codepoint of the offending char
  char_label: string; // Human label e.g. "U+0020 SPACE", "U+00A0 NBSP"
  message: string;
}

interface SecretValidationReport {
  secret_name: string;
  is_set: boolean;
  raw_length: number;
  clean_length: number;
  has_contamination: boolean;
  issues: SecretValidationIssue[];
  summary: string;
}

/**
 * Per-character record of what `sanitizeSecret()` removed. Used by the
 * drift report so the UI can show "we stripped 2 chars at positions 16-17:
 * U+0020 SPACE, U+0020 SPACE" without ever exposing the secret value
 * itself. We only emit the *removed* codepoints — never the kept ones.
 */
interface DriftRemovedChar {
  position: number;       // 0-based index in the raw string
  char_code: number;      // U+ codepoint
  char_label: string;     // e.g. "U+0020 SPACE"
  region: "leading" | "trailing" | "internal";
}

interface SecretDriftReport {
  secret_name: string;
  is_set: boolean;
  raw_length: number;
  clean_length: number;
  diff_length: number;          // raw_length - clean_length
  drifted: boolean;             // true iff raw !== clean
  removed_chars: DriftRemovedChar[];
  removed_summary: Record<string, number>; // e.g. { "U+0020 SPACE": 2, "U+00A0 NO-BREAK SPACE (NBSP)": 1 }
  summary: string;
}

/**
 * Compute a diff between the raw secret value and its sanitized form,
 * emitting only the removed characters (never the kept ones). The OAuth
 * sanitizer drops zero-width chars + NBSP everywhere and trims leading/
 * trailing whitespace; we mirror that exact rule here so positions and
 * regions line up with what `sanitizeSecret()` actually does.
 *
 * Safety: this function MUST NOT include the kept characters in the
 * response — that's what protects the secret from leaking through the
 * inspector. Only codepoints + positions of removed chars are returned.
 */
const ZERO_WIDTH_OR_NBSP = /[\u200B-\u200D\uFEFF\u00A0]/;

function buildDriftReport(name: string, raw: string): SecretDriftReport {
  if (!raw) {
    return {
      secret_name: name,
      is_set: false,
      raw_length: 0,
      clean_length: 0,
      diff_length: 0,
      drifted: false,
      removed_chars: [],
      removed_summary: {},
      summary: `${name} is not set — no drift to report.`,
    };
  }

  // Step 1: strip zero-width + NBSP anywhere (matches sanitizeSecret).
  // We track which raw positions get dropped here so the UI can show
  // "internal" removals separately from edge trims.
  const internalDropped: DriftRemovedChar[] = [];
  let stripped = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.codePointAt(i)!;
    if (ZERO_WIDTH_OR_NBSP.test(raw[i])) {
      internalDropped.push({
        position: i,
        char_code: code,
        char_label: labelChar(code),
        region: "internal",
      });
      continue;
    }
    stripped += raw[i];
  }

  // Step 2: detect leading whitespace removed by `.trim()`. Walk the
  // *stripped* string and check which prefix would be trimmed; the
  // positions we report are still indices into the original `raw` so the
  // UI can describe them consistently.
  const leadingDropped: DriftRemovedChar[] = [];
  const trailingDropped: DriftRemovedChar[] = [];

  // Map each stripped-string index back to a raw-string index so the
  // positions we surface still refer to the original raw input.
  const strippedToRawIndex: number[] = [];
  let cursor = 0;
  for (let i = 0; i < raw.length; i++) {
    if (ZERO_WIDTH_OR_NBSP.test(raw[i])) continue;
    strippedToRawIndex[cursor++] = i;
  }

  // Leading trim
  let s = 0;
  while (s < stripped.length && /\s/.test(stripped[s])) {
    const rawIdx = strippedToRawIndex[s];
    const code = raw.codePointAt(rawIdx)!;
    leadingDropped.push({
      position: rawIdx,
      char_code: code,
      char_label: labelChar(code),
      region: "leading",
    });
    s++;
  }
  // Trailing trim
  let e = stripped.length - 1;
  while (e >= s && /\s/.test(stripped[e])) {
    const rawIdx = strippedToRawIndex[e];
    const code = raw.codePointAt(rawIdx)!;
    trailingDropped.push({
      position: rawIdx,
      char_code: code,
      char_label: labelChar(code),
      region: "trailing",
    });
    e--;
  }

  // Combine in raw-position order so the UI list reads naturally.
  const removed_chars = [...leadingDropped, ...internalDropped, ...trailingDropped]
    .sort((a, b) => a.position - b.position);

  // Tally by char_label so the UI can show a compact "what was removed"
  // legend ("U+0020 SPACE × 2, U+00A0 NBSP × 1") in addition to the
  // per-position list.
  const removed_summary: Record<string, number> = {};
  for (const r of removed_chars) {
    removed_summary[r.char_label] = (removed_summary[r.char_label] ?? 0) + 1;
  }

  const clean = sanitizeSecret(raw);
  const drifted = raw !== clean;

  return {
    secret_name: name,
    is_set: true,
    raw_length: raw.length,
    clean_length: clean.length,
    diff_length: raw.length - clean.length,
    drifted,
    removed_chars,
    removed_summary,
    summary: drifted
      ? `${name}: stripped ${removed_chars.length} character${removed_chars.length === 1 ? "" : "s"} ` +
        `(raw ${raw.length} → clean ${clean.length}). Re-save the secret without these characters.`
      : `${name}: raw and sanitized values are identical (length ${raw.length}). No drift.`,
  };
}

function labelChar(code: number): string {
  const hex = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  const named: Record<number, string> = {
    0x09: "TAB",
    0x0a: "LINE FEED",
    0x0d: "CARRIAGE RETURN",
    0x20: "SPACE",
    0xa0: "NO-BREAK SPACE (NBSP)",
    0xfeff: "BYTE ORDER MARK (BOM)",
    0x200b: "ZERO WIDTH SPACE",
    0x200c: "ZERO WIDTH NON-JOINER",
    0x200d: "ZERO WIDTH JOINER",
  };
  return named[code] ? `${hex} ${named[code]}` : hex;
}

function validateSecret(
  name: string,
  raw: string,
): SecretValidationReport {
  const clean = sanitizeSecret(raw);
  const issues: SecretValidationIssue[] = [];

  if (!raw) {
    return {
      secret_name: name,
      is_set: false,
      raw_length: 0,
      clean_length: 0,
      has_contamination: false,
      issues: [],
      summary: `${name} is not set.`,
    };
  }

  // Check leading whitespace (any chars trimmed from the start).
  const leadingMatch = raw.match(/^(\s+)/);
  if (leadingMatch) {
    const ch = raw.codePointAt(0)!;
    issues.push({
      kind: "leading_whitespace",
      position: 0,
      char_code: ch,
      char_label: labelChar(ch),
      message:
        `Leading whitespace at position 0 (${labelChar(ch)}). ` +
        `TikTok will URL-encode this and reject the request as invalid_client_key.`,
    });
  }

  // Check trailing whitespace.
  const trailingMatch = raw.match(/(\s+)$/);
  if (trailingMatch) {
    const pos = raw.length - trailingMatch[1].length;
    const ch = raw.codePointAt(pos)!;
    issues.push({
      kind: "trailing_whitespace",
      position: pos,
      char_code: ch,
      char_label: labelChar(ch),
      message:
        `Trailing whitespace at position ${pos} (${labelChar(ch)}, ` +
        `${trailingMatch[1].length} char${trailingMatch[1].length === 1 ? "" : "s"}). ` +
        `TikTok will URL-encode this and reject the request as invalid_client_key.`,
    });
  }

  // Scan for invisible / dangerous chars anywhere in the string.
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.codePointAt(i)!;
    if (ch === 0xfeff) {
      issues.push({
        kind: "bom",
        position: i,
        char_code: ch,
        char_label: labelChar(ch),
        message: `BOM character found at position ${i} — strip it from the secret.`,
      });
    } else if (ch >= 0x200b && ch <= 0x200d) {
      issues.push({
        kind: "zero_width",
        position: i,
        char_code: ch,
        char_label: labelChar(ch),
        message: `Invisible zero-width character at position ${i} (${labelChar(ch)}).`,
      });
    } else if (ch === 0xa0) {
      issues.push({
        kind: "nbsp",
        position: i,
        char_code: ch,
        char_label: labelChar(ch),
        message: `Non-breaking space at position ${i} — copy/paste from a styled doc?`,
      });
    } else if (ch < 0x20 && ch !== 0x09) {
      // Control chars like \r \n \0 anywhere are always wrong.
      issues.push({
        kind: "control_char",
        position: i,
        char_code: ch,
        char_label: labelChar(ch),
        message: `Control character at position ${i} (${labelChar(ch)}).`,
      });
    } else if (
      // Internal whitespace (not at edges) = paste error
      i > 0 &&
      i < raw.length - 1 &&
      /\s/.test(raw[i]) &&
      ch !== 0xa0 // already handled
    ) {
      issues.push({
        kind: "internal_whitespace",
        position: i,
        char_code: ch,
        char_label: labelChar(ch),
        message:
          `Internal whitespace at position ${i} (${labelChar(ch)}) — ` +
          `the client_key should never contain spaces.`,
      });
    }
  }

  const has = issues.length > 0;
  return {
    secret_name: name,
    is_set: true,
    raw_length: raw.length,
    clean_length: clean.length,
    has_contamination: has,
    issues,
    summary: has
      ? `${name} contains ${issues.length} contamination issue${issues.length === 1 ? "" : "s"} ` +
        `(raw length ${raw.length}, clean length ${clean.length}). ` +
        `Auto-sanitized at runtime, but please re-save the secret without whitespace.`
      : `${name} is clean (length ${raw.length}).`,
  };
}

/**
 * TikTok OAuth Config Inspect
 *
 * Admin-only diagnostic endpoint. Returns:
 *  - the *masked* TIKTOK_CLIENT_KEY currently in use by the edge functions
 *  - the redirect_uri that tiktok-oauth-start would generate for the caller's origin
 *  - the exact authorize URL that would be sent to TikTok (with the same masking)
 *  - the requested scopes
 *
 * Use this when "Connect TikTok" fails with `client_key` errors to confirm
 * which key the edge function is actually sending to TikTok.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Read raw values so we can detect drift (whitespace, BOM, etc.) AND
    // expose the sanitized version that the OAuth functions actually use.
    const rawClientKey = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
    const rawClientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
    const clientKey = sanitizeSecret(rawClientKey);
    const clientSecret = sanitizeSecret(rawClientSecret);

    // Pre-compute structured validation reports. The UI uses these to render
    // a prominent "whitespace contamination detected" alert above the masked
    // values, with exact char codes + positions so the admin can fix the
    // root cause (often a paste flow that re-introduces whitespace) instead
    // of relying on runtime auto-sanitization forever.
    const clientKeyValidation = validateSecret("TIKTOK_CLIENT_KEY", rawClientKey);
    const clientSecretValidation = validateSecret("TIKTOK_CLIENT_SECRET", rawClientSecret);

    // Drift reports describe exactly which characters `sanitizeSecret()`
    // would remove. Unlike the validation report (which warns on patterns),
    // this one is a *diff* — codepoints + positions only, never the secret
    // content. Lets the operator confirm at a glance whether silent
    // sanitization is actually changing the value the OAuth functions see.
    const clientKeyDrift = buildDriftReport("TIKTOK_CLIENT_KEY", rawClientKey);
    const clientSecretDrift = buildDriftReport("TIKTOK_CLIENT_SECRET", rawClientSecret);

    // Auth: only admins. We deliberately split each failure mode into its own
    // error code so the UI can show a specific, actionable message
    // ("you're signed out" vs "your account is not an admin").
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      console.warn("[tiktok-oauth-config-inspect] Missing/invalid Authorization header");
      return errorResponse(
        "missing_authorization_header",
        "You must be signed in as an admin to use the TikTok OAuth config inspector.",
        401,
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return errorResponse(
        "missing_authorization_header",
        "You must be signed in as an admin to use the TikTok OAuth config inspector.",
        401,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      console.warn(
        "[tiktok-oauth-config-inspect] Auth token rejected:",
        authError?.message ?? "no user",
      );
      return errorResponse(
        "invalid_auth_token",
        "Your session is invalid or expired. Please sign in again as an admin.",
        401,
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      console.error(
        "[tiktok-oauth-config-inspect] Role lookup failed:",
        roleError.message,
      );
      return errorResponse(
        "internal_error",
        "Could not verify your admin role. Please try again or contact support.",
        500,
      );
    }

    if (!roleData) {
      console.warn(
        "[tiktok-oauth-config-inspect] Non-admin attempted access. user_id:",
        user.id,
      );
      return errorResponse(
        "not_admin",
        "Admin access required. The TikTok OAuth config inspector is only available to admin accounts.",
        403,
      );
    }

    // Mirror the exact redirect URI logic from tiktok-oauth-start so the
    // values shown here match what would actually be sent to TikTok.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const origin = (body.origin as string) || "https://getpawsy.lovable.app";
    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;
    const scopes = "user.info.basic,video.publish,video.upload";

    // Quick sanity hints — most "client_key" errors come from one of these.
    const hints: string[] = [];
    // `clientKey` is already sanitized; `rawKey` here keeps the previous
    // variable name for the rest of the validations below.
    const rawKey = clientKey;
    // Stable links we point admins to. Keeping them here (not just in the UI)
    // means the same guidance shows up in logs/curl output too.
    const PORTAL_APPS_URL = "https://developers.tiktok.com/apps";
    const SANDBOX_DOCS_URL =
      "https://developers.tiktok.com/doc/login-kit-sandbox/";
    const TEST_USERS_HELP =
      `Open your app in the TikTok Developer Portal (${PORTAL_APPS_URL}) → ` +
      `Sandbox → Test users → "Add test user" → enter the TikTok username ` +
      `"@getpawsy" (without the @). The user must accept the invite from the ` +
      `notification in their TikTok app before "Connect TikTok" will work. ` +
      `Sandbox keys (sbaw…) only authorize accounts that appear in this list — ` +
      `any other account will fail with an invalid_client / unauthorized error. ` +
      `Docs: ${SANDBOX_DOCS_URL}`;

    if (!rawKey) {
      hints.push("TIKTOK_CLIENT_KEY is not set in Lovable Cloud secrets.");
    } else {
      if (rawClientKey !== clientKey) {
        // Auto-sanitization handles this at runtime, but we still surface a
        // warning so the admin re-saves a clean value (defense in depth).
        hints.push(
          `TIKTOK_CLIENT_KEY contains leading/trailing whitespace or invisible ` +
          `characters (raw length ${rawClientKey.length}, clean length ${clientKey.length}). ` +
          `Auto-sanitized at read time, but please re-save the secret without whitespace.`,
        );
      }
      if (rawKey.length < 12) {
        hints.push("TIKTOK_CLIENT_KEY looks unusually short — verify you copied the Client Key, not just a prefix.");
      }
      if (rawKey.length > 40) {
        hints.push(
          "TIKTOK_CLIENT_KEY looks unusually long — you may have pasted the Client Secret instead of the Client Key.",
        );
      }
      if (!/^[a-z0-9]+$/i.test(rawKey)) {
        hints.push("TIKTOK_CLIENT_KEY contains unexpected characters (only letters/digits expected).");
      }
      if (rawKey.toLowerCase().startsWith("sbaw")) {
        hints.push(
          "Sandbox key detected (sbaw…). " + TEST_USERS_HELP,
        );
      }
    }
    if (rawClientSecret && rawClientSecret !== clientSecret) {
      hints.push(
        `TIKTOK_CLIENT_SECRET contains leading/trailing whitespace or invisible ` +
        `characters (raw length ${rawClientSecret.length}, clean length ${clientSecret.length}). ` +
        `Auto-sanitized at read time, but please re-save the secret without whitespace.`,
      );
    }
    if (!clientSecret) {
      hints.push("TIKTOK_CLIENT_SECRET is not set — token exchange will fail in the callback step.");
    }

    // Build the same authorize URL tiktok-oauth-start would build, but with
    // the key masked. Useful for visually confirming what TikTok receives.
    const maskedKey = maskSecret(clientKey);
    const authorizeUrlPreview =
      `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(maskedKey)}` +
      `&response_type=code&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=<csrf>`;

    return new Response(
      JSON.stringify({
        ok: true,
        client_key_masked: maskedKey,
        client_secret_set: Boolean(clientSecret),
        client_secret_length: clientSecret ? clientSecret.length : 0,
        redirect_uri: redirectUri,
        origin_used: origin,
        scopes,
        authorize_url_preview: authorizeUrlPreview,
        hints,
        client_key_validation: clientKeyValidation,
        client_secret_validation: clientSecretValidation,
        client_key_drift: clientKeyDrift,
        client_secret_drift: clientSecretDrift,
        // Always returned so the UI can show "where do I add @getpawsy?" even
        // when there are no warning hints — admins keep asking for the link.
        sandbox_test_user_help: {
          tiktok_username_to_add: "@getpawsy",
          portal_apps_url: PORTAL_APPS_URL,
          sandbox_docs_url: SANDBOX_DOCS_URL,
          steps: [
            `Open your TikTok app at ${PORTAL_APPS_URL}`,
            "Switch to the Sandbox tab (top of the app page)",
            "Open the Test users section",
            'Click "Add test user" and enter the username "getpawsy"',
            "Open the TikTok mobile app on the @getpawsy account and accept the invite notification",
            'Return here and try "Connect TikTok" again',
          ],
          why_sandbox_only:
            "Sandbox client keys (prefix sbaw…) are isolated from production. " +
            "TikTok will reject the OAuth request for any account that is not " +
            "explicitly listed under Sandbox → Test users, returning errors " +
            "like invalid_client, unauthorized_client, or 'application not " +
            "approved'. To authorize @getpawsy you either (a) add it as a " +
            "test user above, or (b) submit the app for production review " +
            "and switch to the production client key.",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tiktok-oauth-config-inspect] Error:", err);
    return errorResponse(
      "internal_error",
      err instanceof Error ? err.message : "Internal error",
      500,
    );
  }
});