---
name: Pinterest Revenue Engine V4
description: Inventory + media-quality eligibility gate, winner replacement, queue cleanup, sales-mode optimization, V4 admin dashboard
type: feature
---
**Shared module:** `supabase/functions/_shared/pinterest-eligibility.ts` exports `assessProductEligibility(productId)` and `computeMediaScore()`. Reasons: out_of_stock, inactive, hidden_product, archived, missing_inventory, cj_zero, media_score_low, destination_404, product_not_found. Media score 0-100: video +30, ≥5 photos +20, max dim >1200px +20, lifestyle +10, white-bg +10, multi-angle +10. Min publishable score = 60. Auto-logs to `pinterest_eligibility_log` with `source` label.

**Edge functions:**
- `pinterest-revenue-v4-bootstrap` — one-shot audit of pin/video/cinematic queues, marks ineligible rows, returns top eligible candidates with media_score ≥80.
- `pinterest-winner-replacement` (cron 04:00 UTC) — scans top performers, finds same-category in-stock replacements (price ±25%, media ≥80), enqueues new video queue row, logs to `pinterest_replacement_log`.
- `pinterest-queue-cleanup-daily` (cron 05:00 UTC) — marks ineligible queue rows and 7d duplicate destination URLs as `ineligible`/`duplicate`.
- `pinterest-revenue-v4-dashboard` — admin JWT-gated aggregator returning blocked-by-inventory, blocked-by-media, avg_media_score, replacements_generated, creative_winners, top_ctr_pins, v4 video pass-rate, creative_source_tiers.

**Tables (admin read, service write):** `pinterest_eligibility_log`, `pinterest_replacement_log`, `pinterest_winner_templates`.

**Columns:** `cinematic_ad_jobs.creative_source_tier` ('product_video' | 'photos' | 'ai'); `pinterest_runtime_settings.optimization_target` default 'sales'.

**Admin route:** `/admin/pinterest-revenue-v4` (lazy-loaded, `PinterestRevenueV4.tsx`).

**Source tier priority (item 5):** `pickCreativeSourceTier()` — product_video > photos (≥5) > ai. Wire into cinematic orchestrators before AI fallback.

**Voice Diversity Engine (item 13):** `_shared/voice-pool.ts` defines 8-voice pool (female/male × friendly/premium/energetic/{storytelling|trustworthy}) mapped to approved ElevenLabs IDs. `pickVoice()` enforces no >2 consecutive in same category and no >20% share of last 100 pins, then weighted-random by learned performance. `cinematic-voice-selector` now uses pool, records every choice in `pinterest_voice_assignments` (voice_name/voice_type/voice_style/elevenlabs_voice_id) and writes job.meta.voice. Cron `pinterest-voice-optimizer` (06:30 UTC) aggregates last-30d CTR / outbound / saves / purchases per (voice, category) into `pinterest_voice_performance`. Learned weights only activate after ≥50 pins in a category; otherwise neutral weights.

**Multi-Warehouse Engine (item 14):** `products` now carries `us_stock`/`eu_stock`/`cn_stock`/`primary_warehouse`/`fallback_active`. Single resolver `src/lib/warehouse-availability.ts` + edge mirror `_shared/warehouse-availability.ts` returns `{status, source, label, shippingLabel, estimatedDelivery, pinterestEligible, isFallback}`. Priority US → EU → CN; only `sold_out` when all three are 0. `computeAvailability` and `merchant-safe-product` defer to it so PDP, JSON-LD, OG, and GMC feed agree. `pinterest-eligibility` allows publishing when ANY warehouse > 0 (reason `all_warehouses_empty` replaces `cj_zero` when per-warehouse columns are present). `pinterest-video-publisher` hydrates `warehouseSource` and `sanitizeFallbackDescription()` strips any "out of stock" wording and appends `Available Again / Limited Stock / Worldwide Shipping` for CN/EU fallback. New table `warehouse_revenue_log` (events: `us_only_sale`, `cn_fallback_sale`, `eu_fallback_sale`, `missed_sold_out`). Daily cron `warehouse-missed-revenue-scan` (03:30 UTC) estimates missed revenue per fully-sold-out PDP at a 1.5% baseline CR. Admin dashboard tile `WarehouseInventoryPanel` on `/admin/pinterest-revenue-v4` (edge: `warehouse-inventory-dashboard`) surfaces counts (US only / EU fallback / CN fallback / sold out) and 30-day recovered vs missed revenue.
## Global Inventory & Revenue Engine V1 (2026-06-20)
- Generated columns on `products`: `effective_stock`, `inventory_source`, `inventory_priority`, `inventory_score`, `us_available` / `eu_available` / `cn_available`. All STORED, no app math needed.
- Priority: US (100) > EU (70) > CN (40). `inventory_score`: us>50=100, 20-50=90, 1-19=75, EU=60, CN=50, none=0.
- Pinterest eligibility now keys off `effective_stock`, not US-only.
- Fallback hooks: CN → ["Back In Stock","Still Available","Worldwide Shipping"]; EU → ["EU Warehouse","Fast EU Shipping","Limited Stock"]. Never mention China origin.
- New table `product_replacement_candidates` populated by `inventory-replacement-scan` (same category, ±20% price, priority-ordered).
- New `inventory-global-audit` edge function (admin-gated) returns US-only/EU-only/CN-only/sold-out/wrongly-marked/reactivatable counts + 30d revenue projection.
- `InventoryGlobalAuditCard` + replacement scan button mounted under `WarehouseInventoryPanel` on `/admin/pinterest-revenue-v4`.

## Gold Standard Creative System (2026-06-20)
- New columns on `cinematic_ad_jobs`: `creative_score`, `creative_score_voice|motion|product_visibility|conversion|brand`, `creative_quality_tier` (`low|medium|gold`), `gold_standard_benchmark_id`, `cloned_from_winner_id`.
- New settings columns on `cinematic_ad_settings`: `gold_standard_enabled` (true), `gold_standard_min_score` (80), `gold_standard_priority_score` (90), `gold_standard_reference_slug` (`cat-scratching-bed`).
- New tables: `pinterest_creative_benchmarks` (seeded with Cat Scratching Bed reference) and `pinterest_winner_dna` (top-performer voice/pacing/camera/CTA extracted for cloning). Both admin-read, service-write.
- Shared `supabase/functions/_shared/gold-standard-scorer.ts` derives the 5 axes from existing signals (final_creative_score, voice_score, ctr_prediction_score, realism_score, camera_motion_score, engagement_pacing_score, scene_change_count, product_fidelity_score, dense_caption_ratio, media_type). Voice penalised for robotic names, brand penalised when dense_caption_ratio > 0.15, product visibility target ≥ 80%. Static media + failed v4 cap the ceiling below gold.
- Edge function `gold-standard-audit` (admin JWT + `has_role`) scores up to 1500 jobs, persists creative_score + tier, returns counts (gold/medium/low). `gold-standard-winner-clone` aggregates 30d `pinterest_video_metrics`, picks the top 25 pins, persists DNA rows.
- `cinematic-ad-autopublish` now runs the Gold Standard scorer right after the V4 gate. Tier `low` → `publish_blocked_reason='gold_standard_below_80:<score>|reasons'`. Tier `gold` / `medium` continue down the existing publish path with score persisted on the row.
- Admin UI: `GoldStandardCreativePanel` on `/admin/pinterest-revenue-v4` exposes "Audit videos" and "Capture winner DNA" actions and surfaces scanned / gold / medium / low counts.

## Self-Healing Pinterest Engine V1 (2026-06-20)
- New tables: `pinterest_pipeline_settings` (singleton: target 48 pins/day, min 24, min pending videos 20 / pins 30, recovery <80, emergency <60), `pinterest_pipeline_health_snapshots`, `pinterest_pipeline_failures` (sources: pinterest_api, render, inventory, cj, supabase, storage, voice, media, other), `pinterest_pipeline_recovery_runs`. Admin-read, service-write.
- Shared `_shared/pipeline-health.ts` exposes `computeHealthScore()` (throughput 40 + depth 15 + failure 15 + dead-pipeline 15 + min-volume 15), `categorizeFailure()`, `nextRetryAt()` (1/5/15/60-min ladder, max 4 attempts), `recordFailure()`, `safeRecord()`.
- Edge functions:
  - `pipeline-health-monitor` (cron */5m) — snapshots queues + last-event ages, computes score, writes snapshot, sets `pinterest_pipeline_settings.current_mode`, and self-invokes `pipeline-auto-replenish` (videos<20 or pins<30), `pipeline-recovery-run` (score<recovery), `pipeline-emergency-content` (score<emergency).
  - `pipeline-auto-replenish` — winner priority: `effective_stock>0` ordered by `inventory_priority DESC`, `media_score DESC`; skips products already in queue; enqueues into `cinematic_ad_jobs` or `pinterest_pin_queue` with `source='self_healing_replenish'`.
  - `pipeline-recovery-run` (cron */30m + on-demand) — resets stuck rendering>20m and processing pins>10m, probes credit state + token expiry, kicks autopilot/drain/autopublish/failure-retry.
  - `pipeline-emergency-content` — when AI render unavailable, enqueues existing `pinterest_video_assets` (≥5s, stock>0) via `pinterest-video-publisher:queue_draft` so Pinterest never stalls.
  - `pipeline-failure-retry` (cron */1m) — replays unresolved failures on the 1/5/15/60 ladder, escalates to `monitoring_alerts` after 4 attempts.
  - `pipeline-health-dashboard` (admin JWT) — returns latest snapshot + 96-row trend + open failures + last 10 recovery runs.
- Admin UI: `PipelineSelfHealingPanel` mounted under `/admin/pinterest-revenue-v4` — health gauge, mode badge, 10 KPI tiles, open-failure feed, recovery feed, manual triggers.
- Quality Protection preserved: replenish reuses existing eligibility + Gold Standard gate; emergency mode publishes ONLY product video assets ≥5s with stock>0 — never static images, OOS, 404, or empty voice.
