# Server-side 301/404 proposal (not deployed)

Measured 2026-10-16: `public/_redirects` is ignored by the host. `/product/*`,
`/lp/*` and unknown `/products/*` / `/guides/*` all return HTTP 200 without a
`Location` header. The redirect happens only in the browser. The `cf-ray` header
belongs to the host's Cloudflare edge. This project has no Cloudflare connection,
so the agent cannot read or change a `getpawsy.pet` zone. Everything below needs
the owner's own Cloudflare zone for getpawsy.pet, with orange-cloud proxying.

## A. Redirect Rules (Rules → Redirect Rules, single hop, query preserved)

| # | When (expression) | Target (dynamic) | Status |
|---|---|---|---|
| 1 | `starts_with(http.request.uri.path, "/product/") and len(http.request.uri.path) > 9` | `concat("https://getpawsy.pet/products/", substring(http.request.uri.path, 9))` | 301, preserve query string |
| 2 | `starts_with(http.request.uri.path, "/lp/") and len(http.request.uri.path) > 4` | `concat("https://getpawsy.pet/products/", substring(http.request.uri.path, 4))` | 301, preserve query string |

The target `/products/<slug>` decides for itself: a live product, a retired
noindex stub, or 404 (rule B). There are no wildcard redirects to the homepage
or to `/collections/all`.

## B. Real 404 for unknown products/guides (Worker, fail-open)

Route: `getpawsy.pet/products/*` and `getpawsy.pet/guides/*`, GET/HEAD only.

1. Load the allowlist from the live sitemaps (`/sitemap-products-1.xml`, the
   guides sitemap) **and** `retired-product-slugs.ts`. Cache for 1 hour
   (Cache API). Also allow noindex-but-live PDPs: before returning 404,
   fetch the origin and check whether the prerendered HTML has
   `prerender-status-code` = 404. Return 404 only in that case, or when the
   slug has no prerendered directory (origin HTML equals the SPA shell
   `<title>` of index.html).
2. Unknown → fetch the origin, return the **same body** with `status: 404`
   and `x-robots-tag: noindex`. Use 410 only for the exact retired 9 slugs
   once they have been gone for 30 days or more.
3. Never touch: assets (`/assets/*`, any path with a file extension), `/sitemap*.xml`,
   the feeds (`/google-feed.xml`, `/google-shopping-feed.xml`, `/merchant-feed.xml`),
   `/robots.txt`, `/healthz.json`, or query-only variants (`?utm_*`, `?cb=`).
4. On any exception, sitemap fetch failure or non-200 origin → pass the origin
   response through unchanged.

## Validation before enabling

The `test/smoke-test.sh` pattern plus these must all pass:
- the active RVS PDP returns 200 with `index`
- a merch-hidden PDP returns 200
- a retired slug returns 404
- `/products/does-not-exist-xyz` returns 404
- a valid guide returns 200; an unknown guide returns 404
- `/product/<live>` returns 301 → `/products/<live>`, then 200
- `/lp/<live>?utm_source=x` returns 301 with the query kept
- all three feeds return 200 as XML with 241 items; the sitemaps and `robots.txt` return 200

Rollback: disable the rule or route. There is no state to undo.
