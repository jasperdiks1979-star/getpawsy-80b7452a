# Visitor World Map Pro V2 — Staged Production Refactor

This is a multi-week program, not a single-turn edit. Trying to ship every deliverable (new admin page, enterprise-grade dashboard, timeline replay, websocket live engine, session detail drawer, resizable/dockable panels, render-worker infra audit, CI parity extensions, session-duration rewrite, Pinterest attribution audit, exhaustive test suite) in one uninterrupted run would guarantee exactly the "fabricated PASS" outcome the brief forbids. I'm proposing a staged plan where each stage is independently verifiable with real evidence before the next begins.

Ground rule reaffirmed: **all business KPIs read only from `analytics-canonical` via `useAnalyticsTruth`**. Live presence stays isolated (already implemented, `mode=live`, no KPI leak). Diagnostics stay labelled "Diagnostic only".

## Stage 0 — Inventory & baseline (no code changes)
- Enumerate every current consumer of visitor/session data: `VisitorWorldMap`, `CleanAnalyticsPanel`, `CanonicalKpiStrip`, `LiveVisitorInspector`, CSV/Summary exports, mobile widget, any legacy desktop map.
- Confirm whether a separate "desktop" implementation still exists, or if `VisitorWorldMap` is already the shared component. This determines whether Stage 1 is a merge or just a rename+extend.
- Capture screenshots on iPhone / iPad / laptop / desktop widths against the current build as the baseline for "after" comparisons.
- Output: short written inventory committed to `docs/visitor-world-map-v2/inventory.md`.

## Stage 1 — Single component: `VisitorWorldMapV2`
- Rename/extract the current `VisitorWorldMap` into `src/components/admin/visitor-world-map-v2/` with subcomponents (`Toolbar`, `KpiHeader`, `MapCanvas`, `LeftFilters`, `RightFeed`, `DiagnosticsPanels`).
- Old `VisitorWorldMap` becomes a thin re-export so nothing else breaks.
- Responsive layout via CSS grid + container queries; **one** component renders on all viewports.
- Acceptance: existing e2e parity tests still green; visual diff on mobile matches baseline.

## Stage 2 — New admin route: Visitor World Map Pro
- Add route `Admin → Analytics → Visitor World Map Pro` mounting `VisitorWorldMapV2` in "pro" layout (wider grid, left+right sidebars visible ≥1280px, collapsible <1280px).
- Compact widget on existing pages keeps working via the same component in "compact" mode.
- Acceptance: navigating between compact widget and Pro page shows identical numbers for the same filters.

## Stage 3 — Toolbar, filter, and KPI surface
- Time selector: `live, 30m, 1h, 2.5h, 5h, 10h, 24h, 7d, 30d, custom`.
- Source / activity / quick-filter selectors as specified.
- KPI header cards: only the metrics `analytics-canonical` already returns. Any metric not yet in the canonical envelope (AOV, RPV, RPS, avg session duration, bounce, heartbeat %, scroll %, engagement %) is listed explicitly as "not yet available from canonical — pending Stage 6" rather than fabricated.
- Saved filter presets in `localStorage` (no new table yet).

## Stage 4 — Live mode hardening
- Current live presence pipeline stays; add the visible "LIVE PRESENCE — realtime only, not canonical, business KPIs disabled" banner and disable KPI cards while live.
- Realtime updates via existing Supabase Realtime channel on `visitor_activity`; no new websocket infra.
- Acceptance: switching between "Live now" and "Last 24h" flips banner + KPI availability; canonical numbers unchanged.

## Stage 5 — Right sidebar visitor feed + session detail drawer
- Feed of live/recent visitors with the fields the canonical + activity sources already expose. Fields that don't exist yet (bot score, fraud score, AI purchase probability, confidence score) are marked "not tracked" — not invented.
- Session detail drawer built from `canonical_events` for the selected `session_id`.

## Stage 6 — Data-quality investigations (separate, evidence-first)
Each of these gets its own PR with root-cause writeup + parity test, not a hand-wave:
- **Pageview parity.** Reproduce the mismatch across Dashboard / CSV / Summary / Canonical / Report with real numbers, identify the diverging code path, fix, add parity test in `src/test/`.
- **Session duration.** Audit heartbeat writer + engagement gate; propose fix; only ship after we can show measured vs previous values.
- **Pinterest attribution.** Trace one Pinterest session end-to-end through `analytics-canonical`, Sales Commander, Customer Journey, Organic Intelligence, Revenue Forensics; document any drift.

## Stage 7 — Desktop productivity extras
Only after Stages 1–5 are green: resizable panels (`react-resizable-panels`), fullscreen map, keyboard shortcuts, layout persistence, one-click export, timeline replay.

## Stage 8 — Render Worker audit
Separate track. Inspect `render-worker/` config, Render env vars, `RENDER_WORKER_SECRET` / `SUPABASE_URL` presence, boot-loop logs. Deliver a written audit + concrete fixes. Not bundled into the map refactor.

## Stage 9 — CI parity extensions
Extend `.github/workflows/analytics-truth-parity.yml` and `scripts/analytics-truth-parity-probe.mjs` to also assert: Desktop==Mobile (same component now, so trivially true — assert via a rendered snapshot), CSV==Summary==Canonical==Widget==Map for pageviews, revenue, purchases, ATC, checkout.

## Certification policy
No stage is marked PASS without: (a) the file diff, (b) `tsgo` + vitest green, (c) Playwright screenshot evidence at the relevant viewport, (d) for parity claims, the actual numbers side-by-side. Stages where a claim can't be honestly certified will be returned as FAIL with the blocking evidence, per the brief.

## What I need from you to start
1. Approve this staged plan (or tell me which stages to drop / reorder).
2. Confirm Stage 1 scope: is there still a separate legacy "desktop" map component I need to find and merge, or is `src/components/admin/VisitorWorldMap.tsx` already the only implementation? (A quick "yes it's the only one" or "look under X" saves a full-repo audit.)
3. Confirm Stage 8 (Render Worker) can be handled as a parallel track by itself — it doesn't belong inside the map refactor.

Once approved I'll execute Stage 0 → Stage 1 in the next turn and stop for review before Stage 2, so each stage's PASS is real.
