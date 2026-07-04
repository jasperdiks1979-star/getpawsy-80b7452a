# Restore "Live now" mode on the Visitor World Map

## Goal
Bring back a true realtime presence view on the Visitor World Map, cleanly separated from canonical business KPIs. `analytics-canonical` remains the only source of business truth (counters, CSV, Summary, parity tests). "Live now" is presence-only, sourced from `visitor_activity.last_seen_at` within the last 120 seconds, and cannot leak into KPI totals.

## What the user will see

- A new **"Live now"** entry at the top of the existing period selector on the Visitor World Map (replacing the current confusing "Live (15 min)" label).
- When "Live now" is active:
  - The map shows one marker per active visitor (last_seen within 120s) with valid geo.
  - Above the map, a clearly-labeled **"Live presence — realtime, not a business KPI"** banner.
  - The counters row switches to Live labels: "X live visitors", "Y with geo", "Z browsing / cart / checkout" — where cart/checkout badges are only shown if a canonical session/visitor row confirms the funnel state.
  - CSV / Summary export buttons are disabled with a tooltip explaining they only apply to canonical periods.
- When any "Last Nh / Nd" option is active: behavior is exactly as today (canonical truth), and existing parity tests must keep passing byte-for-byte.

## Technical details

### File touched
Only `src/components/admin/VisitorWorldMap.tsx` for the mode switch + rendering. New pure helpers go in `src/lib/visitorWorldMapCanonicalFeatures.ts`. Unit test added; existing parity e2e untouched.

### 1. Mode flag
- Add `const isLiveNow = timeRange === "live";`
- Update `TIME_RANGE_OPTIONS`: `{ value: "live", label: "Live now", minutes: 2 }`. `getTimeRangeMs()` for canonical unchanged elsewhere (canonical hours still clamp to `Math.max(1, ...)`).
- Live query window: `Date.now() - 120_000` (was 60s).

### 2. Live marker features (new pure helper)
`buildLivePresenceMarkers(activities, canonicalSessionIds, canonicalVisitorFunnelById): LivePresenceMarker[]`
- Dedupe `activities` by `session_id`, keep row with latest `last_seen_at`.
- Keep only rows with valid lat/lng (reuses `isValidLatLng`).
- `activity_type` for each marker:
  - `"checkout"` if canonical map (by session_id or visitor_id) marks `has_checkout || has_purchase`.
  - `"cart"` if canonical marks `has_add_to_cart || has_view_cart`.
  - `"browsing"` otherwise. **Cart/checkout badges never derive from `visitor_activity` alone** — enforcing the rule "badges only if canonical event exists".
- Returns `{ session_id, visitor_id, latitude, longitude, country, city, page_path, source, activity_type, last_seen_at, isCanonical: canonicalSet.has(session_id) }`.

### 3. Rendering swap in the Mapbox effect
Where the current effect calls `markerFeaturesToGeoJsonWithCanonical(markerFeatures, canonicalSessionIdSet)`, branch on `isLiveNow`:
- `isLiveNow` → build GeoJSON from `liveMarkerFeatures` (canonical flag comes from the intersection). Includes `mode: "live"` property on each feature.
- else → unchanged canonical path.
Effect deps get `isLiveNow` and `liveMarkerFeatures`.

### 4. Counters + labels
- `counts` and `totalVisitors` remain canonical-derived when not live.
- When `isLiveNow`:
  - `totalVisitors = liveMarkerSessions.size` (across live activities, geo not required).
  - `counts = { browsing, cart, checkout }` from live markers' `activity_type` (which was already intersected with canonical for cart/checkout).
  - Badges swap "unieke bezoekers" → "live bezoekers", plus a small warning chip "Live presence · niet-canoniek".
- Fullscreen "Nu online" block already exists; extend it to read the live count when in live mode.

### 5. CSV / Summary in live mode
- Buttons stay visible but `disabled` with tooltip `"CSV / Samenvatting werken alleen op canonieke periodes (5h / 10h / 24h)"`. Prevents accidental non-canonical exports.

### 6. Diagnostics panel (extra data-attributes on the existing block)
- `data-mode` = `"live"` | `"canonical"`
- `data-live-activity-rows` = raw `activities.length` in live mode
- `data-live-active-visitors` = deduped session count (all, incl. no geo)
- `data-live-with-geo` = live rows with valid coords
- `data-live-markers-rendered` = `liveMarkerFeatures.length`
- `data-live-overlap-session` = live session_ids present in canonical set
- `data-live-overlap-visitor` = live visitor_ids present in canonical visitor set
- `data-canonical-sessions-in-period` = existing canonical count (unchanged)
Visible Stat pills mirror the same values when in live mode.

### 7. Zero-KPI-leak invariant
- Canonical `truth`, `truthSessions`, `truthCounters`, `mapDiagnostics`, `canonicalFeatureAudit`, CSV, and Summary code paths are **not** modified. Live values are stored in separate variables (`liveMarkerFeatures`, `liveCounts`, `liveTotalVisitors`) and only branched at the render call sites.
- Existing e2e `visitor-world-map-parity.spec.ts` and `visitor-world-map-render.spec.ts` continue to run on canonical periods and must remain green.

### 8. Tests
- New unit test `src/test/visitor-world-map-live-presence.test.ts`:
  - Given 3 live activities (1 with geo+canonical cart, 1 with geo+not-in-canonical, 1 without geo) and a canonical set, `buildLivePresenceMarkers` returns 2 markers, cart badge only where canonical confirms it, isCanonical flag correct.
  - Deduplication by `session_id` picks latest `last_seen_at`.
  - No mutation of canonical arrays.
- Typecheck (`bunx tsgo`) + vitest must pass.

## Out of scope (explicit non-goals)
- No changes to `analytics-canonical`.
- No changes to CSV / Summary content.
- No new realtime channels; the existing `visitor_activity` subscription and `useQuery` polling are reused.
- No changes to the Clean Analytics Panel or KPI strip.

## Acceptance
- Selecting "Live now" shows markers for visitors active in the last 120s (proven with a local Playwright smoke against `/live-map` after seeding one live `visitor_activity` row).
- Switching back to "Last 24h" restores the exact canonical numbers; parity e2e stays green.
- Live counters carry a "not-canonical" label; CSV/Summary buttons are disabled in live mode.
- Diagnostics attributes expose every count the acceptance list requires.
