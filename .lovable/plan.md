# Pinterest Video Revenue Engine V4 + Stripe Webhook Audit

This is a large multi-track request. I want to confirm scope and sequencing before shipping it, because several parts overlap with systems that already exist (Recovery Engine, Revenue AI V1, V4 Quality Gate, Self-Healing pipeline) and a few parts need real keys / live calls.

## Track 1 — Stripe webhook audit (CRITICAL, do first)

1. Inspect `supabase/functions/stripe-webhook` source + deploy state.
2. Probe the endpoint live (GET + POST without signature) to confirm 200/400 behavior and signature enforcement.
3. Query DB: `cron_job_logs`, `orders` (last paid/pending), `checkout_funnel_events`, `disputes` to confirm whether it still drives revenue.
4. Reuse existing `webhook-health` edge function output.
5. Verdict matrix:
   - **In use** → repair signature/200, run end-to-end Stripe test event, document.
   - **Legacy/Skidzo** → mark legacy in code header + memory, do NOT delete (safer); add admin note.
6. Deliver short CRITICAL / WARNING / SAFE report in chat.

## Track 2 — Golden Reference video (`pin.it/73g2ln0as`)

`pin.it` short links cannot be resolved server-side without the full pin id. **I need either the expanded `pinterest.com/pin/<id>` URL, or the MP4 uploaded to the project**, otherwise I cannot analyze voice-over / pacing / hook for real.

Assuming I get it, I will:
- Insert it into `pinterest_creative_benchmarks` as `tier='gold_standard'`.
- Persist the quality profile (hook, voice style, pacing, CTA, motion) into a new row in `cinematic_creative_dna` tagged `source='gold_standard'`.
- Wire `cinematic-ad-validate` to compare new jobs against the gold profile (cosine similarity on the structured profile) and add a `gold_match_score` field.

## Track 3 — Creative Quality Filter (publish gate)

New scoring contract on `cinematic_v4_jobs`:
`hook_score, voice_score, product_visibility_score, motion_score, visual_score, conversion_score, engagement_score` → `total_quality_score`.
Gate inside `cinematic-ad-autopublish`:
- `<85` → status `quality_rejected`
- `85–89` → status `quality_hold` (queued for hook/voice reroll)
- `≥90` → publish

Reuse existing v4 scoring fields; add the missing dimensions and the gate.

## Track 4 — Voice Over Engine V2

New table `cinematic_voice_rotation` (5 voice profiles seeded: warm_female, energetic_female, premium_female, warm_male, storyteller_male) + last-used timestamp. Edge function `voice-rotation-pick` returns the least-recently-used voice not used in the last N pins for that product/niche. Wire into `cinematic-ad-generate-voice`.

## Track 5 — Video Generation Rules (hard bans)

Update `cinematic-ad-validate`:
- Reject when `media_type='static'` (already partly done by quality gate).
- Reject when `voiceover_url IS NULL`.
- Reject when `scene_change_count < 4` (slideshow heuristic).
- Reject when source asset hash matches CJ supplier library (new `cj_supplier_asset_hashes` table; seeded from existing `pinterest_image_blocklist` + `product_media_audit`).

## Track 6 — Inventory Intelligence Engine

Already mostly built in the **Global Product Recovery Engine** (last ship). I'll add the explicit 3-scenario tagger `inventory_promotion_status` (`PROMOTE | PROMOTE_LONG_ETA | DO_NOT_PROMOTE`) computed from `product_global_inventory` and wire it into:
- `pinterest-auto-replenish` (skip `DO_NOT_PROMOTE`)
- `cinematic-ad-autopublish` (skip `DO_NOT_PROMOTE`)
- PDP delivery badge (show longer ETA for `PROMOTE_LONG_ETA`).

## Track 7 — Durian Cat Scratching Bed re-audit

Re-run `product-global-audit` + `supplier-discovery` for `cj_product_id=2006968402615898113`. Previous audit returned worldwide stock = 0 and CJ status = 3 (off-shelf). I'll re-confirm against live CJ and ship a short verdict; no code change unless stock reappeared.

## Track 8 — Pinterest Continuity Engine

New cron `pinterest-continuity-tick` (every 30 min):
- Count rows in `pinterest_pin_queue` where `status in ('queued','rendering')`.
- Count `cinematic_v4_jobs` where `status='ready_to_publish'`.
- If publishable videos `<20`, enqueue generation jobs for top-ranked products (Track 9 ranking).
- Severity log to `pinterest_pipeline_health_snapshots`:
  - `<20` → info, `<10` → warning, `<5` → critical, `0` → page-out via existing `pipeline-emergency-content`.

## Track 9 — Product Prioritization

New view `product_pinterest_priority_v` = weighted score:
`stock_ok*40 + margin_norm*20 + past_pin_ctr*20 + has_video_assets*10 + conversion_score*10`.
Used by Continuity Engine to pick what to render next.

## Track 10 — Final report (in chat after execution)

`# products promotable`, `# excluded`, Durian status, queue depth, publishable videos, scheduled pins, top-10 video targets.

## Out of scope this pass
- Replacing the existing v4 pacing/realism scoring (reuse, don't duplicate).
- Building a new voiceover provider integration (use existing ElevenLabs setup).
- Deleting `stripe-webhook` even if legacy — only mark legacy; user can delete later.

## What I need from you before executing
1. **Expanded Pinterest URL or MP4** for `pin.it/73g2ln0as` (Track 2 — required).
2. **Confirm Stripe is still in production use** for GetPawsy (Track 1 verdict path).
3. Approve the publish gate thresholds (85 / 90) as final.

Reply "go" with answers to 1–3 and I'll ship everything in one pass.
