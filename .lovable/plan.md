
# Organic Growth Intelligence Center

A single enterprise dashboard at `/admin/organic-growth` that becomes the **Layer-1 truth** for organic growth. Reads only canonical sources — never re-classifies, never re-attributes, never fabricates.

Before I build, I need a few decisions from you so I don't waste a pass. Reply with answers (or "defaults") and I'll ship it end-to-end.

---

## Decisions I need

1. **Route + navigation slot**
   - Default: new page `/admin/organic-growth` ("Organic Growth Intelligence"), added to the admin sidebar under Analytics, above the existing `/admin/organic-first` audit page. Keep `/admin/organic-first` (compliance audit) and `/admin/organic-intelligence` (Success DNA loop) untouched — this new page is the aggregate command center that links out to both.
   - Alternative: replace `/admin/organic-first` and absorb it. Say the word and I'll fold it in.

2. **Data windows on the KPI strip**
   - Default: primary window = last 24h, with deltas vs Yesterday / 7d / 30d computed from `canonical_sessions_traffic_class` daily rollups.
   - Alternative: primary = last 7d. Pick one.

3. **Backend surface**
   - Default: one new edge function `organic-growth-intelligence` that fans out to the canonical views in parallel and returns a single typed envelope (KPIs, channel breakdown, paid validation, leaderboards, funnel, attribution, SEO health, Pinterest organic, Google organic, insights, recommendations). Frontend consumes it through one `useOrganicGrowthIntelligence` hook. This is what keeps the page <500ms and prevents N+1.
   - No new tables. No new classifiers. Insights and recommendations are generated **inside** the edge function from the canonical rows returned in the same call — no separate AI call on page load (evidence-backed rules only; anything below the min sample size is suppressed, not fabricated).

4. **Adapters (Search Console, Merchant Center, Ads, Clarity, Bing WMT)**
   - Default: render the panels as **"Not Connected"** placeholders with a `Connect` CTA that opens the existing connector flow. No fake numbers. Confirm this is what you want (vs hiding the panels entirely until connected).

---

## Scope (once decisions are locked)

### Edge function `organic-growth-intelligence`
Reads, in parallel, ONLY from:
- `canonical_sessions_traffic_class`
- `canonical_events`
- `canonical_sessions`
- `canonical_traffic_class_funnel_24h`
- `v_organic_product_ranking_30d`
- `v_organic_pin_ranking_30d`

Returns a single typed envelope with every section below. Bots + internal excluded via the same predicates canonical uses.

### Frontend page `/admin/organic-growth`

Sections, in order:
1. **KPI strip** — Organic Sessions / Visitors / Product Views / ATC / Checkout / Purchases / Revenue / CVR / avg attribution confidence, each with Δ vs Yesterday / 7d / 30d.
2. **Organic channel breakdown** — one card per source (Google, Pinterest, TikTok, Facebook, Instagram, Reddit, LinkedIn, YouTube, Bing, DuckDuckGo, Yahoo, Referral, Direct, Unknown). Sessions, visitors, PV, ATC, checkout, purchases, revenue, CVR, avg duration, bounce, trend sparkline, share of organic.
3. **Paid Validation panel** — clearly labelled "VALIDATION ONLY — AI never promotes products from paid data alone." One row per paid channel with sessions/revenue/CVR (+ ROAS/cost only if canonical exposes them; otherwise "—").
4. **Organic Leaderboard** — Top Landing Pages, Top Products (from `v_organic_product_ranking_30d`), Top Pinterest Pins (from `v_organic_pin_ranking_30d`), Top Google Landing Pages. Search Queries card shown as "Not Connected" until GSC is wired.
5. **Organic Growth Map** — reuses the Visitor World Map component in a source-color-only mode (Google green, Pinterest red, TikTok purple, Meta blue, Direct gray, Referral teal, Unknown light gray, Paid amber). Marker color is locked to source; size = activity; glow = engagement.
6. **Attribution panel** — first / last / assisted / multi-touch counts + confidence + evidence source distribution (organic / paid / blended / heuristic / insufficient_data).
7. **SEO Health** — indexable pages, indexed products/collections/guides/blog, missing metadata/schema/canonical/OG, missing sitemap entries, robots exclusions, pages without internal links / impressions. Sourced from existing SEO scanner tables; anything not yet tracked shows "Not tracked" instead of a fabricated number.
8. **Pinterest Organic** — impressions, outbound clicks, CTR, saves, top boards, top pins, pin age, velocity, saturation. All from canonical + existing `pinterest_analytics_daily`.
9. **Google Organic** — top URLs / entry / exit pages, conversions, revenue from canonical. GSC-only fields ("Top Search Queries", "Impressions", "Avg Position") shown as "Not Connected" until GSC is wired.
10. **Organic Funnel** — Landing → PV → ATC → Checkout → Purchase with drop-off %.
11. **AI Insights** — rule-based, evidence-backed, generated from the same envelope. Suppresses any insight where `sample_size < min` or `confidence < 0.7`.
12. **Recommendations** — every card shows Evidence Source / Confidence / Sample Size / Freshness. Nothing rendered without all four.

### Guarantees
- No new classifier, no new attribution logic, no new ranking algo.
- Zero writes. Read-only page.
- No fabricated adapter data — every unconnected integration renders "Not Connected".
- Loads under 500 ms once the edge function's per-envelope response is cached at the CDN edge for 30s (same pattern as `analytics-canonical`).
- Regression surface: none — existing `/admin/organic-first`, `/admin/organic-intelligence`, Visitor World Map, and analytics-canonical remain byte-identical.

---

## What I'll return after build

- PASS/FAIL per section
- Files changed (edge function, hook, page, component list)
- Views consumed (list — no views created)
- Playwright screenshot of the loaded dashboard
- Timing measurement (edge function TTFB + client render)
- Regression check: `analytics-truth-parity` test + visitor world map tests still pass
- Enterprise certification score against the requirements list

Reply with answers to the 4 decisions (or "defaults") and I'll build.
