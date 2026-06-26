# PMIN — Pinterest Market Intelligence Network

Build an autonomous, ecosystem-wide Pinterest intelligence layer on top of PCIE2 + PQIF v4 + PAIP. Additive only. Safety locks stay ON (`pinterest_publishing_global_stop=true`, `pcie2_publish_enabled=false`, `paip_brain_enabled=false`). No copyrighted content is stored or reproduced — only statistical pattern metadata and original generations.

This is a large multi-wave program. I'll ship it in 5 waves with health gates between each. Each wave produces a PDF + JSON implementation report in `public/admin-reports/ai-implementation/` and updates manifest.json.

## Wave X1 — Foundation & Public Discovery (build now, no AI spend)

Schema:
- `pmin_settings` — global toggles, budget caps, source enablement, kill switch.
- `pmin_sources` — registered signal sources (trends / search-suggest / related / category / seasonal / shopping / boards).
- `pmin_runs`, `pmin_run_steps` — orchestrator audit trail.
- `pmin_discovered_pins` — metadata only (no images, no raw copy beyond 200-char samples), unique on `(source_url, title_hash)`. Includes `category_key`, `niche_key`, `region`, `discovered_at`, `engagement_proxy`.
- `pmin_keyword_trends` — keyword × category × week, with `velocity`, `volume_proxy`, `season_flag`, `opportunity_score`.
- `pmin_category_knowledge` — per-category rolling stats (best colors, best hooks, best length, best posting windows).

Edge functions:
- `pmin-orchestrator` — resumable phase controller, evidence-logged, idempotent.
- `pmin-discovery-harvester` — uses Firecrawl (search + scrape) on Pinterest public surfaces + seed boards. Hard caps: ≤25 queries/run, ≤20 candidates/query, ≤500 inserts/run. Reuses existing `pinterest-competitor-intel` patterns.
- `pmin-keyword-trend-scorer` — extracts velocity / freshness / seasonality. Pure compute, no AI calls.

Cron: `pmin-discovery` daily 03:45 UTC (before existing brain at 03:00? — schedule after existing competitor-intel at 03:15).

Admin UI: `/admin/pmin` with three panels — Discovery Health, Keyword Trends, Category Knowledge. CSV export.

Wave X1 gate: ≥1,000 discovered pins, ≥200 keyword trend rows, 0 errors over 3 runs.

## Wave X2 — DNA Engines (Visual / Headline / Description / CTA / Layout)

Schema:
- `pmin_visual_dna` — per-discovered-pin extracted features (camera angle, lighting, composition, color harmony, animal pose, etc.), embedding vector (pgvector).
- `pmin_headline_dna`, `pmin_description_dna`, `pmin_cta_dna`, `pmin_layout_dna` — pattern rows with rolling `success_score`.
- `pmin_pattern_performance` — daily aggregates of pattern → CTR proxy / save proxy / outbound proxy.

Edge functions:
- `pmin-visual-dna-extractor` — Gemini Flash vision on **publicly-listed thumbnails only**, extracts features into structured JSON. Budget capped per run ($5/run, $30/day).
- `pmin-headline-dna-extractor` — Gemini Flash text classifier over the 200-char title samples.
- `pmin-description-dna-extractor` — same, descriptions.
- `pmin-pattern-aggregator` — rebuilds rolling success scores nightly.

Cron: nightly 04:00 UTC, after Wave X1 harvest.

Wave X2 gate: ≥500 visual_dna rows, ≥1,000 headline_dna rows, top patterns surfaced in UI, daily AI spend ≤ $30.

## Wave X3 — Trend Detection, Competitor Intel & Opportunity Engine

Schema:
- `pmin_trends` — emerging / accelerating / declining / seasonal / holiday, with `opportunity_score`, `peak_eta`, `confidence`.
- `pmin_competitors` — auto-discovered public accounts, growth deltas, viral boards (metadata only).
- `pmin_product_match` — every GetPawsy product × trend → `trend_score`, `virality_score`, `pinterest_fit`, `expected_ctr`, `expected_saves`, `expected_revenue`.

Edge functions:
- `pmin-trend-detector` — EWMA + change-point detection over keyword + category time series.
- `pmin-competitor-scout` — extends existing `paip-competitor-scout`, tracks growth over time.
- `pmin-product-matcher` — joins `products` × `pmin_trends` × `pmin_category_knowledge`, writes ranked match table.

Cron: trend-detector 05:00 UTC, competitor-scout 05:30 UTC, product-matcher 06:00 UTC.

Wave X3 gate: ≥50 active trends scored, all active products matched, opportunity ranking visible in `/admin/pmin`.

## Wave X4 — Predictive Pre-Publish Quality Gate (PCIE2 integration)

Extends PCIE2 + PQIF v4 without touching the publish lock.

- `pmin-creative-predictor` — given a PCIE2 candidate creative, returns predicted CTR / save / conversion / quality / uniqueness based on Wave X2 DNA + Wave X3 trends.
- `pmin-creative-gate` — wraps PCIE2 candidate output: if predicted CTR < category top-10% **or** quality_score < 90 **or** uniqueness < 90 **or** duplicate_probability > 5%, **reject + auto-request a regeneration** via the existing PCIE2 regeneration queue. Logs every decision to `pmin_decisions`.
- New table `pmin_decisions` — full evidence trail per evaluated creative.

No publishing changes. Gate runs in `shadow` mode first (decisions logged, PCIE2 unchanged) until X4 health gate passes.

Wave X4 gate: ≥1,000 shadow decisions, predicted-vs-actual correlation ≥ 0.4 on backtests against existing `pcie2_pin_performance`.

## Wave X5 — Self-Improvement Loop & Reporting

- `pmin-learning-loop` — nightly: ingests Pinterest metrics from `pinterest_analytics_daily` + `pinterest_video_metrics`, updates pattern success scores, promotes/retires DNA rows, regenerates category knowledge.
- `pmin-report` — generates Daily Intelligence + Weekly Market + Monthly Strategy reports (PDF + JSON) into `public/admin-reports/ai-implementation/` and updates manifest.json.
- Admin dashboard final panels: Trending Categories, Trending Products, Trending Keywords, Trending Headlines, Trending Image Styles, Competitor Growth, Category Heatmaps, Opportunity Scores, Publishing Recommendations, Revenue Predictions, Learning Progress.

Cron: learning-loop 06:30 UTC, daily-report 07:00 UTC, weekly-report Mon 07:15, monthly-report 1st 07:30.

Wave X5 gate: 3 consecutive nightly reports green, learning loop closed (pattern scores moving with observed metrics).

## Safety, Budget, Compliance

- All locks remain ON: `pinterest_publishing_global_stop`, `pcie2_publish_enabled`, `paip_brain_enabled`, plus new `pmin_brain_enabled=false`.
- Budget caps in `pmin_settings`: $30/day total AI, $5/run vision, kill switch instantly stops all crons.
- No raw copyrighted text, image, or video stored. Title/description samples capped at 200 chars. Images: URL hash + extracted features only.
- All edge functions service-role + admin-JWT guarded. No anon access to any `pmin_*` table.
- RLS: every `pmin_*` table — admin select; service_role full. No anon grants.

## What I'll do right now (auto-approval flow)

1. Open the Wave X1 migration (schema + GRANTs + RLS).
2. After approval: deploy `pmin-orchestrator`, `pmin-discovery-harvester`, `pmin-keyword-trend-scorer`, schedule cron, build `/admin/pmin` shell with Discovery Health + Keyword Trends panels.
3. Run one dry-harvest of ≤25 queries against existing seed niches, verify counts, generate Wave X1 PDF + JSON report.
4. **Stop** before Wave X2 and ask you to approve AI-spend waves (`Approve X2`, `Approve X2+X3+X4+X5`, etc.) — same pattern as PAIP.

Reply **Approve X1** to start, or tell me to adjust scope (e.g., skip discovery and start from product-matching, change budget caps, add/remove sources).
