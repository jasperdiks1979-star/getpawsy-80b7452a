
# Pinterest Enterprise Distribution Monitor

Purpose: measure whether PCIE2-published pins are actually being distributed by Pinterest. Pure observation layer — no writes to publishing, queues, PCIE2, Guardian, recovery, routing, or analytics.

## Scope guardrails (non-negotiable)

- No changes to: publishing, PCIE2, Guardian, queues, recovery, routing, `canonical_*`, `pinterest_video_*` cadence, tracking events.
- No cron mutations. Read-only over existing tables.
- No new writes except a single admin-only snapshot table for score history (optional, gated behind a feature toggle in the code — off by default).

## Data sources (existing, read-only)

- `pcie2_publish_queue` (status='published') → source of truth for "PCIE2 published pin"
- `pcie2_pin_performance` → per-pin daily impressions/saves/clicks/ctr
- `pinterest_video_metrics` → fallback per-pin metrics (voice/scene/board/category linkage)
- `pinterest_analytics_daily` → account-level daily aggregates (baselines/averages)
- `pinterest_category_benchmarks` → per-category CTR/save averages
- `pinterest_boards` → board names
- `products` → product name/category
- `pcie2_creatives` → creative_id → product/board resolution

## Deliverables

### 1. Database (additive only)

One migration, no destructive changes:

- **View** `v_pcie2_pin_distribution` — one row per published PCIE2 pin joining queue → performance → boards → products, with derived:
  - `age_hours`, `impressions_24h/72h/7d`, `saves_24h/7d`, `outbound_24h/7d`, `pin_clicks_7d`
  - `ctr_7d`, `save_rate_7d`, `engagement_score` (blend: CTR·0.30 + save_rate·0.35 + outbound_rate·0.35, normalized 0–100)
  - `impression_velocity` (imps/hr rolling), `save_velocity`, `click_velocity`
  - `distribution_status` — computed via CASE:
    - `NEW` age<6h
    - `INDEXING` age 6–24h AND imps=0
    - `DORMANT` age>72h AND imps=0
    - `STALLED` age>24h AND imps<10
    - `DISTRIBUTING` imps≥10 AND velocity flat
    - `GROWING` velocity > 1.2× 24h avg
    - `VIRAL` imps>1000 AND ctr≥1.5×category_avg AND save_rate≥1.5×category_avg
  - `flags[]` text array: `zero_imps_24h`, `zero_imps_72h`, `ctr_below_avg`, `imps_accelerating`, `saves_accelerating`, `board_underperforming`, `product_underperforming`

- **View** `v_pcie2_distribution_board_rollup`, `v_pcie2_distribution_product_rollup`, `v_pcie2_distribution_category_rollup` — aggregations for the dashboard cards.

- **View** `v_pcie2_distribution_health` — single-row enterprise health score (0–100) blending:
  - % pins with imps in first 24h (weight 0.25)
  - median CTR vs category avg (0.20)
  - % pins DISTRIBUTING/GROWING/VIRAL (0.25)
  - % pins DORMANT/STALLED (negative, 0.15)
  - publishing cadence steadiness (0.15)

- GRANT SELECT on all views to `authenticated`; admin-read enforced client-side via `has_role`.

- **No new tables** in phase 1. If the user later wants score history, add `pcie2_distribution_health_snapshots` behind a separate migration.

### 2. Admin page

Route: `/admin/pinterest-distribution-monitor` (new file, no existing route touched).

Sections:
- Header KPI strip: Enterprise Health Score, pins tracked, % distributing, % dormant, median CTR vs benchmark.
- Distribution status donut (NEW/INDEXING/DISTRIBUTING/GROWING/VIRAL/STALLED/DORMANT).
- Impression velocity over time (line, last 14d, from `pinterest_analytics_daily`).
- Daily publishing cadence bar (from `pcie2_publish_queue.published_at`).
- Top / Worst pins table (sortable, filter by status/flag).
- Top boards, top products, top categories tables.
- Editorial winners: pins with `VIRAL` status or `imps_accelerating` flag.
- Flag inbox: grouped by flag type with pin drill-down.

All data via direct `supabase.from('v_...')` reads. No edge functions required.

### 3. Files added

```text
supabase/migrations/<ts>_pcie2_distribution_monitor_views.sql
src/pages/admin/PinterestDistributionMonitor.tsx
src/components/admin/distribution-monitor/
  HealthScoreCard.tsx
  StatusDonut.tsx
  VelocityChart.tsx
  CadenceChart.tsx
  PinTable.tsx
  RollupTable.tsx
  FlagInbox.tsx
src/hooks/useDistributionMonitor.ts
```

Route registered in the existing admin router entry only (single-line append).

## Regression analysis

- No existing table/column/policy altered.
- No existing view/function/trigger replaced.
- No cron added or modified.
- No edge function deployed.
- No `pcie2_*`, `pinterest_video_*`, `canonical_*` write path touched.
- Views are `SECURITY INVOKER` (default) so RLS on base tables continues to apply.
- Client bundle grows by one lazy-loaded admin page (~15 KB gz est.).
- DB overhead: 4 views executed only on admin page open; each is a straight join + aggregate over already-indexed columns. Expected p95 < 250 ms per view at current pin volume (~300 pins).

## Verification checklist (post-migration)

1. `SELECT count(*) FROM v_pcie2_pin_distribution` matches `pcie2_publish_queue WHERE status='published'`.
2. Every distribution_status value appears at least once OR is verifiably empty by data.
3. Health score renders between 0–100.
4. No error in `postgres_logs` after 30 min.
5. Publishing pipeline unaffected: `pcie2_publish_queue` insert rate unchanged over 24h window before/after.

## Result contract

Returns: PASS/FAIL · Screens created · Queries added · Expected overhead · Regression analysis — as required by the mission.

## Out of scope (explicitly)

- No auto-remediation.
- No pin republish / archive triggers.
- No modification to `pinterest_loser_blocklist` or winner detector.
- No changes to Pinterest API calls or metrics sync cadence.
