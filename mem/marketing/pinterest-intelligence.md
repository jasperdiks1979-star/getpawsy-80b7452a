---
name: Pinterest AI Intelligence Engine
description: Self-learning analytics + winner/loser + trends + scheduling + attribution at /admin/pinterest-intelligence
type: feature
---
**Dashboard:** /admin/pinterest-intelligence — 7 panels via single edge `pinterest-intelligence-api?panel=headline|categories|variants|verdicts|windows|trends|revenue`.

**Tables:** pinterest_analytics_daily, pinterest_pin_dimensions, pinterest_category_benchmarks, pinterest_pin_verdicts, pinterest_loser_blocklist, pinterest_trend_signals, pinterest_competitor_pins, pinterest_posting_windows, pinterest_publish_governor, pinterest_funnel_events, pinterest_domain_health. pinterest_video_queue extended with priority, archived, winner_score.

**Crons:** analytics-sync hourly, benchmarks-rollup 6h, winner-detector 2h, trend-harvester+schedule-optimizer+domain-health daily 04/06/06:30 UTC.

**Winner rule:** impressions≥1000 AND CTR≥1.2×category avg AND save_rate≥max(cat_avg, 0.5%) → priority=90 + clone trigger via existing pinterest-video-clone-top-performers. **Loser:** CTR<0.5×avg AND saves<0.5×avg → archived=true + 30d blocklist.

**Trend source:** US seasonal calendar (12 months) + evergreen pet keywords. Pinterest Trends API is gated; competitor scrape function stubbed for future.

**Attribution:** pinterest_funnel_events insertable by anon (RLS) so client `enqueueCapiEvent` can write; admin reads via has_role.
