/**
 * getpawsy.pet — GSC Soft-404 Recovery Worker (corrected build)
 *
 * Emits real 410/301 HTTP status codes for the exact 331-URL GSC Soft-404
 * cohort dated 2026-07-19. Every other request is a pass-through.
 *
 * Safety principles:
 *   - EXACT-MATCH ONLY. No wildcards, no family rules.
 *   - FAIL-OPEN. Unknown host, non-GET/HEAD, or thrown error -> origin.
 *   - NO CANONICAL on a 410 (a removed URL must not canonicalize).
 *   - MARKETING-PARAM ALLOWLIST on 301 (utm_*, gclid, fbclid, pinclid only).
 *   - HEAD returns identical status + headers to GET, but no body.
 */

import rules from "../data/worker-rules.json";

export interface Env {}

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "getpawsy.pet",
  "www.getpawsy.pet",
]);

export const EXACT_410: ReadonlySet<string> = new Set(rules.exact_410 as string[]);
export const EXACT_301: Readonly<Record<string, string>> =
  rules.exact_301 as Record<string, string>;

// Explicit allowlist of query parameters preserved across a 301 redirect.
export const ALLOWED_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "pinclid",
]);

export function filterQuery(search: string): string {
  if (!search || search === "?") return "";
  const src = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = new URLSearchParams();
  for (const key of ALLOWED_QUERY_PARAMS) {
    for (const v of src.getAll(key)) {
      if (v === "") continue; // drop empty allowed params
      out.append(key, v);
    }
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function goneBody(): string {
  // NO <link rel="canonical"> — removed URLs must not canonicalize.
  return (
    `<!doctype html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<title>410 Gone — getpawsy.pet</title>` +
    `<meta name="robots" content="noindex,nofollow">` +
    `</head><body>` +
    `<h1>410 Gone</h1>` +
    `<p>This page has been permanently removed.</p>` +
    `<p><a href="https://getpawsy.pet/">Return to getpawsy.pet</a></p>` +
    `</body></html>`
  );
}

function goneHeaders(path: string): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=3600, s-maxage=86400",
    "x-robots-tag": "noindex, nofollow",
    "x-gsc-recovery": "410",
    "x-gsc-recovery-path": path,
  };
}

function goneResponse(path: string, method: string): Response {
  const body = method === "HEAD" ? null : goneBody();
  return new Response(body, { status: 410, headers: goneHeaders(path) });
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

    if (!ALLOWED_HOSTS.has(url.hostname)) return fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);

    const path = normalizePath(url.pathname);

    // 1. Exact 301
    const target = EXACT_301[path] ?? EXACT_301[url.pathname];
    if (target) {
      const filtered = filterQuery(url.search);
      const location = filtered ? `${target}${filtered}` : target;
      return redirectResponse(url.pathname, location);
    }

    // 2. Exact 410
    if (EXACT_410.has(path) || EXACT_410.has(url.pathname)) {
      return goneResponse(url.pathname, request.method);
    }

    // 3. Pass-through
    return fetch(request);
  },
};
