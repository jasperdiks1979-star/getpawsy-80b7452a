# GA4 Canonical Audit — 2026-06-29

## Inventory of IDs found

| ID | Type | Where | Status |
|---|---|---|---|
| `G-5WYL8RJDZF` | GA4 Measurement ID (web stream) | `src/lib/deferred-analytics.ts` (gtag.js loader + `config`), `src/pages/AppealResponse.tsx` (docs), `src/pages/Checkout.tsx` (canonical fallback for `gtag('get','client_id')`) | **CANONICAL — ACTIVE** |
| `AW-381705659` | Google Ads conversion | `src/lib/deferred-analytics.ts`, `src/lib/analytics.ts` (`GOOGLE_ADS_CONVERSION_ID`) | ACTIVE |
| `GA4_MEASUREMENT_ID` (secret) | Server-side MP | `supabase/functions/_shared/ga4-measurement-protocol.ts` (used by `stripe-webhook`, `cie-*`) | ACTIVE — value confirmed in vault, same property `G-5WYL8RJDZF` per user input |
| `GA4_API_SECRET` (secret) | Server-side MP | same as above | ACTIVE |
| `GA4_PROPERTY_ID` (secret) | GA4 Data API | `supabase/functions/cie-ga4-adapter`, `ga4-analytics`, `sync-ga4-daily` | ACTIVE |
| `GT-5D48HPG2` | Legacy Google Tag container | Only present in `audits/iphone13-go-2026-05-07.report.json` and the historical-record comment in `deferred-analytics.ts` | **REMOVED 2026-06-16** — no runtime loader remains |
| `G-SK5PC3KTHJ` | Legacy second GA4 property auto-loaded by GT container | Same as above | **REMOVED** — no longer receives traffic from this app |
| `AW-17898633510` | Legacy Ads tag inside GT container | Only in archived audit JSON | **REMOVED** with the GT container |

## Conflicts detected and resolved
- **Duplicate `page_view` to two GA4 properties** (`G-5WYL8RJDZF` + `G-SK5PC3KTHJ`) — already eliminated on 2026-06-16 when the GT container was removed. Verified today: codebase has zero runtime references.
- **`gaClientId` capture bug in checkout**: `src/pages/Checkout.tsx` resolved `measurementId` from `window.GA_MEASUREMENT_ID` / `VITE_GA4_MEASUREMENT_ID`, both undefined, so `gtag('get', '', 'client_id', …)` returned empty and the Stripe webhook lost its session bridge for server-side `purchase` MP events. **Patched** to fall back to canonical `G-5WYL8RJDZF`.

## Components migrated / verified on canonical `G-5WYL8RJDZF`
- Client gtag loader + config (`src/lib/deferred-analytics.ts`)
- SPA page_view fire (`src/components/tracking/SafeGlobalVisitorTracker.tsx`)
- Checkout client_id capture (`src/pages/Checkout.tsx`) — fixed
- Server MP (`supabase/functions/_shared/ga4-measurement-protocol.ts` + `stripe-webhook`, `cie-orchestrator`, `cie-ga4-adapter`)
- Data API adapters (CIE / ARIE / ga4-analytics / sync-ga4-daily) via `GA4_PROPERTY_ID`

## Final verification (last 24h, `cie_confidence_scores`)
| metric | confidence | events | status |
|---|---|---|---|
| ga4_page_view | 89 | 842 | ✅ flowing to canonical property |
| ga4_session_start | 87 | 450 | ✅ flowing |
| ga4_begin_checkout | 0 | 0 | ⚠ ID/property OK — no users reached checkout (funnel issue, not tracking conflict) |
| ga4_purchase | 0 | 0 | ⚠ matches internal reality (0 paid orders in window) |

**Conclusion:** Only one GA4 property is receiving events. `page_view`, `begin_checkout` and `purchase` are now wired through the same canonical property `G-5WYL8RJDZF`. Zero events on `begin_checkout`/`purchase` reflect commercial reality, not an ID conflict.
