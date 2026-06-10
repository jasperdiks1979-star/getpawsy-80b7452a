---
name: Pinterest Revenue AI V5
description: Per-visitor geo+intent+revenue scoring, unified opportunity ranking, Pinterest-specific forecasting, and /admin/revenue-ai command center on top of V4
type: feature
---
**Edge function:** `pinterest-revenue-ai` (service-role). Actions: `loop`, `score_visitors`, `rank_opportunities`, `forecast`, `dashboard`. The `loop` action chains the V4 `pinterest-revenue-engine-loop` first, then runs V5 scoring → ranking → forecasting.

**Crons:**
- `pinterest-revenue-ai-loop-6h` (`45 */6 * * *`, schedule id 124) — forward 6h optimization loop.
- `pinterest-revenue-ai-backfill-weekly` (`20 4 * * 1`, schedule id 125) — Monday 04:20 UTC, re-scores trailing 30d of Pinterest `visitor_activity` for accurate geo+intent attribution drift correction.
- `pinterest-revenue-ai-health-hourly` (`25 * * * *`, schedule id 126) — hourly health check, writes to `monitoring_alerts` (alert_key prefix `pinterest_revenue_ai:`).

**Health check action:** `POST /functions/v1/pinterest-revenue-ai?action=health_check`. Also runs automatically at the end of every `loop`. Emits/auto-resolves alerts in `monitoring_alerts` (severity P1/P2, category `pinterest_revenue_ai`) for: V4 sync failure, visitor scoring failure or 0 scored sessions despite Pinterest traffic, ranking failure or stale ranks (>12h), forecasting failure or no forecasts in 24h, 0 pins published in 24h, queued backlog ≥200, rejection rate >60%, US share <40% (sample ≥100), and overall loop staleness (>9h since last forecast). Resolved automatically on the next healthy run.

**Backfill action:** `POST /functions/v1/pinterest-revenue-ai?action=backfill&days=N` (or `&since=...&until=...`). Walks `visitor_activity` filtered to `utm_source ilike '%pinterest%'` day-by-day; for each day deletes existing `pinterest_visitor_revenue_scores` rows in that window then re-inserts fresh scores (idempotent). After the walk, re-runs `rankOpportunities` + `forecast` so dashboards reflect the corrected history. `days` clamped to 1–365, per-day limit 20k rows.

**Tables:**
- `pinterest_visitor_revenue_scores` — per-session geo (country/region/city) + board/pin/product/keyword/creative/hook + revenue_score, traffic_quality_score, buyer_intent_score. Source: `visitor_activity` filtered to `utm_source ilike '%pinterest%'`.
- `pinterest_opportunity_ranks` — unified per-entity (product/board/keyword/creative/hook) opportunity score + rank_tier (winner ≥80th pct, loser ≤20th pct, untested <5 clicks, neutral otherwise) + 30d revenue/clicks/CTR/US share/conversion rate.
- `pinterest_forecasts` — per-entity 7d/30d expected impressions/clicks/conversions/revenue with confidence + `rising` flag. EWMA over 30d with tier boost (winner ×1.25, loser ×0.6).

**Dashboard:** `/admin/revenue-ai` — auto-refresh every hour, "Run loop now" button. Shows US share vs 80% target, 30d Pinterest visitors, top products/boards/keywords by opportunity score, revenue by US state + city, and top 30d revenue forecasts.

**Scoring rules (per visitor session):**
- `revenue_score = (revenue_cents/100)*10 + purchases*50 + checkouts*8 + atc*3`
- `traffic_quality_score = min(100, page_views*8 + min(session_seconds,300)/6)`
- `buyer_intent_score = min(100, atc*25 + checkouts*50 + purchases*100)`

**Forecast:** `dailyClicks * horizon * trendBoost` where `trendBoost = {winner:1.25, loser:0.6, neutral:1.0}`. Confidence = `min(1, clicks_30d/200)`.

**Does NOT replace V4** — chains it. V4 still owns: US snapshot, board health scoring, product tiering, keyword/title AI expansion, 70/25/5 traffic allocation, 70% priority category floor.