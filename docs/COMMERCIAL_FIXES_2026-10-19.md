# Five commercial fixes: staged evidence and limitations

## Safety and baseline

- Entry HEAD `9b71197633a187179cb130adc3b06944ee8e3555`, clean workspace.
- No deployment, order, Stripe session, payment, database write/migration, supplier imagery, ad change, PR change or GA4/consent modification.
- No prohibited manual build/typecheck command was executed. The harness's latest observed automatic build was green; that is not independent release-validation evidence.
- Source changes are automatically retained in Lovable history. Restore the entry revision through History for source rollback; no production rollback was exercised because nothing was published.

## 1. Commercial session contract — specified reader coverage completed

`commercial-funnel.ts` splits distinct canonical sessions into commercial, UNKNOWN and excluded populations. Explicit bot/internal/technical evidence overrides stale human flags. An exclusion flag alone is not evidence of a bot. No historical data is modified. Duplicate cart callbacks count one cart-reaching session; visitors and sessions remain distinct.

The canonical funnel SDK/hook, truth totals, scorecards, Mission Control, Genesis boardrooms, revenue command center, executive war room, customer clusters, Pinterest widget and traffic command center now use the shared reader/counters. Source rollups and executive KPI totals also use this reader.

**Completed October 19 follow-up:** `getCanonicalProducts`, `getCanonicalHeatmap` and `useOrganicGrowthIntelligence` no longer consume the legacy aggregate views/server envelope. They use the shared canonical commercial-session verdict plus `read-commercial-reports`: session-indexed SELECT batches of 25, explicit since/until filters, 500-row pagination, ceilings of 500 commercial sessions/10,000 events/40 event requests, sequential batches, 15-minute memory cache and in-flight coalescing. Budget exhaustion, failed permissions, or reported truncated session evidence fail visibly; no partial-zero or legacy fallback.

Product stage counts dedupe session/product/stage across the entire selected window, including midnight; heatmap `event_count` remains explicitly diagnostic while `unique_sessions` counts sessions. Paid revenue requires selected paid/completed order evidence; product revenue uses verified item subtotals, never duplicates an entire shipping/tax-inclusive order total across products. Missing item allocation fails visibly. Organic totals, channels, landing pages and product leaderboard derive from that same snapshot. Unsupported legacy pin attribution, previous-period deltas and automated recommendations are withheld. Attribution confidence is unavailable (the existing numeric field uses zero with an explicit unavailable adapter note); no confidence-based learning is enabled.

This completes the three named missing reader paths, not a claim to have unified every unrelated diagnostic/server aggregate. No Edge Function or database contract was changed.

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

**NOT PUBLISHED.** Independent TypeScript, production prerender/build and exercised artifact rollback remain unavailable: the current execution-tool instruction explicitly says not to run the project's builds/typechecks manually because the harness runs them automatically. No forbidden commands or release-validation wrapper were run to bypass this rule; automatic green output is not independent proof. No production deployment or custom-domain new-build verification is claimed. Owner still must verify the authorized return destination.

## Follow-up evidence (23:29 UTC October 19)

- Entry HEAD `452fb8d965c183a771537753cccd18de1059a6fd`, clean; versus `3b29468db2e9150efa999cf7661e4b3aa34c3f97`, only the preserved AGENTS wording shortening differed. No git mutation commands used and no additional agent launched.
- Tested application SHA `c195afccbec271b5fe3ebaadb536a60a19b4f332`; subsequent changes only record this evidence/roadmap.
- Focused: `bunx vitest run` with commercial-report-aggregation, commercial-five-fixes, analytics-commercial-inclusion, card-listing-price, listing-price-hook, merchandising-layer, security-b and pinterest-traffic-widget-canonical-source: **116 passed / 8 files**.
- Full: `bunx vitest run`: **2924 passed, 2 skipped; 174 files passed / 1 skipped**. Final tests include 17 adapter regressions. Diff whitespace check passed.
- Authenticated local browser using existing data: 30-day canonical snapshot **27,083 sessions**, adapter read **582 events** for **128 commercial sessions**, UNKNOWN **1,665**, excluded **25,290**; **35 product/day rows**, **235 heatmap rows**. Counts are canonical read-time classification, not independently proven unique humans. No historic relabel/backfill.
- Organic readback succeeded: commercial/organic sessions **4/1 (24h), 31/23 (7d), 128/84 (30d)**; ten product leaderboard rows; legacy pin rows deliberately absent. Products Performance displayed its populated table and correct contract label. The earlier columnheader wait failed because table headings were cells; corrected cell selector passed. This is staged verification, not live production proof.
- Fixes 2–5 files were unchanged from the completed baseline; their 23 regression cases passed again. Stripe, checkout security staging, GA4/consent, prices, ads and PRs were untouched.
- Latest observed automatic log: **build OK at 23:25:57 UTC**. Final database snapshot **RAM 71%, connections 16/60, zero restarts, no exhaustion alerts**.
- Source rollback: restore `452fb8d965c183a771537753cccd18de1059a6fd` via Lovable History to reverse only this follow-up, retaining fixes 2–5. Not rehearsed; no production release to undo.