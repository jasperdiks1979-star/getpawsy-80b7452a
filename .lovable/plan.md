# Pinterest Growth Intelligence Engine — Build Plan

## Scope & guardrails
- New route: `/admin/pinterest-growth-ai` (15 sections from the brief).
- 100% additive on top of existing `pinterest_*` and `pe_*` schemas, edge functions, and crons. Zero edits to Wave 1–2 PE code, `usePinterestTracking`, `SafePinterestTag`, `CartContext`, or any existing analytics surface.
- All new tables namespaced `pga_*` (Pinterest Growth AI). Admin-only RLS via `has_role(auth.uid(),'admin')` + GRANT to authenticated + service_role.
- Truth rule: every metric must come from a real source (Pinterest API, Pinterest Ads API, Pinterest Analytics, GA4, existing CAPI/funnel tables, products catalog). Scope-blocked endpoints render "Scope blocked — reconnect" instead of fake numbers — same pattern PE already uses.
- Auto-fix safe list = exactly the brief's safe-execute list. Everything in the manual-approval list goes to `pe_manual_approval_queue` (reuse existing queue, do not fork).
- No persisted Pinterest mutations (PATCH/POST to live pins, boards, campaigns) until Wave 5 approval gate. Waves 1–4 are read + compute + recommendation only.
- All AI calls go through Lovable AI Gateway (`google/gemini-3-flash-preview` default; `gemini-2.5-flash-image` for image regen). No client-exposed keys.

## Waves

### Wave A — Foundation + Executive Overview (section 1)
- Tables: `pga_settings`, `pga_executive_snapshots`, `pga_growth_scores_daily`, `pga_timeline_events`.
- Edge function `pga-overview-sync`: pulls revenue, ATC, purchases, ROAS, conv rate from existing `pinterest_funnel_events`, `pinterest_attribution_sessions`, `orders`, GA4 snapshots. Reach/CTR/outbound from `pinterest_pins` + organic sync (PE Wave 2).
- Edge function `pga-growth-score`: rolls section scores into one Growth Score (0–100).
- UI: `PinterestGrowthAIPage.tsx` shell + `ExecutiveOverviewPanel`.

### Wave B — Creative + SEO + Product Intelligence (sections 2, 3, 7)
- Tables: `pga_pin_scores` (creative/engagement/sales/seo/virality/confidence), `pga_pin_recommendations`, `pga_seo_keywords`, `pga_seo_suggestions`, `pga_product_scores`.
- Edge functions: `pga-creative-scorer`, `pga-seo-intelligence`, `pga-product-intelligence`. All read-only; recommendations land in `pga_pin_recommendations` / `pga_product_recommendations` with `safe_to_auto_apply` flag.
- Reuses `pin_product_intelligence`, `pin_creative_scores`, `pin_hook_library_v2` already produced by Wave 3 — does not rewrite them, only joins.
- UI: CreativeIntelligencePanel, SEOIntelligencePanel, ProductIntelligencePanel.

### Wave C — Boards + Publishing + Trends + Competitor (sections 5, 6, 8, 9)
- Tables: `pga_board_scores`, `pga_publishing_windows_ai`, `pga_trend_signals_v2`, `pga_competitor_observations`.
- Edge functions: `pga-board-intelligence`, `pga-publishing-intelligence` (per-board/weekday/category best-time model — EWMA over last 90d of outbound clicks), `pga-trend-intelligence`, `pga-competitor-intelligence` (reuses existing `pinterest_competitor_pins`, never copies copyrighted material — extracts patterns only).
- UI: BoardsPanel, PublishingPanel, TrendsPanel, CompetitorPanel.

### Wave D — A/B Testing + Growth Opportunities + Revenue Intelligence + Timeline (sections 4, 10, 11, 12)
- Tables: `pga_ab_experiments`, `pga_ab_variants`, `pga_opportunities`, `pga_revenue_forecasts`.
- Edge functions: `pga-ab-orchestrator` (generates variants → queues as drafts only until Wave 5 gate, never auto-publishes paid; statistically significant winner = z-test p<0.05, n≥100 impressions per arm), `pga-opportunity-scanner` (24 signal scan from brief), `pga-revenue-forecaster` (EWMA + linreg over 30d, 7d/30d horizons, 80% CI).
- UI: ABTestingPanel, OpportunitiesPanel, RevenuePanel, TimelinePanel.

### Wave E — Learning Engine + Autonomous Operator + Safe Auto-Fix + Daily Report (sections 13, 14, 15)
- Tables: `pga_learning_weights` (per dimension: headline, image, video, keyword, board, product, hook, style), `pga_operator_runs`, `pga_auto_fix_log`, `pga_daily_reports`.
- Edge functions:
  - `pga-learning-engine`: nightly EWMA promote/retire (n≥30 & ≥median → boost; n≥40 & <0.5× median → retire). Writes to `pga_learning_weights`. Existing Wave 3 hook/scene tables are read-only inputs.
  - `pga-ai-operator`: every 15min "what is preventing growth?" loop. Calls the 12 sub-engines, queues fixes. Reuses `pe_manual_approval_queue` for unsafe items.
  - `pga-auto-fix`: executes the safe-list only (URL repair, metadata repair, cache refresh, queue repair, missing creative/title/description/lifestyle generation via existing Wave 3B + CPE functions, broken-feed repair, dup-pin repair, scheduling repair, trend cache refresh, API retry).
  - `pga-daily-report`: 04:30 UTC, generates PDF + JSON + Markdown to `public/admin-reports/ai-implementation/<date>-pga-daily.{pdf,json,md}` and appends manifest.
- Crons (via insert tool, not migration): 15min operator + safe-fix; hourly overview + creative scorer; 6h SEO + trends + boards; daily 04:30 report + learning engine; weekly Sunday competitor refresh. All use `PE_CRON_SECRET` pattern already proven in Wave 1.

### Wave F — Final regression + reports
- Files: `architecture-report.pdf/json`, `endpoint-report.pdf/json`, `automation-report.pdf/json`, `ai-capability-report.pdf/json`, `growth-roadmap.pdf/json`, `pinterest-permissions-remaining.pdf/json`, `regression-report.pdf/json` → all in `public/admin-reports/ai-implementation/` with manifest updates.
- Regression: `tsgo` clean, `/admin/pinterest-health`, `/admin/pinterest-enterprise-control-center`, `/admin/pinterest-control-center`, `/admin/pinterest-brain`, `/admin/pinterest-intelligence`, `/admin/growth-intelligence`, `/admin/reports`, PDP, cart, checkout — all must render with no new errors. Hard stop if any previously-green PE endpoint goes red.

## Architecture diagram

```text
                   ┌────────────────────────────────────────┐
                   │   /admin/pinterest-growth-ai (NEW)     │
                   │   15 panels, read-only by default      │
                   └───────────────┬────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
   pga_* tables           pga-* edge functions       pe_manual_approval_queue
   (scores, recs,         (scorers, operator,        (reused, no fork)
    timeline, reports)    daily report, auto-fix)
        │                          │
        └──────────────┬───────────┘
                       │
        ┌──────────────┴───────────────────────────────┐
        │  Read-only inputs (NEVER mutated by Growth AI)│
        │  pinterest_pins, pinterest_pin_queue,        │
        │  pinterest_funnel_events, pin_product_*,     │
        │  pin_creative_scores, pin_hook_library_v2,   │
        │  pe_endpoint_checks, pe_health_snapshots,    │
        │  products, orders, ga4_daily_snapshots       │
        └───────────────────────────────────────────────┘
```

## Out of scope (explicit)
- Activating paid campaigns, mutating budgets/bids/billing, deleting any Pinterest entity, copying competitor creative — all manual-approval or never.
- Rewriting Wave 3 / Wave 3B / PE Wave 1 / PE Wave 2 / autopilot / publisher / cron worker.
- Touching `usePinterestTracking`, `SafePinterestTag`, `CartContext`, or any analytics emit path.

## What you approve to start
Approve to begin Wave A immediately. The system will then chain Waves B → F autonomously, stopping only on critical regression. Each wave ends with the standard PDF+JSON report under `public/admin-reports/ai-implementation/` and a manifest update, per the project's reports rule.
