---
name: Pinterest Market Intelligence Engine
description: External Pinterest trend → opportunity scoring with lifecycle classification, nightly run, XAI emission, and Health Dashboard panel
type: feature
---
**Edge function:** `supabase/functions/pinterest-market-intelligence/index.ts` (service role).
- `GET` or `?action=snapshot` → existing aggregate + `market_intel` snapshot.
- `POST {action:"run"}` or `?action=run` → nightly: gather signals, classify lifecycle, score, upsert, expire stale, emit XAI.

**Signals (read-only, NEVER mutates source tables):** `pinterest_trend_signals`, `pmin_keyword_trends`, `market_trend_clusters`, `pinterest_competitor_patterns`, `pinterest_competitor_opportunities`, `pinterest_pin_performance`.

**Lifecycle classifier:** emerging / growing / peak / declining / expired / evergreen / seasonal — uses growth velocity, saturation, age_days.

**Opportunity score (0–100):** `0.40·growth + 0.25·intent + 0.15·(1-saturation) + 0.10·(1-competition) + 0.10·seasonality`. Confidence rises with age + stability + intent.

**Recommended action:** amplify ≥70, test ≥50, monitor, harvest (peak), sustain (evergreen), throttle (declining/expired).

**Tables (admin RLS, service-role write):**
- `pinterest_market_opportunities` — `signal_key`+`signal_kind` unique; lifecycle, opportunity_score, confidence, expected_reach, expected_revenue_cents, recommended_action, evidence jsonb. Status flips to `expired` after 14d without refresh.
- `pinterest_market_intel_runs` — per-run counters + market_score + competition_index.

**XAI emission:** Top 12 high-confidence (≥0.5) emerging/growing/peak opportunities with score ≥60 get `emitXaiDecision` rows on `pcie2_xai_decisions`. dedupeKey = `pinterest-market-intel:<signal_key>:<YYYY-MM-DD>`.

**Cron:** id 253, `35 4 * * *` UTC (`pinterest-market-intelligence-nightly`).

**Dashboard:** `MarketIntelligencePanel` on `/admin/pinterest-health` (no new page). Surfaces market trend score, trend confidence, competition index, creative saturation, expected reach/revenue, emerging/declining lists, recommended actions, last-run audit.

**Founder-mode rule:** Engine never publishes; every recommendation must be readable via the XAI feed. No short-lived spike chases — confidence + age gates filter noise. Evergreen winners are sustained, not throttled.
