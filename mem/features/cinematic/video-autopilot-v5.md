---
name: Pinterest Video Autopilot V5
description: Autonomous cron loop with scene rotation, product-match QA, anti-slideshow, daily cap 30 and 90-min gap
type: feature
---
- **Cron:** `pinterest-video-autopilot-tick` runs every 10 min (pg_cron job `pinterest-video-autopilot-tick`). 24/7 unattended.
- **Settings:** `pinterest_video_autopilot_settings` row 1 — `enabled=true`, `mode='autonomous'`, `max_per_day=30`, `min_publish_gap_minutes=90`.
- **Per tick:**
  1. Enforces daily cap (counts `published` rows since UTC midnight) and gap (≥90 min since last publish).
  2. Self-heals: rows stuck in `publishing` >10 min are flipped back to `draft`; rows in `publish_blocked`/`failed`/`creative_rejected` under their retry cap and >30 min cool-down are re-armed to `draft`.
  3. Picks next `draft` by `priority DESC, created_at ASC`.
  4. Runs **Product Match QA** (`_shared/product-match-qa.ts`): script↔product, voiceover↔script, scene species↔inferred species, captions↔product. Any failing signal → `reject_score > 0` → `publish_blocked` with `qa_reject:<reasons>` and attempt_count++.
  5. Runs **Anti-Slideshow** in the same module: rejects `<4` scenes, `<4` unique shots, `<4` transitions, or `camera_motion_score < 35`.
  6. Audits every decision to `cinematic_product_match_qa_log` (scores + reasons + passed).
  7. On pass: calls `pinterest-video-publisher` with `x-render-secret` header (service-mode bypass) and `action=publish`.
- **Scene rotation:** `_shared/scene-rotation.ts` reads `cinematic_scene_environments` (60 seeded templates across modern_home/luxury_home/outdoor/park/beach/hiking_trail/apartment/urban_loft/family_environment/cozy_bedroom/premium_pet_room/kitchen/backyard/roadtrip/seasonal). Hard rule: same slug AND same scene_group cannot repeat back-to-back per product type.
- **Dashboard:** `/admin/pinterest-video-autopilot` shows active voice, active scene, published today, queue size, failed today, avg QA, avg CTR (30d) — auto-refreshes every 30s and exposes a manual "Run tick now" button.
- **Limits/contract:** never publish on QA fail; never publish on slideshow detection; never bypass the daily cap or gap.