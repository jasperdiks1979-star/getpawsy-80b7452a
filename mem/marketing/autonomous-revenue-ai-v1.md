---
name: Autonomous Revenue AI V1
description: Revenue-first self-learning Pinterest engine on top of V4/V5, Gold Standard, Self-Healing — optimizes for outbound clicks, ATC, checkouts, purchases, revenue (not impressions/views)
type: feature
---
Tables (admin-read, service-write):
- `revenue_ai_pin_performance` — per-pin daily rollup + tier (top_1/5/10/loser)
- `revenue_ai_winner_dna` — per-dimension EWMA winner DNA (voice/hook/cta/category/duration/opening/camera)
- `revenue_ai_loser_blocklist` — pin & pattern blocks with auto-expiry
- `revenue_ai_voice_rankings` — voice allocation_weight (top 20% = 2x base, bottom 20% = 0.25x)
- `revenue_ai_category_profiles` — winning recipes per category
- `revenue_ai_trend_signals` — daily direction + recommended_quota_multiplier (rising 1.5x, falling 0.5x)
- `revenue_ai_revenue_scores` — product composite (stock15/ctr15/sales30/media15/pinterest25) → publish_multiplier
- `revenue_ai_executive_reports` — nightly 24h/7d KPIs + promote-more/less lists
- `revenue_ai_settings` (singleton)

Edge functions:
- `revenue-ai-perf-rollup` (`*/30 * * * *`) — joins pin perf + visitor scores + queue meta
- `revenue-ai-winner-detect` (`7 * * * *`) — EWMA α=0.3, loser flag at ctr < 0.6×account_avg & purchases=0 & imp≥2000
- `revenue-ai-loser-suppress` (`12 * * * *`) — blocks (category|hook|voice) patterns with n≥3, imp≥5000, 0 purchases for 14 days
- `revenue-ai-revenue-score` (`25 */2 * * *`) — composite tiers hero/winner/contender/tail → 3.0/2.0/1.0/0.5x publish
- `revenue-ai-queue-guard` (`*/5 * * * *`) — floors 100 video / 50 pin / 20 reserve, invokes pipeline-auto-replenish
- `revenue-ai-voice-allocator` (03:00) — min 10 pins per voice
- `revenue-ai-category-profile` (03:15)
- `revenue-ai-trend-detect` (03:30)
- `revenue-ai-product-eliminator` (04:00) — OOS, media<40, rating<3.5 w/ ≥5 reviews → tier=tail + 30d block
- `revenue-ai-executive-report` (05:00 UTC) — nightly summary
- `revenue-ai-winner-clone` (on-demand) — fuses top DNA per dimension + winner product → cinematic-ad-autopublish (Gold Standard enforced)
- `revenue-ai-failover` — AI render → product video → cinematic slideshow → backup voice → requeue
- `revenue-ai-dashboard` — admin GET
- `revenue-ai-orchestrator` — chains all in correct order ("Run full loop")

Admin UI: `/admin/revenue-ai` mounts `AutonomousRevenueAiPanel` on top — KPI grid, voice rankings, top revenue products, category trends, loser blocklist, latest executive report, one-click engine controls.

Quality: cloned creatives MUST pass Gold Standard ≥80 (no bypass). Loser suppression honors Category Diversity Governor. Eliminator uses `effective_stock` (global warehouse engine).