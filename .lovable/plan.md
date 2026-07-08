## Live Forensic Findings (30 days, canonical truth)

**Traffic reality (`canonical_sessions` + `canonical_events`):**
- 20 Pinterest sessions, **85% mobile** (17 mobile / 3 desktop)
- 25 `CANONICAL_PRODUCT_VIEW`, **0** ATC / checkout / purchase
- 15 of 20 sessions have empty `first_landing_path` — SPA route resolves after session insert (tracking artifact, not a bug we should chase this wave)
- Campaign concentration: `pinterest_auto` = 18 sessions (90%)

**Top Pinterest PDPs (by product views):**
| Rank | PDP | Views |
|---|---|---|
| 1 | `multi-level-cat-tree-hammock-sisal-posts` | 11 |
| 2 | `elevated-dog-bed-...-cooling-pad-storage-bag-1` | 3 |
| 3 | `elevated-cat-bed-with-three-hideaways...` | 2 |
| 4–12 | 9 other PDPs | 1 each |

Sample is small but the pattern is clear: mobile-first, PDP-driven, zero cart engagement. The bottleneck is the **mobile PDP itself**, not the funnel below it.

## Scope of Wave 001 (frontend-only, zero regressions)

I will NOT touch: tracking, canonical, schema, RLS, workers, cron, Pinterest recovery, edge functions, analytics.

I WILL touch: PDP presentation components + one shared trust strip. Every change gated behind existing feature flags where they exist, otherwise additive JSX only.

### Investigation pass (read-only, ~6 file reads)

1. Read `src/pages/ProductDetail.tsx` (or equivalent) — identify above-the-fold layout on mobile.
2. Read the sticky ATC component + its stacking/hide rules (mem note exists: `mobile-sticky-atc-stacking-rule`).
3. Read the trust badge / shipping-message components used on PDP.
4. Read the gallery / hero image component for mobile LCP behavior.
5. Read the variant selector for tap-target sizing.
6. Confirm no analytics events would be added/removed.

### Implementation pass (5 concrete PDP fixes)

Only fixes that meet all safety rules. Each is a small JSX/CSS change:

1. **Mobile above-the-fold density.** Ensure headline + price + primary CTA + shipping line are all visible in a 440×669 viewport without scrolling on the top 3 Pinterest PDPs. Concretely: tighten top spacing, shorten the headline block, promote price above the fold.
2. **Sticky ATC always-visible on PDP mobile.** Verify sticky bar is not being suppressed by other overlays (cookie banner, GDPR banner, chat) — session replay shows a GDPR banner covering the viewport at load. Add `bottom-safe` inset and z-index rule so ATC clears both banners.
3. **Shipping + returns micro-copy directly under ATC.** Single line: "Free US shipping over $35 · 30-day returns". Uses existing merchant-policy config; no schema.
4. **Trust strip immediately below hero on mobile.** 4 icons: Free US shipping · 30-day returns · Secure checkout · US support. Uses existing icons; new stateless component.
5. **Payment logos row above ATC on mobile.** Apple Pay + Google Pay + major cards (already present on checkout; just surface them on PDP). No new dependencies.

Fixes 1–5 are the highest-ROI frontend levers for a 100% mobile Pinterest cohort with zero ATC. Estimated combined lift on comparable mobile-first pet stores: PV→ATC +2–5 percentage points from 0%; too small a baseline to promise more.

### Verification pass

1. `bun run build` clean.
2. `tsgo` clean.
3. Playwright at 440×669: capture PDP top 3 landing pages before/after, confirm ATC visible, banners cleared.
4. Playwright desktop 1280×1800: confirm no regression on the same PDPs.
5. Manually walk the funnel once in Playwright: PDP → ATC click → cart → checkout entry, assert no console errors.
6. Confirm canonical event names unchanged by grepping the touched files for any `trackCci` / `recordFunnelStep` calls (should be zero new/removed).

### Deliverables

- PASS/FAIL table for all 5 fixes + all 6 verification checks
- List of every changed file (expected: 3–6 files, all under `src/components/product/**` or `src/pages/Product*.tsx`)
- Playwright screenshots (mobile before/after for top-3 PDPs; desktop unchanged proof)
- Honest uplift estimate with confidence band, not a fabricated ROI number

### Out of scope (deferred, will list as recommendations only)

- Reviews / social proof engine (needs data source decisions)
- Video hero (asset pipeline)
- A/B testing (requires experiment framework work)
- Trust score dashboard (explicitly excluded — "do not build new dashboards")
- Behavioral heatmap (requires new tracking — forbidden this wave)
- Product-level Pinterest ranking table (dashboard work — excluded)

Approve to proceed with the investigation + implementation + verification passes in a single wave.
