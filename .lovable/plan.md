# Analytics Integrity Certification — Plan

## Scope (as you selected)

- Read-only audit report of every mismatch between the 4 target dashboards.
- Build **one** canonical service, `analytics-canonical` edge function + `useCanonicalFunnel` hook.
- Migrate the 4 dashboards to consume it. Everything else keeps its current queries and gets a deprecation note.

Target dashboards:
1. Visitor World Map (`VisitorWorldMap.tsx` / `LiveMap.tsx`)
2. Visitor Summary / Clean Analytics Panel (`CleanAnalyticsPanel.tsx`)
3. Funnel Health Center (`FunnelHealthCenter.tsx`, `FunnelHealth.tsx`)
4. Sales Commander (`SalesCommanderPage.tsx`)

## Canonical definitions (locked)

All counts are **distinct sessions**, filtered `is_bot=false AND classification IN ('verified_user','probable_user') AND qa IS NOT TRUE`, from `lp_funnel_events` unless noted.

| Metric | Definition |
|---|---|
| `visitors` | distinct `session_id` with any event in window |
| `sessions` | same as visitors (session = visit) |
| `page_views` | `event_name='page_view'` — raw count, not deduped |
| `product_views` | distinct sessions with `event_name='view_item'` |
| `add_to_cart` | distinct sessions with `event_name='add_to_cart'` |
| `view_cart` | distinct sessions with `event_name='view_cart'` |
| `checkout_started` | distinct sessions with `event_name='begin_checkout'` |
| `purchases` | distinct `orders.id` where `status='paid'` in window (independent of funnel gate) |
| `revenue` | `SUM(orders.total_amount)` where `status='paid'` |
| `conversion_rate` | `purchases / visitors` |

World Map country breakdown uses `geo_country` from the same rows. No dashboard may compute these differently.

## Deliverables

### 1. Audit report — `docs/analytics-integrity-audit-2026-07-03.md`
For each of the 4 dashboards: source table(s), current SQL/filter, timezone, bot filter, US-only filter, resulting number for last 10h, and the delta vs canonical. Root cause for each mismatch (e.g. World Map counting `page_path='/cart'` pageviews instead of `add_to_cart` events; Visitor Summary reading `visitor_activity` which lacks the bot filter).

### 2. Canonical service — `supabase/functions/analytics-canonical/index.ts`
- Input: `{ from, to, geo?: 'US'|'all' }`
- Output: one JSON with every metric above + per-country breakdown + funnel array `[page_view, view_item, add_to_cart, view_cart, begin_checkout, purchase]`.
- Uses service role; enforces the Clean filter server-side.
- 30s in-memory cache keyed on inputs.
- `verify_jwt = true` (admin-only).

### 3. Client hook — `src/hooks/useCanonicalFunnel.ts`
Thin wrapper over `supabase.functions.invoke('analytics-canonical', ...)` with react-query, 30s staleTime. Returns typed `CanonicalFunnel`.

### 4. Migrations
- `VisitorWorldMap` / `LiveMap`: replace its own query with `useCanonicalFunnel`. Country markers driven by canonical per-country breakdown. `cart` marker = sessions with `add_to_cart` (not `/cart` pageviews).
- `CleanAnalyticsPanel`: drop local calculations; render numbers straight from hook.
- `FunnelHealthCenter` / `FunnelHealth`: replace the KPI cards + funnel bars with hook data. Keep the existing latest-events inspector and QA sim buttons unchanged.
- `SalesCommanderPage`: KPI strip (visitors, ATC, checkout, purchases, revenue, CVR) reads hook.

### 5. Self-test — `src/test/canonical-funnel.test.ts`
Given a fixed set of `lp_funnel_events` + `orders` fixtures, assert the canonical service returns the exact expected counts and that dashboard renderers show identical numbers.

### 6. Before/After certification block
Appended to the audit doc: last-10h numbers per dashboard, before vs after, PASS/FAIL per metric, dashboard consistency score (=100% when all 4 render identical numbers).

## Out of scope (explicit)

- No changes to event *emission* (client `funnelEvents.ts`, GA4 config, gtag, DataLayer).
- No changes to `visitor_activity` writers or Stripe webhook.
- Other admin dashboards (Traffic Command Center, Revenue AI, TikTok/Pinterest funnels, UTM Conversion Events, etc.) keep their current queries. They will get a `// TODO(canonical): migrate to useCanonicalFunnel` comment so future work is obvious. No silent behavioral change to them.
- No GA4 Data API reconciliation in this pass (would require GA4 credentials + quota work). Called out as follow-up.

## Risks

- Numbers on migrated dashboards will drop vs today because the Clean filter is stricter than what World Map currently uses. This is expected and correct; it's the whole point of the certification.
- If `lp_funnel_events` is missing events that only exist in `visitor_activity` (legacy rows), historical windows may look lower. Audit report will quantify this and, if material, I'll add a one-time backfill migration proposal for you to approve separately — not in this pass.

## Acceptance

- One edge function, one hook, four migrated dashboards, one audit doc, one test file — all four dashboards render identical numbers for the same window.
