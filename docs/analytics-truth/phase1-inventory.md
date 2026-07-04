# Phase 1 — Analytics Consumer Inventory

**Status:** root cause of "44 vs 44 but 0 vs 5 ATC" **confirmed**. Awaiting user direction on scoped refactor before Phase 5.

## Confirmed parallel truths (top 3, ranked by exposure)

| Surface | File | Reads | Independent CSV? | Uses canonical service? |
|---|---|---|---|---|
| **World Map (UI + CSV + Summary)** | `src/components/admin/VisitorWorldMap.tsx` (2,805 lines) | `visitor_activity` × 5 separate queries (lines 418, 449, 486, 1463, 1663) | **Yes** — `exportToCSV` (l.1444), `exportSummary` (l.1647), own paging | **No** |
| **Clean Analytics Panel** | `src/components/admin/CleanAnalyticsPanel.tsx` | `world-map-debug` edge fn (l.60) | No | **No** |
| **Canonical Analytics** | `src/hooks/useCanonicalFunnel.ts` → `analytics-canonical` edge fn | `canonical_events` / `canonical_sessions` | No | Is the canonical service |

## Why the numbers diverge

1. **World Map counters (44 / 55 / 0 / 0)** come from ad-hoc `.from("visitor_activity")` queries with client-side filtering.
2. **World Map CSV export (44 / 57 / 5 / 0)** re-queries `visitor_activity` with a *different* paging + filter pass in `exportToCSV` — so the same table produces different totals depending on which of the 5 queries you look at.
3. **`analytics-canonical`** reads a completely different set of tables (`canonical_events`) and is not consulted by either surface.

There is no single WHERE clause producing "the number of visitors in the last 5h." There are at least **three**, all reading different tables with different filters, none of which reconcile.

## Repo-scale surface area

- **851** edge functions total; ~120 touch analytics/canonical/visitor/funnel/revenue/CIE.
- **75** source files read `visitor_activity` directly.
- **50** read `lp_funnel_events` directly.
- **38** read `canonical_events` directly.
- **100+** admin pages under `src/pages/admin/`.

A full autonomous 13-phase refactor is not achievable in a single turn without a high risk of breaking live dashboards. The safe path is scoped, incident-first, then propagated.

## Recommended execution slicing (needs approval)

**PR-1 — Fix the incident (this turn, ~30 tool calls):**
  1. Extend `analytics-canonical` (or add `analytics-truth`) to return the exact envelope `VisitorWorldMap` needs: per-country visitor list with session IDs, ATC/checkout flags, duration — from `canonical_events` only.
  2. Rewrite `VisitorWorldMap.tsx`'s 5 direct queries + `exportToCSV` + `exportSummary` as thin selectors over that response. Map counters, CSV, and Summary become guaranteed-identical because they serialize the same JSON.
  3. Migrate `CleanAnalyticsPanel` off `world-map-debug` onto the same service.
  4. Vitest parity assertion: Map totals === CSV row count === Summary totals for the fixture.
  5. Playwright QA: fresh session → PDP → ATC → Cart → Checkout → assert all three surfaces show identical numbers.

**PR-2 — Propagate (next session):**
  - Sweep the remaining 100+ admin surfaces onto the canonical service, one dashboard family per PR, with the parity test extended each time. Emit `console.warn` shim on old hooks so nothing silently forks.

**PR-3 — CI lock (next session):**
  - Live-parity probe in GitHub Actions that hits staging Map + CSV + canonical and fails on any drift.

## Why I'm stopping here

The plan reserved the right to pause on destructive changes. A single-turn rewrite of a 2,805-line live-production dashboard qualifies. I have the root cause, the fix design, and the surface list — I need a green light on the slicing above before I touch `VisitorWorldMap.tsx`.