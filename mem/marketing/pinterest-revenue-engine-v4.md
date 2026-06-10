---
name: Pinterest Revenue Engine V4
description: US-domination + winner amplification + keyword/title banks + 6h self-healing loop on top of existing Pinterest Growth Engine
type: feature
---
**Edge function:** `pinterest-revenue-engine-loop` (service-role). Actions: `loop`, `snapshot_us`, `score_boards`, `tier_products`, `expand_keywords`, `generate_titles`, `regen_losers_top50`, `dashboard`.

**Crons:**
- `pinterest-revenue-engine-loop-6h` (`15 */6 * * *`) — full loop every 6h.
- `pinterest-us-snapshot-daily` (`0 3 * * *`) — backup US/CA/AU snapshot.

**Shared lib:** `_shared/pinterest-priority-categories.ts` — `PRIORITY_CATEGORIES` (smart-litter / cat-trees / cat-furniture / luxury-beds / smart-gadgets), `PRIORITY_CATEGORY_FLOOR=0.7`, `countryWeight()` (US=1.0, CA=0.6, AU=0.4, other=0.1), `EVENT_WEIGHTS` (click=5, save=4, outbound=8, conversion=15).

**Tables:**
- `pinterest_keyword_bank` — per-product long-tail bank, AI-expanded (50/winner, capped at 30 stored).
- `pinterest_title_variants` — 3–5 word title variants, AI-generated per winner.
- `pinterest_us_share_daily` — daily total/us/ca/au/other clicks + weighted_score + top US boards/products jsonb.
- `pinterest_product_tiers` — winner/neutral/loser/untested + score (revenue dominates) + 30d metrics.
- `pinterest_boards` (+columns) — `health_score` (0–100 composite: CTR 40% + US share 30% + revenue 20% + volume 10%), `tier` (top/mid/low/blacklisted), `us_share_30d`, `clicks_30d`, `saves_30d`, `revenue_cents_30d`, `last_scored_at`.

**Growth engine integration (`pinterest-growth-engine` patched):**
- `computeUsShares` now uses tier-1 weighted credit (US=1.0, CA=0.6, AU=0.4, other=0.1).
- `selectProducts` enforces **70% priority-category floor** before falling back to other categories, AND **70/25/5 winner/neutral/loser quota** sourced from `pinterest_product_tiers`. Report adds `tierDistribution` + `priorityCategoryShare`.

**Tier rules (computed in `tierProducts`):**
- WINNER: 30d revenue ≥ $5.00 OR ≥1 purchase OR (CTR ≥ 1.5% AND ≥20 clicks).
- LOSER: ≥800 impressions AND ≤2 outbound clicks.
- UNTESTED: <200 impressions.
- NEUTRAL: everything else.

**No auto-publish.** Drafts still flow through V2 enforcement (≤5-word titles, ≤6-word overlays, banned CTAs, generic-board demotion) and V3 US filter (board US-share floor 0.3).

**Dashboard:** existing `/admin/pinterest-revenue-engine` extended; loop data fetched via `pinterest-revenue-engine-loop?action=dashboard`.