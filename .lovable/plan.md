# Pinterest Conversion Validation Engine

A nightly engine that proves every active Pinterest pin can convert click → checkout, with a `/admin/pinterest-conversion-monitor` dashboard, auto-repair, and a 0-100 health score.

## Scope decisions you should confirm

1. **Headless browser limitation (Phase 2, 7-cart, 7-checkout).** Supabase Edge Functions run Deno without Chromium, so a real `Add To Cart` click + cart-state assertion cannot run there. Two realistic paths:
   - **A. Edge-function proxy (recommended, ship immediately):** validate via HTTP + DOM parse (load page, check that the React shell + product JSON-LD is served, verify product row in DB has price/inventory/image/variant, dry-run the `add_to_cart` mutation through the same RPC the UI uses). No screenshots; "cart_status" = simulated server-side. Ships tonight.
   - **B. Real headless (Playwright):** add a small worker on the existing `render-worker/` service (already in repo) that takes URLs off a queue, runs Playwright, posts screenshots back. ~1–2 days of extra work and ongoing render minutes.
   I will ship **A now** and stub the screenshot columns so **B** can drop in later without schema changes. Tell me if you want me to also start B in this turn.

2. **Auto-repair scope (Phase 5/9).** I will wire repair to the existing `pinterest-content-correction` + repair logs you already have. Self-healing will: re-queue with new image, re-map board, re-resolve dead slug via `product_slug_history`, deactivate orphan pins. It will not delete posted pins (Pinterest API doesn't allow `pin_edit` on Standard Access — already a memory).

3. **Phase 7 KPIs.** "Revenue Per Pin / Board / Product" requires order-level attribution. I will use `pinterest_attribution_sessions` + `orders` joined on the visitor's session UTM (already captured). Where attribution is empty I'll show "—" rather than fake zero.

## What gets built this turn

### New tables (one migration)
- `pinterest_conversion_audit` — every pin × nightly run row (all fields you listed + screenshot URLs nullable for future Playwright).
- `pinterest_conversion_alerts` — alert log (type, severity, pin_id, product_id, opened_at, auto_closed_at, repair_action).
- `pinterest_conversion_runs` — one row per nightly cycle (counts, score 0-100, status green/orange/red, started_at, finished_at).
- All three: RLS admin-only via `has_role(auth.uid(),'admin')`, `service_role` full, `authenticated` SELECT only via admin guard.

### New edge functions
- `pinterest-conversion-audit` — Phase 1+3+4. Pulls active pins, for each: HTTP HEAD destination, follow redirects, parse final slug, join `products`, compute `conversion_risk_score` (weighted: inactive=+40, no_inventory=+25, http_4xx=+30, missing_image=+15, missing_price=+10, utm_lost=+10, cart_rpc_fail=+30, capped 0-100), insert into `pinterest_conversion_audit`. Logs UTM intact/lost.
- `pinterest-conversion-repair` — Phase 5+9. Reads worst rows from latest run, dispatches existing repair primitives (`pinterest-content-correction`, slug-history insert, board remap, pin re-queue). Re-runs audit on each touched pin, closes alert if green.
- `pinterest-conversion-nightly` — Phase 10 orchestrator. Runs audit → repair → re-verify → writes `pinterest_conversion_runs` row with score & traffic-light.

### Cron (single job, every night 01:00 UTC)
One `pg_cron` job calling `pinterest-conversion-nightly` (it sequences the sub-phases internally, simpler than 6 separate cron rows and avoids drift).

### Admin page `/admin/pinterest-conversion-monitor` (lazy-loaded under existing AdminShell)
- **Header strip:** Overall score (0-100), traffic light, last-run timestamp, "Run audit now" button.
- **Phase-6 widgets** (12 cards): Active Pins, Ready, Failed, Repaired, At Risk, Broken URLs, Redirect Issues, UTM Failures, Inventory Failures, Add-To-Cart Failures, Orphan Products, Avg Risk Score.
- **Phase-7 KPI grid** (24h / 7d / 30d / 90d toggle): Impressions, Outbound Clicks, Sessions, ATC, Checkout Started, Purchases, Revenue, RPM. Plus "Revenue per Pin / Board / Product" top-10 tables sourced from `pinterest_attribution_sessions ⋈ orders`.
- **At-risk table** sorted by `conversion_risk_score DESC` with inline "Repair now" action.
- **Alerts feed** (open + recently auto-closed), filterable by type.

### Validation test
Vitest covering the risk-score formula and the alert-open/auto-close state machine.

### First run
Trigger `pinterest-conversion-nightly` once immediately after deploy and surface its report on the page.

## Out of scope this turn (call out so we agree)
- Real Playwright screenshots (Phase 2 B-path).
- Email/Slack alert delivery — alerts surface in-dashboard only. Add later if you want a channel.
- Per-pin A/B repair experimentation — single deterministic repair pipeline first.

## Technical notes
- Edge functions use `auth.getUser()` + admin role check; cron invocations use service-role JWT.
- Risk score and traffic-light thresholds: ≥85 green, 60–84 orange, <60 red — tunable via `pinterest_runtime_settings`.
- HTTP audit uses the same JS-aware approach validated last turn (puppeteer in render-worker is optional follow-up).
- All repair actions write to existing `pinterest_pin_repair_log` for continuity with prior audits.

Reply **approve** to ship Path A now, or tell me to expand (Playwright, alert channels, etc.) before I build.
