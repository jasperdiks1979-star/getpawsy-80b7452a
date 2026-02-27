# GetPawsy — Production Performance & Caching Forensic Plan

> Generated: 2026-02-27 | Target: Mobile CWV Pass (LCP ≤ 3.0s, CLS ≤ 0.10)

---

## PART 1 — Missing Cloudflare Config (Paste These)

| # | Setting | Path in Cloudflare Dashboard |
|---|---|---|
| 1 | Origin Cache Control ON/OFF | Caching → Configuration |
| 2 | Rocket Loader ON/OFF + Auto Minify | Speed → Optimization |
| 3 | Bot Fight Mode panel + JS Detections | Security → Bots |
| 4 | Cache Rules (separate from Page Rules) | Rules → Cache Rules |
| 5 | Redirect Rules / Transform Rules | Rules → Redirect Rules / Transform Rules |

---

## PART 2 — Evidence Collection Commands

Run these from your terminal and paste the output.

### 2.1 HTML Document (Critical)

```bash
curl -sI https://getpawsy.pet/ | grep -iE 'http/|cache-control|cf-cache-status|age:|vary|set-cookie|content-type|server-timing|cf-ray|x-cache-debug|content-encoding'
```

### 2.2 Redirect Chain (www → apex)

```bash
curl -sI https://www.getpawsy.pet/ | grep -iE 'http/|location|cf-cache-status|set-cookie'
```

### 2.3 Hero Image

```bash
curl -sI https://getpawsy.pet/hero/getpawsy-hero-mobile.webp | grep -iE 'cf-cache-status|cache-control|content-length|content-type|age:'
```

### 2.4 JS Entry Chunk

```bash
# Find the current hash
curl -s https://getpawsy.pet/ | grep -oP '/assets/index-[a-zA-Z0-9]+\.js' | head -1
# Then check headers on that URL
```

### 2.5 Cart (Must Be Bypass)

```bash
curl -sI https://getpawsy.pet/cart | grep -iE 'cf-cache-status|cache-control|set-cookie'
```

### 2.6 Cookie Injection Check

```bash
curl -sI https://getpawsy.pet/ 2>&1 | grep -i set-cookie
```

### What Each Result Means

| Header | Good ✅ | Bad ❌ | Why It Matters |
|---|---|---|---|
| `cf-cache-status: HIT` | Edge cached | `DYNAMIC` = not cached | HTML TTFB drops from ~1.6s to ~50ms |
| `set-cookie: __cf_bm` | absent | present | CF sees Set-Cookie → marks uncacheable |
| `cache-control: s-maxage=300` | Origin tells CF to cache | missing | Without this, CF ignores "Cache Everything" |
| `age: >0` | Served from cache | `0` or absent | Confirms actual edge hit |
| `x-cache-debug: html-public` | Origin cooperating | absent | Custom header proving origin config |

### The `__cf_bm` Problem

`set-cookie: __cf_bm; Domain=.lovable.app` — Cloudflare Bot Management injects a cookie on **every** response. Even with "Cache Everything" Page Rule, CF will **not** cache responses with `Set-Cookie` headers.

The `Domain=.lovable.app` suggests the request may be proxied through lovable.app infrastructure, not directly to origin.

---

## PART 3 — Root Cause Matrix (Ranked by Impact)

| # | Root Cause | Impact | Evidence | Fix | Where |
|---|---|---|---|---|---|
| **1** | HTML not edge-cached (`DYNAMIC`) | ~1200ms LCP | TTFB 1.6s; cf-cache-status DYNAMIC | Cache Rule with Edge TTL Override | Cloudflare |
| **2** | `__cf_bm` cookie fragments/blocks cache | Blocks #1 | `set-cookie: __cf_bm` in response | JS Detections OFF or Cache Rule Override | Cloudflare |
| **3** | CLS from promo banner hydration mismatch | ~0.4–0.7 CLS | 40px shift if localStorage ≠ static shell | Blocking localStorage read in `<head>` | Code (index.html) |
| **4** | CLS from Navbar Suspense fallback | ~0.05 CLS | Height mismatch (112→72 or vice versa) | Dynamic height via localStorage | Code (Layout.tsx) |
| **5** | Font 404 (stale Playfair Display URL) | ~200ms render delay | Console 404 on woff2 | Updated to v40 | Code (index.html) |

---

## PART 4 — E-Commerce Safe Caching Design

### Policy Matrix

| Route Pattern | Cache? | Edge TTL | Browser TTL | Why |
|---|---|---|---|---|
| `/` + `/collections/*` + `/guides/*` + `/products/*` | ✅ YES | 5 min (s-maxage=300) | 0 (always revalidate) | Static HTML, no user state |
| `/assets/*` | ✅ YES | 1 year | 1 year (immutable) | Content-hashed filenames |
| `/hero/*` | ✅ YES | 30 days | 1 day | Rarely changes |
| `/cart*` + `/checkout*` | ❌ NO | Bypass | no-store | User-specific |
| `/auth*` + `/admin*` | ❌ NO | Bypass | no-store | Authenticated |
| `/api/*` + `/~api/*` | ❌ NO | Bypass | private, no-store | Dynamic API |

### Cloudflare Implementation (Free Plan, Page Rules Maxed)

> Page Rules are full (3/3). Use **Cache Rules** instead (Free plan gets 5).

#### Cache Rule 1 — "Bypass dynamic routes" (PUT THIS FIRST)

```
Expression:
(http.host eq "getpawsy.pet"
 and (starts_with(http.request.uri.path, "/cart")
  or starts_with(http.request.uri.path, "/checkout")
  or starts_with(http.request.uri.path, "/auth")
  or starts_with(http.request.uri.path, "/admin")
  or starts_with(http.request.uri.path, "/api")
  or starts_with(http.request.uri.path, "/~api")))

Action:
- Cache eligibility: Bypass cache
```

#### Cache Rule 2 — "Cache public HTML"

```
Expression:
(http.host eq "getpawsy.pet"
 and not starts_with(http.request.uri.path, "/cart")
 and not starts_with(http.request.uri.path, "/checkout")
 and not starts_with(http.request.uri.path, "/auth")
 and not starts_with(http.request.uri.path, "/admin")
 and not starts_with(http.request.uri.path, "/api")
 and not starts_with(http.request.uri.path, "/~api"))

Action:
- Cache eligibility: Eligible for cache
- Edge TTL: Override origin → 300 seconds
- Browser TTL: Override origin → 0 seconds
```

> **Why "Override origin" for Edge TTL?** Because `__cf_bm` cookie may cause CF to ignore `s-maxage`. Override forces caching regardless.

#### After creating Cache Rules:
Delete Page Rule #3 ("Cache Everything") since Cache Rule replaces it → frees a Page Rule slot.

### Rollback Plan

If dynamic pages break:
1. Delete Cache Rule 2 (the HTML caching one)
2. Purge cache: `Caching → Configuration → Purge Everything`
3. Takes effect in <30 seconds

---

## PART 5 — LCP Decomposition

### Estimated Breakdown

| Phase | Current (est.) | After CF Cache | Target |
|---|---|---|---|
| TTFB | ~1600ms | ~100ms | ≤200ms |
| Load Delay (hero preload) | ~200ms | ~200ms | ≤200ms |
| Load Time (hero download) | ~300ms | ~300ms | ≤300ms |
| Render Delay (JS/fonts) | ~400ms | ~400ms | ≤300ms |
| **Total LCP** | **~2500ms** | **~1000ms** | **≤1000ms** |

> The 15.8s LCP scenario = cold-start + no edge cache + slow mobile throttling.

### CLS — Why 0.761 Could Still Appear

1. **Fixes not deployed** — verify production HTML contains `data-promo-dismissed` blocking script
2. **Cookie banner** — DOM injection above fold without height reservation
3. **TrendingNowStrip** — still lazy-loaded in deployed build
4. **Font swap** — Playfair Display loading causes text reflow

---

## PART 6 — Build Verification

```bash
# Check if CLS fix is deployed
curl -s https://getpawsy.pet/ | grep -o 'promo-banner-dismissed'

# Check TrendingNowStrip is not lazy
curl -s https://getpawsy.pet/ | grep -oP '/assets/index-[a-zA-Z0-9]+\.js' | head -1
# Then: curl -s <that URL> | grep -c 'TrendingNow'
```

If `promo-banner-dismissed` is NOT found → publish first.

---

## PART 7 — Retest Protocol

### After All Changes Applied

1. Purge CF cache (`Caching → Configuration → Purge Everything`)
2. Wait 60 seconds
3. Verify edge caching:
   ```bash
   curl -sI https://getpawsy.pet/ | grep cf-cache-status  # → expect MISS
   curl -sI https://getpawsy.pet/ | grep cf-cache-status  # → expect HIT
   ```
4. Run PageSpeed Insights (mobile) **3 times**: [PSI Link](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgetpawsy.pet%2F&form_factor=mobile)
5. Take **median** of 3 runs

### Acceptance Criteria

| Metric | Target | Stretch |
|---|---|---|
| LCP | ≤ 3.0s | ≤ 2.5s |
| CLS | ≤ 0.10 | ≤ 0.05 |
| TTFB | ≤ 0.8s | ≤ 0.4s |
| FCP | ≤ 2.0s | ≤ 1.5s |
| TBT | ≤ 200ms | ≤ 100ms |

---

## PART 8 — Action Plan (Prioritized)

| Step | Action | Who | Time |
|---|---|---|---|
| 1 | Paste 5 CF config items (Part 1) | You | 2 min |
| 2 | Run 6 curl commands (Part 2) and paste output | You | 2 min |
| 3 | Publish latest build in Lovable | You | 1 min |
| 4 | Create Cache Rules in CF (Rule 1 bypass first, then Rule 2 cache) | You in CF | 5 min |
| 5 | Purge CF cache | You in CF | 1 min |
| 6 | Run PSI 3x, paste median results | You | 5 min |
| 7 | Report back with results | You | 1 min |

---

## Reference Documents

- `docs/cloudflare-caching.md` — Full Cloudflare edge caching architecture
- `docs/post-deploy-verification.md` — Post-deploy CWV verification checklist
- `tools/cf-cache-audit.js` — Automated cache audit script
