---
name: CTA variant auto-rollback
description: Hourly guardrail that flips /go CTA variant back to baseline if CTR drops under floor
type: feature
---
**Auto-rollback for /go CTA experiments.**

- Active variant is stored in `cta_variant_config` (singleton id=1) — NOT hardcoded in `LinkInBio.tsx`. The component reads it via `useCtaVariant(default)`. The constant `CTA_VARIANT_DEFAULT` is only the fallback while the network fetch is in flight.
- Edge function `cta-variant-rollback-guard` runs hourly via pg_cron job `cta-variant-rollback-guard-hourly` (5 * * * *). Aggregates `lp_funnel_events` (excluding `is_internal`) over `evaluation_window_hours`, computes CTR = clicks/impressions, and rolls back to `baseline_variant` if CTR < `ctr_floor_pct` AND impressions ≥ `min_impressions`.
- Defaults: floor 6%, window 24h, min 200 impressions, baseline `high_conv_v2`.
- Audit trail: every rollback writes a row to `cta_variant_rollback_log`.
- Manual dry-run: `POST /functions/v1/cta-variant-rollback-guard?dry_run=1`.
- To disable: set `cta_variant_config.rollback_enabled = false`.
- To bump variant: insert new variant string into `active_variant` AND update `baseline_variant` if previous active is now the safe fallback.
