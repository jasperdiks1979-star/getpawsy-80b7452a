---
name: Pinterest Psychology Engine (PPE)
description: Story-first, multi-candidate, hard-gated PCIE-V2 subsystem optimized for CTR, saves, outbound clicks, product visibility, US relevance, and scroll-stop power.
type: feature
---
**Core principle:** Before rendering, the AI must answer: "If I were a US Pinterest user who had never heard of GetPawsy, would THIS image make me stop scrolling and click?" Uncertain → DO NOT RENDER, improve concept first.

**Layered on PCIE-V2 — no duplicate engines.** Implemented as new pipeline stages + scoring axes + storage tables, all toggled via the existing `pcie_v2_feature_flags` / `pcie_v2_config` / `pcie_v2_pipeline_stages` / `pcie_v2_scoring_axes` tables so the legacy director keeps working when `ppe_enabled=false`.

**Shared module:** `supabase/functions/_shared/ppe-engine.ts`
- `buildStoryProfile({niche,title,slug})` — deterministic per-niche Story Bank (12 niches) covering story, primary/secondary emotion, desired response, buying motivations, target customer, scene suggestions. `detectNicheKey` maps free-form input to a bank entry.
- `pickRotatingBadge(sb)` — picks a least-recently-used badge from `ppe_brand_badges` (30 seeded) within a 14-day window, randomized over the bottom-quintile to avoid lockstep cycling.
- `rewriteSupplierTitle(raw, niche)` — reuses `cleanProductTitleForPinterest` from `pinterest-geo-intelligence.ts` so the US Geo title contract stays the single source of truth.
- `buildAttentionMap({hookLen,productHero,hasBadge,hasCta})` — deterministic 5-slot map enforcing the Product → Animal → Emotion → Brand → CTA reading order, with a 0-100 balance score.
- `predictCandidate(ctx)` — single Lovable AI Gemini-flash call (JSON-mode) returning per-axis 0-100 scores (`ctr_prediction`, `save_prediction`, `purchase_prediction`, `product_visibility`, `scroll_stop`, `novelty`, `us_relevance`), `competitor_verdict` ∈ {wins,ties,loses}, `would_click`, `reasons`, `improvements`. Fails closed to a 70-score floor so the pipeline keeps moving when the gateway is unavailable.
- `compositePpeScore(scores)` — weighted blend (CTR .22, scroll_stop .18, visibility .20, save .10, purchase .12, novelty .08, us .10).
- `ppeFloors(cfg)` — pulls visibility/ctr/novelty/composite floors from DB config.

**New PCIE-V2 stages registered by handler key in `pcie-v2-creative-director/index.ts`:**
`ppe_story_profile` (35) → `ppe_badge` (55) → `ppe_title_rewrite` (58) → `ppe_attention_map` (72) → `ppe_predict` (88) → `ppe_competitor_sim` (92) → `ppe_persist` (96). Each stage is a pure handler in `STAGE_HANDLERS`; disabling via `pcie_v2_pipeline_stages.enabled=false` removes it without code changes.

**Publish gate upgrade (`publish` stage):** Reads PPE scores via `ctx.ppe_scores` and `ctx.ppe_composite` and rejects with `reject_reason='ppe_gate:<failed_axes>'` if any of: `product_visibility<95`, `ctr_prediction<95`, `novelty<96`, `composite<92` (floors live in `pcie_v2_config` keys `ppe_visibility_floor` / `ppe_ctr_floor` / `ppe_novelty_floor` / `ppe_composite_floor`). The competitor simulation stage rejects with `reject_reason='competitor_sim:loses'` whenever the LLM verdict is `loses`.

**Multi-candidate competition:** When `ppe_enabled` AND `ppe_multi_candidate` are true, `candidatesPerRun` is forced into `[ppe_min_candidates=8, ppe_max_candidates=12]`. Winner = highest `ppe_composite` (fallback `novelty_total`), then `pcie_v2_creatives.ppe_winner=true` and `ppe_candidate_scores.winner=true` are set; losers stay in the DB for explainability.

**New tables (admin-read RLS, service-write):**
- `ppe_story_profiles` — cached story per `(niche, product_slug)` (unique index uses `COALESCE`, not a constraint, because expressions are not allowed in `UNIQUE (...)`).
- `ppe_brand_badges` (30 seeded) + `ppe_badge_usage` (rotation tracking).
- `ppe_candidate_scores` — per-candidate predictive scores, attention map, badge, story, primary emotion, competitor verdict, winner flag, raw payload.
- `pcie_v2_creatives` extended with `ppe_payload jsonb`, `ppe_composite int`, `ppe_winner bool` (non-breaking).

**Edge function `ppe-engine`:**
- `?action=snapshot` — dashboard rollup: 24h/7d composites, CTR, visibility, scroll-stop averages, competitor win/lose counts, recent winners, top rejection reasons, badge rotation, recent creatives.
- `?action=simulate` — preview a story profile + badge + title rewrite + attention map for a supplier title (no writes).
- `?action=analyze` — upsert a `ppe_story_profiles` cache row.
- `?action=score` — re-score a concept on demand (returns LLM predict + composite).

**Admin UI:** `PinterestPsychologyEnginePanel` added to `/admin/pinterest-health` (no new page). Shows floors, sample sizes, composite/CTR/visibility/scroll-stop averages, competitor wins/loses, recent winners with story + emotion + badge + verdict, rejection reasons, badge rotation, and an inline "Simulate" form that calls `ppe-engine?action=simulate`.

**Prompt version bump:** `pcie_v2_creatives.prompt_version` is now `pcie_v2.2-ppe` whenever the PPE stages run. This is the field to filter on for any backward-compatibility queries.

**Backward compatibility:** Flip `ppe_enabled=false` in `pcie_v2_feature_flags` to fully disable PPE — all PPE stages early-return, no PPE rows are written, and the legacy publish gate is unchanged.