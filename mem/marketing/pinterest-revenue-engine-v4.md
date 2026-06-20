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