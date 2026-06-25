
# Phase G — Pinterest Revenue Intelligence Engine (PRIE)

## Guardrails
- 100% additive. Zero edits to PGA, PE, Pinterest Brain, Revenue Brain, Revenue AI V5, autopilot, publisher, crons, `usePinterestTracking`, `SafePinterestTag`, `CartContext`.
- All new tables prefixed `prie_*`. Admin RLS via `has_role(auth.uid(),'admin')` + GRANT to `authenticated`/`service_role`.
- All AI via Lovable AI Gateway. Default `google/gemini-3-flash-preview`; `google/gemini-3.1-flash-image` for image regen.
- Truth-only: every metric joins live tables (`pinterest_pins`, `pinterest_funnel_events`, `pinterest_attribution_sessions`, `orders`, `ga4_daily_snapshots`, `pinterest_pdp_conversion_stats`, `pinterest_revenue_*`, `pin_creative_scores`). Scope-blocked endpoints render "Scope blocked — reconnect" (PE pattern).
- Auto-fix safe list = exact brief list. Spend/budget/bid/billing/campaign/board/catalog deletion → `pe_manual_approval_queue` (reused).
- No persisted Pinterest mutations until Wave 4 approval gate.

## Waves

### Wave 1 — Foundation + Global AI Brain + Revenue Prediction (sections 1, 2, 13)
- Tables: `prie_settings`, `prie_brain_snapshots` (6 scores + bottleneck + top action + confidence), `prie_revenue_predictions` (per product: impressions/saves/closeups/clicks/atc/purchases/revenue daily/monthly/annual + confidence), `prie_timeline_events`.
- Edge fns: `prie-brain-sync`, `prie-revenue-predictor` (EWMA over 30d Pinterest traffic + product conv rate from `pinterest_pdp_conversion_stats` + margin from `products`).
- UI: `PinterestRevenueAiPage.tsx` shell + ExecutiveBrainPanel + RevenuePredictionPanel + TimelinePanel.

### Wave 2 — Pin Quality + Creative Evolution + Self-Learning (sections 3, 4, 5, 12 read-only)
- Tables: `prie_pin_quality_scores` (11 sub-scores + explanation), `prie_creative_generations` (V1–V4, never overwrites originals — references `pinterest_pin_queue` source), `prie_learning_weights` (dim: headline/image/video/board/keyword/time, EWMA confidence ±).
- Edge fns: `prie-pin-quality-scorer`, `prie-creative-evolver` (queues drafts only — no auto-publish in this wave), `prie-self-learner` (nightly EWMA over outbound clicks/saves/atc/purchases).
- Reuses `pin_creative_scores`, `pin_hook_library_v2`, `pin_scene_style_families`. Read-only.
- UI: PinQualityPanel, CreativeEvolutionPanel, LearningPanel.

### Wave 3 — Experimentation + Prioritization + Trends + Competitor + Opportunities (sections 6, 7, 8, 9, 10)
- Tables: `prie_experiments`, `prie_variants`, `prie_product_priority` (10 sub-scores + class scale/maintain/observe/pause/regenerate), `prie_trend_signals` (Pinterest/Google/seasonal/holiday/breed/weather proxies), `prie_competitor_observations` (patterns only), `prie_opportunities` (13 detection types + expected traffic/revenue/confidence).
- Edge fns: `prie-experiment-orchestrator` (z-test p<0.05, n≥100/arm, statistically significant winner promotion via queue only), `prie-prioritizer`, `prie-trend-engine`, `prie-competitor-engine` (reuses `pinterest_competitor_pins`), `prie-opportunity-scanner`.
- UI: ExperimentsPanel, ProductPriorityPanel, TrendsPanel, CompetitorPanel, OpportunitiesPanel.

### Wave 4 — Decision Engine + Autonomous Content Factory + Safe Auto-Fix + Executive Insights (sections 11, 12, 14, 15)
- Tables: `prie_decisions` (top20 scale/repair/promote/pause/videos/images per 15min cycle), `prie_auto_fix_log`, `prie_executive_reports` (daily 04:30 UTC → PDF+JSON+MD in `public/admin-reports/ai-implementation/`), `prie_memory` (winning headlines/hooks/templates/videos/colors/products/boards/times/keywords/seasons).
- Edge fns: `prie-decision-engine` (15min), `prie-content-factory` (confidence-gated; calls existing CPE + cinematic + lifestyle engines, never new image/video generators), `prie-auto-fix` (safe-list only: refresh analytics, retry APIs, repair URL/metadata/queue/cache, regenerate creatives, generate images/videos/desc/SEO via existing engines, dedupe pins, repair scheduling), `prie-executive-report`.
- Crons via `supabase--insert` (PE_CRON_SECRET pattern):
  - 15min: brain-sync, decision-engine
  - hourly: pin-quality-scorer, revenue-predictor
  - 6h: opportunity-scanner, trend-engine, prioritizer
  - daily 04:30 UTC: executive-report, self-learner
  - weekly Sun: competitor-engine
- UI: DecisionPanel, ContentFactoryPanel, AutoFixPanel, ExecutiveInsightsPanel, GrowthKpiPanel.

### Wave 5 — Regression + Reports
- Reports under `public/admin-reports/ai-implementation/`:
  - `2026-06-25-prie-architecture.{pdf,json}`
  - `2026-06-25-prie-performance.{pdf,json}`
  - `2026-06-25-prie-revenue.{pdf,json}`
  - `2026-06-25-prie-ai-capability.{pdf,json}`
  - `2026-06-25-prie-automation.{pdf,json}`
  - `2026-06-25-prie-regression.{pdf,json}`
  - `2026-06-25-prie-future-roadmap.{pdf,json}`
- Regression: `tsgo` clean, all existing Pinterest admin routes render, PDP/cart/checkout green, no PE/PGA endpoint regression. Hard stop on any red.

## Architecture

```text
/admin/pinterest-revenue-ai (NEW)
   │
   ├── prie_* tables (snapshots, predictions, quality, generations, learning,
   │    experiments, priority, trends, opportunities, decisions, memory, reports)
   │
   ├── prie-* edge functions (brain, predictor, quality, evolver, learner,
   │    experiment, prioritizer, trends, competitor, opportunity, decision,
   │    content-factory, auto-fix, executive-report)
   │
   └── reuses (read-only): pinterest_pins, pinterest_pin_queue,
        pinterest_funnel_events, pinterest_pdp_conversion_stats,
        pinterest_revenue_*, pin_creative_scores, pin_hook_library_v2,
        pga_*, pe_*, products, orders, ga4_daily_snapshots
        + write to pe_manual_approval_queue for unsafe actions
```

## Out of scope
- Mutating budgets/bids/campaigns/billing/catalog/boards — manual approval only.
- Rewriting PGA / PE / Wave 3 / Revenue Brain / Revenue AI V5 / autopilot / cron worker.
- Touching analytics emit paths or tracking hooks.

## What to approve
Approve to begin Wave 1. System then chains Waves 2 → 5 autonomously, with PDF+JSON report after each wave under `public/admin-reports/ai-implementation/` and manifest update. Final activation gate after Wave 5 regression passes.
