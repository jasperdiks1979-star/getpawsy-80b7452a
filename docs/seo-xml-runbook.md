# SEO & XML Runbook — GetPawsy

## Architecture Overview

- **Framework**: Vite + React SPA (client-side rendering)
- **XML Generation**: Build-time via `vite-plugin-sitemaps.ts`
- **Hosting**: Lovable Cloud (static files served from `dist/`)
- **Error Handling**: `AppErrorBoundary` (root) + `RouteErrorBoundary` (routes) + ProdSafe guards

## XML Files

All XML files are **generated at build time** and written to `dist/`:

| File | Source |
|------|--------|
| `sitemap-index.xml` | Master sitemap index pointing to sub-sitemaps |
| `sitemap.xml` | Alias of sitemap-index.xml (backward compat) |
| `sitemap-static.xml` | Static pages (/, /products, /bestsellers, etc.) |
| `sitemap-products-{N}.xml` | Products split into 500-URL chunks from `products_public` |
| `sitemap-collections.xml` | Active SEO collections |
| `sitemap-clusters.xml` | Namespaced pillar + intent pages (/dog/*, /cat/*) |
| `sitemap-blog.xml` | Published blog posts |
| `sitemap-hubs.xml` | Money hub pages (orthopedic dog beds, cat trees, car safety) |
| `sitemap-guides.xml` | Guide pages (static list + DB articles) |
| `merchant-feed.xml` | Google Merchant Center RSS 2.0 feed |

## Regenerating XML Snapshots

### Automatic (every deploy)
XML files regenerate automatically on every build/deploy. The Vite plugin queries the database REST API at build time.

### Manual Trigger
1. Go to Lovable editor
2. Make any small change (e.g., add a comment) and save
3. This triggers a new build which regenerates all XML files

### Fallback Behavior
If the database query fails during build:
- Sitemap files fall back to a minimal valid empty `<urlset/>`
- Merchant feed falls back to a minimal valid empty `<channel/>`
- Build **never fails** due to XML generation errors

## Troubleshooting

### XML shows HTML instead of XML
**Cause**: The SPA router caught the request instead of serving the static file.
**Fix**: The `GuideSlugRedirect.tsx` component already bypasses `.xml` paths. If this still happens, check that the static file exists in `dist/`.

### White Screen
**Cause**: JavaScript error in React rendering.
**Fix**: Already mitigated by:
1. `AppErrorBoundary` — catches fatal errors at root level, shows branded recovery UI
2. `RouteErrorBoundary` — catches per-route errors with Refresh/Go Back buttons
3. `ProdSafe` mode — all module-level inits wrapped in try/catch
4. `lazyWithRetry` — lazy imports with error logging

### sitemap.xml is empty or minimal
**Cause**: Database query failed during build.
**Fix**: Check build logs for `[xml-plugin]` messages. Verify Supabase REST API is accessible.

### Merchant feed has 0 products
**Cause**: `products_public` view returned no data.
**Fix**: Check that `products_public` view exists and `is_active=true` products are present.

## robots.txt

Located at `public/robots.txt` (static file).

**Key rules:**
- Money pages allowed: `/product/`, `/guides/`, `/blog/`, `/bestsellers`, `/collections/`
- Parameter URLs blocked: `/*?*` (prevents crawl waste)
- Admin/internal pages blocked: `/dashboard`, `/admin`, `/profile`, etc.
- Sitemap declared: `Sitemap: https://getpawsy.pet/sitemap.xml`

**⚠️ Warning**: The `Disallow: /*?*` rule blocks ALL query-string URLs. This is intentional to prevent crawl waste, but ensure canonical URLs never contain query parameters.

## Domain Configuration

- Primary: `https://getpawsy.pet`
- www variant: `https://www.getpawsy.pet` (DNS A-record → Lovable)
- Cloudflare: DNS-only mode (grey cloud) for SSL compatibility
- No client-side hostname redirects (removed to prevent loops)

## Diagnostics

Admin diagnostics page available at `/admin/diagnostics`:
- Live HTTP health checks for /, /sitemap.xml, /merchant-feed.xml, /robots.txt
- Last 50 frontend error logs with timestamps
- Status badges (green/red) for quick assessment
