# Google Ads cloaking audit: findings (read-only, nothing changed)

All live checks ran on 28 Sep, with no login, using a normal browser identity, Googlebot and AdsBot-Google.

## Findings

| # | Area | Evidence | Status |
|---|------|----------|--------|
| 1 | Host and protocol | `http://getpawsy.pet/sitemap.xml`, `https://www.getpawsy.pet/sitemap.xml` and `http://www.getpawsy.pet/` all redirect in one 301 hop to `https://getpawsy.pet/...`. The result is identical for all three identities. The redirect happens at the hosting edge, not in project files. | CLEAN |
| 2 | Sitemaps | `public/sitemap.xml` and the child sitemaps list only `https://getpawsy.pet/...` addresses. All return 200 for all three identities. | CLEAN |
| 3 | robots.txt | `public/robots.txt` returns 200, with one `User-agent: *` group, `Allow: /`, admin/checkout/auth paths blocked, and `Sitemap: https://getpawsy.pet/sitemap.xml`. There is no Googlebot- or AdsBot-specific group. | CLEAN |
| 3b | robots.txt comment | Lines 27–34: the comment says tracking links are allowed, but the rules block `?gclid=`. AdsBot ignores `*` rules, so ad review is unaffected; Googlebot won't crawl gclid links. | POSSIBLE RISK (low) |
| 4 | Same page for crawlers | `/`, a product page, `/shipping` and `/?gclid=x&utm_source=google` return byte-identical responses to the shopper, Googlebot and AdsBot identities, with no redirects. | CLEAN |
| 5 | Browser-type checks in code | `src/hooks/useTikTokLanding.ts:31` checks for the TikTok in-app browser and only scrolls to the buy button. `src/hooks/usePdpBotRenderTrace.ts` only logs. `index.html` has no crawler checks. Neither changes content or destination. | CLEAN |
| 6 | Redirect files | `public/_redirects` holds rules such as `/product/:slug → /products/:slug 301`, but this hosting does not process that file: live `/product/...` and `/bestseller/...` return 200. The redirect actually happens in the browser. None of the rules depend on who is visiting. | POSSIBLE RISK (misleading config, not cloaking) |
| 7 | Old `/product/` vs `/products/` | `src/App.tsx:952` `ProductRouteRedirect` sends everyone to `/products/:slug`. `index.html:403` sends `/bestseller/:slug` to `/product/:slug` and then on to `/products/...`, so it takes two browser hops. Crawlers and users follow the same path. The feed (265/265) and product sitemap (250/250) use only `https://getpawsy.pet/products/`. | CLEAN (two-hop bestseller link is POSSIBLE RISK, low) |
| 8 | Service worker | None registered. `index.html:794` and `src/App.tsx:218` only remove old ones. | CLEAN |
| 9 | Edge workers | The `cloudflare-worker-gsc-recovery/` code acts only on exact paths and request methods, never on browser type or country. It is unclear whether it is deployed; that sits outside the project. | CLEAN in code; deployment unverified |
| 10 | Outside scripts | `index.html` loads only Google Fonts directly. Tracking scripts load in the app for everyone equally, with no redirects. | CLEAN |
| 11 | Page address tags | The `index.html` pre-load script (ORIGIN `https://getpawsy.pet`) and `HostnameGuard` set the page address to https apex. Preview hosts get noindex. | CLEAN |
| 12 | Company identity | The shop's code and public files have no "GetPawsy LLC" or "New York, NY" business claims. The site says Skidzo, Apeldoorn, Netherlands (`src/lib/shipping-constants.ts:182–188`, `index.html:745`). | CLEAN |
| 13 | Current shipping policy (the source of truth) | `src/lib/shipping-constants.ts`: delivery 5–10 business days (line 133), free shipping from $35 (`src/lib/cart-pricing.ts:15`), processing 1–2 business days. | reference |
| 14 | Old shipping claims | **Live site only:** mobile trust bar "Free shipping over $50" (`src/config/trust-blocks.ts:36`); cat-tree guide "US warehouse, 3–7 business days, over $49" (`public/data/guides/best-cat-trees-large-cats-2026.json:42,233`); ad text "Ships in 3–7 days" (`public/data/google-ads-copy.json:91`). **All three are already corrected in the prepared, unpublished change.** | CONFIRMED ISSUE (live), fixed pending publish |
| 15 | Broken feed link | `index.html` advertised `/feed.xml`, which returns 404 live. Removed in the prepared change. | CONFIRMED ISSUE (live), fixed pending publish |
| 16 | Remaining old text | Pinterest pin copy says "Ships from New York, NY · 3–7 business days" (`supabase/functions/_shared/pinterest-copy.ts:50`). An unused backend file has "3-7 business days" (`supabase/functions/_shared/warehouse-availability.ts:54,81`). Public internal reports under `/admin-reports/executive/ceo-production-readiness/` recommend "3–7 business days". | POSSIBLE RISK |
| 17 | Unproven ad claim | Ad texts say "CPS-certified" car seats (`public/data/google-ads-copy.json`); I found no evidence behind it. | POSSIBLE RISK (misrepresentation, not cloaking) |

## Smallest safe remediation
1. **Publish the prepared change** (items 14 and 15). This needs a publish.
2. Pinterest pin copy line 50: replace with policy wording (5–10 business days, no New York). This is a backend change that goes live on its own, and it needs your explicit Pinterest approval.
3. Make the `/admin-reports/` files not public, or remove the old shipping advice from them. This needs a publish.
4. Remove or evidence "CPS-certified" in the ad copy (your decision). This needs a publish.
5. Optional: have `index.html` send `/bestseller/` straight to `/products/`, and fix the robots.txt comment. This needs a publish.
6. Optional: confirm in Cloudflare whether any edge worker is active, and that it has no browser-type rules. That's your action outside Lovable.

## Technical notes
- `public/_redirects` and `public/_headers` are not processed by this hosting. Redirects must stay in the browser code.
- No database, product, price, checkout, sign-in, Pinterest, supplier or order changes were made this turn. Cleanup stays off.
