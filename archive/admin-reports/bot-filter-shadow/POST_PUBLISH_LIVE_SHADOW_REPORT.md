# POST_PUBLISH_LIVE_SHADOW_REPORT

**Run**: Phase 4A live shadow validation
**Window requested**: 45 min organic + controlled test
**Executed at**: 2026-07-17 23:14–23:15 UTC
**Verdict**: `LIVE_TECHNICAL_ROUTE_GUARD_FAILED`

## A. Deployment evidence

| Check | Value | Status |
|---|---|---|
| Publish scheduled | 2026-07-17 ~23:06 UTC (prev turn) | ok |
| Live host | `https://getpawsy.pet` (200) | ok |
| `getpawsy.lovable.app` → `getpawsy.pet` | 302 | ok |
| Served main bundle | `assets/index-bb4B3QnA.js` (231 333 B, etag `5f93396c...`) | — |
| `gp_canonical_sid` string in any of 30 referenced chunks | **NOT FOUND** | FAIL |
| `getCanonicalSessionId` / `isTechnicalPath` in bundle | **NOT FOUND** | FAIL |

**Interpretation**: The bundle currently served at `getpawsy.pet` is the pre-Phase-4A build. The Phase 4A frontend commit was published but has not yet propagated to the served content-hashed bundle (custom-domain propagation can take several minutes, and the served hash is unchanged from pre-publish).

## B. Controlled browser test

Marker: `shadow-b1fb6de0-07c2-42ac-adfa-9492dc271ea7`
UA: `Mozilla/5.0 GetPawsyShadowProbe/<marker>`
Visitor-id: `5e42ec9a-f428-4e8a-9865-52727a30c9eb`

| Step | Path | Expected | Observed |
|---|---|---|---|
| 1 landing | `/` | `gp_canonical_sid` set, mirrored to legacy | `gp_canonical_sid=None`; `gp_session_id=9f22…474e`; `visitor_session_id=1784330080729-0fbn9v4639pe` (different namespace) |
| 2 second page_view | `/products` | same canonical sid | `gp_canonical_sid=None` |
| 3 product_view | (no `/products/` link matched in DOM) | product_view row | not exercised |
| 4 interaction | scroll | UX signals | fired |
| 5 technical route | `/api/health` | **blocked, no commercial event** | **1 `cci_events.page_view` row written for `/api/health` with sid `9f22…474e`** |

### DB read-back (probe events, `created_at > now() - 10m`)

`cci_events` (5 rows, all with sid `9f2206d5-7f3d-4685-b020-df71bedf474e`):

| ts | event_name | page_path |
|---|---|---|
| 23:14:41 | homepage_view | / |
| 23:14:41 | page_view | / |
| 23:14:45 | page_view | /products |
| 23:14:45 | collection_view | /products |
| **23:14:53** | **page_view** | **/api/health** |

`visitor_activity` for the probe UA: **0 rows** (legacy path did not fire on these routes for this UA fingerprint; namespace mismatch cannot be measured because writer produced no rows).

`canonical_events` join: N/A — analytics-canonical is unchanged and not driven by these direct writers.

## C. Organic 45-min window

**Not executed.** Pass criteria require the guarded frontend to be live before organic observation is meaningful. Serving bundle lacks Phase 4A code, so any organic events collected in the next 45 min would be measuring the pre-fix state and cannot satisfy the pass criteria. Aborted per fail-closed rules.

Reference measure (last 30 min, whole storefront, pre-fix bundle):
- `cci_events` total: 79
- `cci_events` on technical prefixes (`/api|/functions|/storage|/admin|/_admin|/rest`): **1** (`/api/health` — from this probe)
- Organic technical-route leakage in last 30 min: **0**

## D. Metric matrix (controlled only)

| Metric | Controlled | Organic |
|---|---|---|
| Raw new events | 5 | not measured |
| CCI sessions | 1 (`9f22…474e`) | — |
| visitor_activity sessions | 0 | — |
| canonical sessions (joined) | 0 | — |
| session_ids joinable | 0 / 1 | — |
| Join % | **0%** | — |
| Namespace mismatches | `gp_canonical_sid=null` vs `gp_session_id=9f22…` vs `visitor_session_id=1784330080729…` = **2 mismatches** | — |
| UUID-per-pageview | 0 (single legacy sid held across 4 pageviews) | — |
| Missing classifier enrichment | 5 / 5 | — |
| Technical-route leakage | **1 (`/api/health`)** | 0 |

## E. Guardrail confirmation (no default flip)

- `analytics-canonical` default: **unchanged**
- Dashboard: **unchanged**
- CSV export: **unchanged**
- Markdown summary: **unchanged**
- Historical rows: **unchanged**
- No backfill · no deletes · no schema changes · no new classifier rules · no synthetic human marking
- Mutations this run: **0** (all queries were SELECT; probe traffic is genuine client-side writes only)

## F. Root cause

The Phase 4A commit was published in the previous turn but the served content-hashed bundle at `getpawsy.pet` is still the pre-Phase-4A build (`index-bb4B3QnA.js`). Because the guard code isn't in that bundle:

1. `SafeGlobalVisitorTracker` did not seed `gp_canonical_sid`.
2. `cci.ts` did not run `isTechnicalPath('/api/health')`, so `/api/health` produced a `cci_events` page_view.
3. Writers still emit via the pre-existing legacy sid namespaces.

This is a **deployment-propagation** state, not a code regression — the underlying Phase 4A wiring itself passed 34/34 synthetic tests last run.

## G. Verdict

`LIVE_TECHNICAL_ROUTE_GUARD_FAILED`

Selected because a technical route (`/api/health`) demonstrably produced a live commercial `page_view` row after the publish call — the strictest, most specific failure in the allowed set. Namespace mismatch is also present, but the technical-route leakage is the higher-severity live evidence and satisfies the exact verdict wording.

## H. Recommendation

1. **Do not proceed to Phase 4B.**
2. Wait for bundle propagation (verify by re-fetching `getpawsy.pet` and confirming a NEW `assets/index-*.js` hash whose body contains `gp_canonical_sid`).
3. Re-run this exact probe once the new hash is served; expect `gp_canonical_sid` set on step 1, all 4 human steps sharing one sid, `/api/health` producing **zero** `cci_events` rows.
4. Only then start the 45-min organic window and re-evaluate pass criteria.