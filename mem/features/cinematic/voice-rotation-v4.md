---
name: Voice rotation V4
description: 8-voice V5 roster across 4 tiers (35/35/20/10) with 2-consecutive ban and CTR-weighted uplift
type: feature
---
- Pool defined in `supabase/functions/_shared/voice-pool.ts`. Single source of truth — `cinematic-voice-selector` and any consumer of `pickVoice()` inherit changes automatically.
- V5 roster (8 voices): tier `female_a` Jessica+Emma (35% total), `female_b` Sophie+Olivia (35%), `male` James+Ryan (20%), `premium_experimental` Charlotte+Brian (10%).
- `ROTATION_RULES`: `CONSECUTIVE_BAN_AT = 2` (never twice in a row), `GLOBAL_CAP_PCT = 0.25`, tier targets `{female_a:0.35, female_b:0.35, male:0.20, premium_experimental:0.10}`, performance weight clamped to `[0.5, 2.5]`.
- Tier bias = `target_share / tier_count` is multiplied into the candidate weight, so weighted random sampling trends toward the 35/35/20/10 mix over time.
- Auto-uplift: pass `performanceWeights[voice]` from the `cinematic_voice_performance_v` view (CTR over last 30d) — voices with higher CTR get linearly higher weight up to 2.5×.
- Recency penalty (×0.3) on the single most-recent voice; back-to-back guaranteed blocked by the 2-consecutive ban.
- All assignments still recorded to `pinterest_voice_assignments` for history-driven rotation.