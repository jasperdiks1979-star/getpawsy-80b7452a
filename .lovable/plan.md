# Pinterest Autonomous Intelligence Platform (PAIP v1)

Additive upgrade on top of PCIE2, PQIF v2, Queue, Publisher, Creative Intelligence, Learning Loop, Nightly Audit. No existing system is removed, renamed, or simplified. Safety locks `pinterest_publishing_global_stop = true` and `pcie2_publish_enabled = false` remain ON until each wave is validated.

The 19 requested modules are too large to ship in one pass without breaking existing engines. I will deliver in 4 waves, each independently verifiable, each ending in a PDF/JSON implementation report and a GREEN/RED health gate.

---

## Wave A — Intelligence Layer (Modules 1, 2, 3, 4, 8, 10)

Pure-read scorers. No writes to publish pipeline.

**New tables (all admin-RLS + service_role GRANT):**
- `paip_trend_database` — keyword, source (pinterest_trends, pinterest_predicts, google_trends, seasonal), volume, growth, competition, seasonality_window, score, captured_at
- `paip_product_trend_scores` — product_id, trend_score, search_opportunity, competition, seasonality, demand_forecast_30d, updated_at
- `paip_visual_attention` — image_url, attention_score, attention_map jsonb, complexity, focal_points, golden_ratio, rule_of_thirds, whitespace, product_prominence, artifact_probability, confidence
- `paip_emotion_scores` — creative_id, curiosity, joy, fear, relief, urgency, excitement, trust, luxury, comfort, love, pet_happiness, owner_happiness, viral_emotion
- `paip_seo_scores` — creative_id, title_score, desc_score, keyword_density, lsi_coverage, entity_match, semantic_relevance, intent, final_score, reasons jsonb
- `paip_competitor_signals` — competitor, niche, color_palette, headline_pattern, composition, cta_pattern, psychology_tag, captured_at
- `paip_product_daily_rank` — product_id, run_date, composite_score, components jsonb, rank

**Edge functions:**
- `paip-trend-harvester` (cron `0 */6 * * *`) — pulls Pinterest trends proxy + Google Trends RSS + seasonal calendar; upserts `paip_trend_database`; recomputes `paip_product_trend_scores`.
- `paip-visual-attention` — called by PQIF v3 before publish. Uses Gemini 2.5 Flash multimodal to return JSON heatmap proxy + scores. Caches by `image_url + sha1`.
- `paip-emotion-scorer` — same flow, emotion vector per creative.
- `paip-seo-scorer` — Gemini 3 flash, deterministic rubric.
- `paip-competitor-scout` (cron `30 4 * * *`) — reuses existing competitor-intel infra; only writes pattern signals, never copies assets.
- `paip-product-ranker` (cron `0 5 * * *`) — composite of trend/inventory/margin/history/competition/demand/season/shipping/quality/reviews.

**Gate:** all six tables populated for ≥80% active products, no edge function errors for 24 h.

---

## Wave B — Quality Firewall v3 + Conversion Prediction + Human Detection (Modules 5, 7, 12, 19)

Plug-in checks added to PQIF v2 pipeline. Existing PQIF stays authoritative; v3 is a strict superset.

**New tables:**
- `paip_conversion_predictions` — creative_id, expected_ctr, expected_save_rate, expected_outbound_ctr, expected_atc_rate, expected_purchase_p, expected_revenue_cents, expected_roas, expected_cpc, expected_cpm, expected_cpa, confidence, model_version
- `paip_human_detection` — image_url, artificiality, human_authenticity, photo_realism, naturalness, verdict
- `paip_firewall_v3_checks` — verdict_id, check_name, passed, score, details jsonb

**New shared module:** `supabase/functions/_shared/pinterest-quality-firewall-v3.ts`. Wraps v2's `runFirewall()` and appends:
- visual plagiarism (phash near-dup over `pcie2_creatives` + `pinterest_pins`)
- AI watermark / CJ background detection (Gemini vision)
- Chinese text / OCR misspelling / grammar
- broken link / dead product / 404 HEAD checks
- resolution / aspect ratio / compression
- brand consistency + pet-safety lexicon
- conversion-prediction floor + human-authenticity floor

`pqif_settings` gains `v3_enabled` flag (default false → flip to true after Wave B validation).

**Gate:** v3 dry-run on 100 sampled creatives — must agree with v2 on ≥95% of v2 rejections and surface ≥10 new genuine fails.

---

## Wave C — Creative Evolution + Memory + Auto-Retire + Self-Heal (Modules 6, 9, 13, 14)

**New tables:**
- `paip_creative_memory` — every creative ever published with full feature vector + lifetime impressions/clicks/saves/purchases/CTR/ROAS/season/weekday/hour/audience/visual_dna_id/emotion_id/trend_id. Append-only, never pruned.
- `paip_evolution_runs` — product_id, generation, parents jsonb, mutations jsonb, survivors jsonb
- `paip_retirement_log` — creative_id, reason, metrics_at_retirement, replacement_id
- `paip_self_heal_log` — issue, target, action, result

**Edge functions:**
- `paip-evolution-engine` (cron `15 6 * * *`) — per product, generates the 20×9 variation matrix via existing pcie2-headline/hook/creative engines (no new generator, just orchestrator + selection pressure). Hard cap: 25 products/run.
- `paip-memory-writer` — hooks into `pqif-learning-loop` to mirror every measured pin into `paip_creative_memory`.
- `paip-auto-retire` (cron `45 6 * * *`) — applies CTR/saves/ROAS/season thresholds; queues replacement via evolution engine.
- `paip-self-healer` (cron `*/30 * * * *`) — repairs broken URLs/images/missing prices/stock/dup creatives/failed jobs. Reuses existing `pcie2-self-healer` patterns.

**Gate:** ≥1 full evolution generation per top-50 product; memory rows > impressions rows in `pcie2_pin_performance`.

---

## Wave D — Pinterest Brain + Enterprise Dashboards + Zero-Touch Activation (Modules 11, 15, 16, 17, 18)

**Central orchestrator:**
- `paip-brain` edge function (cron `*/15 * * * *`) — reads all PAIP scores + PQIF v3 verdicts + memory + predictions. Decides per creative: `publish | delay | reject | regenerate | mutate | retire | duplicate | replace`. Writes to `paip_brain_decisions` and pushes to existing `pcie2_publish_queue` (never bypasses queue or publisher).

**New tables:** `paip_brain_decisions`, `paip_brain_runs`, `paip_dashboard_snapshots`.

**UI:** `src/pages/admin/PinterestAutonomousPage.tsx` with tabs: Performance, Trend, SEO, Emotion, Creative, Visual, Revenue, ROAS, CTR Heatmaps, Prediction Accuracy, Learning Curve, Family Performance, Brain Decisions. All powered by a single `paip-dashboard-api` function.

**Perf:** GIN/BTREE indexes on every new table's hot path; queue batching in brain; rate-limit guard reusing existing `pinterest_credit_state`.

**Activation:** only after Waves A–C are GREEN and a 7-day shadow run shows brain decisions agreeing with PQIF v3 on ≥90% of rejections. Then flip `paip_brain_enabled = true`; safety locks remain user-controlled.

---

## Technical notes

- All AI calls via Lovable AI Gateway, default `google/gemini-3-flash-preview`, vision via `google/gemini-2.5-flash`. No new secrets.
- Every new public table follows the 4-step GRANT pattern (CREATE → GRANT to authenticated + service_role → ENABLE RLS → admin-only policies via `has_role`).
- One implementation report (PDF + JSON) per wave under `public/admin-reports/ai-implementation/` and manifest update.
- No legacy publisher, no removal of PQIF v2, PCIE2, learning loop, nightly audit, or any cron.
- Backward compatibility: all existing functions, tables, columns, RLS, and crons untouched. New crons use ids ≥ 200 to avoid collision.

---

## What I need from you

1. **Approve Wave A first** (intelligence layer only, zero publish-path risk), or approve all 4 waves to run sequentially with health-gated handoff between each.
2. Confirm budget cap for AI scoring during bootstrap. Suggested: **$75** total across all waves (same guardrail used for PCIE2 bootstrap). I will stop and report if exceeded.
3. Confirm safety locks stay ON until Wave D is GREEN (recommended).

Reply with `Approve A`, `Approve all`, or edits to the plan.
