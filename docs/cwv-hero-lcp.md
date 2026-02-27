# CWV Hero LCP Optimization

**Date:** 2026-02-27
**Scope:** Homepage (`/`) only — hero image LCP fix

## What Changed

### 1. New Optimized Hero Images (`/public/hero/`)

| File | Dimensions | Target Size | Format |
|------|-----------|-------------|--------|
| `getpawsy-hero-desktop.webp` | 1600×896 | ≤140KB | WebP |
| `getpawsy-hero-mobile.webp` | 896×1184 | ≤110KB | WebP |

Mobile gets a **portrait** crop (3:4) so the cat is large and prominent on small screens without wasting bandwidth on off-screen pixels.

### 2. `<picture>` Element (Index.tsx + index.html static shell)

```html
<picture>
  <source media="(max-width: 768px)" srcSet="/hero/getpawsy-hero-mobile.webp" type="image/webp" />
  <img src="/hero/getpawsy-hero-desktop.webp" width="1600" height="896"
       loading="eager" fetchpriority="high" decoding="async" class="hero-lcp-img" />
</picture>
```

- **`loading="eager"`** — no lazy-load deferral
- **`fetchpriority="high"`** — browser prioritizes this over other images
- **`decoding="async"`** — decode off main thread
- **`width`/`height`** — reserves space, prevents CLS

### 3. Preload Links (`index.html <head>`)

```html
<link rel="preload" as="image" fetchpriority="high"
      href="/hero/getpawsy-hero-mobile.webp" media="(max-width: 768px)">
<link rel="preload" as="image" fetchpriority="high"
      href="/hero/getpawsy-hero-desktop.webp" media="(min-width: 769px)">
```

Media-conditioned preloads ensure only the correct variant is fetched.

### 4. Responsive aspect-ratio (CSS)

- Desktop: `aspect-ratio: 16/9`
- Mobile (≤768px): `aspect-ratio: 3/4`

This prevents CLS by reserving the correct vertical space before the image loads.

### 5. Cookie Banner (unchanged)

Already `position: fixed; bottom: 0` with deferred mount — CLS = 0.

## LCP Element

The LCP element is the `<img>` inside the `<picture>` tag with class `hero-lcp-img`.

## Verification

### Lighthouse CLI (Mobile)
```bash
lighthouse https://getpawsy.pet/ --preset=perf --form-factor=mobile --throttling-method=simulate --only-categories=performance --quiet
```

### DevTools Checks
1. **Network tab:** Filter `getpawsy-hero`. Hero request should start within first 200ms (preloaded).
2. **Performance tab → Timings:** LCP marker should point to hero `<img>`.
3. **Layout Shifts:** Should show 0 shifts from hero section.

### curl Checks
```bash
# Desktop hero caching
curl -sI https://getpawsy.pet/hero/getpawsy-hero-desktop.webp | grep -iE 'cache-control|content-length'

# Mobile hero caching
curl -sI https://getpawsy.pet/hero/getpawsy-hero-mobile.webp | grep -iE 'cache-control|content-length'
```

### PageSpeed Insights
```
https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgetpawsy.pet%2F
```

## Expected Metrics (Mobile Lighthouse)

| Metric | Before | Expected |
|--------|--------|----------|
| LCP | ~4.5–6.8s | < 2.5s |
| CLS | ~0.05 | < 0.05 |
| TBT | ~800ms | < 400ms |

## No Regressions

- ✅ Cart/checkout unchanged
- ✅ Analytics deferred loading unchanged
- ✅ Cookie banner: fixed overlay, zero CLS
- ✅ Navigation: plain `<a>` CTAs work without React
- ✅ Static shell in index.html matches React-rendered hero exactly
