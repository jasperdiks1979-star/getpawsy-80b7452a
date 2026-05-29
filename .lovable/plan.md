# GetPawsy Funnel Tracking Audit & Revenue Analytics

This is a large, multi-phase build. Before I start writing code I want to align on scope and sequencing so we don't ship half-finished dashboards or duplicate what already exists.

## What already exists (from prior work in this project)

Tracking foundation is actually quite mature:

- `lp_funnel_events` table with envelope columns: `session_id`, `event_name`, `product_id`, `product_name`, `value`, `utm_*`, `classification`, `geo_tier`, `geo_country`, `device`, `os_family`, `browser_family`, `is_bot`, `qa`, `validation_status`, `degraded`, `idempotency_key`, `raw_payload`.
- `src/lib/funnelEvents.ts` — `fireUserAddToCart`, `fireCheckoutEvent`, `firePdpView`, `fireScrollDepth`, `fireRageClick`, `fireSessionEnd`, `fireReturnVisit`, with dedupe + degraded fallback (TRK-1/TRK-2).
- `src/lib/attribution.ts` — first/last touch in sessionStorage, classifies tiktok/pinterest/google_ads/google_organic/meta/email/direct/referral.
- `src/lib/checkoutFunnel.ts` — Stripe/Klarna funnel mirror via `track-checkout-funnel` edge function.
- `src/hooks/useUTMTracking.ts` + `logUtmSession` — 30-day UTM persistence.
- Admin views: `/admin/clean-kpi`, `/admin/degraded-events`, `/admin/bot-threshold-report`, plus the existing Klarna funnel report.
- GA4, TikTok Pixel, Pinterest Tag, Meta — all wired through `SafeGlobalVisitorTracker` / `SafePinterestTag` / `marketingClient`.

The "only view_item events" symptom is almost certainly **not** missing instrumentation — it's that TikTok Bio traffic on a mobile carrier IP is bouncing before ATC. But we should prove that with an audit instead of assuming.

## Proposed approach — split into 3 shippable milestones

Rather than one giant PR, I'd ship this in 3 reviewable chunks. Each milestone is independently useful.

### Milestone 1 — Audit + Funnel Dashboard (the most valuable piece)

1. **Run the audit live** (no code): query `lp_funnel_events` grouped by `event_name`, source, device for the last 30 days to produce the real **Event Inventory Report** and **Funnel Coverage Report**. Output to `/mnt/documents/funnel-audit.md`. This tells us exactly which events are firing vs missing before we write any code.
2. **`/admin/funnel`** — the conversion dashboard:
   - Funnel: visitors → product_view → add_to_cart → checkout_click → payment_success
   - Conversion rates between each step
   - Revenue per visitor / session / source / campaign
   - Date range + source/campaign/device filters
   - Reuses `lp_funnel_events` + `orders` table

### Milestone 2 — Product & Source dashboards

3. **`/admin/products-performance`** — per-product views/ATCs/checkouts/purchases/revenue/CVR, sortable.
4. **`/admin/traffic-performance`** — per-source (TikTok / Pinterest / Google / Direct / Email) visitors/ATCs/purchases/revenue/ROAS where ad spend is known.
5. **`/admin/tracking-health`** — pixel heartbeat panel: last-seen timestamp per GA4 / TikTok / Pinterest / Meta event, plus "missing event" alerts (e.g. ATC fired but no GA4 ATC seen in last 24h).

### Milestone 3 — Attribution hardening + test suite

6. **Attribution persistence audit**: verify `first_touch` / `last_touch` survive PDP→cart→checkout→`/order-success`, write back into `orders.attribution_first_touch` / `attribution_last_touch` columns so revenue-by-source is accurate. Add migration only if columns don't exist.
7. **Missing events** found in Phase 1 audit get instrumented: `variant_change`, `gallery_interaction`, `remove_from_cart`, `add_shipping_info`, `add_payment_info`, `newsletter_signup`, `guide_view`, `guide_cta_click` (most of these likely already exist — audit will tell us).
8. **Playwright e2e** `tracking-funnel.spec.ts`: visit product → ATC → checkout → mock purchase → assert each `lp_funnel_events` row exists with full envelope.

## What I will NOT touch

Per your guardrails: no URL changes, no SEO/canonical edits, no product/collection/PDP rewrites, no ad campaign config changes, no removal of existing events, no changes to `SafeGlobalVisitorTracker` / `SafePinterestTag` / pixel boot order.

## Technical notes

- All new dashboards: admin-guarded, lazy-loaded route (matches `BotThresholdReport`, `CleanKpiDashboard`, `DegradedEventsPage` pattern).
- Bot/QA traffic excluded by default with a toggle.
- Use `unique session_id` counts for funnel steps (not raw event counts) — same convention as Clean KPI dashboard.
- Revenue source: `orders` table joined to `lp_funnel_events` on `session_id` for attribution.
- No mock data, no placeholders — if a metric has zero rows it renders "No data yet" with the SQL behind it.

## One question before I start

**Do you want me to start with Milestone 1 now (audit + `/admin/funnel`), or would you rather I run only the audit first (Phase 1 report to `/mnt/documents/funnel-audit.md`) so you can see what's actually broken before I build dashboards?**

The audit-first path is safer — we'll likely find that 2-3 specific events are missing and most of the "no funnel data" problem is just bounced TikTok traffic, which changes what we build.
