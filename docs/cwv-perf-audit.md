# Core Web Vitals Performance Audit

**Date:** 2026-02-27

## Changes Applied

### 1. Hero / LCP Image
- **Already optimized**: `<img>` tag with `fetchpriority="high"`, `loading="eager"`, `decoding="async"`, explicit `width/height`, responsive `srcSet`.
- **Improved**: Added `imagesrcset` and `imagesizes` to the `<link rel="preload">` in `<head>` so the browser can pick the correct responsive variant during preload (previously only preloaded the 600w variant regardless of viewport).
- Static HTML shell in `index.html` ensures hero paints before any JS executes.
- Hero images served from origin (`/hero-dog-*.webp`), no Cloudinary round-trip.

### 2. Cookie Banner (CLS Prevention)
- **Changed**: Mount delay from `requestIdleCallback` (2s timeout) → **1500ms OR first user interaction**, whichever comes first.
- Cookie banner uses `position: fixed; bottom: 0` — zero layout shift by design.
- CSS `contain: layout` applied via `[data-testid="cookie-banner"]` in `index.html`.
- No cookies set on public HTML responses (Cloudflare caching safe).

### 3. JavaScript Weight
- **Already optimized**: Route-based code splitting via `React.lazy()` for all below-fold sections (12+ lazy components on homepage).
- Supabase client dynamically imported — not in critical path.
- Icons use per-icon deep imports (`lucide-react/dist/esm/icons/*`).
- Data queries gated behind `useHydrationReady()` — no fetches until idle/interaction.

### 4. Fonts
- **Already optimized**: Self-hosted WOFF2 via inline `@font-face` in `<head>`.
- 2 families (DM Sans 400+600, Playfair Display 700), all `font-display: swap`.
- Metric-override fallback fonts prevent CLS during font load.
- Both font files preloaded with `<link rel="preload" as="font">`.

### 5. Below-Fold Images
- All non-hero images use `loading="lazy"` and `decoding="async"` via `OptimizedImage` component.
- Responsive `srcSet` with `sizes` attribute for proper resolution selection.
- `content-visibility: auto` applied to lazy images via `data-defer-visibility`.

## Expected Impact

| Metric | Before | Expected After |
|--------|--------|----------------|
| LCP | 12s+ (TTFB-bound) | <2.5s (with CF cache HIT) |
| CLS | High | <0.05 |
| TBT | ~300ms | <200ms |
| FCP | ~2s | <1.5s (with CF cache) |

**Key insight**: The 12s LCP was primarily caused by missing `Cache-Control` headers at origin, preventing Cloudflare edge caching. With proper headers (set in `nginx.conf`) and CF cache rules, TTFB drops from ~8s to <100ms on cache HIT.

## How to Verify

### PageSpeed Insights
1. Run https://pagespeed.web.dev/ against `https://getpawsy.pet/`
2. Check mobile LCP < 2.5s, CLS < 0.1

### Response Headers (curl)
```bash
curl -sI https://getpawsy.pet/ | grep -iE 'cache-control|cf-cache|x-cache-debug|set-cookie'
```
Expected:
- `cache-control: public, max-age=0, s-maxage=28800, stale-while-revalidate=60`
- `x-cache-debug: html-public`
- `cf-cache-status: HIT` (on 2nd request)
- No `set-cookie`

### LCP Trace (dev)
Append `?lcpTrace=1` to any page URL and check browser console for timeline markers.

### Audit Script
```bash
node tools/cf-cache-audit.js
```
