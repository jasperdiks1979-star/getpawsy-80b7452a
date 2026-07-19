/**
 * getpawsy.pet — GSC Soft-404 Recovery CANARY Worker (single-file, iPhone-deployable)
 *
 * Scope: EXACT-MATCH only for the 15 confirmed /c/* paths from the frozen
 * 331-URL GSC Soft-404 cohort dated 2026-07-19. Every other request is a
 * pass-through to the origin.
 *
 * Safety:
 *   - Fails open: unknown host, non-GET/HEAD, or thrown error -> origin.
 *   - No canonical tag on 410 (removed URLs must not canonicalize).
 *   - HEAD returns identical status + headers, no body.
 *   - No wildcards: /c/anything-else passes through untouched.
 */

const ALLOWED_HOSTS = new Set([
  "getpawsy.pet",
  "www.getpawsy.pet",
]);

const EXACT_410 = new Set([
  "/c/all",
  "/c/best-sellers",
  "/c/cats/beds-furniture",
  "/c/cats/bowls-feeders",
  "/c/cats/food-treats",
  "/c/cats/grooming",
  "/c/cats/health",
  "/c/cats/litter",
  "/c/cats/toys",
  "/c/dogs/clothing",
  "/c/dogs/feeding",
  "/c/dogs/grooming",
  "/c/dogs/health",
  "/c/dogs/sleep",
  "/c/dogs/toys",
]);

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function goneBody() {
  // No <link rel="canonical"> — a removed URL must not canonicalize.
  return (
    '<!doctype html><html lang="en"><head>' +
    '<meta charset="utf-8">' +
    '<title>410 Gone — getpawsy.pet</title>' +
    '<meta name="robots" content="noindex,nofollow">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:520px;margin:10vh auto;padding:0 1rem;color:#111;text-align:center}a{color:#2563eb}</style>' +
    '</head><body>' +
    '<h1>410 Gone</h1>' +
    '<p>This collection page has been permanently removed.</p>' +
    '<p><a href="https://getpawsy.pet/">Return to getpawsy.pet</a></p>' +
    '</body></html>'
  );
}

function goneResponse(path, method) {
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300",
    "x-robots-tag": "noindex, nofollow",
    "x-gsc-recovery": "410-canary",
    "x-gsc-recovery-path": path,
  };
  const body = method === "HEAD" ? null : goneBody();
  return new Response(body, { status: 410, headers });
}

export default {
  async fetch(request, env, ctx) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return fetch(request);
    }

    if (!ALLOWED_HOSTS.has(url.hostname)) return fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);

    const path = normalizePath(url.pathname);
    if (EXACT_410.has(path) || EXACT_410.has(url.pathname)) {
      return goneResponse(url.pathname, request.method);
    }

    return fetch(request);
  },
};