---
name: Pinterest US Traffic Filter (V3)
description: US-share scoring + state long-tail injection inside the Pinterest Growth Engine
type: feature
---
**Shared lib:** `supabase/functions/_shared/pinterest-us-keywords.ts` — `US_TITLE_SUFFIXES`, `US_STATES_TOP` (15), `US_LONGTAIL_BY_NICHE` (11 niches), `detectNicheLite`, `pickUsKeywords`, `pickUsState` (deterministic by slug). `US_SHARE_TARGET=0.8`, `US_SHARE_FLOOR=0.3`.

**Engine integration (`pinterest-growth-engine` v3-us):**
- `computeUsShares(sb)` rolls last-30d `visitor_activity` rows where `utm_source ILIKE '%pinterest%'` AND `is_internal=false`, returning per-product and per-board US share + overall sample size.
- `scoreProduct` gains a 0–30 `usBoost` (`shareUs * 30`) — products that already convert US visitors rank higher in the slate.
- `autoApproveSafeDrafts` sorts drafts by board US share desc, demotes any board with `us_share < 0.3` to last-resort (archived with reason `v3-us: board us_share … < 0.3` when alternatives have capacity), and stamps approved drafts with `meta.us_focus=true`, `meta.us_keywords[]`, `meta.us_state_focus`, `meta.us_board_share`, `meta.us_product_share`, `meta.niche_detected`, plus `pinterest_pin_queue.us_audience_score = round((boardShare*60 + productShare*40) * 100)`.
- `callCreativeDirector(slug, count, { us_focus, us_keywords, us_state, niche })` — directors get US hints so newly generated titles/overlays favor US phrasing without breaking the ≤5-word title / ≤6-word overlay rules.

**Dashboard panel (`usTraffic`):** `overall_share`, `target` (0.8), `floor` (0.3), `sample_size`, `board_count_tracked`, `product_count_tracked`, `top_us_boards[]`.

**Report fields (run report v3-us):** `usSharesByPickedProduct{}`, `usIntelligence{}`, `approval.skippedLowUs`, `approval.boardsBelowUsFloor`, `config.usShareFloor`, `config.usShareTarget`.

**Safety:** US filter never overrides hard guardrails (sandbox boards, missing image/link, inactive products, per-board cap, generic-board demotion, ≤5-word title, banned CTA overlays).