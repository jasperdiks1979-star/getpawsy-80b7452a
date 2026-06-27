---
name: Organic Confidence — Primary Executive KPI
description: Definition, weighting model, and pyramid classification for the Organic Confidence score used by Sales Commander and all Growth OS engines
type: feature
---
**Question answered:** "What would still sell if we stopped all advertising today?"

**Scope:** every product, every Pinterest pin, every category and every collection
receives an Organic Confidence score (0–100) and a pyramid level.

### Weighting model (`src/lib/organicConfidence.ts`)
| Component | Weight | Source |
|---|---|---|
| Organic visitors (log-scaled, ceiling 1000) | 0.15 | Layer 1 visitor_activity |
| Organic engagement (view-rate + atc-rate) | 0.20 | Layer 1 |
| Organic conversion (purchases / product_views, capped at 4%) | 0.25 | Layer 1 |
| Organic revenue (log-scaled, ceiling 5000) | 0.15 | Layer 1 orders |
| Returning sessions (log-scaled, ceiling 200) | 0.10 | Layer 1 |
| Paid independence (1 − paid_share) | 0.15 | penalty only |
| Market demand boost (Pinterest / Google Trends, optional) | +5 max | external |

### Confidence Pyramid
- **L1 Hypothesis** — insufficient evidence
- **L2 Emerging** — ≥10 organic visitors, score ≥20
- **L3 Validated** — ≥50 organic visitors, score ≥45, with ≥1 purchase or ≥5% ATC rate
- **L4 Organic Winner** — ≥2 organic purchases, score ≥65
- **L5 Scale Candidate** — ≥3 organic purchases, CVR ≥2%, score ≥80, paid_share ≤50% → paid promotion justified

### Forbidden inputs (hard rule)
`paid_visitors`, `paid_sessions`, `paid_impressions`, `ad_spend`, `campaign_budget`,
`ROAS`, `CPA`, `CPC`, `CPM`, `advertising_reach`, `purchased_exposure`.
Only `paid_visitors` may participate, and only as a penalty via paid_share.

### Surfaces
- Edge fn `organic-confidence` — global + per-product + per-category + per-pin scores.
- `/admin/sales-commander` — defaults to Layer 1 Organic Truth, tabs for Paid and Business Reality.
- Recommendation engine entries must declare `evidence_source ∈ {organic_behaviour, market_demand, paid_performance, blended}`.

### Operational rule
Sales Commander ranks products by Organic Confidence, never by paid-driven revenue.
Paid revenue remains visible inside the Layer 2 tab but never becomes the default sort.
