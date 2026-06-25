# Pinterest Enterprise Control Center — Build Plan

## Scope
Single new admin surface at `/admin/pinterest-enterprise-control-center` plus supporting edge functions, tables, crons, and reports. Five waves executed sequentially in autonomous mode; each wave ends with regression checks, safe auto-fix sweep, PDF + JSON report under `public/admin-reports/ai-implementation/`, and a hard stop only on critical failure.

Current token is organic-only (ads/catalogs/billing endpoints return 401). All Ads/Catalog/Billing panels will render honestly: status badges show "scope blocked" with reconnect CTA, never fabricated numbers. Wave 1 ships the reconnect button; Waves 2+ light up automatically once the token has the scopes.

## Truth & safety rules (enforced in every wave)
- Endpoint marked green only on live HTTP 200.
- No campaign activation, budget edit, billing edit, bid change, or paid-ad publish without manual approval — these go to the approval queue.
- Safe auto-fix list (auto-executes): UTM repair, landing-URL fix, duplicate-draft purge, wrong-board reassignment when confidence ≥ 0.9, broken-queue-item pause, rejected-creative regenerate-as-draft, missing product metadata backfill from source, re-run validations, retry failed API calls, refresh analytics/token/cache. Everything else queued.
- Existing Pinterest tables, edge functions, and crons preserved. New tables namespaced `pe_*` to avoid collisions with the dense existing `pinterest_*` schema.
- All new tables: admin-only RLS via `has_role(auth.uid(), 'admin')`, plus `GRANT ... TO authenticated, service_role`.
- No persisted scores or campaign mutations during Wave 1–3; mutations gated until Wave 4 approval engine is live.

## Wave 1 — Full Access Connection + Endpoint Verification + Global Health shell
**Edge functions**
- `pe-oauth-reconnect-start` — wraps existing `pinterest-oauth-start` requesting full scope set: `boards:read|write`, `boards:read_secret|write_secret`, `pins:read|write`, `pins:read_secret|write_secret`, `user_accounts:read|write`, `ads:read|write`, `catalogs:read|write`, `billing:read`, `biz_access:read|write`. Stores expected-scope set in `pe_oauth_intents`.
- `pe-endpoint-matrix` — runs 25+ live probes (organic, ads, catalog, billing, tracking), records HTTP code, granted/missing scope, root cause, fix, auto-fixable flag. Persists to `pe_endpoint_checks`. Emits global health rollup to `pe_health_snapshots`.
- `pe-scope-verify` — calls `/v5/user_account` + introspection, diffs granted vs required, writes `pe_scope_status`.

**Tables**
- `pe_health_snapshots`, `pe_scope_status`, `pe_endpoint_checks`, `pe_oauth_intents`, `pe_issue_log`, `pe_auto_fix_log`, `pe_manual_approval_queue`, `pe_daily_reports`.

**UI**
- New route `/admin/pinterest-enterprise-control-center` with section A (Global Health) live. Buttons: Reconnect Full Access, Verify Scopes, Run Full Diagnostic, Download PDF, Download JSON. Sections B–F render as scope-gated placeholders with reconnect CTA.

**Wave 1 exit**: PDF + JSON report (`2026-06-25-pe-wave1.{pdf,json}`), manifest update, regression on existing `/admin/pinterest-health`.

## Wave 2 — Organic + Ads + Catalog panels
**Edge functions**
- `pe-organic-sync` — live pins/boards/drafts/failed/rejected, per-pin metrics (impressions, saves, closeups, outbound, CTR). Top/worst/broken/needs-repair lists.
- `pe-ads-sync` — per-campaign / ad-group / ad walk: status, approval, delivery, budget, schedule, bid, audience size, spend, impressions, clicks, CPC, CTR, conversions, ROAS, delivery/policy/billing blockers. Tables: `pe_ads_campaigns`, `pe_ads_ad_groups`, `pe_ads_ads`, `pe_ads_delivery_diagnostics`.
- `pe-catalog-sync` — catalog/product-feed/product-group status, approved/rejected/pending counts, missing-data / broken-image / broken-URL / stock / price / GTIN issue lists. Tables: `pe_catalog_health`, `pe_product_group_health`.

**UI**: Sections B/C/D fully wired with live data when scopes present, scope-blocked state otherwise.

**Wave 2 exit**: Wave-2 report, regression on Pinterest Health + Control Center + Wave 3B Progress Panel.

## Wave 3 — Pixel/CAPI + Conversion Monitor
**Edge functions**
- `pe-tracking-health` — Pinterest Tag presence + load + last event time + event_id dedup + EMQ + consent-gating, server CAPI status, failed events, GDPR posture. Table: `pe_tracking_health`, `pe_capi_events`.
- `pe-conversion-funnel` — Pinterest sessions → product views → ATC → checkout → purchase → revenue; best/worst converting products; PDP blockers. Table: `pe_conversion_funnel`.

**UI**: Sections E + F live. Reuses existing `pinterest_funnel_events` and `pinterest_attribution_sessions` as source of truth.

**Wave 3 exit**: Wave-3 report + regression on `usePinterestTracking` and `SafePinterestTag` (must not change behavior).

## Wave 4 — AI Operator + Diagnosis Engine + Safe Auto-Fix + Approval Queue
**Edge functions**
- `pe-ai-operator` — continuous scan covering all 24 listed signals (zero impressions, rejected ads, broken landing, wrong board, pixel/CAPI failure, token expiry, scope loss, billing block, sudden CTR/CPC/ROAS movement, stalled queue, etc.). Produces structured diagnoses to `pe_issue_log`.
- `pe-auto-fix` — executes safe-list automatically, logs to `pe_auto_fix_log`. Restricted fixes posted to `pe_manual_approval_queue` with proposed_action, reason, risk, expected_benefit.
- `pe-approval-execute` — admin-only RPC that runs an approved queue item end-to-end with rollback metadata.

**UI**: Section G (AI Operator feed) + dedicated Approval Queue panel with Approve / Reject buttons.

**Wave 4 exit**: Wave-4 report + safe-fix sweep dry-run results.

## Wave 5 — Optimizers, crons, daily reports
**Edge functions** (all recommendation-mode by default, never auto-apply paid changes)
- `pe-optimizer-campaign`, `pe-optimizer-budget`, `pe-optimizer-audience`, `pe-optimizer-creative`, `pe-optimizer-product`, `pe-pin-repair`, `pe-broken-link-repair`, `pe-impression-recovery`, `pe-ranking-recovery`, `pe-pin-refresh`, `pe-trend-detector`, `pe-competitor-monitor`, `pe-seasonal-generator`. Each writes to `pe_ai_recommendations` with `{recommendation, evidence, confidence, expected_impact, required_action, safe_to_auto_apply}`.

**Crons** (pg_cron + pg_net)
- Every 15 min: `pe-endpoint-matrix` + `pe-ai-operator` (health + alerts).
- Hourly: `pe-organic-sync` + `pe-ads-sync` + `pe-tracking-health` + `pe-conversion-funnel`.
- Daily 04:00 UTC: `pe-daily-report` → executive PDF + JSON to `pe_daily_reports` and `public/admin-reports/`.

**Reports surface in `/admin/reports` via manifest.json append.**

**Wave 5 exit**: Final consolidated report listing scope matrix, endpoint matrix, current blockers, what Lovable controls today, what still needs Pinterest approval, next recommended action.

## Backward compatibility
- Zero changes to existing `pinterest_*` tables/policies/edge functions/crons.
- Existing `/admin/pinterest-health` and `/admin/pinterest-control-center` remain untouched. New route is additive.
- No edits to `usePinterestTracking`, `SafePinterestTag`, `CartContext`, or any analytics surface in Waves 1–3 (Wave 3 is read-only diagnostic).

## Regression gates between waves
After each wave: `tsgo` clean, all new routes render, existing Pinterest dashboards still load, scope/endpoint matrix delta logged, PDF + JSON written, manifest updated, hard stop only if endpoint matrix shows a previously-green check turning red.

## Out of scope (explicit)
- Activating campaigns, mutating budgets, mutating billing, launching new paid campaigns, deleting paid entities — queued only.
- Pinterest features requiring Standard/Advanced Access we don't already have (e.g. `commerce_integration` for billing writes) — surfaced as manual-action items, not auto-requested.

Approve to start Wave 1 immediately; the system will then chain Waves 2 → 5 autonomously, stopping only on critical regression.
