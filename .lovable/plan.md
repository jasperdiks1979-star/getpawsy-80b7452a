## Goal
Replace the manually-seeded PCIE2 dependency with a permanent **autonomous Pinterest Intelligence ecosystem**. After this build, headline/hook/creative libraries grow on their own, every publish is unique, and the system learns from Pinterest metrics with zero manual intervention. Only after the full ecosystem passes its success gates does the controlled Phase 2 migration resume.

Nothing in this plan publishes to Pinterest. `pinterest_publishing_global_stop=true` and `pcie2_publish_enabled=false` stay locked until Step 7 canary, which is gated by Steps 1–6.

---

## Step 1 — Headline Intelligence Engine (self-generating)
- New edge function `pcie2-headline-engine` (admin/internal-JWT). Inputs: `category`, `family`, `count`, `model_version`.
- 22 headline families (Curiosity, FOMO, Problem, Solution, Transformation, Comparison, Statistics, Emotional, Luxury, Budget, Urgency, Educational, Question, Story, Before/After, Authority, Social Proof, Seasonal, Holiday, Gift, Benefit, Pain) seeded as a static enum — not as data rows.
- Generation: Lovable AI Gateway (`google/gemini-3-flash-preview`) per category × family batch of 10. Each row writes: `headline, family, emotion, reading_grade (Flesch-Kincaid), length, predicted_ctr (model), duplicate_score (cosine vs last 200), embedding vector(3072) via `google/gemini-embedding-001`, generated_at, model_version, prompt_version, source_category`.
- Migration: add missing columns to `pcie2_headline_library` (`emotion`, `reading_grade`, `length`, `predicted_ctr`, `duplicate_score`, `embedding vector(3072)`, `prompt_version`, `source_category`, `family` enum). Add HNSW index on `embedding`.
- Continuous expansion: cron `pcie2-headline-engine` every 6h tops up any category × family below 25 active rows. No hard ceiling.

## Step 2 — Hook Intelligence Engine (self-generating)
- New edge function `pcie2-hook-engine`. Generates hooks per `product_id × category × audience × board × intent × season × country × language`.
- Scoring per row: `predicted_ctr`, `novelty_score` (1 − max cosine vs last 500), `duplicate_score`, `quality_score` (Gemini judge rubric 0–100), `engagement_prediction`.
- Migration: extend `pcie2_hook_library` with `audience, board_id, intent, season, country, language, predicted_ctr, novelty_score, duplicate_score, quality_score, engagement_prediction, embedding vector(3072), model_version, prompt_version`. HNSW index.
- Cron every 6h refills any (category, audience, board) cell below 20 active hooks.

## Step 3 — Creative Intelligence Engine (self-generating briefs)
- New edge function `pcie2-creative-engine`. For each active product produce briefs across 15 concepts (Lifestyle, Close-up, Comparison, Problem, Solution, Pet Interaction, Owner Interaction, Luxury, Minimal, Outdoor, Indoor, Motion, Premium, Funny, Educational).
- Each row in `pcie2_creatives`: `concept, prompt, negative_prompt, layout, camera_angle, lighting, background, breed, pose, composition, style, headline_id, hook_id, cta, quality_score, predicted_ctr, pinterest_score, ai_confidence, embedding vector(3072), duplicate_score, model_version, prompt_version`. Reuse existing table; ALTER to add any missing columns.
- Concept enum lives in code; data rows never carry "templates".

## Step 4 — Creative Evolution Guard
- New shared module `supabase/functions/_shared/pcie2-evolution.ts`. Before any creative is marked `ready`, it must pass: cosine similarity < 0.88 vs last 200 published creatives across (image embedding, headline embedding, hook embedding), and at least 3 of {headline, hook, CTA, layout, camera_angle, lighting, background, breed, pose, composition, negative_prompt, style} must differ from the most recent sibling for the same product.
- Failures auto-regenerate up to 5 attempts, then flag `evolution_blocked` and skip.

## Step 5 — Dry-Run Generation (top 100 revenue products)
- Orchestrator `pcie2-bootstrap-run` invokes Steps 1–4 against the top 100 products by 90-day revenue.
- Hard gates before continuing:
  - `pcie2_headline_library >= 500`
  - `pcie2_hook_library >= 500`
  - `pcie2_creatives >= 1000`
  - Median `quality_score >= 70`
  - Median `duplicate_score <= 0.25`
- No Pinterest calls. Pure DB writes + embeddings.

## Step 6 — Pipeline Trace Dry-Run (100 products)
- Run `pcie2-publisher` in `mode=dry_trace` against the 100 products. Every `pcie2_pipeline_trace` row must contain: `pipeline_id, creative_id, creative_version, headline_version, hook_version, prompt_version, board_decision, ai_model_version, quality_score, publish_ts (null in dry), deployment_sha, source_product_id`. Any null halts.

## Step 7 — Canary (5 brand-new creatives)
- Only if Steps 1–6 pass. Generate 5 fresh creatives that reuse zero existing assets: new prompt, headline, hook, CTA, composition, style.
- Each must exceed the rolling median quality score of the past 100 generated creatives.
- Flip `pcie2_publish_enabled=true` scoped to those 5 product IDs via the existing canary allowlist on `pcie2_publish_queue`. `pinterest_publishing_global_stop` stays `true` for everything else.
- Live Pinterest verification per pin reuses the existing Phase 6 verifier from `.lovable/plan.md`.

## Step 8 — Self-Learning Loop
- New edge function `pcie2-learning-engine` (cron every 1h once canary is live). Pulls Pinterest analytics for published pins: impressions, saves, outbound_clicks, closeups, pin_clicks, CTR.
- Writes feature attribution to `pcie2_feature_attribution` (already exists) and updates rolling weights for: headline family, hook family, concept, layout, board, posting hour, CTA. Future generations sample weighted by these scores.
- Nightly `pcie2-learning-engine mode=retrain` rebuilds the CTR prediction model (logistic regression on embeddings + features) and bumps `model_version`.

## Step 9 — Reporting (mandatory)
- Python script generates `public/admin-reports/ai-implementation/2026-06-26-pcie2-autonomous-ecosystem.{pdf,json,html}`.
- Sections: AI readiness · headline engine state · hook engine state · creative engine state · evolution guard stats · learning engine state · trace validation · counts (headlines/hooks/creatives) · duplicate analysis · quality analysis · remaining blockers · deployment readiness · success gate matrix.
- Append to `manifest.json`. Copy to `/mnt/documents/`. Verify the file lists on Admin → Reports → AI Implementation Reports.

---

## Success criteria (auto-checked before resuming Phase 2)
- `pcie2_headline_library > 500`
- `pcie2_hook_library > 500`
- `pcie2_creatives > 1000`
- `pcie2_pipeline_trace` rows for 100 products with all provenance columns populated
- Evolution guard active (similarity < 0.88 enforced)
- Learning engine cron scheduled and last_run < 2h
- Quality engine median ≥ 70, duplicate median ≤ 0.25
- Only then call `pcie2-migration-audit mode=resume` to continue the controlled Phase 2 migration.

---

## Deliverables
- Edge functions: `pcie2-headline-engine`, `pcie2-hook-engine`, `pcie2-creative-engine`, `pcie2-bootstrap-run`, `pcie2-learning-engine`. Extend `pcie2-publisher` with `mode=dry_trace`.
- Shared module: `_shared/pcie2-evolution.ts`, `_shared/pcie2-embeddings.ts`.
- Migrations: extend `pcie2_headline_library`, `pcie2_hook_library`, `pcie2_creatives` with the new columns + HNSW vector indexes; add `pcie2_model_versions` registry.
- Crons: headline top-up (6h), hook top-up (6h), learning hourly (after canary), learning retrain nightly.
- Reports: PDF + JSON + HTML, manifest updated, mirrored to `/mnt/documents/`.

## Hard halts
- Any step's success gate fails → halt, report, no flag flips.
- Embedding/model 402 or 429 → back off, log to `pcie2_learning_runs`, do not silently skip.
- `pinterest_publishing_global_stop` may only flip in Step 7 and only scoped to the 5 canary product IDs.

## Non-goals
- No static seeded example headlines/hooks.
- No UI rewrites beyond surfacing the report.
- No re-introduction of legacy publishers.
- No Stripe/auth changes.

## Cost guardrail
- Bootstrap budget cap: 5000 credits (~$500). `pcie2-bootstrap-run` aborts when `pinterest_credit_state.credits_remaining` drops below the cap floor.

Confirm to proceed and I will execute Steps 1–9 in one run, halting at the first failed gate.