# P0 storefront outage — diagnosis and recovery plan

## Findings (read-only, 21:3x UTC 7 Oct)
- Live pages: homepage and /products return 200 in under 0.3 s. Static shell is fine.
- Published release unchanged: the site still serves the same main code file as the last verified release (`index-Dbu14XnP.js`). No new deployment tonight.
- Catalog data request (public product view): **HTTP 522 after ~20 s** (gateway timeout).
- Sign-in service health check: **HTTP 522 after ~20 s**.
- Backend status tool reports database and auth "reachable" (~90 ms) and no exhaustion alerts in 48 h; live database metrics unavailable.
- Same signature as the two earlier incidents (healthy internal status, public gateway timing out) — both were fixed by one backend restart with no code or data change.

## Root cause (most likely)
The hosted Lovable Cloud backend's public gateway has stalled. Shoppers get the page shell but every product and sign-in request times out, so skeletons/spinner never finish. Not caused by code, the release, or the Bing sitemap submission.

## Recovery (needs your approval)
1. One controlled backend restart. No code, data, schema, analytics, orders or catalog changes.
2. Wait for healthy status, then re-check catalog and sign-in requests return 200.
3. Verify live (mobile-equivalent): homepage, /products, /collections/cat-litter-boxes, one product page, /auth — real content, no stuck skeletons.
4. If one restart doesn't fix it: no repeat restarts; report blocker and recommend contacting support.

## Follow-up worth considering (not part of this fix)
This is the third gateway stall; raise it with Lovable support and consider a larger database server size if it recurs.
