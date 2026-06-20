# Voice Diversity Engine (Item 13)

Adds intelligent voice rotation + per-category voice optimization to the cinematic ad pipeline.

## 1. Voice Pool (static config)

New shared module `supabase/functions/_shared/voice-pool.ts` exports 8 voices mapped to ElevenLabs voice IDs:

| voice_name | voice_type | voice_style | elevenlabs_id |
|---|---|---|---|
| Female Friendly | female | friendly | EXAVITQu4vr4xnSDxMaL (Sarah) |
| Female Premium | female | premium | XrExE9yKIg1WjnnlVkGX (Matilda) |
| Female Energetic | female | energetic | Xb7hH8MSUJpSbSDYk0k2 (Alice) |
| Female Storytelling | female | storytelling | FGY2WhTYpPnrIDTdsKH5 (Laura) |
| Male Friendly | male | friendly | TX3LPaxmHKxFdv7VOQHJ (Liam) |
| Male Premium | male | premium | JBFqnCBsd6RMkjVDRZzb (George) |
| Male Energetic | male | energetic | bIHbv24MWmeRgasZH58o (Will) |
| Male Trustworthy | male | trustworthy | onwK4e9ZLuTAKqWW03F9 (Daniel) |

Exports `pickVoice({ category, recentVoices, performanceWeights })`:
- Hard rule: skip voice if last 2 pins in same category used it
- Hard cap: skip voice if it represents ≥20% of last 100 pins globally
- Weighted random by `performanceWeights[voice_name]` (default 1.0 when no data)

## 2. New tables (single migration)

- `pinterest_voice_assignments` (pin_id, queue_id, cinematic_job_id, product_id, category, voice_name, voice_type, voice_style, elevenlabs_voice_id, assigned_at)
- `pinterest_voice_performance` (voice_name, category, pins_count, impressions, ctr, outbound_clicks, saves, purchases, conversion_score, updated_at; unique(voice_name, category))

Both: admin SELECT via `has_role`, service_role ALL.

## 3. Wiring

- `cinematic-ad-orchestrator` (or `_shared/voiceover-selector.ts`): before TTS request, call `pickVoice()`, persist row in `pinterest_voice_assignments`, store `voice_name/type/style` on `cinematic_ad_jobs.meta.voice` and `pinterest_video_queue.meta.voice`.
- `pinterest-video-publisher`: copy `voice_*` fields into `pinterest_video_assets.meta.voice` and `pinterest_pin_queue.meta.voice` at publish.

## 4. New edge function `pinterest-voice-optimizer` (cron daily 06:30 UTC)

For each (voice_name, category):
1. Join `pinterest_voice_assignments` + `pinterest_pin_performance` + `pinterest_revenue_attribution_v3` for last 30d
2. Aggregate impressions, CTR, outbound, saves, purchases
3. Compute `conversion_score = 0.5*purchases_per_pin + 0.3*outbound_rate + 0.15*save_rate + 0.05*ctr`
4. Upsert into `pinterest_voice_performance`
5. Only categories with ≥50 pins get a non-uniform `performanceWeights` written to `app_config.voice_performance_weights` (JSON keyed by category → voice_name → weight 0.1–2.0)

## 5. Admin panel addition on `/admin/pinterest-revenue-v4`

New "Voice Diversity" card showing: per-voice share of last 100 pins (with 20% cap line), top performing voice per category, last 30d conversion_score table.

## Out of scope

- New voices, voice cloning, multi-language voices
- Changing existing voiceover script/length logic
- Touching V5 engine

Approve to ship migration + voice-pool + orchestrator wiring + optimizer cron in one pass.
