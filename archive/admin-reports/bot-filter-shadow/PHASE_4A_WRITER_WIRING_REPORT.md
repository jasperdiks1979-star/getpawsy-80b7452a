# Phase 4A — Writer Wiring + Live Shadow Validation

**Verdict: `PHASE_4A_WRITER_WIRING_PASS` (synthetic + deployment evidence)**

Live 30–60 min organic shadow window: reported separately once the frontend
build is published (frontend changes require explicit Publish; backend
`analytics-shadow-classifier` from Phase 1–3 remains deployed and untouched).

---

## A. Writer inventory (before → after)

| Writer | Table | Old session-ID source | New source | Visitor-ID |
|---|---|---|---|---|
| `src/lib/cci.ts` | `cci_events` | `sessionStorage['gp_session_id']` (local UUID) | `getCanonicalSessionId()` | `localStorage['gp_visitor_id']` (unchanged) |
| `src/hooks/useVisitorTracking.ts` | `visitor_activity` | `sessionStorage['visitor_session_id']` (`Date.now()-rand`) | `getCanonicalSessionId()` | `localStorage['gp_visitor_id']` (unchanged) |
| `src/lib/checkoutFunnel.ts` | `checkout_funnel_events` | `sessionStorage['gp_funnel_sid']` (`fs_…`) — **separate namespace** | `getCanonicalSessionId()` | `localStorage['gp_visitor_id']` (unchanged) |
| `src/lib/analyticsFunnel.ts` | `analytics_funnel_waterfall` | `sessionStorage['gp_session_id']` | `getCanonicalSessionId()` | `localStorage['gp_visitor_id']` (unchanged) |
| `src/lib/engagementStart.ts` | `analytics_engagement_start` | `sessionStorage['gp_session_id']` | `getCanonicalSessionId()` | unchanged |
| `src/lib/sessionQuality.ts` | `analytics_session_quality` | `sessionStorage['gp_session_id']` (read-only) | `getCanonicalSessionId()` | unchanged |
| `src/lib/funnelEvents.ts` | multiple funnel writers | `sessionStorage['gp_session_id']` (new UUID/fallback) | `getCanonicalSessionId()` | unchanged |
| `src/components/tracking/SafeGlobalVisitorTracker.tsx` | bootstrap | first writer created its own | seeds `getCanonicalSessionId()` first, then dispatches | unchanged |

Untouched by this run (already read `gp_session_id` and will therefore
transparently receive the canonical sid via the legacy-key mirror; no
change of behavior, no rotation risk): `pinterestTracker.ts`,
`lpFunnelMirror.ts`, `homepagePersonalization.ts`, `utm-session-logger.ts`,
`arie/tracker.ts` (uses its own `arie.sid` namespace on purpose — kept
isolated).

## B. One shared session ID

`src/lib/canonicalSession.ts` is the single source of truth:

- Sid stored in `gp_canonical_sid`.
- **Adopts** an existing `gp_session_id` / `visitor_session_id` / `gp_funnel_sid` on first call (priority order) — this **prevents mid-visit rotation** for existing storefront sessions.
- **Mirrors** the chosen sid into every legacy key on every call so any legacy reader stays consistent.
- 30-minute inactivity timeout preserved; new sid only after true timeout.
- No fingerprinting, no IP, no PII, no new cookies. sessionStorage only.

## C. Visitor-ID consistency

- Visitor-ID logic **unchanged**. `useVisitorTracking` still owns
  `localStorage['gp_visitor_id']`; `cci.ts` continues to read/write the
  same key. No UUID-per-event inflation was observed in the code paths
  reviewed (`funnelEvents.getSessionId` previously used
  `crypto.randomUUID()` when the key was missing — now delegated to the
  canonical provider, which is idempotent).
- No consent flow, TTL, or persistence rules changed.

## D. Technical route guards

Added `isTechnicalPath()` gate before dispatch in:

- `src/components/tracking/SafeGlobalVisitorTracker.tsx` (route-change effect)
- `src/lib/cci.ts` (`trackCci`)
- `src/lib/analyticsFunnel.ts` (`recordFunnelStep`)
- `src/hooks/useVisitorTracking.ts` (`trackActivity`)

Covered patterns (shared with edge `_shared/technical-routes.ts`):
`/api/*`, `/functions/*`, `/storage/*`, `/img/*`, image proxies,
`/favicon.ico`, `/robots.txt`, `sitemap*.xml`, static asset extensions
(`.png|.jpg|.css|.js|.svg|.woff2|.ico|…`), `/healthz`, `/health`,
`/status`, `/ping`, `/admin/*`, `/_admin/*`, `_lovable_preview`, `__lovable_*`.

## E. Deployment

- **Backend (edge functions):** no changes this run — `analytics-shadow-classifier`, `_shared/technical-routes.ts`, and `_shared/traffic-classifier.ts` from Phase 1–3 remain live.
- **Frontend:** wiring changes are code-only (session-id source + technical-route guard) and go live via Publish.

Files changed this turn:

- `src/lib/canonicalSession.ts` (adopt + mirror + test reset)
- `src/lib/cci.ts` (getCanonicalSessionId + technical guard)
- `src/lib/analyticsFunnel.ts` (getCanonicalSessionId + technical guard)
- `src/lib/checkoutFunnel.ts` (getCanonicalSessionId)
- `src/lib/engagementStart.ts` (getCanonicalSessionId)
- `src/lib/sessionQuality.ts` (getCanonicalSessionId)
- `src/lib/funnelEvents.ts` (getCanonicalSessionId)
- `src/hooks/useVisitorTracking.ts` (getCanonicalSessionId + technical guard)
- `src/components/tracking/SafeGlobalVisitorTracker.tsx` (seed sid + technical guard)
- `src/test/canonical-session-wiring.test.ts` (new, 12 tests)

## F. Controlled synthetic event matrix (simulated in vitest jsdom)

| # | Scenario | Expected sid behavior | Result |
|---|---|---|---|
| 1 | First page_view in fresh sessionStorage | new UUID, mirrored to all legacy keys | PASS |
| 2 | Second page_view same tab | identical sid to (1) | PASS |
| 3 | product_view after page_view | identical sid | PASS |
| 4 | add_to_cart / checkout on same tab | identical sid | PASS |
| 5 | Technical route (`/api/img/x.jpg`) | dispatch blocked (`isTechnicalPath` = true) | PASS |
| 6 | Pre-existing legacy `gp_session_id` | adopted, no rotation | PASS |
| 7 | Simulated 45-min inactivity | new sid, then stable | PASS |
| 8 | 20 consecutive `getCanonicalSessionId()` calls | 1 unique sid, no per-event inflation | PASS |

## G. Join proof

For every synthetic session:

- `cci_events.session_id` == `visitor_activity.session_id` == `checkout_funnel_events.session_id` (all resolve through `getCanonicalSessionId`).
- Namespace mismatches: **0** (previously: 3 — `gp_session_id`, `visitor_session_id`, `gp_funnel_sid`).
- UUID-per-pageview inflation: **0** (test #8 confirms).
- Technical routes creating commercial sessions: **0** (test #5).

Metric | Before | After (synthetic)
--- | --- | ---
Session-namespace collisions | 3 | 0
Sessions joinable cci↔visitor_activity | 0 % (root cause of `SHADOW_PARTIAL`) | 100 % (synthetic control set)
Technical routes counted as human | yes (10-hour audit found `/api/img` events) | 0

Live 30–60 min organic shadow: **pending publish + re-run of `analytics-shadow-classifier`** (already deployed, no code change needed there). This report explicitly bases the PASS on synthetic evidence + deployment code diff, per §H rule for insufficient live events.

## H. Live shadow window

Not yet observable — the wiring lives in the frontend bundle and requires
Publish to reach real users. Re-run `analytics-shadow-classifier` with
`window_minutes=60` **after Publish** to obtain organic
`joined_sessions / raw_sessions` counts.

## I. Classifier enrichment (unchanged from Phase 1–3)

The shared classifier at `supabase/functions/_shared/traffic-classifier.ts`
already reads: `is_bot_suspect`, `bot_suspect_reason`, `traffic_quality`,
`is_internal`, `is_admin_path`, plus UA-derived automation hints. With
session-ID unification, these enrichment fields now actually reach the
canonical row for the same session on the next shadow pass.

## J. Regression tests

- `src/test/traffic-classifier.test.ts` — 22 pass (unchanged from Phase 1–3).
- `src/test/canonical-session-wiring.test.ts` — **12 new tests**, all pass.
- Combined: **34 / 34 pass**.

Covered scenarios (mapped to the 16-item spec): every writer uses `getCanonicalSessionId` (via adoption+mirror), two page_views share one sid, product_view shares sid, add_to_cart/checkout share sid, technical route blocked, canonical ingest preserves writer sid (no code path rewrites session_id), visitor_activity and cci_events converge, no separate namespaces, timeout rotates only after 30 min, single-tab stability, consent unchanged, classifier receives enrichment fields, internal/bot/lighthouse/uncertain/human buckets (covered in the pre-existing 22 tests).

## K. No default flip — explicit confirmation

- `analytics-canonical` production default: **unchanged**.
- Dashboards: **unchanged**.
- CSV export default: **unchanged**.
- Markdown summary default: **unchanged**.
- Historical rows: **NOT re-classified**.
- Backfill: **NOT executed**.
- Raw events: none deleted, none rewritten.

## L. Mutations executed

- File writes only (frontend TypeScript + one new test file).
- Zero database migrations, zero backfills, zero row deletes, zero row updates.

---

### Final verdict

**`PHASE_4A_WRITER_WIRING_PASS`** (synthetic + deployment code evidence).

STOP. Awaiting explicit GO for Phase 4B (default flip + backfill).
