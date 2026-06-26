# GetPawsy Phase 2 — Autonomous Commerce OS (ACOS)

## Scope & guardrails

Additive-only. No existing system is replaced, refactored, or deactivated. All new code lives under new tables (`acos_*`), new edge functions (`acos-*`), and a new unified dashboard route (`/admin/command-center-2`). Existing Commander, Growth, Traffic, Pinterest, CJ, Revenue, Cinematic, Render, GA4, GMC, Klaviyo, Reports, Evolution Engine Phase 1 & 2 remain fully operational.

Hard rules:
- Default mode = **observe + recommend**. Autonomous mutations gated behind per-engine feature flags (default OFF) plus the existing `global_stop` and `pcie2_publish_enabled` locks.
- No publishing changes — Phase 2 routes through existing CI Layer → Assembler → Publisher.
- No OAuth, Queue, Guardian, Canary, Recovery, Ads, or Billing changes.
- Every autonomous decision logged with reason, expected outcome, actual outcome, and rollback ref.

## Architecture

```text
              ┌────────────── Command Center 2.0 (UI) ──────────────┐
              │ unified panels, filters, mobile-first                 │
              └────────┬─────────────────────────────────────────────┘
                       │ reads only
        ┌──────────────┴─────────────────────────────────────┐
        │           ACOS Orchestrator (nightly + hourly)      │
        └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──────────┘
           │  │  │  │  │  │  │  │  │  │  │  │  │  │
           ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼
        Revenue  Score  Winner  Loser  Pin-SEO  Board-IQ  Diversity
        Creative-Family  Video-Expand  Ads-AI  Landing-AI  Trend
        Predictive  Commander-AI  Self-Learning  Daily-Loop
                       │
             ┌─────────┴──────────┐
             │ reads existing prod │
             │ writes new acos_*  │
             └────────────────────┘
```

## Database (new tables only)

All `acos_*` tables: admin-read RLS, service-role write, standard `created_at`/`updated_at`.

- `acos_product_metrics_hourly` — per-product metrics snapshot (impressions, clicks, CTR, saves, CPC, CPM, ATC, checkouts, purchases, CVR, revenue, gross_profit, gross_margin, net_margin, ROAS, CPA, AOV, RPM, refund_rate, inventory_health, velocity, trend_score, confidence)
- `acos_product_forecasts` — 24h / 7d / 30d projections + uncertainty bands
- `acos_product_scores` — live 0–100 score + 15 component sub-scores + category (champion/scale/growing/stable/needs-improvement/low/archive)
- `acos_creative_families` — generated family library (luxury/minimal/lifestyle/funny/cute/emotional/problem-solution/UGC/POV/comparison/story/review/cinematic/macro/premium/before-after/seasonal/holiday/educational)
- `acos_creative_fatigue` — per-creative fatigue signals + rotation recommendations
- `acos_winner_signals` / `acos_loser_signals` — per-product winner/loser detections with action recommendations
- `acos_pin_seo_variants` — multi-variant pin SEO drafts + performance
- `acos_board_intelligence` — per-board CTR/saves/conversions/diversity + suggestions (rename/merge/split/archive)
- `acos_diversity_state` — category rotation balance ledger
- `acos_video_expansion_jobs` — 15s/30s/45s/60s × portrait/landscape/square queue (delegates to existing V3 generator; no new render path)
- `acos_ads_recommendations` — ad launch / scale / pause recommendations + budget caps
- `acos_landing_audits` — PDP audit + low-risk auto-applied vs queued-for-approval changes
- `acos_trend_opportunities` — Pinterest/Google/internal trend signals + suggested campaigns
- `acos_predictions` — traffic/sales/revenue/ROAS/inventory/profit forecasts
- `acos_commander_chats` — Commander AI Q&A with grounded citations
- `acos_decisions` — every autonomous action: reason, expected, actual, delta, rollback_ref, status
- `acos_learning_insights` — winning headlines/colors/layouts/times/boards/CTAs/lengths
- `acos_orchestrator_runs` / `acos_orchestrator_steps` — hourly + nightly loop telemetry
- `acos_settings` — feature flags, thresholds, budget caps, emergency stop

## Edge functions (new only)

Each function: admin JWT guard, observation-only by default, reads existing prod tables, writes only `acos_*`.

| Function | Cadence | Purpose |
|---|---|---|
| `acos-revenue-brain` | hourly | Compute 22 metrics + confidence per product |
| `acos-score-engine` | hourly | 0–100 score + category |
| `acos-winner-detect` | hourly | Top CTR/saves/revenue/CVR/ROAS/margin → recommendations |
| `acos-loser-detect` | hourly | Poor CTR/saves/bounce → pause/rewrite/regen recs |
| `acos-creative-families` | daily | Generate family briefs via Lovable AI Gateway |
| `acos-creative-fatigue` | daily | Detect repetition + rotation plan |
| `acos-pin-seo-ai` | daily | Multi-variant title/desc/keyword/board/alt/UTM drafts |
| `acos-board-intelligence` | daily | Board scoring + rename/merge/split/archive recs |
| `acos-diversity-engine` | hourly | Category exposure rebalance ledger |
| `acos-video-expansion` | on-demand | Enqueue 15/30/45/60s variants to existing V3 |
| `acos-ads-ai` | hourly | Ad recommendations + (flagged) campaign actions |
| `acos-landing-ai` | daily | PDP audit + low-risk auto-fix queue |
| `acos-trend-discovery` | 4×/day | Pinterest + Google Trends + internal signal merge |
| `acos-predictive` | nightly | 24h/7d/30d forecasts with bands |
| `acos-commander-ai` | on-demand | Grounded Q&A over acos_* + existing tables |
| `acos-self-learning` | nightly | Aggregate winners into insight library |
| `acos-orchestrator` | hourly + nightly | Run loop; nightly publishes Executive Report |
| `acos-executive-report` | nightly | PDF + JSON to `public/admin-reports/ai-implementation/` + manifest update |

## UI — Command Center 2.0

New route `/admin/command-center-2` (existing Commander page untouched). Mobile-first, filterable panels:

- Platform Health • Revenue Today / Week • Traffic • Pinterest • Ads • ROAS
- AI Jobs • Videos • Pins • Products • Growth Score
- Warnings • Recommendations • Predictions
- Top Products / Pins / Videos / Ads / Categories
- Inventory Risks • Pending vs Completed Tasks • System Health
- Commander AI chat (right rail) — answers reference live metrics with citations
- Decision Log with rollback button (per row)
- Feature-flag matrix + emergency stop

Existing dashboards continue to work and are linked from a "Legacy Dashboards" footer.

## Safety

- Per-engine feature flags in `acos_settings` (default OFF for any mutating action)
- Honors existing `app_config.global_stop` and `pcie2_publish_enabled`
- Hard daily/weekly/monthly ad budget caps with ledger
- Every decision rollback-able from Decision Log
- Notifications via existing Guardian + email/SMS channels
- Heavy jobs run as queued background work (`acos_orchestrator_*`), retryable, resumable

## Performance

- Hourly loop is incremental (last-hour delta only)
- Forecasts cached per product; recompute only on >5% feature change
- All long-running jobs async via orchestrator; no admin UI blocking
- Indexes on (product_id, observed_at) for hot tables

## Rollout (3 waves, ship in one turn)

**Wave A — Foundation (this turn)**
1. Migration: all 21 `acos_*` tables + indexes + RLS + grants + default settings (all mutations OFF)
2. Deploy 18 edge functions in observation mode
3. Build `/admin/command-center-2` shell with live panels for Revenue Brain, Score Engine, Winner/Loser, Decisions, Recommendations, Predictions, Commander AI chat
4. Smoke-run each engine once; generate Wave A implementation report (PDF + JSON) + manifest update

**Wave B — Activation (later, opt-in)**
- User toggles flags per engine after reviewing recommendations

**Wave C — Self-tuning (later)**
- Self-learning loop weights propagate into future generation prompts

## Deliverables this turn

- 21 new tables, 18 new edge functions, 1 new dashboard route
- All existing systems unchanged and verified
- PDF + JSON implementation report at `public/admin-reports/ai-implementation/2026-06-26-acos-phase-2-wave-a.{pdf,json}` and manifest entry
- GREEN verification only when migration applied, functions deployed, dashboard renders, smoke tests pass, and Phase 1/2 Evolution Engine + Commander + Publisher all still respond.
