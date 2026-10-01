# Crawler identity enrichment: read-only report and plan (nothing changed)

## Existing code involved
- `supabase/functions/log-crawler-visit/index.ts` (~1,010 lines). The page calls it from the browser through `src/hooks/useCrawlerTracking.ts`. It:
  - reads the visitor's IP from `cf-connecting-ip`, then `x-forwarded-for`, then `x-real-ip`
  - matches the user agent with `detectBotType()`
  - checks Googlebot against Google's 4 published IP-range files (`isVerifiedGoogleIp`, IPv4 and IPv6, cached for 24h, extra ranges allowed via `GOOGLEBOT_EXTRA_CIDRS`)
  - tags spoofed Googlebots as `"(spoofed-ua)"`
  - always logs verified or spoofed Googlebot; samples everything else
- `supabase/functions/_shared/traffic-classifier.ts`: server-side rules, labels `human / uncertain / bot / internal / technical`, reason `known_crawler_ua`.
- `src/lib/trafficQualityClassifier.ts`: labels PROBABLE_HUMAN / POSSIBLE_HUMAN / bot / internal; feeds the dashboards and the CSV export.
- Database: `is_real_human_session()` and the `real_human_sessions` view feed the visitor dashboards' Human / Expanded / Raw views (built from `analytics-canonical` and `canonical_sessions`).

## Database tables involved
- `crawler_visits`: id, page_url, user_agent, is_googlebot, bot_type, ip_address, referrer, created_at, idempotency_key
- `crawler_sampling_decisions`: id, created_at, page_url, user_agent, ip_address, outcome, always_log, reason, render-trace fields, ua_claims_googlebot, verified_googlebot, spoofed_googlebot, bot_type, sample_rate, sample_roll
- Both tables currently show **0 rows** in the database's own statistics, which can lag behind reality. Either way, little or no crawler data has been collected so far.
- Both store the **raw IP** today, which conflicts with your privacy rules.

## What we can verify today
- Googlebot only, by matching its IP against Google's published ranges. Google's ranges also cover AdsBot-Google, Google-InspectionTool and Mediapartners, but today those are only identified by user agent.
- Everything else (Bing, Pinterest, Meta, Apple and others) is identified by user agent only, so it is not verified.

## Infrastructure limits
1. **Crawlers that don't run JavaScript are invisible.** The store is served as static files, so no server code runs when a page is fetched. Only crawlers that run the page's scripts reach our logging. This rules out:
   - status codes and response times per page
   - sitemap and robots.txt fetches
   - most AdsBot fetches

   The feed is served by our own backend, so feed fetches could be logged there as an optional add-on.
2. **Reverse DNS:** the backend's DNS lookup tool may support reverse lookups, but this hasn't been tested here. It would be tried as a bonus. The main method is matching against the IP ranges Google and Bing publish, which Google documents as equivalent to a DNS check.
3. **ASN / network owner:** there's no free source without adding an outside service. Network owner and ASN stay empty. "Datacenter" would be marked only when an IP matches a known crawler's published ranges.
4. A crawler can only be counted against a shopper session if it actually ran the tracking script. Behavior-based rules still catch the rest.

## Smallest safe plan
Core work (about 6–10 credits):
1. Database change that only adds fields (nothing removed):
   - new fields on `crawler_visits`: `crawler_identity`, `crawler_family`, `crawler_verified`, `crawler_verification_method`, `crawler_confidence`, `user_agent_family`, `ip_hash`, `crawler_reasons`
   - `ip_hash` is a salted one-way hash of the IP
   - new rows stop saving the raw IP
   - old rows are left untouched, because cleanup stays disarmed
2. New shared helper `_shared/crawler-identity.ts`:
   - recognizes about 15 crawlers by user agent
   - checks Google crawlers against Google's ranges (reusing the existing loader) and Bing against Bing's published file
   - tries the reverse-DNS round trip only if the runtime supports it
   - caches results in memory per server instance
   - returns reason codes such as `crawler:verified_googlebot` and `crawler:ua_googlebot_unverified`
3. Connect the helper to `log-crawler-visit`. Verified crawlers are never sampled out, and the page never waits for the check.
4. Add crawler-only labels to both classifiers: VERIFIED_SEARCH / ADS / SOCIAL / KNOWN_OTHER. They can never count as human, so Human and Expanded can only drop crawler rows. Raw view and sales numbers stay as they are.
5. One focused test file covering cases A–H from your spec.

Optional (about 5–8 credits):
6. A read-only admin "Crawlers" page, with filters and a timeline of crawler visits to key pages. No IPs shown.
7. Crawler columns in the existing CSV export.
8. Log feed fetches made by crawlers.

Not included: deleting rows after a set time, since that would re-enable cleanup; network-owner lookups; anything that changes what shoppers or crawlers see. Nothing is published without your explicit approval.

## Files
- Core: new `supabase/functions/_shared/crawler-identity.ts`, new `src/test/crawler-identity.test.ts`, 1 database change; edited `log-crawler-visit/index.ts`, `_shared/traffic-classifier.ts`, `src/lib/trafficQualityClassifier.ts`
- Optional: new `src/pages/admin/CrawlersPage.tsx`; edited admin routes in `App.tsx` and the export column list
