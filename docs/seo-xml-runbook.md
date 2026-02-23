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
1. Queries Supabase REST API for live product/collection/blog data
2. Falls back to static JSON files in `/data/*.json` if API is unavailable
3. Writes valid XML files into `/public`
4. Vite copies `/public` → `/dist` during build

**Build flow**: `prebuild (generate-sitemaps.mjs)` → `vite build` → deploy `/dist`

**Data files** (fallback sources in `/data/`):
- `products.json` — empty array (live REST is primary source for 562+ products)
- `collections.json` — SEO collections
- `blog.json` — published blog posts
- `guides.json` — guide pages
- `clusters.json` — cluster/pillar pages

## XML Files

| File | Source |
|------|--------|
| `sitemap.xml` | Sitemap index (sitemapindex) referencing all child sitemaps |
| `sitemap-index.xml` | Alias of sitemap.xml |
| `sitemap-static.xml` | Static pages (/, /products, /blog, etc.) |
| `sitemap-products-{N}.xml` | Products split into 5000-URL chunks |
| `sitemap-collections.xml` | Active SEO collections |
| `sitemap-clusters.xml` | Pillar + intent pages |
| `sitemap-blog.xml` | Published blog posts |
| `sitemap-guides.xml` | Guide pages |
| `sitemap-hubs.xml` | Money hub pages (static file in /public) |
| `merchant-feed.xml` | Google Merchant Center RSS 2.0 feed (vite plugin) |

## Regenerating Sitemaps

### Manual
```bash
node scripts/generate-sitemaps.mjs
```

### Automatic (every deploy)
Add to package.json: `"prebuild": "node scripts/generate-sitemaps.mjs"`

### Fallback Behavior
If Supabase REST API fails during generation:
- Script falls back to `/data/*.json` files
- If those are also empty, generates valid empty `<urlset></urlset>` XML
- Build **never fails** due to XML generation errors

## Troubleshooting

### XML shows HTML instead of XML
**Cause**: The SPA router caught the request instead of serving the static file.
**Fix**: Ensure the static `.xml` file exists in `dist/`.

### sitemap-products-*.xml shows 0 discovered pages in GSC
**Cause**: XML was empty or had invalid structure.
**Fix**: Run `node scripts/generate-sitemaps.mjs` and verify output contains `<url>` entries.

### Merchant feed has 0 products
**Cause**: `products_public` view returned no data during vite build.
**Fix**: Check build logs for `[xml-plugin]` messages. Verify Supabase REST API is accessible.

## robots.txt

Located at `public/robots.txt` (static file).

**Key rules:**
- Money pages allowed: `/product/`, `/guides/`, `/blog/`, `/bestsellers`, `/collections/`
- Parameter URLs blocked: `/*?*` (prevents crawl waste)
- Admin/internal pages blocked: `/dashboard`, `/admin`, `/profile`, etc.
- Sitemap declared: `Sitemap: https://getpawsy.pet/sitemap.xml`

## Domain Configuration

- Primary: `https://getpawsy.pet`
- www variant: `https://www.getpawsy.pet` (DNS A-record → Lovable)
- Cloudflare: DNS-only mode (grey cloud) for SSL compatibility

## Diagnostics

Admin diagnostics page available at `/admin/diagnostics`:
- Live HTTP health checks for /, /sitemap.xml, /merchant-feed.xml, /robots.txt
- Last 50 frontend error logs with timestamps
- Status badges (green/red) for quick assessment
