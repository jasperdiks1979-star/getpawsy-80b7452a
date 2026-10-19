# Five commercial fixes: staged evidence and limitations

## Safety and baseline

- Entry HEAD `9b71197633a187179cb130adc3b06944ee8e3555`, clean workspace.
- No deployment, order, Stripe session, payment, database write/migration, supplier imagery, ad change, PR change or GA4/consent modification.
- No prohibited manual build/typecheck command was executed. The harness's latest observed automatic build was green; that is not independent release-validation evidence.
- Source changes are automatically retained in Lovable history. Restore the entry revision through History for source rollback; no production rollback was exercised because nothing was published.

## 1. Commercial session contract — PARTIAL, not universal

`commercial-funnel.ts` splits distinct canonical sessions into commercial, UNKNOWN and excluded populations. Explicit bot/internal/technical evidence overrides stale human flags. An exclusion flag alone is not evidence of a bot. No historical data is modified. Duplicate cart callbacks count one cart-reaching session; visitors and sessions remain distinct.

The canonical funnel SDK/hook, truth totals, scorecards, Mission Control, Genesis boardrooms, revenue command center, executive war room, customer clusters, Pinterest widget and traffic command center now use the shared reader/counters. Source rollups and executive KPI totals also use this reader.

**Remaining coverage:** `getCanonicalProducts` and `getCanonicalHeatmap` still read historical aggregate views; `useOrganicGrowthIntelligence` still consumes its existing server envelope. These lack per-session identity/flags at their public aggregate boundaries and cannot be truthfully reclassified by a frontend filter. Their consumers include product-performance/PDP-conversion/growth/canonical-analytics pages. Consequently this run does NOT establish one contract across ALL commercial reports. Completion needs a separately reviewed read-only aggregation adapter with session-level evidence, bounded queries and regression coverage; no new function was auto-deployed or database contract changed here.

Diagnostics retain raw sessions. Do not interpret the patched truth totals as proof that every diagnostic/map/revenue aggregation has been migrated, or that purchases counted as session stages are reconciled financial revenue.

## 2. Variant Offer price — staged

- Collection JSON-LD shares cards' existing batched option-price query and omits unresolved offers instead of publishing stale base prices.
- PDP Product JSON-LD receives the exact displayed price. The static slug-derived, price-less Product skeleton is removed after the resolved schema mounts, avoiding stale names/invented fallback brand.
- Staged desktop and mobile selected Pink: `$162.99`; selected Light grey: `$164.99`; windmill: `$36.95`; manual stainless litter box: `$97.95`.
- Catalog base prices, supplier-cost authority and cart/checkout implementation are unchanged. Price tests preserve the base `$158.99` and ignore unprocessed supplier variant costs.

## 3. Intentional robots policy — staged

- Tier C remains noindex,follow; explicit seo_noindex remains authoritative. No tier/index eligibility was widened.
- Shared runtime product directive agrees with the existing sitemap/prerender eligibility policy in regression tests.
- Staged tree has one resolved noindex,follow robots directive; static Vite fallback tags no longer contradict it.
- Full generated prerender/sitemap coverage remains unverified until independent release gates become available.

## 4. Bowl health claims — staged

- Displayed name and structured name remove Cervical Vertebra Protection; slug/catalog record stay unchanged.
- Exact bowl SKU's stored description claimed posture/digestion benefits, reduced neck strain, and less regurgitation/bloating. These unsupported promises are replaced at read time by a neutral elevated-bowl description.
- Desktop/mobile visible text and resolved schema are neutral; unrelated descriptions retain paragraph breaks.
- This is a targeted audit of this bowl's associated promises, not a certification of every claim in the entire catalog.

## 5. Shipping/returns — staged

- Updated touched shipping messages to “on orders $35+”; regression proves `$35.00` qualifies and `$34.99` does not.
- Existing 30-day eligible-return window, five-business-day refund processing after approval and Skidzo identity retained.
- Existing published shipping-cost allocation retained: merchant-error returns covered; eligible change-of-mind shipping paid by customer. Support confirms eligibility and destination before shipment.
- No return destination is verified. Business location is explicitly not presented as a return address; owner must supply the authorized destination. No address/fee/coverage/time invented.

## Verification

- Full Vitest: **2905 passed, 2 skipped**, 173 test files passed/1 skipped (174), approximately 15 seconds.
- Focused price/classification/merchandising/authenticated-reader tests: **99 passed**, seven files.
- 23 new focused cases in `commercial-five-fixes.test.ts` cover classifier vetoes/UNKNOWN, distinct sessions, real variant prices, stock, policy parity, bowl facts and exact shipping threshold.
- Fresh browser contexts: 1280×1800 desktop and 390×844 mobile, US timezone; real product reads with all non-GET/HEAD/OPTIONS requests blocked. Four PDPs and returns rendered without page errors. Pink/Light grey clicked; resolved Offer matched selected prices. This proves staged display, not a live deployment or payment flow.
- Final health snapshot: RAM **70%**, connections **22/60**, zero restarts, no recent exhaustion alerts.

## Release decision

**NOT PUBLISHED; NOT universally ready to release.** Independent TypeScript, production prerender/build and exercised artifact rollback remain unavailable under this run's explicit instructions. Fix 1 adoption also remains incomplete. No live-success claim is made. Complete those gates before publishing.