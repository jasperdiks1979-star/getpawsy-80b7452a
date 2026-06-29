# Genesis V3.3 — Market Intelligence OS

A real, production-grade market intelligence layer that sits on top of Canonical Analytics, Product Intelligence (PI V3), and Pinterest Growth (V3) — never duplicating them. Everything is admin-only, derived from real production data or real external APIs (no placeholders, no fabricated AI scores).

## Architecture (reuses existing Genesis stack)

```text
External APIs ──► gv3_mi_signals (raw, timestamped)
                       │
                       ▼
                gv3_mi_trends (normalized, scored)
                       │
                       ├──► gv3_mi_competitors (patterns only)
                       │
                       ├──► gv3_mi_opportunities  ◄── gv3_pi_scores (PI V3)
                       │                          ◄── gv3_pin_growth_scores
                       │                          ◄── canonical_* views
                       │
                       ├──► gv3_mi_creative_diversity ◄── pcie2 / pinterest_pins
                       │
                       └──► gv3_mi_first_sale_plan (daily ranked plan)
                                       │
                                       ▼
                            autopilot_actions (existing queue — no auto-publish)
                                       │
                                       ▼
                            autopilot_outcomes_24h / 72h / 7d / 30d
                                       │
                                       ▼
                            gv3_mi_learning (confidence calibration)
```

## Phase 1 — Market Intelligence Engine
- New tables: `gv3_mi_signals` (raw per source), `gv3_mi_trends` (normalized).
- Edge function `gv3-mi-collect` (daily cron 06:00 UTC) pulls real signals from:
  - Pinterest Trends + Search Suggestions (existing Pinterest OAuth connection)
  - Google Trends (public daily trends JSON, US)
  - Google Shopping (via Firecrawl scrape of shopping SERPs for pet queries)
  - Amazon Best Sellers + Movers & Shakers (Firecrawl, pet category)
  - Chewy Popular (Firecrawl)
  - Reddit (`/r/pets`, `/r/dogs`, `/r/cats` JSON — no key)
  - TikTok discover signals (existing TikTok connection where available)
  - US Holidays (static USA calendar table seeded once)
  - Weather (Open-Meteo, free, no key, top-10 US metros)
- Each row stores: strength, velocity (7d EMA), confidence (source agreement), est_lifetime, competition, seasonality, category, color/material/price/content trends, intent, urgency.
- Confidence methodology: weighted multi-source agreement + signal recency decay; never fabricated, sources logged in `evidence` JSONB.

## Phase 2 — Competitor Intelligence
- New table `gv3_mi_competitors` (domain, pattern_type, value, frequency, last_seen).
- `gv3-mi-competitors` cron (daily 04:00 UTC) uses Firecrawl on a curated competitor allowlist (Chewy, Petco, BarkBox, etc.). Extracts patterns only — pricing ranges, headline structures, CTA styles, image style classification via Lovable AI Gateway vision (gemini-2.5-flash). No copying — patterns + statistics only.

## Phase 3 — Trend Matching Engine
- New table `gv3_mi_opportunities` (product_id, trend_id, opportunity_score, gap_type, evidence).
- `gv3-mi-match` cron (daily 07:00 UTC) joins `gv3_mi_trends` × `products` × `gv3_pi_scores` × `gv3_pin_growth_scores`. Detects: already selling, missing opportunity, wrong pricing, wrong creative, missing Pinterest, missing video, etc. Opportunity Score is deterministic — derived from real internal metrics + trend strength.

## Phase 4 — Creative Evolution Engine
- New table `gv3_mi_creative_diversity` (creative_id, cluster_id, traits JSONB, diversity_score).
- `gv3-mi-creative-diversity` reuses existing `pinterest_pins` + PCIE2 artifacts. Uses Lovable AI vision to tag traits (lighting, palette, angle, environment, season, etc.) and clusters via cosine similarity on trait vectors. Enforces hard diversity rule via a Postgres function `gv3_mi_can_publish(creative_id)` that publish-assembler will consult.

## Phase 5 — First Sale AI
- New table `gv3_mi_first_sale_plan` (day, rank, product_id, lane, score, expected_revenue, evidence).
- `gv3-mi-first-sale` cron (daily 07:30 UTC) consolidates Phase 3 opportunities into a single ranked daily execution plan across 8 lanes (probability, revenue, Pinterest, Google, seasonal, impulse, repeat, urgency).

## Phase 6 — Autonomous Actions
- `gv3-mi-first-sale` writes proposed actions into the **existing** `autopilot_actions` queue with `source='market_intelligence'`. Never auto-publishes. CRITICAL/HIGH only spend credits (existing rule).

## Phase 7 — Learning Loop
- New view `gv3_mi_action_outcomes` joining `autopilot_actions` (MI-sourced) with `canonical_events` at 24h/72h/7d/30d windows.
- New table `gv3_mi_learning` (signal_source, category, predicted, actual, delta, calibrated_weight).
- `gv3-mi-learn` cron (daily 03:00 UTC) updates per-source confidence weights (EMA) that feed Phase 1.

## Phase 8 — Executive Dashboard
- New page `/admin/market-intelligence` (`MarketIntelligencePage.tsx`).
- Sections: US Market Health, Trend Radar, Emerging Opportunities, Top Competitors, Creative Diversity, Trend Timeline, Product Opportunity Matrix, Seasonality, US Holiday Countdown, Weather Impact, Trending Colors/Materials/Categories/Keywords, Creative Alerts, Competitor Alerts, Recommended Actions (deep-link to Autopilot Queue in Growth Command Center), AI Confidence, Learning Progress.
- All reads via the Canonical SDK + new typed helpers in `src/lib/marketIntelligence.ts`. No duplicated analytics.

## Phase 9 — Safety
- All `gv3_mi_*` tables: RLS enabled, admin-SELECT via `has_role`, service_role full. No anon. GRANTs included in same migration.
- Edge functions: `verify_jwt = false` with in-code admin/service-role enforcement, Zod validation, rate-limited via existing infra.
- Reuses Canonical SDK, PI V3, Pinterest Growth, Autopilot, cron infra. No duplicate analytics tables.

## Phase 10 — Success Criteria & Quality Gate
- Verifications run at end: `tsgo` clean, `canonical_validate_consistency() = 0.00%` drift, RLS linter clean, no placeholder values, all dashboards return real rows.
- Deployment report: services, crons, sources, learning pipeline, AI models (Lovable Gemini 2.5 Flash for vision/text), confidence methodology, security validation, perf impact (all heavy work in cron), production readiness score.

## Technical Details
- **AI:** Lovable AI Gateway (`google/gemini-2.5-flash` for vision tagging and pattern extraction; `google/gemini-2.5-flash-lite` for cheap bulk classification). No external paid LLM keys.
- **Scraping:** Firecrawl connector (already linked) for Amazon/Chewy/Google Shopping/competitor pages.
- **Open APIs (no key):** Reddit JSON, Open-Meteo, Google Trends daily RSS.
- **Pinterest/TikTok:** existing OAuth connections.
- **Cron:** pg_cron via the existing scheduler pattern.
- **No new public endpoints. No duplicate SQL. No fake metrics.**

## What I will NOT do
- No demo dashboards, no seed/placeholder rows.
- No duplicating `canonical_*`, `gv3_pi_*`, or `gv3_pin_growth_*`.
- No auto-publishing — everything routes through the existing Autopilot Queue.
- No client-side secrets; Firecrawl/Pinterest/TikTok stay server-side.

Proceed?
