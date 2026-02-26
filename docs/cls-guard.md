# CLS Guard — "Never Regress CLS Again"

Lightweight runtime instrumentation that catches Cumulative Layout Shift regressions
before they reach users.

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

The badge has `pointer-events: none` and `contain: layout paint` — zero layout impact.

## Console output

When CLS exceeds the soft threshold you'll see:

```
🟡 [CLS-GUARD] Soft threshold warning: CLS 0.0823 ≥ 0.08
```

When CLS exceeds the hard threshold:

```
🔴 [CLS-GUARD] HARD THRESHOLD EXCEEDED: 0.1456 ≥ 0.12
Route: /
Top offenders:
  1. shift=0.0620 sources=[div#static-hero-shell, img.hero-image]
  2. shift=0.0340 sources=[nav.navbar]
  3. shift=0.0280 sources=[div.trending-strip]
```

## Interpreting sources

Each layout-shift entry may include `sources` — DOM elements that moved.
The monitor extracts a CSS-like selector (`tag#id.class1.class2`) for each source node.

Common offenders:
- Images without explicit width/height
- Dynamic content inserted above the fold (banners, nav, strips)
- Font swaps causing text reflow
- Lazy-loaded components mounting with different dimensions

## Window globals (dev/preview only)

```js
window.__CLS__          // current CLS number
window.__CLS_GUARD__    // { getSnapshot(), cls }
```

## Playwright CI test

The test at `tests/cls.spec.ts` navigates to key routes and asserts:

```js
const cls = await page.evaluate(() => window.__CLS__);
expect(cls).toBeLessThan(0.12);
```

## Production behavior

In production builds:
- No badge is rendered
- No window globals are exposed
- No console warnings unless `VITE_CLS_GUARD_ENABLED=true` is explicitly set
- Zero bytes added to the critical path
