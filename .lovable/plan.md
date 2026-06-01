# GetPawsy Conversion Fix Sprint

Scope is bounded by the PDP Conversion Audit. No site-wide redesign — only the smallest set of changes that move Add-to-Cart from ~1.6% toward 5%.

Before I start writing files I'd like to confirm the plan, because several items touch shared infra (pricing, inventory, social proof, bestsellers filter) and I want to avoid collateral damage to GMC feed, Pinterest pipeline and QA — all of which the memory rules tell me not to break.

---

## P0 — Stock truth, mobile H1, real prices, copy isolation

### 1. Stock = 0 must mean Out of Stock everywhere

Single source of truth: `inStock` helper in `src/lib/merchant-safe-product.ts` (read-only check of `stock_quantity > 0` OR dropship-active flag per `mem://infrastructure/inventory-availability-logic`).

Touch points:
- `ProductDetail` / buy box: render "Out of Stock", disable primary CTA, hide "Ready to ship / arrives by …" urgency lines.
- `PdpStickyAtc`: already supports `inStock=false` → wire the real value through (audit shows it's currently hard-coded `true` for some templates).
- `homepage-bestsellers` + `top-winners` selectors: filter `inStock === true`.
- Featured / "Customers also bought" hooks: same filter.
- JSON-LD `availability`: `OutOfStock` when stock 0 (prevents GMC mismatch).

No DB changes — purely read-side.

### 2. H1 above the fold on mobile

In the PDP mobile layout, reorder so the stack is:
`MobileTrustWhisper → H1 (full, no clamp) → price+rating → gallery`.

Currently gallery comes first and pushes H1 below 844px. Remove the `line-clamp-2` on the mobile H1 so the full title is visible. Verify on 390×844 and 375×812.

### 3. Kill synthetic compare-at

In `merchant-safe-product.ts` (and any card helper) remove the `price * 1.25` fallback. Rule:
- Show `compare_at_price` only when DB value exists, is > current price, and `compare_at_source === 'historical'` (or equivalent flag).
- Otherwise: no strikethrough, no "% off" badge.
- Update discount calc per `mem://infrastructure/discount-calculation-standard`.

### 4. Category copy leakage

Add a guard in the description renderer: if `product.category` does not match the keyword family in the rendered benefits/FAQ block, fall back to a generic but category-correct neutral block (no AI placeholder strings like "aggressive chewers" on grooming).

Implementation: keyword blacklist per category (toys words on grooming → blocked, grooming words on supplements → blocked). Logged once in dev for visibility.

---

## P1 — Real social proof, trust, variant UX

### 5. Real social proof only

New tiny hook `useRealSocialProof(productSlug)` reading from existing tables:
- orders count (last 30d) — if ≥ a meaningful threshold (e.g. 5) show "X people ordered this month"
- PDP views (last 7d) from analytics — show "X viewed this week" when ≥ 25
- wishlist saves — show "X saved" when ≥ 3

Suppress entirely when none of the thresholds are met (no "Be the first!" filler). Replaces the current `ProductSocialProof` hand-written quote block on PDPs where real signals exist; keeps the file but renders only verified numbers, no invented names/quotes. This aligns with `mem://compliance/product-reviews-and-rating-policy`.

### 6. Product-specific trust block

Extend `trust-blocks.ts` with an optional 4th module: a category-specific guarantee, e.g.:
- beds: "Chew-resistant stitching"
- harnesses: "No-pull fit guarantee"
- litter boxes: "Odor-lock or refund"
- grooming: "Skin-safe materials"

Rendered in the PDP reassurance block alongside the existing US Shipping / Secure Checkout / Easy Returns trio.

### 7. Variant UX

Refactor the variant selector used on PDP:
- Detect axes (color / size / other) from variant titles.
- Color → swatch row; Size → button row; everything else → compact select.
- Preselect the variant with the most orders (fallback: first in-stock).
- Always show the live variant price next to the selector so no surprise at checkout.

---

## P2 — Conversion dashboard

New admin page `src/pages/admin/PdpConversionDashboardPage.tsx` route `/admin/pdp-conversion`. Lazy-loaded per memory rule.

Columns per product (top 50 by PDP views, last 7d):
PDP views · ATC % · Begin Checkout % · Revenue · Score (0–100)

Score = weighted blend of ATC %, in-stock health, trust signals present, copy isolation passing. Sorted worst → best so the highest-leverage fixes float to the top.

Data sources: existing analytics tables (`pdp_funnel_events`, `orders`). Read-only — no migrations.

---

## Technical details

**Files to edit**
- `src/lib/merchant-safe-product.ts` — drop synthetic compare-at, harden `inStock`
- `src/components/products/ProductDetail.tsx` (or PDP layout file) — mobile order, disable ATC when OOS
- `src/components/products/PdpStickyAtc.tsx` — wire real `inStock`
- `src/components/products/ProductSocialProof.tsx` — replace hand-written quotes with real-signal renderer
- `src/config/trust-blocks.ts` — add category guarantee module
- `src/components/products/VariantSelector.tsx` — color/size split, preselect bestseller
- `src/config/homepage-bestsellers.ts`, `src/config/top-winners.ts` — filter OOS
- New: `src/hooks/useRealSocialProof.ts`
- New: `src/pages/admin/PdpConversionDashboardPage.tsx` + route entry

**Won't touch**: QA, Director Mode, Pinterest publishing, edge functions, feed XML generation, DB schema, auth.

**Risk**: bestseller filter may shrink homepage rows on low-stock days — acceptable per the "no empty states" memory? I'll fall back to in-stock products from the same category to keep rows full.

---

Confirm and I'll implement in this order: P0 (1→4) → P1 (5→7) → P2 (8). Tell me if you'd like any item descoped or split into a separate sprint.
