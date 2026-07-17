// Technical / non-storefront route patterns. Mirrored in src/lib/technicalRoutes.ts.
// Used at 4 layers: storefront tracker, gtag dispatch, canonical-ingest, analytics-canonical.

export const TECHNICAL_PREFIXES = [
  "/api/",
  "/functions/",
  "/storage/",
  "/.well-known/",
  "/admin/",
  "/_admin/",
  "/rest/",
  "/auth/v1/",
  "/realtime/",
];

export const TECHNICAL_EXACT = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/healthz",
  "/health",
  "/status",
  "/ping",
]);

export const TECHNICAL_REGEX: RegExp[] = [
  /^\/sitemap.*\.xml$/i,
  /^\/sitemap.*$/i,
  /^\/img\//i,
  /^\/images?\/proxy/i,
  /\/image[-_]?proxy/i,
  /^\/_next\//i,
  /^\/_vercel\//i,
  /_lovable_preview/i,
  /__lovable_/i,
  /\.(png|jpe?g|webp|gif|svg|ico|css|js|map|woff2?|ttf|eot|txt|xml|json)(\?|$)/i,
];

export function isTechnicalPath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  let path = pathOrUrl;
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch { /* keep as-is */ }
  const p = path.toLowerCase();
  if (TECHNICAL_EXACT.has(p)) return true;
  if (TECHNICAL_PREFIXES.some((pre) => p.startsWith(pre))) return true;
  if (TECHNICAL_REGEX.some((r) => r.test(p))) return true;
  return false;
}