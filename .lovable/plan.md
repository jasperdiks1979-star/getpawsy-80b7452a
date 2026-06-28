# ARIE — Autonomous Revenue Intelligence Engine

ARIE is a large, multi-phase system. This plan covers **Phase 1 (Foundation)** — the minimum that gives the AI eyes (full funnel), ears (validation), hands (safe auto-repair) and a face (Revenue Command Center). Phases 2–4 are scoped at the end so we can ship value now without boil-the-ocean risk.

## Scope of Phase 1

In:
- End-to-end funnel event store + attribution stitching
- Cross-source validator (GA4 ↔ DB ↔ Pinterest ↔ TikTok)
- Conversion drop detector + incident generation
- Hourly synthetic visitor robots (Pinterest / TikTok / Organic on mobile + desktop)
- JS / API health collector (reusing existing `frontend_error_logs`)
- Auto-Fix engine for **safe categories only** (metadata, canonical, UTM repair, event dedup, broken image fallback) with versioning + rollback
- Revenue Command Center at `/admin/revenue-command`

Out (deferred):
- Session replay (rrweb pipeline) — large infra, Phase 2
- Data-driven multi-touch attribution model — Phase 3
- Self-learning confidence tuning loop — Phase 4
- Any auto-edit of payments, pricing, inventory, checkout, auth, schema (hard-blocked by safety policy)

## Database (new tables, all admin-only RLS + service_role)

```text
arie_funnel_events          one row per stage transition; session_id, visitor_id, stage,
                            ts, product_id, source, campaign, creative_id, pin_id,
                            tiktok_video_id, device, country, value_cents, meta jsonb
arie_sessions               denormalized journey: first_touch, last_touch, stages_reached[],
                            time_to_purchase_ms, revenue_cents, attribution jsonb
arie_validation_runs        source pair (ga4_vs_db, pin_vs_db, ttk_vs_db), window,
                            expected, actual, drift_pct, severity, status
arie_incidents              id, type, severity, confidence, affected_revenue_cents,
                            affected_sessions, root_cause, suggested_repair,
                            auto_repair_status, rollback_token, opened_at, resolved_at
arie_repairs                incident_id, category, before jsonb, after jsonb,
                            applied_by, confidence, rollback_available, rolled_back_at
arie_synthetic_runs         persona, device, browser, route_path, step_results jsonb,
                            failure_stage, total_ms, status
arie_health_snapshots       hourly: funnel_conversion, drop_pcts jsonb, pixel_health,
                            api_health, tracking_health, lost_revenue_estimate_cents
arie_settings               feature_flags jsonb (auto_repair_enabled per category),
                            confidence_threshold, alert_channels
```

All tables: admin SELECT, service_role ALL. No `anon` grants.

## Edge functions (Deno)

```text
arie-funnel-ingest          public POST from client tracker, validates + writes
                            arie_funnel_events (dedup on event_id)
arie-session-stitcher       cron 5m: rebuilds arie_sessions from raw events,
                            resolves UTM/click-id → attribution
arie-validator              cron 15m: cross-source counts (GA4 via existing
                            ga4_daily_snapshots, pinterest_analytics_daily, orders),
                            writes arie_validation_runs, opens incident on drift>15%
arie-drop-detector          cron 30m: per-segment CVR z-score vs 14-day baseline,
                            opens incident with confidence + estimated lost $
arie-synthetic-robot        cron hourly: playwright-style fetch journeys (HTTP
                            level, no headless browser) for 4 personas × 2 devices
arie-auto-fix               invoked by incidents; dispatches to category handler
                            (metadata/canonical/utm/dedup); writes arie_repairs with
                            rollback token; respects safety allowlist + flag
arie-health-rollup          cron hourly: writes arie_health_snapshots powering dashboard
```

Reuse: `gi_*`, `pinterest_analytics_daily`, `ga4_daily_snapshots`, `orders`, `checkout_funnel_events`, `frontend_error_logs`, `tracking_anomalies`, `monitoring_incidents` (do not duplicate — ARIE links by FK where overlap exists).

## Client tracker

`src/lib/arie/tracker.ts` — thin wrapper that emits to `arie-funnel-ingest` for each stage already wired in the app (PDP view, gallery, variant, ATC, checkout steps, purchase). Sends `event_id` (uuid) so the validator can dedup against GA4. No new UI hooks needed beyond importing into existing components.

## Revenue Command Center (`/admin/revenue-command`)

Single page, tabbed:

```text
Overview      live revenue, today vs 14d, lost-revenue estimate, open incidents count
Funnel        Sankey of arie_health_snapshots latest drop_pcts; per-source filter
Validation    table of arie_validation_runs (last 24h) with drift % and severity
Incidents     open/resolved, root cause, repair status, manual rollback button
Synthetic     last 24h of arie_synthetic_runs grid: persona × device, pass/fail
Health        pixel/API/tracking gauges + sparkline from arie_health_snapshots
Repairs       changelog of arie_repairs with diff preview + rollback
```

Reuse existing shadcn cards/tables; no new design tokens.

## Safety contract (hard-coded in arie-auto-fix)

```text
ALLOWED_CATEGORIES = [
  'metadata.title', 'metadata.description', 'metadata.canonical',
  'metadata.og', 'metadata.pinterest_rich_pin', 'jsonld.product',
  'utm.repair', 'tracking.event_dedup', 'image.fallback_alt'
]
FORBIDDEN_PATHS     = ['payments/*', 'pricing/*', 'inventory/*',
                       'checkout/*', 'auth/*', 'schema/*']
REQUIRES_FLAG       = arie_settings.feature_flags.auto_repair[category] === true
MIN_CONFIDENCE      = 0.95
```

Any repair outside allowlist → incident only, no auto-action.

## Phase 1 deliverables checklist

```text
[ ] 1 migration (8 tables + RLS + grants)
[ ] 7 edge functions deployed
[ ] 6 cron schedules wired via pg_cron + pg_net
[ ] src/lib/arie/tracker.ts + wired into existing funnel components
[ ] /admin/revenue-command page + route
[ ] arie_settings seeded with auto_repair all-false (opt-in per category)
```

## Deferred phases

- **Phase 2** — rrweb session replay pipeline, rage/dead-click detection, heatmap aggregation.
- **Phase 3** — data-driven attribution model (Shapley) layered on `arie_sessions`.
- **Phase 4** — confidence self-tuning: every applied repair feeds a Bayesian update on category confidence; false positives lower auto-fix appetite.

Approve to start Phase 1, or tell me to cut/reorder scope.