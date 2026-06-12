## Pinterest Recovery Engine (pre-Stage 2)

Goal: fix duplicate density, board concentration and creative fatigue so Stage 2 becomes smaller/safer. No deletes this phase.

Reuses existing infrastructure where possible — `pinterest_creative_pools`, `pinterest_pin_queue`, `pinterest_pin_performance`, `pinterest_boards`, `pinterest_creative_winners`, `pinterest-creative-director`, `pinterest-revenue-brain`. Only adds what's missing.

### 1. Creative Variety Engine (new)
New edge function `pinterest-creative-variety`. Action `seed_pools` (idempotent, force=true to overwrite).
- For each category: `cat_trees, cat_litter_boxes, self_cleaning_litter, cat_essentials, dog_travel, pet_furniture`
- Calls Lovable AI gateway (`google/gemini-3-flash-preview`) to generate 100 headlines (≤42 chars), 100 overlays (≤32), 100 CTAs (≤18), 100 descriptions (≤180) per category — all validated against the banned-phrase list and `pinterest-copy-standards` memory.
- Stores into existing `pinterest_creative_pools` (kind ∈ headline/overlay/cta/description, category, text, score=0, wins=0, impressions=0, banned=false).
- 6 cats × 4 kinds × 100 = 2,400 rows.

### 2. Anti-Duplication Governor (new)
New table `pinterest_governor_rules` (admin-only RLS) + helper function `public.governor_check_pin(p_slug text, p_board_id text, p_headline text, p_overlay text, p_cta text) returns jsonb`. Returns `{allowed, violations[]}`.

Rules enforced:
- ≤8 active pins per product slug (status in `published`/`queued`)
- ≤2 active pins per board per slug
- a given headline/overlay/cta cannot reappear within the last 90 published pins

Wired in publisher path (`pinterest-creative-director` + `pinterest-viral-batch` insert loops) — on violation: quarantine via `quarantineEvent` + skip insert (same pattern as visual-duplicate guard).

### 3. Banned Phrase Protection (data + governor)
Seed `pinterest_governor_rules.banned_phrases jsonb`:
- "Stop Scooping So Much"
- "Stop Buying Cheap Cat Trees"
- "Why Cat Owners Are Switching"
- "Cats Are Obsessed With This"
- plus any headline/overlay with count >20 in `pinterest_pin_queue` (computed nightly)

Action `retire_phrases` on `pinterest-creative-variety`:
- Marks matching pool rows `banned=true` so picker excludes them.
- Flags **queued** (not-yet-published) pins with these phrases as `status=rejected, meta.reason=banned_phrase` — published ones left intact (history).
- Auto-replaces by re-drafting via creative-director with `excludePhrases` hint.

### 4. Board Diversity Engine (governor + picker)
New scorer in `pinterest-creative-director` board picker:
`score = base_relevance − concentration_penalty(board_share_30d)`
Hard caps the top-3 dominant boards to a combined ≤60% share; targets ≥25% diversity (Gini-like spread across boards with ≥1 pin/30d). Diversity computed once per run from `pinterest_pin_queue` last 30d.

### 5. Product Expansion Engine (new view + queue)
New view `pinterest_product_pin_coverage` — per active product: active_pin_count, last_published_at, category, tier.
New action `expand_underrepresented` on `pinterest-creative-variety`:
- Picks products where `active_pin_count = 0` → priority 100, `<3` → priority 90.
- Cap 50/run. Calls `pinterest-creative-director` with diversity-aware briefs (pulls from new pools, respects governor).

### 6. Pinterest Revenue Engine (reuse + thin wrapper)
Already implemented: `pinterest-revenue-brain` + `pinterest-creative-winners` + `pinterest_pattern_weights`.
Add only: `allocation_policy` row in `pinterest_runtime_settings` → `{winners: 0.8, exploration: 0.2}`. `pinterest-creative-director` `pickStrategy` reads this and biases epsilon accordingly (winners drawn from `pinterest_creative_winners` top-quartile by composite_score; exploration uses fresh pool entries).

---

### Execution order (this turn)
1. Migration: `pinterest_governor_rules`, `pinterest_product_pin_coverage` view, GRANT + RLS, allocation_policy row.
2. Edge function `pinterest-creative-variety` (actions: `seed_pools`, `retire_phrases`, `expand_underrepresented`, `recompute_density`, `run_full`).
3. Patch publisher paths (`pinterest-creative-director/index.ts`, `pinterest-viral-batch/index.ts`) to call governor + diversity scorer.
4. Run `seed_pools` (2,400 rows) → `retire_phrases` → `expand_underrepresented` dry-run → `recompute_density`.
5. Output: new duplicate density %, board diversity %, refreshed Stage 2 candidate count + CSV, and explicit Stage 2 recommendation (proceed / shrink / skip).

### Out of scope
- No deletes, no flips to `removed_by_cleanup`.
- No Pinterest API publishes — pools + governor only.
- No new dashboards (data visible via existing `/admin/pinterest-pin-status` and `/admin/revenue-brain`).
- Pinterest Trends API still gated (uses internal proxy).

### Files
- create `supabase/functions/pinterest-creative-variety/index.ts`
- edit `supabase/functions/pinterest-creative-director/index.ts` (governor + board diversity + allocation)
- edit `supabase/functions/pinterest-viral-batch/index.ts` (governor call)
- new migration (rules table, coverage view, grants, RLS, settings row)
- edit `supabase/config.toml` (register new function)
- update `mem://marketing/pinterest-anti-duplication-governor.md`

Approve to proceed, or tell me to slim (e.g. skip Product Expansion or skip publisher patching this turn).
