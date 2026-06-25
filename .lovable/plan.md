## Wave 3 — Pinterest Creative Intelligence Rebuild

Scope is too large to ship in one autonomous run safely (12 steps, new schema, new AI pipelines, new validators, Golden Batch, A/B loop, autonomous publisher). Doing it in one pass guarantees the same outcome Wave 2 exposed: unverifiable "all green" claims. I'll execute in 4 sub-waves. **Publishing stays paused throughout Wave 3A–3C.** Only Wave 3D unpauses, and only if the Golden Batch hits the >99% gates you defined.

**Guiding rule:** every step ends with real DB evidence + PDF/JSON report. No simulated success.

---

### Wave 3A — Foundation: Intelligence + Validators (Steps 1, 2, 11)

Replaces the brittle parts of the old pipeline before any new creative is generated.

1. **Schema (new tables, admin-only RLS, service_role grants):**
   - `pin_product_intelligence` — full Step 1 profile per active product (species, category, emotion, intent, lifestyle, season, visual_style, audience, price_tier, usp_rank[], board_id, landing_url, confidence). Permanent store, versioned.
   - `pin_landing_validations` — last validator run per product (13 checks from Step 2 + pass/fail + reasons + checked_at).
   - `pin_hook_library_v2` — 15 buckets, target 500+ hooks, with `species_scope`, `category_scope`, `banned_for[]`, `embedding`, usage_count.
   - `pin_headline_bank` — 20 headlines per product, uniqueness-hashed.
   - `pin_creative_scores` — Step 7 multi-axis scores per attempt.
   - `pin_golden_batch` — Step 8 winner selection log.
   - `pin_ab_experiments` + `pin_ab_outcomes` — Step 9 learning loop.
   - `pin_wave3_runs` / `pin_wave3_steps` — orchestration.

2. **Edge functions:**
   - `pin-intelligence-builder` — profiles every active product via Gemini 2.5 Pro (multimodal: name + images + description), writes `pin_product_intelligence`.
   - `pin-landing-validator` — runs 13 checks (DB + HEAD fetch + sitemap/canonical check + stock + price). Hard veto for downstream.

3. **Root cause fixes (Step 11) baked into the new schema:**
   - hook_not_allowed → `banned_for[]` enforced at SELECT time.
   - board mismatch → board comes from intelligence row, not heuristic.
   - slug/species mismatch → validator must pass before any draft row.
   - utm missing → URL stamped in a single shared util.
   - banned phrases → centralized linter shared by hook/headline/description.
   - inactive products → validator hard-fail.

**Deliverable:** `wave3a-foundation.pdf` + JSON. Intelligence built for 100% active products, validator green for X / red for Y with reasons.

---

### Wave 3B — Creative Brain: Hooks, Headlines, Scene Engine (Steps 3, 4, 5)

1. **Hook Engine V2** — seed 500+ curated hooks across the 15 buckets, embed them, expose `pick_hook(product_id, bucket?)` with dedupe + cooldown.
2. **Headline AI** — generate exactly 20 headlines per active product via Gemini 3 Flash, banned-phrase linted, uniqueness-hashed against `pin_headline_bank`.
3. **Scene Engine** — replaces director prompts. Output is editorial Pinterest scenes only (lifestyle, owner interaction, modern US home). Hard ban on white bg / floating product / catalogue / collage / AI-artifact prompts (already in `pinterest-style-dna`, re-enforced + scored).
4. **Description bank** — 10 per product, banned-phrase linted.

**Deliverable:** `wave3b-creative-brain.pdf` + JSON. Coverage matrix per product, dedupe stats.

---

### Wave 3C — Quality Gates + Golden Batch (Steps 6, 7, 8)

1. **Visual validator** — Gemini 2.5 Flash multimodal scorer with the 12 checks in Step 6. Returns per-axis 0–100 + overall.
2. **Pinterest Quality Score** — composite of visual realism, product match, landing, species, board, hook, CTR predict, conv predict. **Publish gate = all axes ≥ thresholds in Step 7.** Otherwise auto-regenerate (cap retries at 5 per product — "unlimited" without a cap burns credits and never converges; the cap can be lifted per run).
3. **Golden Batch:** pick top 25 products by `pin_product_intelligence.confidence * margin * stock_health`. For each: 10 scenes × 10 hooks × 10 headlines × 10 descriptions, scored, **single winner persisted**. All losers archived with rejection reasons.

**Deliverable:** `wave3c-golden-batch.pdf` + JSON with confidence histogram, example winners, cost/credits used, average score per axis.

**HARD GATE before Wave 3D:** Golden Batch average confidence ≥99%, CTR prediction ≥98%, landing validator 100%, zero mismatch. Otherwise stop and report.

---

### Wave 3D — Autonomous Publishing + A/B Loop (Steps 9, 10)

Only runs if 3C gate passes.

1. Unpause `pinterest_runtime_settings`, set pacing to **2 pins/hour**, hard cap 48/day.
2. Publisher reads winners from `pin_golden_batch`, stamps UTM, posts via existing Pinterest pipeline.
3. `pin-ab-learner` cron — every 6h, pull Pinterest analytics (impr/save/closeup/outbound) + GA4 conv + revenue → write to `pin_ab_outcomes` → update `pin_hook_library_v2.weight` and scene template weights (epsilon-greedy).
4. Auto-pause if rolling 24h CTR drops below baseline or conv < threshold.

**Deliverable:** `wave3d-publishing.pdf` + JSON: pins live, per-pin scores, first-24h metrics, auto-pause triggers if any.

---

### Step 12 — Final Executive Report

After 3D (or after 3C if gate fails), generate the full `2026-06-25-pinterest-wave3-executive.pdf` with every section you listed (architecture, before/after, regenerated counts, hooks/headlines generated, landing fixes, estimated lift, readiness, risks, cost, credits, runtime, confidence histogram, example creatives, Wave 4 roadmap). Manifest updated.

---

### Technical notes
- All new tables: admin-only RLS + `service_role` grants (per project policy).
- All AI through Lovable AI Gateway (no GEMINI_API_KEY). Models: `google/gemini-2.5-pro` for intelligence profiling, `google/gemini-3-flash-preview` for hooks/headlines, `google/gemini-3-pro-image` for scene render, `google/gemini-2.5-flash` (multimodal) for visual validator.
- Retry cap = 5 (configurable in `pin_wave3_settings`). Unlimited is unsafe without circuit breakers.
- Old Wave 1/2 tables (`pin_product_classification`, `pin_hook_library`, `pin_hook_restrictions`) are kept read-only for diff/audit, replaced functionally by V2 tables.
- Wave 3D requires explicit go-ahead from you in addition to the automated gate — I will not auto-unpause publishing in the same turn 3C finishes.

### Estimated cost / time per sub-wave
- 3A: ~445 Gemini Pro multimodal calls + 445 HEAD fetches. ~15 min runtime, modest credits.
- 3B: ~445 × (1 headline batch + 1 description batch) + hook seeding (one-shot). ~30 min.
- 3C: Golden Batch = 25 × 10 image renders × up to 5 retries = max ~1,250 image renders. **This is the expensive step.** Gemini 3 Pro Image is high-cost; I'll log credit burn live and stop if a guardrail is hit.
- 3D: ongoing, 2 pins/h.

---

### What I need from you
1. **Approve Wave 3A to start now**, or change order.
2. Confirm retry cap of 5 for Step 7 (or set your own number).
3. Confirm Golden Batch size of 25 products × 10 variants (or change).
4. Confirm: Wave 3D requires a second explicit go-ahead from you after the 3C gate passes — yes/no.

After approval I'll execute Wave 3A and ship the report before touching 3B.
