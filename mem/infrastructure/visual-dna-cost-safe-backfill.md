---
name: Visual DNA cost-safe backfill
description: cie-v4-dna-backfill runs deterministic-first (local dHash/palette/brightness), trips a 402 circuit breaker and defers AI enrichment to a backlog.
type: feature
---
`cie-v4-dna-backfill` (cron `cie-v4-dna-backfill-hourly`, `13 * * * *`) must never storm the AI gateway.

- Deterministic pass is always free: `_shared/deterministic-visual-dna.ts` computes dHash (via `_shared/pinterest-phash.ts`), 5-swatch palette, brightness/contrast/saturation/warmth/texture → `gcd_visual_dna`, mirrored into `gcd_creatives`.
- AI semantic enrichment is optional. First `402`/`403` sets `gcd_backfill_state` (id=1) `paused=true` + `resume_after=now()+6h`; no further gateway calls that run, and paused runs make zero calls.
- Pending semantic work is parked in `gcd_visual_dna_backlog` with `status='deferred_due_to_credits'`.
- `gcd_visual_dna` is analytics/learning only — Pinterest publishing and duplicate prevention use `pinterest_pin_queue.pin_image_phash`, not GCD.
