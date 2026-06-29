---
name: Product Relevance Engine (PRE)
description: Genesis V2 vision gate — Pinterest pin cannot publish unless image/title/description truly match the destination product. Fail-closed, cannot be skipped.
type: feature
---
**Edge fn:** `supabase/functions/pre-product-relevance` (admin-only). Actions: `evaluate`, `evaluate_pin_queue`, `recent`, `stats`.

**Shared engine:** `supabase/functions/_shared/pre-product-relevance.ts` — `evaluateProductRelevance()` calls Lovable AI Gateway (`google/gemini-3-flash-preview`, multimodal `image_url` block) and returns a verdict scored on 10 axes:
1. product_visibility (≥95) 2. expectation_match (≥95) 3. species_match (bool) 4. use_case_match (bool) 5. promise_match 6. visual_focus 7. product_occupancy_pct (≥20) 8. click_intent (≥95) 9. landing_match 10. shopping_match (≥95).

**Wired into `_shared/pinterest-integrity-guard.ts`** as check #7. If `pre_settings.enabled` is true and `pin_image_url` is HTTPS, PRE runs on every pin BEFORE insert into `pinterest_pin_queue` AND BEFORE cron-worker publish. Failure → `pre_relevance_failed` blocking reason → pin is rejected. No emergency override.

**Tables:**
- `pre_settings` (key/value) — thresholds + `enabled` flag + `vision_model`.
- `pre_evaluations` — full audit record per eval (scores, blocking reasons, regenerate brief, raw AI response, latency).

**Auto-fix:** Every failed eval returns a `regenerate_brief` (new headline / environment / camera / emotion / composition / image prompt) so the creative factory can regenerate without re-asking the AI.

**Admin UI:** `ProductRelevanceEnginePanel` on `/admin/pinterest-health` — 24h stats, top blocking reasons, dry-run any `pinterest_pin_queue.id`, recent evals table.

**Genesis rule:** A beautiful image that does not sell the product is a failed pin. When in doubt → DO NOT PUBLISH → REGENERATE.