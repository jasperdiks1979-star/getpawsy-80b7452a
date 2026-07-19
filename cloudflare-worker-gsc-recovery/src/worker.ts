/**
 * getpawsy.pet — GSC Soft-404 Recovery Worker
 *
 * Purpose: Emit REAL HTTP status codes (410 Gone / 301 Moved) for the exact
 * 331-URL Google Search Console "Soft 404" cohort dated 2026-07-19, while
 * leaving every other request on the origin untouched.
 *
 * Design principles:
 *   1. EXACT-MATCH ONLY. No wildcards. No family rules. Only URLs present
 *      in data/cohort-manifest.json get intercepted. Every other URL is a
 *      pass-through to the origin.
 *   2. FAIL-OPEN. Any exception, unknown host, unknown method, or non-GET/HEAD
 *      request falls through to the origin unmodified.
 *   3. NON-DESTRUCTIVE. The worker only sets response status + headers on
 *      dead paths; it never rewrites HTML, cookies, or POST bodies.
 *   4. OBSERVABLE. Every intercepted request emits `x-gsc-recovery: <bucket>`
 *      so post-deploy verification can prove which rule fired.
 *
 * Deployment: see DEPLOYMENT.md. Rollback: see ROLLBACK.md.
 */

import rules from "../data/worker-rules.json";

export interface Env {}

const ALLOWED_HOSTS = new Set([
  "getpawsy.pet",
  "www.getpawsy.pet",
]);

const EXACT_410: Set<string> = new Set(rules.exact_410 as string[]);
const EXACT_301: Record<string, string> = rules.exact_301 as Record<string, string>;

function normalizePath(pathname: string): string {
  // Collapse trailing slash (except root) so "/foo/" and "/foo" resolve alike.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function goneResponse(path: string): Response {
  const body =
    `<!doctype html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<title>410 Gone — getpawsy.pet</title>` +
    `<meta name="robots" content="noindex,nofollow">` +
    `<link rel="canonical" href="https://getpawsy.pet/">` +
    `</head><body>` +
    `<h1>410 Gone</h1>` +
    `<p>This page has been permanently removed.</p>` +
    `<p><a href="https://getpawsy.pet/">Return to getpawsy.pet</a></p>` +
    `</body></html>`;
  return new Response(body, {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "x-robots-tag": "noindex, nofollow",
      "x-gsc-recovery": "410",
      "x-gsc-recovery-path": path,
    },
  });
}

function redirectResponse(from: string, to: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      location: to,
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "x-gsc-recovery": "301",
      "x-gsc-recovery-path": from,
      "x-gsc-recovery-target": to,
    },
  });
}

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return fetch(request);
    }

    // Fail-open: only act on allowed hosts + safe methods.
    if (!ALLOWED_HOSTS.has(url.hostname)) return fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);

    const path = normalizePath(url.pathname);

    // 1. Exact 301 (active PDPs behind a stale /product/<uuid> path).
    const target = EXACT_301[path] ?? EXACT_301[url.pathname];
    if (target) {
      // Preserve marketing / tracking query string on the redirect so
      // Pinterest / GA / UTM attribution survives the one-hop 301.
      const location = url.search ? `${target}${url.search}` : target;
      return redirectResponse(url.pathname + url.search, location);
    }

    // 2. Exact 410 (removed URL from the GSC cohort).
    if (EXACT_410.has(path) || EXACT_410.has(url.pathname)) {
      // HEAD gets headers-only 410.
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 410,
          headers: {
            "x-robots-tag": "noindex, nofollow",
            "x-gsc-recovery": "410",
            "x-gsc-recovery-path": url.pathname,
          },
        });
      }
      return goneResponse(url.pathname);
    }

    // 3. Everything else: pass through to origin unchanged.
    return fetch(request);
  },
};