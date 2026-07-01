# Genesis V6.4 — Golden DNA Prompt Compiler

Additive layer that sits between the Creative Director and Gemini. Never weakens PRE, never lowers thresholds, never duplicates existing engines. Fully reuses Golden DNA, PRE, Creative Director, Creative Factory, Product/Conversion/Market/Audience Intelligence, First Sale Accelerator, Recommendation OS, Closed-Loop Learning, and Pinterest Publisher.

## Architecture

```text
Product ──► Rule Extractor ──► Constraint Set ──► DNA Inheritor ──► Prompt Builder
                                    │                    │
                     Product/Market/Audience Intel   PRE=96 Golden Reference
                                    │
                              Compiler QA  ──► reject (recompile) ──► loop
                                    │
                              predicted_pre >= 90 ?  ── no ──► recompile prompt (no Gemini call)
                                    │ yes
                              call Gemini (existing factory)
                                    │
                        pre-product-relevance evaluation
                                    │
                     compiler_prompt_ledger  ──► closed-loop learning
```

## Files added (shared library, single source of truth)

- `supabase/functions/_shared/golden-dna-compiler.ts`
  - `extractProductRules(product, landingSignals)` → `CompiledRuleSet` (species/breed/env/use-case/accessory/colour allow+forbid lists, camera/lens/lighting/mood/composition/background, occupancy target, visibility target, landing-similarity target, shopping-similarity target, click-intent target, emotional trigger, stopping-power target).
  - `inheritGoldenDNA(ruleSet)` → merges defaults from the PRE=96 reference (camera, lighting, crop, distance, focus, bg complexity, contrast, hierarchy, product scale, negative space, eye-tracking, shopping clarity) via existing `pinterest-style-dna.ts`.
  - `buildDeterministicPrompt(ruleSet)` → single canonical Gemini prompt string with explicit MUST/NEVER blocks + numeric occupancy/visibility clauses.
  - `compilerQA(ruleSet, prompt)` → runs species/use-case/shopping/landing/occupancy/visibility ambiguity checks; returns `{ ok, blockers[] }`.
  - `predictPre(ruleSet, priorPreEvals, dnaSimilarity)` → deterministic scorer (feature-weighted, no LLM call) returning `predicted_pre 0-100`.
  - `mutateForBlocker(ruleSet, blocker)` → PRE-aware Phase 4 mutation table (species-lock, occupancy raise, palette lock, emotional upgrade, hero composition).
- `supabase/functions/_shared/golden-dna-compiler_test.ts` — Deno unit tests for extractor, QA, mutator, and predictor.

## Files modified (wire the compiler in — no logic duplication)

- `supabase/functions/pinterest-creative-factory/index.ts`
  - Before every Gemini image call: `compilePrompt()` → QA loop (max 3 mutations) → `predictPre` gate → only then `EdgeRuntime.waitUntil(callGemini)`.
  - Log `trace_id` (existing) plus compiled prompt + rule hash into new ledger.
- `supabase/functions/pre-occupancy-rerender/index.ts`
  - Replace ad-hoc prompt regen with `mutateForBlocker('occupancy')` so retries always compile a DIFFERENT prompt (Phase 4 rule: never resend previous prompt).
- `supabase/functions/pre-product-relevance/index.ts`
  - On finish, write into `compiler_prompt_ledger`: `{trace_id, compiled_prompt, rule_hash, predicted_pre, actual_pre, dominant_blocker}` for closed-loop learning.
- `supabase/functions/pcie2-creative-worker/index.ts`
  - Route all `generateImage` calls through the compiler helper. No fallback path — if QA fails after 3 mutations, drop the job (no Gemini spend), enqueue for human review.

## Database (single new table, additive)

- `public.compiler_prompt_ledger`
  - `trace_id`, `product_id`, `rule_hash`, `compiled_prompt`, `rule_set jsonb`, `predicted_pre`, `actual_pre`, `dominant_blocker`, `mutation_step`, `succeeded bool`, timestamps.
  - Grants: `service_role` full, `authenticated` SELECT (for admin dashboard). RLS: admin-only.
  - Indexed on `(product_id, created_at desc)` and `(dominant_blocker)` so `mutateForBlocker` and Phase 7 learning aggregates are cheap.

## Reused systems (no duplication)

| Concern | Reused component |
| --- | --- |
| Golden reference asset | `_shared/pinterest-style-dna.ts` (PRE=96 DNA) |
| PRE scoring | `pre-product-relevance` (unchanged, same thresholds) |
| Master Creative Director | `_shared/pinterest-master-creative-director.ts` |
| Occupancy retry orchestration | `pre-occupancy-rerender` |
| Product/Market/Audience metadata | existing `products`, `market_intelligence_*`, `audience_intelligence_*` tables |
| Landing colour extraction | existing `product_landing_signals` view |
| Closed-loop learning | `governance_decision_log` + new ledger table |
| Publisher | `pcie2-publish-assembler` (unchanged) |
| Credit preflight | `_shared/ai-credit-preflight.ts` — compiler runs BEFORE preflight so we never even reserve credit for a low-confidence prompt |

## Validation run (Phase 9)

- Pick the current Top-15 First Sale products (from `first_sale_accelerator` ranking view).
- One compiled prompt → one Gemini image → one PRE eval per product.
- If PRE ≥ 95 → mark validated. If PRE < 95 → do NOT touch Gemini or thresholds; instead persist blocker to `compiler_prompt_ledger` and re-run `mutateForBlocker` next cycle. Improvement happens compiler-side only.

## Success targets (measured, not asserted)

- Baseline PRE pass rate: read live from `pre_evaluations` (last 7 days). Ledger `succeeded=true` ratio after rollout is the after-metric.
- Credit reduction: `sum(gemini_image_calls_before) - sum(gemini_image_calls_after)` from `ai_trace_events`.
- Retry reduction: distinct `trace_id` count in `pinterest_pin_queue` retry lane.

Numbers in the final report will be pulled from those tables — no synthetic values.

## Out of scope (explicit)

- No changes to PRE thresholds, publish gates, autopilot mode, or Guardian rules.
- No new Creative Director. Compiler is a pure pre-processor.
- No new Publisher. Existing assembler consumes compiled prompts unchanged.
- No prompt sent to Gemini when `compilerQA` fails or `predicted_pre < 90`.
