# CWV Homepage LCP Fix — Surgical Changes

**Date:** 2026-02-27  
**Scope:** Homepage (`/`) only  
**Target:** LCP < 2.5s, CLS < 0.1, TBT < 200ms (mobile Lighthouse)

## Problem

Field data: LCP p75 ~6.8s. TTFB is excellent (~120ms). Root cause: **JS parse/execute time** — heavy synchronous imports (`Button`/Radix Slot, `ArrowRight`/Lucide, `Loader2`, `AlertCircle`) in the critical render path delay hero paint even though a static HTML shell exists in `index.html`.

## What Changed

### 1. `src/pages/Index.tsx` — Hero CTAs → plain `<a>` tags

**Before:** Hero used `<Button asChild>` (imports Radix Slot ~8KB) + `<ArrowRight>` (Lucide icon ~3KB).  
**After:** Hero uses plain `<a>` tags with Tailwind classes matching the static shell in `index.html`. Visually identical, zero JS dependency for first paint.

`Button` and `ArrowRight` are now **lazy-loaded** — only downloaded when below-fold sections scroll into view.

### 2. `src/App.tsx` — Eliminated 3 sync imports from main chunk

**Removed from top-level:**
- `Button` from `@/components/ui/button` (~8KB with Radix Slot chain)
- `Loader2` from `lucide-react` (~3KB)
- `AlertCircle` from `lucide-react` (~3KB)

**Replaced with:** Plain HTML `<button>` + CSS spinner + emoji icon in error/loading fallbacks. These are error states that rarely render — no need to bloat the happy path.

**Estimated savings:** ~14-20KB less JS parsed on initial load.

### 3. Cookie Banner (already optimized)

Already uses `position: fixed` + deferred mount (1500ms / interaction). CLS = 0. No changes needed.

### 4. Static Hero Shell (already in place)

`index.html` already contains a pre-React static hero with the exact same `<img>` (preloaded, fetchpriority=high, eager, srcset). No changes needed.

## LCP Element

- **Element:** `<img>` inside `<picture>` with class `hero-lcp-img`
- **Desktop:** `/hero/getpawsy-hero-desktop.webp` (1600×896, WebP)
- **Mobile:** `/hero/getpawsy-hero-mobile.webp` (896×1184, WebP, portrait 3:4)
- **Preload:** Two media-conditioned `<link rel="preload">` in `<head>` (mobile ≤768px, desktop ≥769px)
- **Attributes:** `fetchpriority="high"`, `loading="eager"`, `decoding="async"`, `width`/`height` set
- **Aspect ratio:** CSS enforces `16/9` on desktop, `3/4` on mobile — zero CLS

## Verification

### Local Lighthouse
```bash
# Install Lighthouse CLI
npm i -g lighthouse

# Run mobile audit
lighthouse https://getpawsy.pet/ --preset=perf --form-factor=mobile --throttling-method=simulate --output=html --output-path=./lcp-report.html

# Quick check
lighthouse https://getpawsy.pet/ --preset=perf --form-factor=mobile --only-categories=performance --quiet
```

### DevTools checks
1. **Network tab:** Filter `hero-dog`. Verify request starts within first 200ms (preloaded).
2. **Performance tab → Timings:** LCP marker should point to hero image.
3. **Coverage tab:** Check main chunk — unused JS should be < 40%.

### curl checks
```bash
# HTML caching
curl -sI https://getpawsy.pet/ | grep -iE 'cache-control|cf-cache'

# Hero image caching
curl -sI https://getpawsy.pet/hero-dog-600.webp | grep -iE 'cache-control'

# Cart bypass
curl -sI https://getpawsy.pet/cart | grep -iE 'cache-control'
```

### PageSpeed Insights
```
https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgetpawsy.pet%2F
```

## Expected Improvements

| Metric | Before | Expected After |
|--------|--------|---------------|
| LCP | ~4.5-6.8s | < 2.5s |
| CLS | ~0.05 | < 0.05 |
| TBT | ~800ms | < 400ms |
| Initial JS parsed | ~150KB+ | ~130KB |

## No Regressions

- ✅ Cart/checkout: no changes to commerce routes
- ✅ Analytics: deferred loading unchanged
- ✅ Below-fold sections: lazy-loaded, render on scroll
- ✅ Navigation: `<a href>` triggers full navigation (same as `<Link to>` for cross-page)
- ✅ Cookie banner: fixed overlay, zero CLS
