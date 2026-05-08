---
name: Pinterest Creative Intelligence Engine
description: Hook strategy + multi-axis quality scoring + retry loop + composite winner tables on top of pinterest-creative-director
type: feature
---
**Pipeline:** `pinterest-creative-director/index.ts` now does niche → pattern → `pickStrategy()` (hook category + headline + cta + scene directive) → `generateBriefs` (locked to strategy) → `renderScene` → `scorePin` (5 axes: mobile_safety, visual_balance, readability, viral_potential, pinterest_native; weighted total, threshold 78). Failed renders auto-retry up to MAX_RETRIES=2 with rejection reasons fed back into the next brief.

**Files:** `_shared/pinterest-hooks.ts` (10 hook categories + bank + epsilon-greedy `pickStrategy`), `_shared/pinterest-quality.ts` (deterministic checks + Gemini multimodal scorer using `google/gemini-2.5-flash`).

**Tables (admin RLS):** `pinterest_render_attempts` (every attempt + scores + reasons), `pinterest_creative_winners` (per-pin composite from Pinterest analytics + GA4 + Profit Engine), `pinterest_pattern_weights` (rolled up `(pattern_id, hook_category, niche_key)` weights consumed by `pickStrategy`). `pinterest_pin_queue.meta` JSONB now stores `intelligence.{scores,attempt_count,hook_category,pattern_id,rationale}` per accepted draft.

**No GEMINI_API_KEY.** All AI calls go through Lovable AI Gateway. Models: image `google/gemini-3-pro-image-preview`, text/strategy `google/gemini-3-flash-preview`, quality scorer `google/gemini-2.5-flash`.

**Pending follow-ups:** `pinterest-winner-rollup` cron (Pinterest analytics + GA4 + Profit verdict → composite_score → pattern_weights), admin "Top performers" table on `/admin/pinterest-patterns`, and Score column + Auto-rejected filter on `/admin/pinterest-pin-status`.