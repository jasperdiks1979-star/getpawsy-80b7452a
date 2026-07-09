
# Google Enterprise Intelligence Platform (GEIP) V1

Layer-0 canonical Google intelligence for GetPawsy. Read-only. Additive. Zero fabrication. No changes to Pinterest / PCIE2 / PCIE3 / Guardian / Creative Factory / Publishers / Queues / Checkout / analytics tracking / canonical-analytics / Organic Intelligence / Revenue Intelligence.

---

## Pre-flight audit (already done)

- Workspace connectors linked to this project: only **Firecrawl**. The `google_search_console` connector is **NOT linked** yet. Merchant Center runs today via an in-app OAuth pair (`merchant-oauth-start` / `merchant-oauth-callback`). GA4 runs via existing `ga4-analytics` / `sync-ga4-daily` / `cie-ga4-adapter` edge functions.
- No `/admin/google-*` routes exist. Many single-purpose functions exist (`gsc-keyword-intelligence`, `indexation-accelerator`, `merchant-*`, `seo-diagnostics`, `seo-recovery-engine`, `paip-seo-scorer`, `request-indexing`, `indexnow-ping`, `autonomous-seo-engine`).
- GEIP will not replace any of these. It reads from them + from Google APIs, and stores canonical snapshots.

---

## Architecture

```text
┌──────────────────────── Google Enterprise Gateway (shared TS module) ────────────────────────┐
│  _shared/google-gateway.ts                                                                    │
│  - callGSC()      → connector-gateway (google_search_console) once linked, else waiting       │
│  - callGA4()      → reuses existing GA4 service-account secret                                │
│  - callMerchant() → reuses existing merchant OAuth tokens (merchant-oauth-callback flow)      │
│  - callPageSpeed()/callCrUX() → PAGESPEED_API_KEY (public key, safe in secret store)          │
│  - callUrlInspection() / callSiteVerification() → same GSC gateway                            │
│  - callIndexing() → present but DISABLED unless GEIP_INDEXING_WRITE=on (explicit approval)    │
│  Every call: connection-health check → cached-token refresh → typed response + provider-error │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                             │
                 ┌──────── daily crons (pg_cron → sync edge functions) ────────┐
                 │ geip-sync-search-console  03:20 UTC                          │
                 │ geip-sync-ga4             03:25 UTC                          │
                 │ geip-sync-merchant        03:30 UTC                          │
                 │ geip-sync-pagespeed       03:35 UTC (top 25 URLs)            │
                 │ geip-sync-technical-seo   03:40 UTC (robots, sitemaps, schema│
                 │ geip-sync-indexation      03:45 UTC (URL inspection sample)  │
                 │ geip-health-score         03:50 UTC (recomputes all scores)  │
                 │ geip-alerts               04:00 UTC (delta detection)        │
                 └──────────────────────────────────────────────────────────────┘
                                             │
                              geip_* canonical tables (historical)
                                             │
                 ┌────────── /admin/google-enterprise (12 sections) ────────────┐
                 │ Executive · GSC · Indexation · Merchant · GA4 · PageSpeed    │
                 │ Technical SEO · AI Search · Organic Growth · Health Score    │
                 │ Monitoring · Copilot                                         │
                 └──────────────────────────────────────────────────────────────┘
```

**Waiting-state pattern:** every sync function checks `gateway.status()`. Missing credentials → row inserted into `geip_sync_runs` with `status='waiting_for_auth'` and a machine-readable `blocker` code. Dashboard sections render "Waiting for authorization" with a Connect CTA rather than fabricating numbers. Nothing is mocked.

**Dormant AI modules:** Copilot, Organic Growth Engine and recommendation engine ship fully implemented but each checks `geip_readiness()` (min days of history + min row count per source). Below threshold → renders "Learning phase: N/M days of Google data collected". No manual re-migration needed to activate.

---

## Database (one migration, all additive, `geip_` prefix)

Every table gets `GRANT SELECT ... TO authenticated; GRANT ALL TO service_role;` + RLS + `has_role(auth.uid(),'admin')` policy for reads. Writes are service-role only from edge functions.

| Table | Purpose |
|---|---|
| `geip_connections` | Which Google surfaces are authenticated (`gsc`, `ga4`, `merchant`, `pagespeed`, `crux`, `indexing`, `business_profile`); status, last_ok_at, blocker, scopes. |
| `geip_properties` | Verified GSC properties, GA4 property IDs, Merchant account IDs (multi-account ready). |
| `geip_sync_runs` | Every cron invocation: source, started_at, finished_at, rows_ingested, status, error, blocker. |
| `geip_gsc_daily` | Per-day totals: clicks, impressions, ctr, position; dimensions: query/page/country/device/search_appearance. |
| `geip_gsc_top_queries` / `geip_gsc_top_pages` | 30d rolling top-N snapshots. |
| `geip_gsc_coverage` | Index status buckets (indexed, excluded, discovered, crawled, canonical conflict, soft 404, blocked). |
| `geip_url_inspection` | Per-URL inspection results (verdict, coverage, indexing, mobile, rich_results), refreshed on sample rotation. |
| `geip_sitemaps` | Sitemap status from GSC. |
| `geip_manual_actions` / `geip_security_issues` | Full messages from GSC. |
| `geip_ga4_daily` | Sessions, users, engaged sessions, revenue, purchases per channel/source/medium/landing. |
| `geip_merchant_products` | Product-level approval status, disapproval reasons, warnings. |
| `geip_merchant_issues` | Aggregated feed diagnostics. |
| `geip_pagespeed_runs` | LCP/CLS/INP/TTFB/FCP + Lighthouse category scores per URL per run (mobile+desktop). |
| `geip_crux_daily` | Field data (CrUX) per origin/URL. |
| `geip_technical_seo` | robots.txt, sitemap.xml, canonical/schema/OG/twitter/hreflang audit results per URL. |
| `geip_ai_search_signals` | Presence of FAQ, HowTo, Product, Review, Breadcrumb, Article schema; entity coverage per URL. |
| `geip_health_scores` | Overall + 11 sub-scores per day with `why` JSON explaining each. |
| `geip_alerts` | Delta-detected alerts (traffic drop, ranking drop, merchant disapproval, coverage regression, CWV regression, security). |
| `geip_opportunities` | Rows produced by the Organic Growth Engine — keyword gaps, product opportunities, internal-link suggestions, with expected traffic/revenue lift + evidence. |
| `geip_copilot_answers` | Cached Copilot Q&A with `evidence_refs` pointing to canonical rows. |

Historical retention: 400 days for daily rollups, 90 days for URL inspections, unlimited for scores/alerts.

---

## Edge functions

Shared: `supabase/functions/_shared/google-gateway.ts`, `_shared/geip-readiness.ts`, `_shared/geip-scoring.ts`.

Sync functions (all read-only, additive, callable manually + via cron):

- `geip-sync-search-console`
- `geip-sync-ga4`
- `geip-sync-merchant`
- `geip-sync-pagespeed`
- `geip-sync-crux`
- `geip-sync-url-inspection`
- `geip-sync-technical-seo`
- `geip-sync-ai-search-signals`

Intelligence functions:

- `geip-health-score` — writes `geip_health_scores` with per-score `why` JSON.
- `geip-alerts` — delta detector.
- `geip-organic-growth` — opportunity ranker (dormant until readiness passes).
- `geip-copilot` — LLM (Lovable AI Gateway, google/gemini-2.5-flash) with strict evidence-only prompt; refuses to answer without canonical rows.

Reader function (single fan-out envelope for the dashboard):

- `geip-envelope` — parallel reads from `geip_*` + returns typed envelope. 30s edge-cache pattern like `analytics-canonical`. Powers the whole dashboard through one hook `useGoogleEnterprise()`.

Cron: registered via `supabase--insert` (not migration) since it embeds function URL + anon key.

---

## Frontend `/admin/google-enterprise`

- New route `src/pages/admin/GoogleEnterprisePage.tsx` with 12 tabbed sections matching the mission spec (Executive, Search Console, Indexation, Merchant, GA4, PageSpeed, Technical SEO, AI Search, Organic Growth, Health Score, Monitoring, Copilot).
- One hook `useGoogleEnterprise(section)` calling `geip-envelope`.
- Every panel renders one of: `Ready`, `Loading`, `WaitingForAuth (Connect CTA)`, `LearningPhase (X/Y days)`, `Error`.
- Every metric card shows its source table, sample size, freshness, and (for scores) a "Why" popover.
- Sidebar nav entry under Analytics, above the existing `/admin/organic-growth` link.

---

## Authentication & write-safety

- Reuses linked connectors. Bootstraps the `google_search_console` connector via `standard_connectors--connect` on first setup; if the user hasn't linked it yet, all GSC-dependent panels sit in `waiting_for_auth` — no failure, no mock.
- Reuses existing Merchant OAuth token flow (`merchant-oauth-*` functions) — no second OAuth built.
- Reuses existing GA4 secret used by `ga4-analytics`.
- PageSpeed + CrUX use `PAGESPEED_API_KEY` (requested via `add_secret` if missing).
- Indexing API: helper is present in `google-gateway.ts` but every write path checks `GEIP_INDEXING_WRITE === 'on'`; default off. Same guard on Site Verification writes and Merchant mutations. Read-only default per mission rules.

---

## Integration with existing systems (no duplication, no breakage)

- `geip_gsc_daily` becomes the canonical source; existing `gsc-keyword-intelligence` and `seo-diagnostics` keep running unchanged and are read by `geip-sync-search-console` as fallback when the direct GSC call is in waiting state.
- `analytics-canonical` and `useOrganicGrowthIntelligence` are untouched. GEIP publishes read-only views that Organic Intelligence and Revenue Intelligence can consume later without schema changes.
- No overlap with PCIE2/PCIE3/Guardian/Creative Factory/Publishers — GEIP is Google-only.

---

## Deliverables

1. One migration creating all `geip_*` tables + RLS + GRANTs.
2. One insert-tool call registering 8 pg_cron jobs.
3. `_shared/google-gateway.ts`, `_shared/geip-readiness.ts`, `_shared/geip-scoring.ts`.
4. 11 edge functions listed above.
5. `useGoogleEnterprise` hook + `GoogleEnterprisePage` + 12 section components + sidebar nav entry.
6. `add_secret` request for `PAGESPEED_API_KEY` if not present.
7. `standard_connectors--connect` prompt for `google_search_console`.
8. Post-build report: tables created, functions deployed, cron jobs scheduled, connections detected vs waiting, dormant modules and their readiness thresholds.

---

## What I need from you before I start

Reply `approve` and I ship the whole thing in one pass. If you want any of these changed first, say so:

- Route path: `/admin/google-enterprise` (default) vs `/admin/google`.
- Health-score weighting: default = equal weight across the 11 sub-scores, with Search Console + Merchant + PageSpeed doubled. OK?
- Copilot model: `google/gemini-2.5-flash` via Lovable AI Gateway (free-tier friendly, strong at evidence citation). OK?
- Learning-phase thresholds for dormant modules: **14 days of GSC data + 14 days of GA4 data + ≥50 URL inspections** before Organic Growth Engine and Copilot leave dormant state. OK?
