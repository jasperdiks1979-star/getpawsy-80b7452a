
# Revenue Priority V2 + Full Export System

This is a large, multi-system change. I want approval on scope and sequencing before writing any code, because Phase 4 (system integration) and Phase 6 (backfill of all 553 products) are irreversible without rollback work, and the audit explicitly said "wait for approval before activating."

## Phase 1 — Schema & Scoring Engine

**Migration:**
- `product_intelligence.revenue_priority_score_v2 numeric` (0–100)
- `product_intelligence.revenue_tier text` (A/B/C/D)
- `product_intelligence.pinterest_momentum_score numeric`
- `product_intelligence.score_components_v2 jsonb` (full breakdown for audit)
- `products.margin_percent numeric` (derived & persisted)

**New edge function `revenue-priority-v2`** (service-role, admin-only). Actions:
- `compute_all` — recomputes V2 for full active catalog with population-wide normalization
- `compute_one` — single product recompute
- `diversify` — applies category caps (Top 25/50/100/250)
- `validate` — produces old-vs-new comparison report
- `report` — assembles full report payload for PDF

**Score formula (exact weights from spec):**
```
Pinterest 30 + Conversion 20 + Margin 20 + Opportunity 10
+ Inventory 10 + Age 5 + Video 3 + SEO 2 = 100
```

All sub-scores min/max normalized across the active 553-product population.

**Pinterest Momentum (30d window):** weighted blend of impressions, outbound clicks, saves, CTR, engagement rate from `pinterest_pin_performance` / `pinterest_pin_metrics`, with recency decay.

**Margin:** `(price - cost_price) / price`. If `cost_price` missing, fall back to CJ supplier cost from `supplier_products` / `cj_us_winners`.

**Inventory:** weighted by US stock, EU stock, variant breadth, OOS penalty.

**Age:** rewards products 30–180 days old; penalizes <14 days (no data) and stale >365d without recent traction.

**Video:** boolean coverage across cinematic V3 / Pinterest video / CJ video assets.

**SEO:** clamped to ≤2% influence.

## Phase 2 — Category Diversification

Applied as a post-rank pass inside `revenue-priority-v2`. Limits enforced in Top 25/50/100/250. Promotions logged to `score_components_v2.diversification`.

## Phase 3 — Revenue Tiers

Percentile-based: A=top 5%, B=15%, C=30%, D=50%. Persisted on `product_intelligence.revenue_tier`.

## Phase 4 — System Integration (BREAKING CHANGES — needs explicit go-ahead)

Replace legacy score reads with `revenue_priority_score_v2` (with `revenue_tier` as secondary sort) in:
1. `pinterest-autopilot` (score action)
2. `export-merchant-feed` / feed prioritizer
3. Homepage Featured + Trending Products queries
4. `/admin` Product Intelligence dashboard
5. `pinterest-creative-director` queue selection
6. `cinematic-v3-dispatch` queue ordering
7. `pinterest-revenue-brain` auto-promote gate

Each integration shipped behind a single feature flag `app_config.revenue_priority_v2_active` so we can flip back instantly if validation regresses.

## Phase 5 — Export System

**New page** `/admin/revenue-priority-report` with Generate / Download PDF / CSV / JSON buttons.

**New edge function `revenue-priority-export`** returns:
- JSON: full report payload
- CSV: per-product rows (rank, scores, tier, category, flags)
- PDF: assembled client-side with `pdf-lib` or `jspdf` (already in project for traffic report)

**PDF sections** (landscape, paginated, branded):
Executive Summary · Catalog Stats · Old vs New Distribution · Category Distribution · Top 50 · Top 100 · Bottom 100 · Most Improved · Most Declined · Pinterest Winners/Losers · Inventory Risks · Margin Leaders · Missing Videos · Missing Pinterest Data · Missing Cost Data · Diversification Report · Tier Distribution · Recommended Actions · Timestamp / Version / Store.

Charts rendered with existing chart util (recharts → canvas → PNG embed) for histograms, distribution, category breakdown.

## Phase 6 — Backfill

`revenue-priority-v2 / compute_all` run once. Writes V2 score + tier + components for all active products. No legacy fields modified.

## Phase 7 — Validation

`validate` action produces the comparison report (Top 50 old vs new, rank deltas, distribution, balance, influence breakdown per factor). Surfaced on the report page. **Feature flag stays OFF until you approve the validation output.**

## Sequencing & approval gates

1. I build Phases 1, 2, 3, 5, 7 (schema, engine, diversification, tiers, export UI/PDF, validation) — flag OFF, zero production impact.
2. I run the backfill (Phase 6) and generate the validation report + downloadable PDF for you to review.
3. **You approve** → I flip the flag and ship Phase 4 integrations in a single follow-up.

## Open questions before I start

1. **Cost fallback:** when neither `products.cost_price` nor CJ cost is available, should the product get margin score = 0 (penalized) or population median (neutral)? Penalizing surfaces the data gap; neutral avoids false demotion.
2. **Pinterest momentum source of truth:** use `pinterest_pin_performance` (per-pin) aggregated to product, or `gi_pinterest_pin_metrics` (daily)? I'll default to `pinterest_pin_performance` joined via `pinterest_pin_queue.product_id` unless you prefer otherwise.
3. **PDF engine:** reuse the existing `jspdf` setup from `trafficReportPdf` / `adminManualPdf` (faster, consistent branding) — confirm OK.
4. **Active catalog definition:** "active" = `products.is_active = true AND feed_optimization_status != 'discontinued'`?

Approve the plan (and answer the 4 questions, or say "your defaults") and I'll build Phases 1–3, 5, 7 in the next turn.
