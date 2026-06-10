---
name: Pinterest Growth Engine
description: Autonomous daily orchestrator — product selection, variant generation, safe auto-approval, dashboard at /admin/pinterest-growth-engine
type: feature
---
**Edge function:** `pinterest-growth-engine` (service-role, no JWT). Actions: `run`, `dashboard`, `status`.

**Daily cron:** id 119 `pinterest-growth-engine-daily` at 13:00 UTC → POST `{"action":"run"}`.

**Run flow:** select top-N active products (image+margin+price+performance score, excludes recently-used 5d) → call `pinterest-creative-director` action=`run_full` per product (variants=3) → auto-approve drafts whose `meta.intelligence.scores.total >= 78` AND board is production (is_sandbox=false, is_blacklisted=false, production_verified=true) AND pin_image_url+destination_link present AND product still active AND per-board daily cap (3) not hit → archive draft variants of underperformers (verdict=loser last 30d).

**Safety guardrails (hard halt if violated):** no sandbox boards, no missing image, no missing destination, no inactive products, no products without slug. Run is aborted with HTTP 412 `NO_PRODUCTION_BOARDS` when no production board exists.

**Dashboard:** `/admin/pinterest-growth-engine` — today's published, 7d impressions/clicks/saves/CTR, 30d Pinterest-attributed revenue (orders.utm_source='pinterest'), top boards/products, 14d trend table, "Run Now" button.

**Defaults:** productsPerRun=8, variantsPerProduct=3, perBoardDailyCap=3, autoApproveScoreThreshold=78, minMarginPct=0.25. Override via POST body.

**Run log:** `pinterest_evolution_log` rows with `decision_type='growth_engine_run'` and full report in `metrics` jsonb.
