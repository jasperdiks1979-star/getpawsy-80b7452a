---
name: Voice rotation V4
description: 7-voice roster (Jessica/Emma/Sophie/Olivia/James/Ryan/Michael) with 80/20 female:male share and 3-consecutive ban
type: feature
---
- Pool defined in `supabase/functions/_shared/voice-pool.ts`. Single source of truth — `cinematic-voice-selector` and any consumer of `pickVoice()` inherit changes automatically.
- `ROTATION_RULES`: `CONSECUTIVE_BAN_AT = 3` (a voice is blocked when the last 3 picks in its category were all identical), `GLOBAL_CAP_PCT = 0.20`, `FEMALE_TARGET_SHARE = 0.80`, `MALE_TARGET_SHARE = 0.20`.
- Gender bias is multiplied into the candidate weight (`PER_FEMALE_BIAS = 0.80/4 = 0.20`, `PER_MALE_BIAS = 0.20/3 ≈ 0.067`), so weighted random sampling trends toward 80/20 over time.
- Recency penalty (×0.5) still applied to the single most-recent voice in category to avoid back-to-back picks.
- Only `Jessica` uses a canonical ElevenLabs ID (`cgSgspJ2msm6clMCkdW9`). Emma/Sophie/Olivia/James/Ryan/Michael are seeded from the previous approved roster — overwrite `cinematic_voice_profiles.voice_id` to swap real IDs without code changes.
- Old `cinematic_voice_profiles` rows are marked `active = false`; new roster inserted with `active = true` and weights summing 1.00 (4×0.20 female + 3×~0.067 male).
- All assignments still recorded to `pinterest_voice_assignments` for history-driven rotation.