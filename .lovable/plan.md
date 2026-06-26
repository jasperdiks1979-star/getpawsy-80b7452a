# PCIE2 Creative Intelligence Engine v2 — Permanent Autonomous Expansion

Replaces the finite concept list and one-shot Evolution Guard with a self-expanding semantic graph, multi-family creative production, and a mutation-first guard. No temporary re-seed; the engine keeps discovering new territory on its own.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ pcie2-concept-graph      (recursive semantic branch builder) │
│   • seeds 40+ angle nodes per product                        │
│   • detects saturation → spawns new branches via Gemini      │
└─────────────┬────────────────────────────────────────────────┘
              │ enqueues (product, concept, family, visual_dna)
              ▼
┌──────────────────────────────────────────────────────────────┐
│ pcie2_creative_jobs  (existing queue, now multi-dim keyed)   │
└─────────────┬────────────────────────────────────────────────┘
              ▼
┌──────────────────────────────────────────────────────────────┐
│ pcie2-creative-worker v2  (mutation-first Evolution Guard)   │
│   1. generate candidate                                      │
│   2. score (quality≥70) + cosine sim check                   │
│   3. if blocked → mutate angle→headline→CTA→visual→emotion   │
│   4. only reject after all 5 mutations fail                  │
└─────────────┬────────────────────────────────────────────────┘
              ▼
┌──────────────────────────────────────────────────────────────┐
│ pcie2-self-healer cron (every 5 min)                         │
│   • watches growth rate, similarity ceilings, queue depth    │
│   • on stall → calls concept-graph to expand branches        │
└──────────────────────────────────────────────────────────────┘
```

## What ships

### 1. New tables (migration)
- `pcie2_concept_graph` — recursive (parent_id self-ref) semantic nodes per product/global, with `family`, `branch_type`, `saturation_score`, `last_expanded_at`, `embedding vector(1536)`.
- `pcie2_creative_families` — 21 named families (Educational, Storytelling, …) with prompt template, weight, active flag.
- `pcie2_visual_dna` — rotating axes (camera, lighting, breed, room, season, lens, palette, layout…) with combinatorial fingerprint.
- `pcie2_headline_families` + `pcie2_cta_families` — generative templates, last-used timestamps, similarity cooldown.
- `pcie2_mutation_log` — every rewrite attempt (reason, before/after, outcome) for diagnostics.
- `pcie2_engine_health` — rolling metrics (growth_rate_5min, avg_similarity, saturation_index).

### 2. Edge functions (deploy)
- **`pcie2-concept-graph`** — seeds the 40+ canonical angles, embeds each, links siblings; on demand expands a node into N child branches using `google/gemini-2.5-flash` (combines parent angle + product understanding + trend signals).
- **`pcie2-family-router`** — picks a creative family per job using weighted rotation + cooldown; never repeats > threshold.
- **`pcie2-visual-dna-rotator`** — emits a unique visual fingerprint (8 axes) per job; rejects fingerprints within 2-bit Hamming distance of recent 200.
- **`pcie2-headline-engine`** *(upgrade)* — generates from {emotion, problem, benefit, numbers, urgency, curiosity, proof, search-intent, long-tail, pin-trend} combinations; auto-retires templates whose mean cosine > 0.86.
- **`pcie2-cta-engine`** *(new)* — intent-driven CTA synthesis, not template repetition; cooldown enforced.
- **`pcie2-creative-worker`** *(rewrite)* — mutation-first Evolution Guard v2: on quality<70 OR cosine≥0.88 sequentially mutate angle → headline → CTA → visual → emotional framing (Gemini); only reject after all 5 fail. Time-boxed 55 s, self-chains via `EdgeRuntime.waitUntil`.
- **`pcie2-self-healer`** *(new)* — cron every 5 min: detects saturation (growth rate < 5/min for 15 min OR avg sim > 0.85), calls `pcie2-concept-graph` to spawn fresh branches and `pcie2-family-router` to elevate underused families, then enqueues new jobs.
- **`pcie2-step5-validate`** *(reuse)* — re-runs automatically when library crosses 1,500.

### 3. Cron
- `pg_cron`: `pcie2-self-healer` every 5 min; `pcie2-creative-worker` backstop every 1 min (already exists).

### 4. Safety locks (unchanged)
- `pinterest_publishing_global_stop = true`
- `pcie2_publish_enabled = false`
- Quality threshold ≥ 70
- Cosine similarity threshold = 0.88
- Budget guardrail: stop bootstrap at $75 spend; `pcie2_engine_health` tracks token/credit usage and writes to `cmdr_budget_ledger`.

### 5. Recovery target
Run until **`pcie2_creatives ≥ 1,500`**, then auto-trigger `pcie2-step5-validate` and write final report:
- Total creatives, growth rate, rejected, mutated, similarity-prevented
- # of concept / headline / CTA / visual families created
- Average pairwise cosine similarity
- Estimated long-term capacity (products × families × visual_dna combos × angle nodes)

Report saved to `public/admin-reports/ai-implementation/2026-06-26-pcie2-engine-v2-autonomous.{pdf,json}` and manifest updated.

## Execution order

1. Migration (tables + indexes + grants + RLS service_role).
2. Deploy concept-graph, family-router, visual-dna-rotator, headline-engine v2, cta-engine, self-healer, worker v2.
3. Seed `pcie2_creative_families` (21 rows) + initial 40-node concept graph per active product (batched).
4. Schedule self-healer cron + ensure worker backstop active.
5. Trigger first expansion + worker chain.
6. Wait for library ≥ 1,500 → run validate → emit report.
7. Leave engine running; locks held; no Step 6 enabled.

## Budget

- Concept graph seeding (~445 products × ~10 expansion calls): ~$8
- Creative bootstrap to 1,500 (~700 new creatives, mutation-heavy): ~$25
- Headroom / mutations: ~$15
- Total est: **~$48 / $75 cap**

## Out of scope

- Pinterest publishing (locks held)
- Render worker (already healthy, no changes)
- Any Step 6 activation
