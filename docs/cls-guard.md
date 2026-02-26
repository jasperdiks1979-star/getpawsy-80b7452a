# CLS Guard — "Never Regress CLS Again"

Lightweight, multi-layer guardrail system that catches Cumulative Layout Shift regressions
before they reach users. Zero production runtime cost.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  BUILD TIME          vite-plugin-cls-build-guard.ts  │
│  ├─ Image provider != "none"                        │
│  └─ Hero preload exists in index.html               │
├─────────────────────────────────────────────────────┤
│  BOOT TIME (before React)    cls-guard-init.ts       │
│  ├─ Start PerformanceObserver (layout-shift)        │
│  └─ Capture first-paint geometry rects              │
├─────────────────────────────────────────────────────┤
│  POST-MOUNT           postMountCLSChecks()           │
│  ├─ Verify hydration geometry (Δ > 2px → error)     │
│  ├─ Validate hero preload (href match, fetchpri)    │
│  └─ Scan image policy (intrinsic size, c-v)         │
├─────────────────────────────────────────────────────┤
│  RUNTIME              cls-monitor.ts                 │
│  ├─ Cumulative CLS tracking                         │
│  ├─ Top offender forensics (selector + rects)       │
│  └─ Threshold enforcement (soft/hard)               │
├─────────────────────────────────────────────────────┤
│  CI                   tests/cls.spec.ts              │
│  ├─ Mobile viewport 390×844                         │
│  ├─ Slow 4G throttling                              │
│  ├─ CLS < 0.12 assertion per route                  │
│  └─ Geometry mismatch assertion                     │
└─────────────────────────────────────────────────────┘
```

## Thresholds

| Level | Default | Env override |
|-------|---------|--------------|
| Soft warn | 0.08 | `VITE_CLS_SOFT_THRESHOLD` |
| Hard fail | 0.12 | `VITE_CLS_HARD_THRESHOLD` |

## Env flags

| Flag | Default | Purpose |
|------|---------|---------|
| `VITE_CLS_GUARD_ENABLED` | `true` (dev/preview), `false` (prod) | Enable/disable the monitor |
| `VITE_CLS_BADGE` | `true` (dev/preview) | Show the live CLS badge |
| `VITE_CLS_HARD_FAIL` | `false` | Throw an error when hard threshold is exceeded (CI only) |

## Debug badge

In dev/preview a small fixed badge appears bottom-left showing the live CLS value:

- 🟢 **Green**: CLS < 0.08 (good)
- 🟡 **Orange**: CLS ≥ 0.08 (soft warning)
- 🔴 **Red**: CLS ≥ 0.12 (hard fail zone)

If a hydration geometry mismatch is detected, the badge shows:
**"⚠ GEOMETRY SHIFT DETECTED"**

The badge has `pointer-events: none` and `contain: layout paint` — zero layout impact.

## Console output

### Soft threshold
```
🟡 [CLS-GUARD] Soft threshold warning: CLS 0.0823 ≥ 0.08
```

### Hard threshold (with rect forensics)
```
🔴 [CLS-GUARD] HARD THRESHOLD EXCEEDED: 0.1456 ≥ 0.12
Route: /
Top offenders:
  1. shift=0.0620 sources=[div#static-hero-shell [y:0→148], img.hero-image [y:200→348]]
  2. shift=0.0340 sources=[nav.navbar [y:40→0]]
  3. shift=0.0280 sources=[div.trending-strip [y:112→76]]
```

### Hydration geometry mismatch
```
[CLS-GUARD] Hydration geometry mismatch:
#static-hero-shell: top 0→148 (Δ148px)
```

### Image policy violations
```
[CLS-GUARD] Missing intrinsic size on above-fold img: https://res.cloudinary.com/...
[CLS-GUARD] content-visibility:auto on above-fold img: https://res.cloudinary.com/...
```

### Preload mismatch
```
[CLS-GUARD] Hero preload mismatch:
  preload: https://res.cloudinary.com/.../hero-desktop.webp
  actual:  https://res.cloudinary.com/.../hero-mobile.webp
```

## Why hydration mismatch causes CLS spikes

The static HTML shell in `index.html` renders instantly on first paint. If React's
hydrated layout inserts elements (promo bar, navbar, trending strip) above the hero
that weren't accounted for in the shell, everything below shifts down — a massive
CLS burst.

The geometry freeze captures element positions at first paint, then verifies they
haven't moved after React hydration. Any vertical shift > 2px triggers an error.

**Fix**: The static shell reserves exactly 148px of vertical space (40 + 72 + 36)
with spacer divs matching the hydrated layout.

## Why intrinsic image sizing is mandatory

Images without explicit `width` and `height` attributes cause layout shifts when
they load because the browser doesn't know their dimensions until the image data
arrives. Above-the-fold images MUST have intrinsic dimensions set.

Similarly, `content-visibility: auto` on above-the-fold images causes the browser
to defer rendering, which can spike LCP and cause reflow when the image finally paints.

## Build-time protection

The Vite build plugin (`vite-plugin-cls-build-guard.ts`) prevents shipping:
- `VITE_IMAGE_OPTIMIZER_PROVIDER=none` (disables CDN optimization)
- Missing hero preload in `index.html`

## CI behavior

The Playwright test (`tests/cls.spec.ts`):
- Emulates iPhone viewport (390×844)
- Throttles to slow 4G (1.6 Mbps down, 150ms latency)
- Navigates to `/`, `/collections`, `/cart`
- Asserts `CLS < 0.12` on each route
- Asserts no geometry mismatch

## How to override locally

```bash
# Disable guard entirely
VITE_CLS_GUARD_ENABLED=false npm run dev

# Relax thresholds for debugging
VITE_CLS_SOFT_THRESHOLD=0.15 VITE_CLS_HARD_THRESHOLD=0.25 npm run dev

# Enable hard-fail (throws on threshold breach)
VITE_CLS_HARD_FAIL=true npm run dev

# Hide badge
VITE_CLS_BADGE=false npm run dev
```

## Window globals (dev/preview only)

```js
window.__CLS__                         // current CLS number
window.__CLS_GUARD__.getSnapshot()     // full forensic snapshot
window.__CLS_GUARD__.cls              // current CLS
window.__CLS_GUARD__.hardFail         // true if hard threshold breached
window.__CLS_GUARD__.geometryMismatch // true if hydration shifted elements
window.__CLS_GUARD__.geometryDeltas   // array of mismatch descriptions
window.__FIRST_GEOMETRY__             // first-paint element rects (if captured)
```

## Production behavior

In production builds:
- No badge is rendered
- No window globals are exposed
- No console warnings unless `VITE_CLS_GUARD_ENABLED=true` is explicitly set
- Geometry freeze, preload validator, and image scanner are tree-shaken
- Build guard runs at compile time only
- Zero bytes added to the critical path
