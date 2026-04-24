/**
 * Centralized accessor for TikTok OAuth secrets.
 *
 * Lovable Cloud secrets are entered via a textarea-style form, which makes it
 * easy to accidentally include leading/trailing whitespace, a newline, a tab,
 * or even invisible characters (BOM, zero-width space, NBSP) when pasting from
 * the TikTok Developer Portal. TikTok then rejects the OAuth request with a
 * generic `invalid_client_key` because the URL contains `%20`/`%0A`/etc.
 *
 * To make every edge function immune to this class of bug, all reads of the
 * TikTok client_key / client_secret MUST go through these helpers instead of
 * `Deno.env.get(...)` directly. They:
 *   1. Read the raw env var.
 *   2. Strip a UTF-8 BOM if present.
 *   3. Remove zero-width / NBSP characters anywhere in the string.
 *   4. Trim leading/trailing ASCII + Unicode whitespace (incl. \r\n\t).
 *
 * The helpers also return the raw value alongside the sanitized one so the
 * diagnostic endpoints can warn the admin that their stored secret has
 * whitespace and should be re-entered cleanly. Sanitization at read time is
 * the safety net; cleaning the stored secret is still preferred.
 */

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00A0]/g;

export function sanitizeSecret(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip BOM + zero-width + NBSP, then trim Unicode whitespace at the edges.
  return raw.replace(ZERO_WIDTH_RE, "").trim();
}

export function getTikTokClientKey(): string {
  return sanitizeSecret(Deno.env.get("TIKTOK_CLIENT_KEY"));
}

export function getTikTokClientSecret(): string {
  return sanitizeSecret(Deno.env.get("TIKTOK_CLIENT_SECRET"));
}

/**
 * Returns both the raw and sanitized values so diagnostic endpoints can detect
 * and report drift (e.g. "your stored secret contains 2 trailing spaces").
 */
export function getTikTokClientKeyWithRaw(): { raw: string; clean: string; hadWhitespace: boolean } {
  const raw = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
  const clean = sanitizeSecret(raw);
  return { raw, clean, hadWhitespace: raw !== clean && raw.length > 0 };
}

export function getTikTokClientSecretWithRaw(): { raw: string; clean: string; hadWhitespace: boolean } {
  const raw = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
  const clean = sanitizeSecret(raw);
  return { raw, clean, hadWhitespace: raw !== clean && raw.length > 0 };
}