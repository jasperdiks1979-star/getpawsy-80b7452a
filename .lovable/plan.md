# Crawler identity enrichment — plan only (nothing changed)

## What exists today
- **Crawler logging function** (`log-crawler-visit`, ~1,000 lines): gets called from the page itself, reads the user agent and the visitor's IP from request headers, and already checks Googlebot against **Google's published IP ranges** (verified vs spoofed). It writes to `crawler_visits` with sampling and duplicate protection.
- **Classifiers**: `_shared/traffic-classifier.ts` (server-side, has `known_crawler_ua` → bot), `src/lib/trafficQualityClassifier.ts` (Human / Possible / Bot / Internal used by the dashboards and CSV), plus `is_real_human_session` / `real_human_sessions` in the database.
- **Pipeline**: `analytics-canonical` + `canonical_sessions` / `tsi_session_enrichment` supply the Human / Expanded / Raw modes.

## Hard limits (please read)
1. **Only crawlers that run JavaScript get seen.** The store is served as static files, so no server code runs when a page is requested. A crawler that just downloads the HTML and doesn't run scripts (common for AdsBot and for sitemap/feed fetches) never reaches our code. We can't see server status codes or response times for page loads. The one exception is the feed, which already runs through our own server code, so feed fetches can be logged there.
2. **Reverse DNS**: the backend runtime has a DNS lookup call, but support for reverse lookups isn't guaranteed. Fallback: verify against the IP ranges Google and Bing publish, as we already do for Googlebot. Google says this method is as valid as a DNS check.
3. **ASN / network owner**: there's no free source for this in our current setup, and we won't add a paid service. We'd mark visits as "datacenter: yes" only when the IP matches a known crawler's published ranges. ASN and network owner would stay empty.

## Smallest safe scope (proposed)
1. **Migration (adds fields only)** on `crawler_visits`: `crawler_identity`, `crawler_family`, `crawler_verified`, `crawler_verification_method`, `crawler_confidence`, `user_agent_family`, `ip_hash` (salted, one-way), `crawler_reasons text[]`. Raw IPs are no longer stored. Rows are deleted after 90 days. A small cache table, `crawler_ip_verification` (hash, identity, verified, expires after 24h), avoids repeat lookups.
2. **New `_shared/crawler-identity.ts`**: matches the user agent for about 15 crawlers (Googlebot, Googlebot-Image, Google-InspectionTool, AdsBot-Google/Mobile, Mediapartners, Bingbot, BingPreview, Pinterestbot, facebookexternalhit, Applebot, DuckDuckBot, Ahrefs, Semrush, generic automation). It checks them against published IP ranges for Google and Bing, then tries a reverse-DNS round trip only if the runtime supports it. It returns reason codes such as `crawler:verified_googlebot`.
3. **Hook it into `log-crawler-visit`**, replacing the Googlebot-only check. Verified crawlers are never sampled out. The page doesn't wait for this.
4. **Classifier**: `traffic-classifier.ts` and `trafficQualityClassifier.ts` get VERIFIED_SEARCH / ADS / SOCIAL / KNOWN_OTHER crawler classes. They only add to the existing rules and are never counted as human, so Human and Expanded modes can only lose crawler rows. Raw mode is unchanged.
5. **Admin**: a read-only Crawlers page with filters and a timeline of visits to key pages. No IPs are shown.
6. **CSV**: extra crawler columns added to the existing Visitor World Map export.
7. **Tests**: focused cases A–H from your spec, one test file.

Nothing changes what shoppers or crawlers see. It only observes, so there's no cloaking risk.

## Files
- New: `supabase/functions/_shared/crawler-identity.ts`, `src/pages/admin/CrawlersPage.tsx`, `src/test/crawler-identity.test.ts`, 1 migration
- Edited: `log-crawler-visit/index.ts`, `_shared/traffic-classifier.ts`, `src/lib/trafficQualityClassifier.ts`, the export CSV headers, and the admin route list in `App.tsx`

## Estimated credits
- Steps 1–4 + tests (the core): about 6–10 credits
- Steps 5–6 (admin page + CSV): about 5–8 more
- Suggestion: approve 1–4 first, and add the admin page later.

No publishing without your explicit approval.
