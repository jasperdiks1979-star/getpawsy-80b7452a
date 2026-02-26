# Web Vitals Protection Architecture

Complete multi-layer guardrail system that prevents performance regressions
from reaching production. Zero runtime cost in production builds.

## Philosophy

> "Performance is not a feature — it's a constraint. Treat it like type safety."

Every performance metric has:
- **Soft threshold**: Warns developers during development
- **Hard threshold**: Blocks CI and throws errors in dev
- **Budget**: Tracks long-term trends

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: BUILD TIME                                         │
│  vite-plugin-cls-build-guard.ts                              │
│  ├─ Image optimizer provider validation                     │
│  ├─ Hero preload existence check                            │
│  └─ JS chunk size budget enforcement                        │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2: BOOT TIME (before React mount)                     │
│  cls-guard-init.ts                                           │
│  ├─ CLS PerformanceObserver (layout-shift)                  │
│  ├─ LCP PerformanceObserver (largest-contentful-paint)      │
│  └─ First-paint geometry capture                            │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3: POST-MOUNT VERIFICATION                            │
│  postMountVitalsChecks()                                     │
│  ├─ Hydration geometry freeze (Δ > 2px → error)             │
│  ├─ Hero preload validation (href match, fetchpriority)     │
│  ├─ Hero image rules (intrinsic size, content-visibility)   │
│  ├─ Image policy scan (all above-fold imgs)                 │
│  └─ Performance budget check                                │
├──────────────────────────────────────────────────────────────┤
│  LAYER 4: RUNTIME MONITORING                                 │
│  cls-monitor.ts + lcp-monitor.ts                             │
│  ├─ Live CLS/LCP tracking with forensic data                │
│  ├─ Threshold enforcement (soft warn / hard fail)           │
│  └─ Budget comparison                                       │
├──────────────────────────────────────────────────────────────┤
│  LAYER 5: DEV UI                                             │
│  WebVitalsPanel.tsx                                          │
│  ├─ Live CLS, LCP, FCP display                              │
│  ├─ Geometry mismatch indicator                             │
│  ├─ Budget violation count                                  │
│  └─ Color-coded status (green/orange/red)                   │
├──────────────────────────────────────────────────────────────┤
│  LAYER 6: CI PIPELINE                                        │
│  .lighthouserc.json + .github/workflows/lighthouse.yml       │
│  ├─ Mobile emulation with slow 4G                           │
│  ├─ Performance ≥ 75                                        │
│  ├─ LCP ≤ 4000ms                                            │
│  ├─ CLS ≤ 0.12                                               │
│  ├─ TBT ≤ 300ms                                              │
│  └─ Blocks PR merge on failure                              │
├──────────────────────────────────────────────────────────────┤
│  LAYER 7: PLAYWRIGHT TESTS                                   │
│  tests/cls.spec.ts                                           │
│  ├─ Mobile viewport (390×844)                               │
│  ├─ Slow 4G throttling                                      │
│  ├─ CLS assertion per route                                 │
│  └─ Geometry mismatch assertion                             │
└──────────────────────────────────────────────────────────────┘
```

## Thresholds

### CLS (Cumulative Layout Shift)
| Level | Value | Action |
|-------|-------|--------|
| Good | < 0.08 | Green badge |
| Soft warn | ≥ 0.08 | Orange badge + console.warn |
| Hard fail | ≥ 0.12 | Red badge + console.error + CI fail |

### LCP (Largest Contentful Paint)
| Level | Value | Action |
|-------|-------|--------|
| Good | < 2500ms | Green |
| Soft warn | ≥ 2500ms | Orange + console.warn |
| Hard fail | ≥ 4000ms | Red + console.error |

### Performance Budget (mobile)
| Metric | Budget | Unit |
|--------|--------|------|
| LCP | 3000 | ms |
| CLS | 0.10 | — |
| TBT | 300 | ms |
| FCP | 2000 | ms |
| JS total | 220 | KB |
| Largest chunk | 120 | KB |

## CI Flow

```
PR opened → GitHub Action triggers
  → bun install → bun build
  → serve dist on :8080
  → Lighthouse CI runs 3x on /, /collections, /cart
  → Assert: perf ≥ 75, LCP ≤ 4s, CLS ≤ 0.12, TBT ≤ 300ms
  → Fail PR if any assertion fails
  → Upload reports as artifacts
```

## Hydration Geometry Explanation

The static HTML shell in `index.html` renders a hero section immediately.
React then hydrates and inserts dynamic elements (promo bar, navbar, trending strip)
above the hero. If these weren't accounted for in the static shell, everything
below shifts down — causing a massive CLS burst.

**The Geometry Freeze system**:
1. Before React mounts: captures `getBoundingClientRect()` of key elements
2. After hydration (double rAF): re-measures the same elements
3. If any element's vertical position changed by > 2px → flags mismatch

**Fix**: The static shell reserves 148px (40 + 72 + 36) with spacer divs.

## Cloudinary Interaction

All product/hero images are served via Cloudinary Fetch API. Critical rules:
- Transformation commas must be URL-encoded (`%2C` not `,`)
- Hero image preload `href` must match the actual Cloudinary URL
- `fetchpriority="high"` on hero preload and img element
- `content-visibility: auto` must NOT apply to above-fold images
- All above-fold images must have explicit `width` and `height` attributes

## Local Override Guide

```bash
# Disable all guards
VITE_CLS_GUARD_ENABLED=false bun dev

# Relax thresholds
VITE_CLS_SOFT_THRESHOLD=0.15 VITE_CLS_HARD_THRESHOLD=0.25 bun dev
VITE_LCP_SOFT_THRESHOLD=4000 VITE_LCP_HARD_THRESHOLD=6000 bun dev

# Enable hard-fail (throws errors)
VITE_CLS_HARD_FAIL=true bun dev

# Hide vitals panel
VITE_VITALS_PANEL=false bun dev

# Disable image optimizer (NOT recommended)
VITE_IMAGE_OPTIMIZER_PROVIDER=none bun dev
```

## Debug Instructions

### Console commands (dev/preview only)
```js
// CLS
window.__CLS__                           // current CLS value
window.__CLS_GUARD__.getSnapshot()       // full forensic data
window.__CLS_GUARD__.hardFail            // true if threshold breached
window.__CLS_GUARD__.geometryMismatch    // true if hydration shifted elements
window.__CLS_GUARD__.geometryDeltas      // mismatch descriptions
window.__CLS_GUARD__.budgetResults       // budget check results

// LCP
window.__LCP_GUARD__.lcp                 // LCP value in ms
window.__LCP_GUARD__.entry               // LCP element details
window.__LCP_GUARD__.hardFail            // true if threshold breached
window.__LCP_GUARD__.getSnapshot()       // full LCP snapshot
```

### Vitals Panel
Click the bottom-left badge to expand the full vitals dashboard.
Shows live CLS, LCP, FCP, geometry status, and budget violations.

## Production Behavior

In production builds:
- **No UI elements** (badge, panel) are rendered
- **No window globals** are exposed
- **No PerformanceObservers** are created
- **No console output** unless explicitly enabled
- **All guard code is tree-shaken** from the bundle
- **Build guard** runs at compile time only
- **Zero bytes** added to the critical rendering path
