# Pinterest Creative Intelligence Engine V2 (PCIE2)

This is a massive, multi-week system. To deliver it safely without breaking the existing Pinterest automation, I'll ship it in 6 additive waves. Each wave is independently verifiable and ends with a PDF/JSON report under `public/admin-reports/ai-implementation/`. Nothing existing is removed.

## Scope guardrails (additive only)
- New tables prefixed `pcie2_*`. No edits to existing `pinterest_*` tables.
- New edge functions prefixed `pcie2-*`. Existing functions (Wave 3A/3B, golden batch, control center) remain untouched.
- New admin route `/admin/pinterest-creative-intel-v2` alongside existing dashboards.
- Publishing of PCIE2 creatives is OFF by default behind a `pcie2_publish_enabled` flag — they only flow into the existing publish queue once you approve.

## Wave 1 — Creative Memory + DNA foundation
Tables: `pcie2_creatives` (full creative record incl. prompt, DNA, hashes, perceptual hash, embedding ref, scores, performance), `pcie2_creative_dna`, `pcie2_product_understanding` (category → psychology model), `pcie2_headline_library` (per-category banks w/ usage counters), `pcie2_hook_library`.
Edge fn: `pcie2-product-classifier` (classifies all active products into 15 functional classes using Gemini), `pcie2-memory-writer`.
Report: architecture + classification coverage.

## Wave 2 — Headline & Hook Intelligence
Edge fn: `pcie2-headline-forge` (generates 50+ unique headlines per product class on demand, dedupes via embedding similarity + n-gram overlap, enforces usage frequency caps), `pcie2-hook-matcher` (validates hook⇄product purpose, rejects mismatches like "stopped scooping" for a camera).
Adds duplicate-rejection service `pcie2-similarity-gate` (headline, prompt, palette, composition, image pHash, embedding cosine).
Report: diversity benchmarks across 100 simulated headlines.

## Wave 3 — Image Quality + Smart Cropping + Multi-Variant
Edge fn: `pcie2-scene-director` (composes premium lifestyle prompts, no raw CJ imagery, 20 variant archetypes: minimal/luxury/funny/POV/macro/etc.), `pcie2-safezone-validator` (Pinterest mobile/desktop/tablet safe area math; rejects overlay clipping), `pcie2-variant-planner` (queues 20 distinct concepts per product).
Report: sample 5 products × 20 variants with safe-zone PASS rate.

## Wave 4 — AI Creative Director + Scoring
Edge fn: `pcie2-director-review` returns 13 sub-scores (Visual, CTR pred, Save pred, Conversion pred, Originality, Brand, Pinterest, SEO, Psychology, Emotion, Luxury, Trust, Overall). Threshold 95 to publish; auto-regenerate loop (max 8 retries, then park).
Tables: `pcie2_scores`, `pcie2_review_runs`.
Report: score distribution over 100 simulated creatives.

## Wave 5 — Self-Learning + Trend + Auto-Retirement
Nightly cron `pcie2-nightly-learn`: pulls perf from existing `pinterest_pin_performance`, updates weights in `pcie2_performance_weights` (per category/color/angle/headline-pattern/animal/typography), feeds back into Scene Director priors.
`pcie2-auto-retire`: flags chronic underperformers, queues replacements via similarity gate.
`pcie2-trend-scout`: pulls seasonal/holiday/Pinterest-trend signals → new concept seeds.
Report: learning loop verification on 30-day historical window.

## Wave 6 — Regression Suite + Executive Report
`pcie2-regression-runner` generates 100 simulated creatives end-to-end and validates:
- 0 duplicates above threshold
- Headline diversity ≥ target
- Product-hook match 100%
- Safe-zone PASS 100%
- Director score ≥ 95 publish-eligible rate
- Image-quality heuristic PASS
Produces final Executive PDF/JSON/MD/HTML, writes to both `/admin/reports` source and `public/admin-reports/ai-implementation/`, updates manifest, runs the existing verification pipeline (`scripts/ai_implementation_report_pipeline.py`) to confirm UI visibility.
**Run completes with PASS / FAIL.**

## Technical details
- Embeddings: Lovable AI Gateway `google/gemini-embedding-001` for headline/prompt/concept vectors, stored as `vector(3072)` with pgvector + HNSW.
- Image AI: existing image pipeline (premium tier) — no new provider.
- All grants/RLS per project standards (service_role full, authenticated admin read via `has_role`).
- Feature flag `pcie2_publish_enabled` (default false) in `app_config`. Until you flip it, PCIE2 only fills its own memory and reports — existing autopilot is untouched.

## What you get after each wave
A new admin tab section + a verified PDF/JSON report. You can stop or pivot between waves.

## Estimated turns
Wave 1: 1 turn. Waves 2–5: ~1 turn each. Wave 6: 1–2 turns (regression run is the heavy one).

---

**Confirm to start with Wave 1** (Creative Memory + Product Classification foundation), or tell me to re-scope (e.g. skip trend engine, start at Wave 3, change publish threshold from 95, change variants/product from 20).
