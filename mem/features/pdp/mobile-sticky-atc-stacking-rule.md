---
name: PDP mobile sticky ATC stacking rule (no overlap)
description: Only ONE fixed-bottom bar may render on mobile PDPs; legacy desktop bar must be hidden md:block
type: constraint
---
## Rule
On `src/pages/ProductDetail.tsx`, only **one** `fixed bottom-0` bar may render on mobile. The mobile sticky CTA is owned by `PdpStickyAtc` (`md:hidden z-40`). The legacy in-file sticky bar gated by `showStickyBar` must be marked `hidden md:block` so it never renders on mobile.

## Why
If both render, the legacy bar's wrapper `<div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">` (no `onClick`) sits at `z-50` over the mobile bar's button at `z-40` and silently swallows every tap. `localStorage['pawsy-cart']` stays `[]`, no toast, no GA4 add_to_cart, no checkout, no purchases. Evidence: 7d funnel showed 167 PDP → 2 ATC → 0 sales; root cause confirmed 2026-06-28 via mobile Playwright probe (`elementFromPoint` returned the wrapper div, not the button; instrumented click listener fired 0×).

## How to apply
- Any new mobile-only sticky bar component must include `md:hidden` AND be the only one mounted on mobile.
- Any desktop-only or universal sticky bar must include `hidden md:block` (or equivalent breakpoint gate) when `PdpStickyAtc` is also mounted on the same route.
- Regression check: on a 390-wide viewport, `document.elementFromPoint(centerOfAtc)` must resolve to a button with a React `onClick`, not an unhandled wrapper div.