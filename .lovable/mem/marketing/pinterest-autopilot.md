---
name: Pinterest Auto-Pilot Engine
description: Autonomous product+hook+board selection scoring engine, drafts-only at /admin/pinterest-autopilot
type: feature
---
**Edge function:** `pinterest-autopilot` (admin-only, service-role). Action `score` (default) ranks active non-duplicate products by composite score: image (0–20) + margin (0–15) + category_fit (0–10) + visual_appeal (0–10) + shipping (0–10) + performance (0–25 from `pinterest_pin_performance`) + force_promote bonus (0/20).

**Hook routing:** local `NICHE_HOOK_AFFINITY` mirror of `_shared/pinterest-hooks.ts`. Detects niche from name+category, picks best family (exploit if saves≥5, else hourly rotation).

**Board routing:** filters `pinterest_boards` to non-sandbox + non-blacklisted + production_verified. Scores by priority×2 + style_affinity match (+15) − weekly saturation (×2).

**Auto scale/pause heuristics:**
- `scale` if performance_score ≥18 AND saves ≥10
- `pause` if impressions ≥500 AND saves ≤1 AND clicks ≤1
- `skip` if weekly cap hit OR total < min_quality_score (default 70)

**Tables:**
- `pinterest_autopilot_settings` (singleton id=1): enabled, mode (conservative/balanced/aggressive), max_pins_per_product_per_week, preferred_category, min_quality_score
- `pinterest_autopilot_overrides` (per product_id, unique): action ∈ {exclude, force_promote, paused}, expires_at
- `pinterest_autopilot_decisions`: full log per run with score_breakdown jsonb, hook, board, action, reason

**Drafts-only.** This function does NOT publish or create queue rows directly — it logs decisions; admin manually triggers `pinterest-creative-director` for drafts. No cron yet.

**Admin UI:** `/admin/pinterest-autopilot` — settings + overrides table + decisions log + "Run Auto-Pilot" button.
