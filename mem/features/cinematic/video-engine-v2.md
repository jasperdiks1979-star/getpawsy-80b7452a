---
name: Cinematic video engine v2
description: Vertical mobile-safe ad engine — scene planner, hook AI, QA v2, creative DNA
type: feature
---
- 9:16 mobile safe zone: 12% top, 22% bottom (CTA), 6% sides via `remotion/src/lib/safeZone.ts`
- Scene planner enforces 5–12 unique scenes with non-repeating motion/crop hashes (`remotion/src/lib/scenePlanner.ts`)
- Hook AI: `cinematic-ad-hook-generator` picks strongest of 3 candidates across 10 hook types
- QA v2 in `cinematic-ad-validate` scores motion_diversity, scene_diversity, caption_visibility, hook_strength, pacing_quality, visual_energy, retention_likelihood, cta_clarity, mobile_readability — auto-rejects below `cinematic_ad_settings.min_*` floors (defaults 40/40/70)
- Style presets: `pinterest_native` (default) and `tiktok_native` in `cinematic_ad_style_presets`
- Creative DNA: `cinematic_creative_dna` table + `cinematic-ad-dna-bias` edge function (actions: top/record/score_all) biases planner toward winning patterns
- Admin UI: `CreativeDNAPanel` mounted in Cinematic Ads Control Center
- All migrations additive, all v2 fields nullable with defaults — engine remains backward compatible (engine_version='v2' default)
