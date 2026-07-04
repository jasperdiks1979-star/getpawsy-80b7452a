# Analytics Truth Certification — Execution Plan

**Goal:** For any (timeframe, filters), every surface (World Map, Summary, CSV, API, Canonical, Journey, Funnel, Sales Commander, Revenue) returns **byte-identical numbers**. One source of truth, everything else is a thin wrapper.

This is not a bug patch — it is an architectural convergence. I'll work autonomously through 13 phases and stop only for hard blockers or destructive changes.

---

## Phase 1 — Inventory (read-only, ~1–2 hrs of tool calls)

Enumerate every analytics consumer and producer:

- Grep the repo for direct reads of: `visitor_activity`, `canonical_events`, `canonical_sessions`, `lp_funnel_events`, `checkout_funnel_events`, `analytics_funnel_waterfall`, `analytics_session_quality`, `session_forensics*`, `session_journey_steps`, `cie_*`, `gi_ga4_events`, `orders`.
- List every edge function under `supabase/functions/` matching `analytics-*`, `canonical-*`, `world-map*`, `export*`, `visitor-*`, `funnel-*`, `cie-*`.
- List every React hook under `src/hooks/` and every admin page under `src/pages/admin/` that queries those tables/functions.
- Produce `docs/analytics-truth/phase1-inventory.md` with one row per consumer: file · reads · joins · filters · groupby · dedupe · tz · country norm · session key · visitor key · source · internal/US/bot/QA/synthetic gates.

## Phase 2 — Dataflow graph

Generate a Mermaid diagram (`/mnt/documents/analytics-dataflow.mmd`) showing browser → edge fn → table → view/RPC → hook → widget for every visible number (Map counters, Map markers, heatmap, Summary cards, CSV, exports).

## Phase 3 — Trace 20 real sessions

Pick 20 recent real (non-bot, non-QA) sessions from `canonical_sessions`. For each, join across `visitor_activity`, `canonical_events`, `lp_funnel_events`, `analytics_funnel_waterfall`, `orders`, `gi_ga4_events`. Emit `docs/analytics-truth/phase3-session-trace.csv` and flag every divergence (event present in one source, missing in another; country/source mismatch; duration disagreement).

## Phase 4 — Prove every UI number

For each visible metric on World Map + Summary + CSV, extract the exact SQL/RPC actually executed today, run it side-by-side over the last 5h / 24h / 7d, and record deltas in `docs/analytics-truth/phase4-metric-parity.md`. Explain every non-zero delta before fixing anything.

## Phase 5 — Remove parallel truths (the actual fix)

Introduce **one** canonical analytics service:

- Edge function: `supabase/functions/analytics-truth/index.ts` — single entry point, accepts `{ hours, filters }`, returns the full analytics envelope (visitors, sessions, pageviews, product_views, atc, view_cart, cart_restored, begin_checkout, purchases, revenue, duration, per-country breakdown, per-session marker list). Reads only from `canonical_sessions` + `canonical_events` (which are already the merge target). All bot/QA/internal/US filters implemented **once** here.
- Client hook: `src/hooks/useAnalyticsTruth.ts` — the ONLY hook allowed to produce these numbers. `useCanonicalFunnel` and existing dashboards get rewritten as thin selectors over its response.
- CSV export edge function: `analytics-truth-export` — imports the exact same query builder from `analytics-truth` (shared `_shared/truth-query.ts`) and streams CSV. No independent SQL.
- Delete / stub every other analytics fetch path with a runtime `console.warn` + fallback to `useAnalyticsTruth` so nothing silently forks.

## Phase 6 — Counter reconciliation

Run the new service for 5h/10h/24h/7d/30d and diff against Map / Summary / CSV / API / Canonical. All five must match to the row. Store results in `docs/analytics-truth/phase6-reconciliation.md`. Any mismatch = FAIL, iterate.

## Phase 7 — Visual map validation

Assert every map marker `session_id` exists exactly once in the canonical session list returned by `analytics-truth`. Marker count, heatmap intensity, country count, cart badge, checkout badge all derive from the same `sessions[]` array — no independent overlays.

## Phase 8 — Filter validation

Move all filter logic (US-only, exclude internal, exclude synthetic/QA/bot, inactive, date range, source, device, country) into a single `applyTruthFilters()` helper in `_shared/truth-query.ts`. Every surface calls it — no local `.filter()` on the client that changes counts.

## Phase 9 — Duration validation

Investigate the ~2s average despite multi-pageview sessions. Audit the writers for `heartbeat`, click, scroll, `visibilitychange`, focus/blur, `last_seen`, `engaged_duration` on `canonical_sessions` / `analytics_session_quality`. Fix the writer (most likely: `last_seen` never updated after initial insert, or engaged_duration computed only at session start). Recompute historical duration in the truth query as `max(event.ts) - min(event.ts)` per session as the authoritative value.

## Phase 10 — Export certification

CSV export literally serializes the same JSON envelope produced by `analytics-truth`. Zero duplicate SQL. Test: fetch UI JSON + CSV for identical params, parse CSV, deep-equal.

## Phase 11 — Live QA

Playwright script (`e2e/analytics-truth-qa.spec.ts`): fresh session → Home → PDP → Sticky ATC → normal ATC → View Cart → Checkout → Return. Then hit `analytics-truth` with that `session_id` and assert every stage present, and that Map/Summary/CSV/Journey/Funnel/Revenue all show the same session with the same values.

## Phase 12 — Regression tests

- Vitest suite `src/test/analytics-truth-parity.test.ts` — mocks a fixture dataset, asserts Map == Summary == CSV == API == Canonical for visitors/pageviews/atc/checkout/purchases/revenue/duration/country.
- GitHub Actions workflow `.github/workflows/analytics-truth-parity.yml` — runs the suite + a live parity probe against staging on every PR. Fails CI on any drift.

## Phase 13 — Final certification report

`docs/analytics-truth/CERTIFICATION.md` with: root causes, architecture diagram, every changed file, every changed SQL, before/after numbers per timeframe, regression results, live QA evidence, remaining risks, rollback plan (revert the wrapper commits — canonical tables untouched).

---

## Technical section

**Root-cause hypothesis (to be proven in Phase 3–4, not assumed):**
1. Multiple hooks each query different source tables (`visitor_activity` vs `canonical_events` vs `lp_funnel_events`) with different bot/internal/US filters → same metric, different numbers.
2. Map counters read a summary RPC; CSV export re-queries raw tables with a different `WHERE` → 44 vs 44, but 0 vs 5 ATC because one path filters `is_bot` and the other doesn't.
3. Duration writer never updates `last_seen` after mount → duration frozen at ~2s.

**Non-destructive guarantees:**
- No table drops. No column renames. No RLS changes beyond additive read grants for the new edge function (service role).
- Canonical tables (`canonical_events`, `canonical_sessions`) are the merge target — everything else becomes read-only for dashboards.
- Old hooks kept as deprecated shims for one release, emitting `console.warn` so we can find any missed caller.

**Files created (new):**
- `supabase/functions/analytics-truth/index.ts`
- `supabase/functions/analytics-truth-export/index.ts`
- `supabase/functions/_shared/truth-query.ts`
- `src/hooks/useAnalyticsTruth.ts`
- `src/test/analytics-truth-parity.test.ts`
- `e2e/analytics-truth-qa.spec.ts`
- `.github/workflows/analytics-truth-parity.yml`
- `docs/analytics-truth/{phase1-inventory,phase3-session-trace,phase4-metric-parity,phase6-reconciliation,CERTIFICATION}.md`
- `/mnt/documents/analytics-dataflow.mmd`

**Files rewritten as thin wrappers (expected, confirmed in Phase 1):**
- `src/hooks/useCanonicalFunnel.ts`
- Every admin analytics page that currently has its own supabase query for these metrics (World Map, Summary, CSV export, Funnel Health, Sales Commander, Revenue Forensics, Customer Journey, Conversion War Room).

**Scope of this run:** all 13 phases, autonomously. I will pause and ask only if I discover a destructive change is required (schema drop, RLS tightening that could break prod, or removal of a dashboard the user still uses).

**Estimated effort:** large — several hundred tool calls across investigation, edge function authoring, hook refactors, and verification. I'll batch aggressively and report progress at end of each phase.

---

## Confirm before I start

This plan will refactor most analytics-reading code in the app onto one service. It is the right fix for the "44 vs 44 but 0 vs 5" class of bug, and there is no shortcut that also satisfies "zero tolerance / identical numbers everywhere."

Approve and I begin at Phase 1 immediately.
