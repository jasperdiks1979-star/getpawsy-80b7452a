
## Audit result — most of this already ships

GetPawsy already runs a deep Pinterest stack (per memory + filesystem audit):

| Phase | Status | What exists |
|---|---|---|
| 1. Tracking | Live | `SafePinterestTag` (PageVisit, ATC, Checkout, Search, Signup), `pinterest_capi_outbox` + relay, `pinterest_attribution_sessions`, UTM persistence in `lpFunnelMirror`, cross-session cookie `gp_pin_sess` |
| 2. Catalog feed | Edge fn exists | `supabase/functions/pinterest-feed` — but not exposed at `/pinterest-feed.xml` public URL |
| 3. Product prioritization | Live | `pinterest-autopilot` scores all products (image/margin/category/perf), logs to `pinterest_autopilot_decisions` |
| 4. Pinterest SEO | Live | `pinterest-creative-director` + `pinterest-content-director` generate titles/descriptions/keywords/hashtags |
| 5. Pin creation | Live | `pinterest-viral-batch` + `pinterest-pin-generator` + `pinterest-creative-director` (6 styles, safe-area engine, AI backdrops) |
| 6. Board strategy | Live | `pinterest_boards` table + governance memory (sandbox exclusion, blacklist, auto-selection by priority/style affinity) |
| 7. Scheduler | Live | `pinterest-scheduler` + `pinterest-cron-worker` + `pinterest-schedule-optimizer` (US peak hours, 4/day cap, ≥90min gap) |
| 8. Trends | Live | `pinterest-trend-harvester` + `pinterest-trend-intelligence` (US seasonal calendar + evergreen pet) |
| 9. Revenue | Partial | `pinterest-intelligence-api?panel=revenue` exists; not surfaced as standalone `/admin/pinterest-revenue` |
| 10. AI optimization | Live | `pinterest-auto-evolve` + `pinterest-winner-detector` + `pinterest-learning-rollup` (winner clone, loser blocklist) |

## Real gaps to close

Five concrete deliverables; the rest is already running.

### 1. `/pinterest-feed.xml` public route
The `pinterest-feed` edge function exists but Pinterest needs a stable public URL. Add a `public/_redirects` rule (or Vite middleware) that rewrites `/pinterest-feed.xml` → the edge function, with proper `Content-Type: application/xml` and a long browser cache + short edge cache.

### 2. `/admin/pinterest-health` — unified tracking + funnel dashboard
New page that pulls from `pinterest_funnel_events`, `pinterest_attribution_sessions`, `pinterest_capi_outbox`, and `lp_funnel_events` to show in one view: sessions, PDP views, ATC, checkouts, purchases, revenue, CR, top products. No new edge functions — reuses `pinterest-intelligence-api` panels + direct table reads.

### 3. `/admin/pinterest-products` — Top 25 promotable products
New page calling `pinterest-autopilot?action=score` and rendering the ranked list with score breakdown (image / margin / category_fit / visual_appeal / shipping / performance). Adds a "Promote now" button that enqueues a creative-director run.

### 4. `/admin/pinterest-scheduler` — visual schedule
New page reading `pinterest_pin_queue` (status, scheduled_for, board, product) grouped by day and US peak window. Existing scheduler logic stays untouched; this is read-only surfacing.

### 5. `/admin/pinterest-trends` and `/admin/pinterest-revenue` — promote existing panels
Thin admin pages that wrap the existing `pinterest-intelligence-api` `trends` and `revenue` panels into dedicated routes (currently buried inside `/admin/pinterest-intelligence`).

## Non-goals (already covered, won't touch)

- Tag, CAPI, attribution — not touching `SafePinterestTag`, `pinterest-capi-relay`, or `pinterest_attribution_sessions`
- Board creation/governance — already governed by sandbox-exclusion + blacklist memory rules
- Pin generation engine — `pinterest-creative-director` already produces 6 styles; not rebuilding
- Auto-evolve / winner loop — already running daily via cron
- GMC, GA4, TikTok, canonical/SEO structure — explicitly out of scope per your guardrails

## Implementation order

1. Add `/pinterest-feed.xml` public route mapping → `pinterest-feed` edge function
2. Build `/admin/pinterest-health` page + register in `AdminLayout` + `App.tsx`
3. Build `/admin/pinterest-products` page wired to autopilot scorer
4. Build `/admin/pinterest-scheduler` page (read-only queue view)
5. Build `/admin/pinterest-trends` + `/admin/pinterest-revenue` wrapper pages
6. Final report: tracking status, catalog status, feed URL, readiness score, top 25 products, 30-day plan

## Technical notes

- All new admin pages: lazy-loaded via existing `AdminLayout` lazy pattern (per memory `bundle-optimization`)
- All Supabase calls: use `auth.getUser()` + service role only via existing edge fns (per memory `edge-function-and-api-standards`)
- New pages use semantic tokens from `index.css`; no custom color classes
- No DB schema changes needed — all tables already exist
- No new secrets required — Pinterest OAuth already linked
