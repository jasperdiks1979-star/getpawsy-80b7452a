# Pinterest Premium Creative Engine — implementation plan

Before I build, I need to flag overlap with what already ships and confirm the right path. GetPawsy already has three layers that do most of what you're describing:

- **Creative Director** (`pinterest-creative-director`) — niche detection + AI scene briefs + Gemini image render + draft insert. No raw product feed.
- **Creative Intelligence** (hooks + multi-axis quality scoring + retry loop, threshold 78).
- **Premium pivot constraints** (14-day cooldown, hook cooldown 30d, pHash≥10, reject white-bg/orange-bar/aggressive-CTA, allowed creative categories, blocked styles).
- **Visual duplicate guard** (last-100 pHash scan pre-insert).
- **Queue type contract** + sanitizer + schema verify.

So the work is **not** "build a new engine from scratch" — it's **harden, raise the bar, block the legacy path, and migrate**. Rebuilding parallel tables (`pinterest_premium_creative_jobs`, `pinterest_creative_style_profiles`, `pinterest_creative_quality_scores`) would fork the system and break attribution/cron/QA we just stabilized.

## What I'll actually ship

### 1. Raise quality bar on the existing pipeline
- In `_shared/pinterest-quality.ts`: bump threshold 78 → **85 total**, add new axes `non_dropshipping` (≥90) and `pinterest_fit` (≥85), `lifestyle` (≥80). Gemini scorer prompt updated to detect: white-bg dominance, supplier-cutout look, marketplace product-card, overlay dumped on product photo, fake badges, unreadable text, German/foreign text.
- Add banned-phrase list (your 8 phrases + memory's existing list) enforced on headline/cta/title/description at brief stage AND post-render OCR check using existing `pinterest_pin_ocr_cache`.
- Retry budget: keep MAX_RETRIES=2; on 3rd failure mark `qa_failed` (not inserted to queue).

### 2. Enforce pin-type mix (70/15/10/5)
- New table **`pinterest_pin_type_governor`** (rolling 30d counters per `pin_type` ∈ {lifestyle, problem_solution, listicle, product_showcase}).
- Pre-insert gate in `pinterest-creative-director`: if `product_showcase` share >10% in last 30d → force regen as lifestyle.
- Brief generator picks pin_type by current deficit vs target ratio.

### 3. Category style profiles
- Seed **`pinterest_creative_style_profiles`** (the 11 categories you listed) with `scene_prompt_template`, `negative_prompt`, `overlay_rules`, `allowed_pin_types`. This replaces the hardcoded `pinterest-style-dna.ts` presets — DNA file becomes the fallback only.
- Director loads profile by `detectNiche(product)` → category key.

### 4. Block the legacy product-feed path
- Audit edge functions that still insert pins from raw `product.image_url` without going through Director. Candidates: `pinterest-viral-batch`, `pinterest-content-correction`, any `pinterest-automation` raw-image path.
- Add a **hard gate** in `pinterest-cron-worker` + `pinterest-publish-now` + `pinterest-automation` + `pinterest-video-publisher`: reject pins where `meta.intelligence.scores` is missing OR `meta.creative_source != 'creative_director_v2'`. Reason: `rejected_low_quality_supplier_style`. Admin override flag in `pinterest_runtime_settings.allow_legacy_product_feed` (default false).

### 5. Migration of existing drafts/queue
- One-shot SQL: mark all currently `queued`/`draft` pins missing `meta.intelligence.scores` OR matching banned phrases OR pHash-matching raw `products.image_url` as `rejected` with reason `rejected_low_quality_supplier_style`.
- Enqueue replacement jobs via Director for the same products (respecting 14d cooldown).

### 6. Admin surface
- New section on `/admin/pinterest-pin-status` (not a new route — keeps muscle memory): **Premium Creative Engine** panel showing:
  - drafts (premium), QA passed, QA failed (with top reasons), legacy blocked count
  - 30d ratio: lifestyle / problem_solution / listicle / product_showcase vs target
  - buttons: Generate premium drafts (N=10), Queue QA-passed, Publish next, Regenerate failed, Emergency stop (writes `runtime_settings.premium_engine_paused`)
  - red warning banner: "Raw product-feed pins are blocked by default."

### 7. Smoke validation after deploy
1. Trigger Director `run_full` for 30 products.
2. Confirm ≥10 drafts pass QA (score≥85, non_dropshipping≥90).
3. Approve+queue them.
4. Run `pinterest-cron-debug` to confirm next eligible pin is one of them.
5. Trigger one `pinterest-publish-now` (respects warm-up/cap), verify destination URL has `pin_id=` + UTMs (already fixed last turn).
6. Confirm one legacy-style queued pin is now `rejected` with the new reason.
7. Return counts + dashboard URL + next cron time.

## What I'm explicitly **not** doing
- Not creating `pinterest_premium_creative_jobs` as a parallel queue. Director already writes to `pinterest_pin_queue` with `meta.intelligence`. A parallel queue would break cron, attribution, and the publisher-path audit we just finished.
- Not creating `pinterest_creative_quality_scores` as a new table. `pinterest_render_attempts` already stores per-attempt scores + reasons. I'll add the 3 new axis columns there.
- Not changing UTM/pin_id stamping — that's done.
- Not touching board routing, warm-up, daily cap, dup guard — already enforced.

## Tables touched
- **New:** `pinterest_creative_style_profiles` (seeded 11 categories), `pinterest_pin_type_governor` (30d rolling).
- **Altered:** `pinterest_render_attempts` (+3 score columns), `pinterest_runtime_settings` (+`premium_engine_paused`, `allow_legacy_product_feed`, `pin_type_target_ratio` jsonb).
- **Data migration:** mass-reject legacy queued pins.

## Open questions before I build
1. **Image model:** Director currently uses `google/gemini-3-pro-image-preview` (Lovable AI Gateway). OK to keep, or do you want `gpt-image-2` for the premium tier? Gemini is faster + cheaper, Pro-image is genuinely photoreal for interiors. I'll keep Gemini Pro unless you say otherwise.
2. **Threshold strictness:** 85/90/85/80 will kill ~60-70% of first-pass renders (with 2 retries). That's the point, but it means slower queue fill. Acceptable?
3. **Migration scope:** Mass-reject applies to `queued` + `draft` rows ≤30 days old, or **all** legacy rows regardless of age? I'd do ≤30d to avoid noise.

Reply **approve** (or with answers to 1–3) and I ship it in one pass — migration, code, seed, smoke test, report.
