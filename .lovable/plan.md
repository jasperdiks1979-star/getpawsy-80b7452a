
# Genesis Master Implementation + V11 / V11.1 — Staged Execution Plan

This is three enterprise-scale programs bundled into one directive (Master Implementation = 16 phases, V11 Credit Forensics = 16 phases, V11.1 AI Economics = 13 phases). Executing all 45 phases in a single turn would break `REUSE first, CONNECT second, BUILD only when necessary` — that rule requires discovery-first, evidence-first work with human checkpoints, not a monolithic build.

I'll deliver in three waves. Each wave is independently shippable and produces an evidence artifact you can approve before the next wave starts. No thresholds lowered, no gates bypassed, no new production waves triggered.

---

## Wave A — Discovery & Truth (no UX changes, no credit spend)

Goal: produce the evidence base every later phase depends on. Zero AI credits consumed by this wave.

1. **Forensic inventory** (Master Phases 1–3): script-driven scan producing `public/admin-reports/genesis-inventory/`:
   - `pages.tsv` — every route in `src/pages/**` + `src/App.tsx` router.
   - `functions.tsv` — every `supabase/functions/*/index.ts` + `verify_jwt` + cron bindings.
   - `tables.tsv` — from `information_schema` via psql (already have exec DB access).
   - `reports.tsv` — every file under `public/admin-reports/**` + `genesis_documents`.
   - `duplicates.json` — name-similarity + AST-signature clustering for pages and functions.
2. **AI Credit Ledger backfill** (V11 Phases 1–2, V11.1 Phase 1): new `finance_ai_ledger` table + `finance-ai-ledger-backfill` edge function that joins `pinterest_credit_events`, `ai_trace_events`, `pcie2_creative_jobs`, `pinterest_creative_factory_jobs`, `cinematic_ad_jobs`, `ai_gateway_logs` (via tool). One row per gateway call with worker, product, job, model, credits, outcome, downstream pin id.
3. **Pipeline trace reconstruction** (V11 Phase 3): read-only SQL views joining creative_job → assembly → publish_queue → pinterest_pins to compute exact drop-off per stage per day.
4. **Evidence report v1** delivered as `/admin/reports` entry: `GENESIS-V11-AI-CREDIT-FORENSICS.pdf` + JSON with SHA-256. Answers the eight primary V11 questions with citations to ledger row ids. No fixes yet.

Deliverable: one PDF, one JSON manifest, one `finance_ai_ledger` table populated. You review before Wave B.

---

## Wave B — Genesis HQ shell + Economics layer (UI-only reuse)

Only starts after Wave A is approved (so we know what to reuse vs. duplicate).

1. **Genesis HQ root nav** (Master Phases 4, 12): new `/admin/hq` route rendering a single sidebar with the 18 sections from the directive. Each entry is a link to the **existing** page discovered in Wave A — no page rewrites, no widget duplication. Global command-palette search (⌘K) over pages, reports, products, orders, pins from Wave A's inventory + existing tables.
2. **Homepage = Digital Boardroom** (Master Phase 5): `/admin/hq` default tab embeds the existing `GenesisBoardroomPage` widgets via composition, not copy.
3. **Report Center** (Master Phase 7): `/admin/hq/reports` — auto-lists `genesis_documents` + filesystem scan of `public/admin-reports/**`, grouped by the 13 categories in the directive. Preview + signed-URL download. No new report generation.
4. **AI Economics dashboard** (V11.1 Phases 2–10): `/admin/hq/ai-economics` reading exclusively from `finance_ai_ledger` + `orders` + `canonical_sessions` (Ω.3 truth). Widgets: cost/image, cost/pin, cost/visitor, cost/purchase, ROI, burn rate, forecast-to-empty. All numbers show `UNKNOWN` if join confidence <90 (Conversion Integrity rule).
5. **Unified Truth enforcement** (Master Phase 9): every new widget calls a single `useTruthMetric(metric_key)` hook backed by `genesis_truth_metrics`. Conflicting sources → `UNKNOWN` badge, never a guess.

Deliverable: Genesis HQ live at `/admin/hq`, zero existing pages deleted, zero widgets duplicated, AI Economics dashboard populated from ledger.

---

## Wave C — Safe fixes, leak stops, certification

Only after Waves A+B are green.

1. **Safe-only credit leak stops** (V11 Phase 14, V11.1 Phase 7): from the Wave A evidence, disable *provably* duplicate retries and zombie workers using existing kill-switches (`pinterest_credit_state.image_generation_killed`, `pinterest_credit_state.autopilot_disabled`) — no threshold changes, no gate bypasses. Each stop logged to `governance_decision_log` with rollback SQL.
2. **Break-even + simulator** (V11.1 Phases 8–9): pure-SQL functions + a read-only simulator UI card in AI Economics. No writes to production tables.
3. **Duplicate merges** (Master Phase 3 tail): only for dashboards flagged `identical_ast=true` in Wave A. Each merge is one PR-sized migration you approve individually.
4. **Mobile parity + self-audit** (Master Phases 14–15): Playwright sweep of every HQ route at 375/768/1280, report failures, patch layout only.
5. **Final certifications**: `GENESIS-MASTER-IMPLEMENTATION-REPORT.pdf` + `GENESIS-V11.1-AI-ECONOMICS-REPORT.pdf`, both SHA-256 fingerprinted and archived to Report Center.

---

## Explicitly out of scope (per the directive's own constraints)

- No new Pinterest generation waves (V11 rule).
- No PRE / Native / Integrity threshold changes (V11 rule).
- No rebuilding of existing dashboards (Master final rule).
- No speculative ROI numbers — `UNKNOWN` wherever join confidence <90 (CIE rule).
- Genome (Master Phase 10), Boardroom Layout Manager (Phase 13), Knowledge Vault (Phase 8) already exist at `/admin/genome`, `/admin/boardroom-v5`, `/admin/vault` — Wave B links to them, does not rebuild.

---

## Approval gate

Reply with one of:
- **"Wave A"** — I start discovery + credit ledger backfill + V11 forensic report immediately.
- **"All waves"** — I execute A → B → C sequentially, pausing only on hard errors.
- **Edits** — tell me what to add, drop, or reorder and I'll revise this plan.

Each wave lands ~20–40 files. Attempting all 45 phases in one turn would produce shallow, duplicated work — the exact anti-pattern this directive forbids.
