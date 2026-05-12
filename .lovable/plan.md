# US Market Intelligence + Trend Analysis Engine

Builds on the existing Growth Intelligence Engine (`gi_*` tables, `/admin/growth-intelligence`). Adds a compliant, US-only trend + competitor + creative-pattern layer that feeds the existing scoring/queue system.

## Compliance Guardrails (hardcoded, non-negotiable)

- US-only weighting (`market = 'US'` everywhere)
- Inspiration only — no asset downloads, no 1:1 clones, no review copying
- Respect robots.txt; only public URLs/metadata
- Remix engine produces transformed originals (different copy, different visuals, own brand)
- Auto-publish stays OFF; trend insights generate DRAFTS only
- All competitor entries logged with source URL + observation date for audit

## Phase 1 — Foundation (this turn, on approval)

### Database (new `mi_*` tables, admin-only RLS)

- `mi_trends` — trend_type, term/topic, market, source, score, momentum, season, first_seen, last_seen
- `mi_trend_signals` — daily raw signals (source, value, captured_at) feeding `mi_trends`
- `mi_competitors` — name, domain, category, notes
- `mi_competitor_observations` — competitor_id, url, platform, hook_type, cta_type, visual_style, posting_cadence, est_engagement, aesthetic_category, structure, thumbnail_pattern, trust_signals, lp_notes, observed_at
- `mi_creative_recipes` — name, hook_family, first_3s_structure, cta_timing, overlay_style, palette_category, emotional_angle, curiosity_pattern, pain_framing, benefit_framing, social_proof_structure, pacing, scene_density, product_positioning, source_refs[]
- `mi_remix_drafts` — recipe_id, product_id, generated_copy, generated_brief, status (draft/approved/queued/rejected), compliance_flags
- `mi_opportunities` — type (niche_gap/weak_competitor/low_comp_topic/content_gap/viral_hook/seasonal), title, evidence, score, status
- `mi_recommendations` — title, body, category, confidence, evidence_refs, status (new/seen/applied/dismissed)
- `mi_seasonal_forecasts` — category, week_of_year, expected_lift, confidence

### US-only views
- `us_mi_trends_v`, `us_mi_opportunities_v`, `us_mi_recommendations_v` (filter market='US', exclude bot/internal sources)

### Admin Dashboard — `/admin/market-intelligence` (8 tabs)
1. Trend Radar (real-time `mi_trends` sorted by momentum)
2. Competitor Intelligence (CRUD on observations, manual import)
3. Hook Leaderboard (aggregated from observations + creatives)
4. Winning Styles (palette/pacing/aesthetic winners)
5. Viral Pattern Library (`mi_creative_recipes`)
6. Opportunity Gaps (`mi_opportunities`)
7. Seasonal Forecasts (`mi_seasonal_forecasts`)
8. Recommended Next Creatives (`mi_recommendations` + remix drafts)

### Manual import (Phase 1)
- CSV upload for competitor observations
- Manual trend entry form
- Manual recipe entry form

No external scraping yet — all data via internal signals + manual entry. This keeps Phase 1 100% compliant out of the gate.

## Phase 2 — Signal Ingestion

- `mi-ingest-internal` edge function: pulls from existing `gi_*` data, GSC (CSV), GA4 (CSV) → writes `mi_trend_signals`
- `mi-pinterest-trends` edge function: uses already-connected Pinterest API for our own pin performance (no scraping competitors)
- Aggregator that rolls signals into `mi_trends` with US weighting
- Google Trends via manual CSV import

## Phase 3 — Pattern Extraction & Remix

- `mi-extract-recipe` edge function (Lovable AI / Gemini): given a manually-pasted public URL or text, extracts hook family / pacing / palette category and stores a recipe — never stores assets
- `mi-remix-draft` edge function: takes recipe + a GetPawsy product → generates ORIGINAL copy + visual brief (text-only brief, our own AI image gen runs separately) → writes `mi_remix_drafts`
- Compliance checker: blocks drafts containing copyrighted phrasing, banned terms, or competitor brand mentions

## Phase 4 — Opportunity & Recommendation Engine

- `mi-detect-opportunities` edge function: cross-joins trends × catalog × competitor coverage to surface gaps
- `mi-generate-recommendations` edge function: turns opportunities + winning styles into plain-English recommendations
- Hook into existing Pinterest/TikTok queues to push approved remix drafts as drafts only

## Phase 5 — Self-Learning Loop

- Feedback table: every published creative → measure US performance via `gi_*` rollups → reinforce/decay recipe scores
- Weekly `mi-learn` edge function adjusts recipe weights and prunes underperformers
- Seasonal forecaster trained on 52-week rolling window

## Safety / what this engine will NEVER do

- Download or store competitor images/videos
- Auto-publish anything
- Suggest copying exact text or branding
- Use non-US data to drive US recommendations
- Bypass robots.txt or platform ToS

## Default state

- All automation = `DRAFT_ONLY`
- Market = `US` hardcoded
- Empty dashboards on first load with clear "no data yet" states + import CTAs

---

**Reageer met "ga" om Phase 1 te starten** (database schema + `/admin/market-intelligence` dashboard met 8 tabs + manual import forms).