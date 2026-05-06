// ─────────────────────────────────────────────────────────────────────────────
// Shared event/URL sanitizer for analytics + Pinterest queue ingest.
//
// Used by every server-side ingest path (track-checkout-funnel,
// log_utm_session callers, Pinterest queue inserts, visitor activity mirrors)
// to:
//   • normalize and validate URLs / referrers / UTM params
//   • detect bots, spam UAs, malformed payloads, emoji floods
//   • return a list of canonical reason codes for quarantine
//
// Empty `reasons[]` ⇒ event is clean and may be inserted into the live table.
// Non-empty ⇒ event must be diverted to `analytics_quarantine` instead.
// ─────────────────────────────────────────────────────────────────────────────

export type SanitizerReason =
  | "invalid_url"
  | "invalid_referrer"
  | "non_allowed_host"
  | "malformed_utm"
  | "duplicate_params"
  | "garbage_querystring"
  | "invalid_utf"
  | "emoji_spam"
  | "encoded_payload"
  | "bot_user_agent"
  | "suspicious_user_agent"
  | "malformed_referrer"
  | "rapid_fire"
  | "oversize_payload";

/** Hosts that are allowed as destination/landing URLs. */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "getpawsy.pet",
  "www.getpawsy.pet",
  "getpawsy.lovable.app",
  "id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
]);

/** Approved UTM source values. Anything else is normalized to null. */
export const APPROVED_UTM_SOURCES: ReadonlySet<string> = new Set([
  "pinterest", "tiktok", "google", "facebook", "instagram", "meta",
  "bing", "youtube", "reddit", "twitter", "x", "email", "newsletter",
  "direct", "organic", "(direct)", "linkinbio",
]);

/** Approved UTM medium values. */
export const APPROVED_UTM_MEDIUMS: ReadonlySet<string> = new Set([
  "social", "cpc", "ppc", "paid", "organic", "referral", "email",
  "display", "retargeting", "affiliate", "linkinbio", "direct",
]);

const BOT_PATTERNS = [
  "bot", "crawler", "spider", "scraper", "headless", "phantom",
  "selenium", "puppeteer", "lighthouse", "pagespeed", "gtmetrix",
  "pingdom", "uptimerobot", "curl", "wget", "python-requests",
  "go-http-client", "httpclient", "java/", "okhttp", "axios/",
];

const SUSPICIOUS_UA_PATTERNS = [
  "<script", "select ", "union ", "drop table", "../", "%00",
];

// Emoji range — any cluster with >3 emoji is treated as spam.
// Wide enough for pictographs + flags + ZWJ sequences.
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu;

// Detect lone surrogates / replacement chars / NULs that signal corrupted UTF.
const INVALID_UTF_REGEX = /[\uFFFD\u0000\uD800-\uDFFF]/;

// Long base64-ish or percent-encoded blobs in URL params often signal spam.
const ENCODED_BLOB_REGEX = /(?:%[0-9A-Fa-f]{2}){12,}|[A-Za-z0-9+/=]{200,}/;

const MAX_URL_LEN = 1500;
const MAX_FIELD_LEN = 500;

export interface SanitizeOpts {
  allowExternalReferrer?: boolean;
}

export interface UrlCheckResult {
  ok: boolean;
  cleaned: string | null;
  reasons: SanitizerReason[];
}

function countEmoji(s: string): number {
  const m = s.match(EMOJI_REGEX);
  return m ? m.length : 0;
}

/** Validate + clean a URL. Returns null cleaned value if irrecoverable. */
export function sanitizeUrl(
  raw: string | null | undefined,
  opts: SanitizeOpts = {},
): UrlCheckResult {
  const reasons: SanitizerReason[] = [];
  if (raw == null || raw === "") return { ok: true, cleaned: null, reasons };

  if (typeof raw !== "string") {
    return { ok: false, cleaned: null, reasons: ["invalid_url"] };
  }

  if (raw.length > MAX_URL_LEN) reasons.push("oversize_payload");
  if (INVALID_UTF_REGEX.test(raw)) reasons.push("invalid_utf");
  if (countEmoji(raw) > 3) reasons.push("emoji_spam");
  if (ENCODED_BLOB_REGEX.test(raw)) reasons.push("encoded_payload");

  let url: URL;
  try {
    url = new URL(raw, "https://getpawsy.pet");
  } catch {
    return { ok: false, cleaned: null, reasons: [...reasons, "invalid_url"] };
  }

  // Only http(s) is acceptable.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, cleaned: null, reasons: [...reasons, "invalid_url"] };
  }

  // Detect duplicate params (?utm_source=a&utm_source=b) — common spam pattern.
  const seen = new Set<string>();
  let hasDup = false;
  for (const k of url.searchParams.keys()) {
    if (seen.has(k)) { hasDup = true; break; }
    seen.add(k);
  }
  if (hasDup) reasons.push("duplicate_params");

  // Strip any param that contains invalid UTF or emoji bursts.
  const toDelete: string[] = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (INVALID_UTF_REGEX.test(k) || INVALID_UTF_REGEX.test(v)) {
      toDelete.push(k); reasons.push("invalid_utf");
    } else if (countEmoji(v) > 3) {
      toDelete.push(k); reasons.push("emoji_spam");
    } else if (ENCODED_BLOB_REGEX.test(v)) {
      toDelete.push(k); reasons.push("encoded_payload");
    } else if (v.length > MAX_FIELD_LEN) {
      toDelete.push(k); reasons.push("garbage_querystring");
    }
  }
  toDelete.forEach((k) => url.searchParams.delete(k));

  if (!opts.allowExternalReferrer) {
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      return { ok: false, cleaned: null, reasons: [...reasons, "non_allowed_host"] };
    }
  }

  // Hard-fail if we collected any non-recoverable reason
  const fatal: SanitizerReason[] = ["invalid_url", "invalid_utf", "non_allowed_host"];
  const ok = !reasons.some((r) => fatal.includes(r));
  return { ok, cleaned: ok ? url.toString() : null, reasons: dedupe(reasons) };
}

/** Validate referrer. External referrers are allowed but still scrubbed. */
export function sanitizeReferrer(raw: string | null | undefined): UrlCheckResult {
  if (!raw) return { ok: true, cleaned: null, reasons: [] };
  const res = sanitizeUrl(raw, { allowExternalReferrer: true });
  if (!res.ok) {
    return { ok: false, cleaned: null, reasons: [...res.reasons, "malformed_referrer"] };
  }
  return res;
}

/** Sanitize one UTM string value. Returns null if not approved/clean. */
export function sanitizeUtmValue(
  field: "utm_source" | "utm_medium" | "utm_campaign" | "utm_term" | "utm_content" | "utm_id",
  raw: string | null | undefined,
): { value: string | null; reasons: SanitizerReason[] } {
  if (raw == null || raw === "") return { value: null, reasons: [] };
  const reasons: SanitizerReason[] = [];
  let v = String(raw).trim().slice(0, 120);

  if (INVALID_UTF_REGEX.test(v)) return { value: null, reasons: ["invalid_utf"] };
  if (countEmoji(v) > 0) return { value: null, reasons: ["emoji_spam"] };
  if (ENCODED_BLOB_REGEX.test(v)) return { value: null, reasons: ["encoded_payload"] };

  // Allowlist source/medium; freeform fields just get character-stripped.
  v = v.replace(/[^A-Za-z0-9._\-+ /:|()]/g, "");
  if (v.length === 0) return { value: null, reasons: ["malformed_utm"] };

  if (field === "utm_source") {
    const lower = v.toLowerCase();
    if (!APPROVED_UTM_SOURCES.has(lower)) {
      reasons.push("malformed_utm");
      return { value: null, reasons };
    }
    return { value: lower, reasons };
  }
  if (field === "utm_medium") {
    const lower = v.toLowerCase();
    if (!APPROVED_UTM_MEDIUMS.has(lower)) {
      reasons.push("malformed_utm");
      return { value: null, reasons };
    }
    return { value: lower, reasons };
  }

  return { value: v, reasons };
}

/** UA bot detection (server-side). */
export function classifyUserAgent(ua: string | null | undefined): SanitizerReason[] {
  if (!ua) return ["suspicious_user_agent"];
  const lower = ua.toLowerCase();
  const reasons: SanitizerReason[] = [];
  if (BOT_PATTERNS.some((p) => lower.includes(p))) reasons.push("bot_user_agent");
  if (SUSPICIOUS_UA_PATTERNS.some((p) => lower.includes(p))) reasons.push("suspicious_user_agent");
  if (ua.length > 600 || INVALID_UTF_REGEX.test(ua)) reasons.push("suspicious_user_agent");
  return reasons;
}

// ─── Rapid-fire detection (per-IP/session) ──────────────────────────────────
// In-memory sliding window. Edge function instances are short-lived so this is
// best-effort; persistent abuse is still caught downstream by the bot UA rule.
const RECENT: Map<string, number[]> = new Map();
const RAPID_WINDOW_MS = 10_000;
const RAPID_THRESHOLD = 25;

export function isRapidFire(key: string): boolean {
  if (!key) return false;
  const now = Date.now();
  const bucket = (RECENT.get(key) || []).filter((t) => now - t < RAPID_WINDOW_MS);
  bucket.push(now);
  RECENT.set(key, bucket);
  // Trim memory: keep at most 200 distinct keys
  if (RECENT.size > 200) {
    const k = RECENT.keys().next().value;
    if (k) RECENT.delete(k);
  }
  return bucket.length > RAPID_THRESHOLD;
}

/** Run all checks for a generic analytics event payload. */
export interface EventCheckInput {
  url?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
  };
  rapidKey?: string;
}

export interface EventCheckResult {
  ok: boolean;
  reasons: SanitizerReason[];
  cleanedUrl: string | null;
  cleanedReferrer: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
}

export function checkEvent(input: EventCheckInput): EventCheckResult {
  const all: SanitizerReason[] = [];
  const u = sanitizeUrl(input.url, { allowExternalReferrer: false });
  all.push(...u.reasons);
  const r = sanitizeReferrer(input.referrer);
  all.push(...r.reasons);
  all.push(...classifyUserAgent(input.userAgent));
  if (input.rapidKey && isRapidFire(input.rapidKey)) all.push("rapid_fire");

  const utmRaw = input.utm || {};
  const src = sanitizeUtmValue("utm_source", utmRaw.source);
  const med = sanitizeUtmValue("utm_medium", utmRaw.medium);
  const camp = sanitizeUtmValue("utm_campaign", utmRaw.campaign);
  const term = sanitizeUtmValue("utm_term", utmRaw.term);
  const cont = sanitizeUtmValue("utm_content", utmRaw.content);
  for (const x of [src, med, camp, term, cont]) all.push(...x.reasons);

  const fatal: SanitizerReason[] = [
    "invalid_url", "invalid_utf", "non_allowed_host",
    "bot_user_agent", "suspicious_user_agent",
    "malformed_referrer", "rapid_fire",
  ];
  const ok = !dedupe(all).some((rsn) => fatal.includes(rsn));
  return {
    ok,
    reasons: dedupe(all),
    cleanedUrl: u.cleaned,
    cleanedReferrer: r.cleaned,
    utm: {
      source: src.value,
      medium: med.value,
      campaign: camp.value,
      term: term.value,
      content: cont.value,
    },
  };
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Persist a rejected event to analytics_quarantine via service-role client. */
export async function quarantineEvent(
  // deno-lint-ignore no-explicit-any
  admin: any,
  args: {
    source: string;
    reasons: SanitizerReason[];
    payload: Record<string, unknown>;
    userAgent?: string | null;
    sessionId?: string | null;
    pagePath?: string | null;
    referrer?: string | null;
    utmSource?: string | null;
    ipHash?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("analytics_quarantine").insert({
      source: args.source,
      reasons: args.reasons,
      payload: args.payload,
      user_agent: args.userAgent ?? null,
      session_id: args.sessionId ?? null,
      page_path: args.pagePath ?? null,
      referrer: args.referrer ?? null,
      utm_source: args.utmSource ?? null,
      ip_hash: args.ipHash ?? null,
    });
  } catch (_) {
    // never throw out of analytics
  }
}