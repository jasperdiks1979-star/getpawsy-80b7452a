# GetPawsy Performance Rebuild — Architecture & Verification

> Last updated: 2026-02-27

## What Changed & Why

### 1. 2-Layer Architecture (Marketing Shell + SPA)

**Problem**: The entire React app (600+ routes, 6 context providers, Supabase SDK) was parsed and evaluated before any pixel painted — even for the homepage.

**Solution**: 
- `index.html` contains a **static HTML shell** for the hero section that paints before any JS executes
- React's `createRoot().render()` replaces the static shell seamlessly once JS loads
- Layout component (`Navbar`, `Footer`, `TrendingNowStrip`) is **lazy-loaded** — not in the initial JS evaluation
- Homepage (`Index.tsx`) is lazy-loaded with `lazyWithRetry`

### 2. Cookie Banner: Zero-CLS, Zero-Dependency

**Problem**: Cookie banner imported `lucide-react` icons (Cookie, X, Settings), `Button` component, `sonner`, and `useIsMobile` hook — adding ~25KB to its chunk.

**Solution**:
- Replaced all lucide icons with emoji/text (`🍪`, `✕`, `⚙`)
- Replaced `Button` with inline-styled `<button>` elements
- Deferred `sonner` to dynamic import (only on interaction)
- Deferred `lcp-debug` markers to dynamic import
- Banner uses `position: fixed` with `translateY(100%)` animation — **never pushes layout** (CLS = 0)
- Mounts after 1500ms OR first user interaction (whichever first)

### 3. Footer: Lazy-Loaded Module

**Problem**: Footer imported 12 lucide icons + `sonner` + `Button` + `Input` eagerly — all bundled into Layout chunk.

**Solution**:
- Footer is now `lazy()` loaded in `Layout.tsx`
- Icons remain eager *within* the Footer module, but since the module itself only loads when needed, they don't block initial paint
- `sonner` toast calls converted to deferred `showToast()` wrapper

### 4. TrendingNowStrip: Icon-Free

**Problem**: Imported `TrendingUp` from lucide, pulling lucide into the initial chunk.

**Solution**: Replaced with inline SVG (14 bytes vs ~2KB module).

### 5. Caching Headers (nginx.conf)

| Route | Cache-Control | Purpose |
|-------|--------------|---------|
| `/` (HTML) | `public, max-age=0, s-maxage=300, stale-while-revalidate=86400` | Cloudflare caches 5min, browser always revalidates |
| `/assets/*` | `public, max-age=31536000, immutable` | Vite hashed files never change |
| `/sitemap*.xml`, `/robots.txt` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` | SEO files cached 1hr at edge |
| `/cart`, `/checkout`, `/admin` | `no-store, no-cache, must-revalidate` | Never cached |

### 6. Existing Optimizations (Preserved)

- Hero image preloaded with `imagesrcset` + `fetchpriority="high"`
- Supabase SDK dynamically imported (not in main bundle)
- All below-fold sections gated behind `useHydrationReady()` (idle/scroll/click trigger)
- Self-hosted font fallback metrics (`DM Sans Fallback`, `Playfair Fallback`)
- `font-display: swap` on all @font-face declarations

## Verification Checklist

### 1. Headers (after deploy)
```bash
# HTML — expect s-maxage=300
curl -sI https://getpawsy.pet/ | grep -iE 'cache-control|x-cache-debug'

# Assets — expect max-age=31536000, immutable
curl -sI https://getpawsy.pet/assets/index-*.js | grep -iE 'cache-control'

# Cart — expect no-store
curl -sI https://getpawsy.pet/cart | grep -iE 'cache-control'

# Redirects — expect 301
curl -sI https://www.getpawsy.pet/anything | grep -iE 'location|HTTP'
```

### 2. Lighthouse (Mobile, Simulated Throttling)
```bash
# Local test
npx lighthouse https://getpawsy.pet/ --only-categories=performance --preset=perf --throttling-method=simulate --chrome-flags="--headless" --output=json
```

**Target scores:**
| Metric | Target | Stretch Goal |
|--------|--------|-------------|
| LCP | ≤ 2.5s | ≤ 2.0s |
| CLS | ≤ 0.10 | ≤ 0.05 |
| TBT | ≤ 200ms | ≤ 150ms |
| FCP | ≤ 2.0s | ≤ 1.5s |

### 3. Bundle Size Check
```bash
# After build, check audits/bundle-report.html
bun run build
# Main chunk should be < 80KB gzipped
# Total JS < 220KB gzipped for homepage route
```

### 4. Cookie Banner CLS
- Open Chrome DevTools → Performance → Record page load
- Search for "cookie" in Layout Shifts panel
- Expected: 0 shifts from cookie banner

### 5. Static Shell Paint
- Add `?lcpTrace=1` to URL
- Check console for `BUNDLE_EXEC` timestamp
- Static hero should be visible BEFORE this timestamp (painted from HTML)

## Common Pitfalls

1. **CLS from cookie banner**: If banner uses `position: relative` or alters document flow → CLS spike. Must be `position: fixed`.
2. **Hero image too large**: Mobile hero should be ≤ 150KB (600w WebP). Use `/hero-dog-600.webp`.
3. **JS hydration blocks paint**: If any import in `main.tsx` is synchronous and heavy (e.g., Supabase SDK), it delays `createRoot`. Keep main.tsx imports minimal.
4. **Font FOUT causing CLS**: `font-display: swap` with proper fallback metrics prevents this. Check `DM Sans Fallback` and `Playfair Fallback` @font-face in index.html.
5. **Third-party scripts**: GA/GTM loaded via `deferred-analytics.ts` after React mount + idle callback. Never in `<head>`.

## Architecture Diagram

```
index.html (Static Shell)
├── <head> — fonts, hero preload, critical CSS inline
├── #static-hero-shell — visible before JS
│   ├── promo banner placeholder (40px)
│   ├── navbar placeholder (72px)
│   ├── trending strip placeholder (36px)
│   └── hero section (image + H1 + CTAs)
└── <script type="module" src="main.tsx">
    ├── createRoot() — replaces #static-hero-shell
    ├── <App> (lazy routes)
    │   ├── <Index> (lazy)
    │   │   ├── <Layout> (contains lazy Navbar + Footer)
    │   │   ├── Hero (instant, matches static shell)
    │   │   ├── Below-fold sections (gated by useHydrationReady)
    │   │   └── Suspense boundaries per section
    │   ├── /products/* (lazy)
    │   ├── /cart (lazy, no-cache)
    │   └── /admin/* (lazy, no-cache)
    └── Deferred widgets (cookie banner, chat, popups — after 5s/interaction)
```
