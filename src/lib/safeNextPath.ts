/**
 * Validate a visitor-supplied "return to" path (e.g. /auth?next=...).
 * Returns the path only if it is a same-origin internal path; otherwise "/".
 * Blocks protocol-relative (//x), backslash (/\x), absolute URLs, schemes,
 * control characters and anything resolving off-origin.
 */
export function safeNextPath(raw: string | null | undefined, origin?: string): string {
  const fallback = '/';
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  // Control chars / whitespace can be stripped by URL parsers and hide "//".
  if (/[\u0000-\u001F\u007F\s]/.test(raw)) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.includes('\\')) return fallback;

  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://getpawsy.pet');
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(base).origin) return fallback;
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
