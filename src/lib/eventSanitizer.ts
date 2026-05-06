/**
 * Client-side event sanitizer — mirrors supabase/functions/_shared/event-sanitizer.ts.
 *
 * Used by visitor tracking, lpFunnelMirror, and other client ingest paths
 * to drop spam-like rows BEFORE they hit Supabase.
 */

const ALLOWED_HOSTS = new Set([
  'getpawsy.pet',
  'www.getpawsy.pet',
  'getpawsy.lovable.app',
  'id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app',
]);

const APPROVED_UTM_SOURCES = new Set([
  'pinterest', 'tiktok', 'google', 'facebook', 'instagram', 'meta',
  'bing', 'youtube', 'reddit', 'twitter', 'x', 'email', 'newsletter',
  'direct', 'organic', '(direct)', 'linkinbio',
]);

const APPROVED_UTM_MEDIUMS = new Set([
  'social', 'cpc', 'ppc', 'paid', 'organic', 'referral', 'email',
  'display', 'retargeting', 'affiliate', 'linkinbio', 'direct',
]);

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const INVALID_UTF_REGEX = /[\uFFFD\u0000\uD800-\uDFFF]/;
const ENCODED_BLOB_REGEX = /(?:%[0-9A-Fa-f]{2}){12,}|[A-Za-z0-9+/=]{200,}/;

export function isCleanString(v: unknown, max = 500): boolean {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  if (v.length > max) return false;
  if (INVALID_UTF_REGEX.test(v)) return false;
  if ((v.match(EMOJI_REGEX) || []).length > 3) return false;
  if (ENCODED_BLOB_REGEX.test(v)) return false;
  return true;
}

export function cleanString(v: unknown, max = 500): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return null;
  return isCleanString(v, max) ? v : null;
}

export function cleanUrlSameSite(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (!isCleanString(raw, 1500)) return null;
  try {
    const u = new URL(raw, 'https://getpawsy.pet');
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function cleanReferrer(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (!isCleanString(raw, 1500)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function cleanUtmSource(raw: unknown): string | null {
  const v = cleanString(raw, 120)?.toLowerCase().trim() ?? null;
  if (!v) return null;
  return APPROVED_UTM_SOURCES.has(v) ? v : null;
}

export function cleanUtmMedium(raw: unknown): string | null {
  const v = cleanString(raw, 120)?.toLowerCase().trim() ?? null;
  if (!v) return null;
  return APPROVED_UTM_MEDIUMS.has(v) ? v : null;
}

export function cleanUtmFreeform(raw: unknown): string | null {
  const v = cleanString(raw, 120);
  if (!v) return null;
  const stripped = v.replace(/[^A-Za-z0-9._\-+ /:|()]/g, '');
  return stripped.length > 0 ? stripped : null;
}

const BOT_PATTERNS = [
  'bot', 'crawler', 'spider', 'scraper', 'headless', 'phantom',
  'selenium', 'puppeteer', 'lighthouse', 'pagespeed',
];

export function isBotUserAgent(ua?: string | null): boolean {
  if (!ua) return false;
  const low = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => low.includes(p));
}

export interface SanitizedTrackingFields {
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

export function sanitizeTrackingFields(input: {
  page_path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
}): SanitizedTrackingFields {
  return {
    page_path: cleanString(input.page_path, 500),
    referrer: cleanReferrer(input.referrer),
    utm_source: cleanUtmSource(input.utm_source),
    utm_medium: cleanUtmMedium(input.utm_medium),
    utm_campaign: cleanUtmFreeform(input.utm_campaign),
    utm_term: cleanUtmFreeform(input.utm_term),
    utm_content: cleanUtmFreeform(input.utm_content),
  };
}