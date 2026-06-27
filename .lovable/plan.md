# CRO-1 — Forensic Conversion Audit & Autonomous Fix Engine

Goal: maximize purchases from existing traffic. Audit every step from first impression to checkout, score it, auto-apply every safe improvement, and produce a before/after report. No publishing, no ad spend, no destructive changes.

## Phase 1 — Forensic Audit (read-only, no UI changes)

Audit surfaces (each gets a score 0–100 + findings + ROI tag):

1. First impression: homepage above-the-fold, LCP image, hero CTA, value prop clarity
2. Navigation + search relevance + recommendation engine output
3. Category pages: density, sort defaults, faceting, empty states
4. PDP: title clarity, pricing display, discount honesty, shipping cost transparency, trust badges, reviews block, urgency/scarcity signals, sticky ATC, image gallery quality, AI-copy quality
5. Cart + checkout funnel: step count, guest checkout, address autofill, express pay (Apple/Google/PayPal), error messaging
6. Policies: shipping times, refund, return, FAQ presence + findability
7. Performance: Core Web Vitals (LCP/CLS/INP), JS bundle, mobile UX at 375/414 widths, image weight, font loading
8. Landing pages: Pinterest `/go` and TikTok `/go?ad=tt` — verify continuity, hero match, ATC visibility above fold
9. Analytics funnel integrity: GA4 `view_item → add_to_cart → begin_checkout → purchase` event coverage; rage-click / dead-click / scroll-depth / form-abandonment signal capture

Data sources used:
- `lp_funnel_events`, `checkout_funnel_events`, `abandoned_carts`, `utm_session_log`, `web_vitals`, `pdp_health_audits`, `rr_funnel_checks`, `rr_atc_audit`, `acos_landing_audits`, `monitoring_landing_page_scores`, `pe_conversion_funnel`, `cwv_validation_events`, `frontend_error_logs`
- Playwright runs at 1280 desktop + 414 mobile against `/`, top 5 PDPs by traffic, `/cart`, `/checkout`, `/go?ad=tt`, `/go?source=pinterest`

## Phase 2 — Scoring Engine

Compute and persist:
- Conversion Probability Score (0–100)
- Trust Score
- Purchase Friction Score (inverse — lower is better)
- Mobile Usability Score
- Expected Conversion Rate (modeled from current funnel × friction delta)
- Revenue Impact per finding (= projected CR lift × 30-day sessions × AOV)

Stored in new `cro_audit_runs` + `cro_findings` tables, surfaced in a new `/admin/cro-command-center` page with ranked ROI table.

## Phase 3 — Autonomous Safe Fixes (auto-applied)

Only changes that are reversible, non-pricing, non-policy, non-legal:
- Add/repair missing GA4 funnel events (`view_item`, `add_to_cart`, `begin_checkout`) where coverage gaps found
- Promote Apple Pay / Google Pay / PayPal express buttons above the fold in cart if currently buried
- Sticky mobile ATC on PDP if missing
- Trust strip (Free US shipping / 30-day returns / Secure checkout) on PDP + cart if missing
- Preload LCP image + `fetchpriority="high"` on hero where missing
- Lazy-load below-the-fold images that are eager
- Fix duplicate `key` warning in Footer (already visible in console)
- Compress oversize hero/PDP images > 40KB to WebP
- Remove dead/redundant scripts blocking main thread
- Inline shipping time + return window into PDP buy box
- Add FAQ accordion to PDP when product has Q&A data
- Wire rage-click + dead-click + scroll-depth + form-abandonment listeners into `SafeGlobalVisitorTracker`
- Repair any 4xx/5xx returning landing endpoints under `/go`

## Phase 4 — Held for Approval (NOT auto-applied)

Listed in the report with one-click apply buttons:
- Price/discount changes
- Refund/return policy wording
- Removing reviews
- Any third-party script add/remove
- Checkout step restructuring
- Anything touching Stripe config

## Phase 5 — Before/After Report

Generated to `public/admin-reports/cro/cro-audit-<timestamp>.pdf` + `.json`, manifest updated. Includes:
- Scores before vs after auto-fixes
- Findings table ranked by ROI
- Expected CR lift + revenue impact (30/90 day)
- Held-for-approval queue
- Playwright screenshots (desktop + mobile) of each audited surface

## Out of scope
- No new traffic acquisition work
- No Pinterest / TikTok publishing
- No Stripe mode change (stays test)
- No schema changes to `orders`, `products` pricing columns

## Deliverables
1. `/admin/cro-command-center` dashboard
2. `cro-audit-orchestrator` edge function (read-only audit + scoring)
3. `cro-autofix-applier` edge function (safe fixes only, with rollback log)
4. Tables: `cro_audit_runs`, `cro_findings`, `cro_autofix_log`
5. PDF + JSON report in `public/admin-reports/cro/`
6. Updated `SafeGlobalVisitorTracker` with rage/dead/scroll/form signals
7. PDP/Cart component patches for sticky ATC, trust strip, express pay ordering

Approve and I start with Phase 1 audit + Phase 2 scoring, then auto-apply Phase 3 in the same run.
