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