
# Genesis V2.5 — Canonical Analytics Unification

## Why a plan, not a one-shot run

The full 18-phase brief touches **555+ tables, 200+ cron jobs, every edge function, every dashboard, GA4, Stripe, Pinterest, TikTok, Meta, heatmap, live visitors, executive KPIs**. A single autonomous run that claims to rewire all of that would either be dishonest ("done!" with nothing actually verified) or would break production. I'm going to land it in **explicit waves**, each one fully shipped, verified, and reversible, instead of faking a single mega-deploy.

This plan covers **Wave 1**: the canonical foundation + one end-to-end vertical slice (PDP → ATC → Cart → Checkout → Purchase) rewired and smoke-tested. Waves 2–4 land the rest of the dashboards, GA4/Stripe reconciliation jobs, self-healing, and the final consistency certificate.

## Wave 1 — Canonical foundation + vertical slice

### 1. Forensic audit artifact
- Generate `public/admin-reports/canonical-analytics/wave1-audit.md`:
  - Inventory of every event source already in the DB (`cci_events`, `cie_events`, `lp_funnel_events`, `checkout_funnel_events`, `orders`, GA4 snapshots, Pinterest/TikTok/Meta adapter tables).
  - List of every dashboard page under `src/pages/admin/` that reads analytics, with the table(s) each one hits today.
  - Duplicate-event map (e.g. `add_to_cart_click` vs `add_to_cart` vs GA4 `add_to_cart`).
- No code changes in this step — read-only audit committed as a report.

### 2. Canonical schema (one migration)
- `public.canonical_events` — append-only, normalized event store. Columns:
  - `id`, `occurred_at`, `ingested_at`
  - `canonical_name` enum: `CANONICAL_PAGE_VIEW`, `CANONICAL_PRODUCT_VIEW`, `CANONICAL_ADD_TO_CART`, `CANONICAL_CART`, `CANONICAL_CHECKOUT`, `CANONICAL_PURCHASE`, `CANONICAL_ENGAGEMENT`
  - identity: `visitor_id`, `session_id`, `ga_client_id`, `stripe_session_id`, `order_id`
  - attribution: `utm_source/medium/campaign/content/term`, `landing_page`, `referrer`
  - context: `country`, `city`, `device`, `browser`, `os`, `page_path`, `product_id`
  - source: `source_system` enum (`cci`, `cie`, `lp_funnel`, `checkout_funnel`, `orders`, `ga4`, `stripe`, `pinterest`, `tiktok`, `meta`)
  - `dedup_key` (unique partial index) — composed of `source_system + source_event_id + session_id + canonical_name + product_id/order_id` so re-ingest is idempotent.
- `public.canonical_sessions` — one row per `session_id` with first-touch attribution, identity bridges, last-seen, derived funnel stage.
- `public.canonical_revenue` — view over `orders` filtered to `status = 'paid'` with Stripe reconciliation join. Single source of truth for revenue.
- Three materialized views, refreshed every 5 min:
  - `mv_canonical_funnel_hourly`
  - `mv_canonical_product_performance_daily`
  - `mv_canonical_traffic_source_daily`
- GRANTs: `SELECT` to `authenticated` (admin-RLS guarded), `ALL` to `service_role`. RLS on raw tables = admin-only.

### 3. Backfill + normalization jobs
- One edge function `canonical-ingest` — internal, service-role only. Pulls last 24h from each source table, normalizes to `canonical_events`, upserts on `dedup_key`. Idempotent.
- One edge function `canonical-refresh` — refreshes the three MVs + `canonical_sessions` derived rows.
- Two pg_cron jobs:
  - `canonical-ingest` every 2 minutes
  - `canonical-refresh` every 5 minutes
- One-shot backfill call for the last 30 days during Wave 1 deploy.

### 4. Vertical slice rewire — Conversion Reality page
- Keep all other dashboards untouched in Wave 1. Pick the single page already designed for cross-source reconciliation (`/admin/conversion-reality`) and switch it to read **only** from `mv_canonical_funnel_hourly` + `canonical_revenue`.
- Add a "Canonical vs Legacy" diff panel so we can watch parity for 48h before rewiring the next dashboard.

### 5. Smoke test
- Extend the existing Playwright ATC smoke to also assert that, within 90s, one `CANONICAL_PRODUCT_VIEW`, one `CANONICAL_ADD_TO_CART`, one `CANONICAL_CART`, one `CANONICAL_CHECKOUT` row land in `canonical_events` for the smoke session, with matching `session_id`.
- For purchase: use the existing Stripe test session helper to drive a `payment_intent.succeeded` and assert a single `CANONICAL_PURCHASE` row tied to the same `session_id` and a real `orders.id`.

### 6. Wave 1 consistency report
- `public/admin-reports/canonical-analytics/wave1-report.md` with:
  - Audit findings
  - Schema deployed
  - Backfill counts (per source)
  - Conversion Reality parity diff (canonical vs legacy) over the last 24h
  - Smoke test evidence

## Waves 2–4 (planned, not executed in Wave 1)

- **Wave 2** — Rewire Traffic, Products, Funnel, Revenue dashboards onto canonical MVs. Remove duplicated query hooks. Add cross-dashboard parity assertion job.
- **Wave 3** — Heatmap + Live Visitors onto canonical. GA4 ↔ canonical reconciliation job with auto-incident on drift > threshold. Stripe ↔ `canonical_revenue` reconciliation.
- **Wave 4** — Self-healing (MV refresh + cache bust on drift), Admin Diagnostics single screen, final consistency certificate, deprecation + removal of superseded tracking paths.

## Non-goals for Wave 1
- No deletion of legacy tables/components (we need them live for the 48h parity window).
- No changes to client-side tracking emitters (`cci.ts`, GA4 client, Pinterest tag) — they keep firing; canonical ingest reads downstream.
- No changes to Stripe webhooks or `orders` schema.

## Technical notes
- Canonical layer is **read-derived**, not a new write path on the client. Client emitters stay exactly as they are; we normalize server-side. This is the only way to do this without a multi-week client migration and without breaking the dedup/pairing contracts we just hardened around `add_to_cart_click`.
- `dedup_key` design guarantees re-ingest is safe and Phase 5 (duplicate elimination) is enforced at the schema level, not in dashboard SQL.
- Revenue rule (Phase 11) is enforced by making `canonical_revenue` a view that *cannot* contain anything but paid orders — dashboards physically can't read inferred revenue.

## Deliverables at end of Wave 1
1. Audit report committed.
2. Migration applied (one file, all GRANTs + RLS + MVs).
3. Two edge functions deployed + two cron jobs scheduled.
4. Conversion Reality page reads from canonical MVs with a live parity panel.
5. Extended smoke test green in CI.
6. Wave 1 report committed with parity numbers and smoke evidence.

Approve this and I'll execute Wave 1 straight through, then come back with the Wave 1 report and the proposed Wave 2 scope. If you'd rather I attempt all 18 phases in a single uncontrolled run despite the risk, say "force full run" and I will — but I won't pretend it's verified when it isn't.
