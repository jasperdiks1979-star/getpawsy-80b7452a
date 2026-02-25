# SEO & XML Runbook — GetPawsy

## Architecture Overview

- **Framework**: Vite + React SPA (client-side rendering)
- **Sitemap Generation**: Prebuild Node script `scripts/generate-sitemaps.mjs` → writes into `/public`
- **Merchant Feed**: Build-time via `vite-plugin-sitemaps.ts` (merchant feed only, NO sitemaps)
- **Hosting**: Lovable Cloud (static files served from `dist/`)
- **Error Handling**: `AppErrorBoundary` (root) + `RouteErrorBoundary` (routes) + ProdSafe guards

## Sitemap System (Single Authority)

**Generator**: `node scripts/generate-sitemaps.mjs`

This is the ONLY sitemap generator. It:
1. Queries REST API for ALL active products, collections, blog posts
2. Falls back to static JSON files in `/data/*.json` if API is unavailable
3. Writes valid XML files into `/public`
4. Vite copies `/public` → `/dist` during build

**Build flow**: `buildStart (vite-plugin-sitemaps.ts)` → `generate-sitemaps.mjs` → `vite build` → deploy `/dist`

**Data files** (fallback sources in `/data/`):
- `products.json` — empty array (live REST is primary source for 568+ products)
- `collections.json` — SEO collections
- `blog.json` — published blog posts
- `guides.json` — guide pages
- `clusters.json` — cluster/pillar pages

## XML Files

| File | Source | Expected URLs |
|------|--------|---------------|
| `sitemap.xml` | Sitemapindex referencing all child sitemaps | N/A (index) |
| `sitemap-pages.xml` | Static pages (/, /products, /about, etc.) | ~9 |
| `sitemap-products-1.xml` | ALL active non-duplicate products | ~568 |
| `sitemap-collections.xml` | ALL active SEO collections | ~94 |
| `sitemap-guides.xml` | ALL guides + clusters | ~19+ |
| `sitemap-blog.xml` | ALL published blog posts | ~323 |
| `merchant-feed.xml` | Google Merchant Center RSS 2.0 feed (vite plugin) | ~568 |

**No tier filtering** — all indexable content is included.

## robots.txt

Located at `public/robots.txt` (static file).

**Key rules:**
- All pages allowed by default
- Admin/internal pages blocked: `/admin`, `/dashboard`, `/profile`, `/cart`, `/checkout`, etc.
- Parameter URLs blocked: `gclid`, `fbclid`, `utm_`, `ref`, `session`, `sort`, `filter`, `variant`
- Single sitemap declared: `Sitemap: https://getpawsy.pet/sitemap.xml`

## Domain Configuration

- Primary: `https://getpawsy.pet`
- www variant: `https://www.getpawsy.pet` (DNS A-record → Lovable)
- Cloudflare: DNS-only mode (grey cloud) for SSL compatibility

## Troubleshooting

### XML shows HTML instead of XML
**Cause**: The SPA router caught the request instead of serving the static file.
**Fix**: Ensure the static `.xml` file exists in `dist/`.

### sitemap-products-*.xml shows 0 discovered pages in GSC
**Cause**: XML was empty or had invalid structure.
**Fix**: Run `node scripts/generate-sitemaps.mjs` and verify output contains `<url>` entries.

### Merchant feed has 0 products
**Cause**: `products_public` view returned no data during vite build.
**Fix**: Check build logs for `[xml-plugin]` messages. Verify REST API is accessible.
