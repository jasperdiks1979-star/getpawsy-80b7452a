# CDN Edge Caching Enforcement — getpawsy.pet

> Single source of truth for Cloudflare edge HTML caching configuration.
> Last updated: 2026-02-27

---

## 1. Current Behavior (Before Fix)

| Metric | Value |
|--------|-------|
| `cf-cache-status` | `DYNAMIC` on all HTML |
| TTFB | ~1600ms (origin hit every request) |
| LCP | ~4.5s |
| `Set-Cookie` on HTML | `__cf_bm=...; Domain=.lovable.app` |
| `Vary` on HTML | `Accept-Encoding` (correct) |
| `Cache-Control` on HTML | `public, max-age=0, s-maxage=300, stale-while-revalidate=86400` (correct) |
| Mobile Lighthouse | ~30 |

## 2. What Blocks Caching

### Root Cause: Bot Fight Mode `__cf_bm` Cookie

Cloudflare Bot Fight Mode injects a `Set-Cookie: __cf_bm=...` header on **every** response.
Cloudflare's edge **never caches responses that contain `Set-Cookie` headers**, regardless of Cache Rules, Page Rules, or origin `Cache-Control` headers.

This creates an unbreakable loop:
```
Request → CF Bot Fight Mode adds Set-Cookie → CF sees Set-Cookie → refuses to cache → DYNAMIC
```

### Forensic Audit Results

| Check | Result | Impact |
|-------|--------|--------|
| Origin sets `Set-Cookie`? | ❌ No — nginx.conf has no cookie directives on public HTML | No impact |
| Origin sets `Vary: Cookie`? | ❌ No — only `Vary: Accept-Encoding` | No impact |
| Origin sets `Cache-Control: private`? | ❌ No — public HTML uses `public, s-maxage=300` | No impact |
| Supabase auth cookies on HTML? | ❌ No — Supabase SDK is client-side only | No impact |
| CSRF/session middleware? | ❌ No — static SPA, no server-side sessions | No impact |
| `__cf_bm` cookie injected? | ✅ **YES** — Bot Fight Mode active | **BLOCKS ALL CACHING** |

### Codebase Cookie Search

Files searched: all `*.ts`, `*.tsx`, `*.js` in `src/`, `nginx.conf`, `Dockerfile`.
- No server-side `Set-Cookie` headers found.
- No cookie middleware found.
- No session management found.
- Cookie references are only in: `CookiePolicy.tsx` (content page), `DebugPanel.tsx` (reads `navigator.cookieEnabled`).

**Conclusion:** The origin is clean. The **only** source of `Set-Cookie` is Cloudflare Bot Fight Mode.

## 3. What We Changed (Origin Side)

### nginx.conf Changes

1. **`/health` endpoint** — Added explicit `Cache-Control: private, no-store` to prevent edge caching of health checks.

All other routes were already correctly configured:

| Route Pattern | Cache-Control | X-Cache-Debug | Cacheable? |
|---------------|--------------|---------------|------------|
| `/` (SPA fallback) | `public, max-age=0, s-maxage=300, stale-while-revalidate=86400` | `html-public` | ✅ Yes |
| `/assets/*` | `public, max-age=31536000, immutable` | `asset-immutable` | ✅ Yes |
| `/sitemap*.xml` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` | `seo-public` | ✅ Yes |
| `/robots.txt` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` | `seo-public` | ✅ Yes |
| `/cart`, `/checkout`, `/auth`, `/admin` | `no-store, no-cache, must-revalidate` | `auth-no-store` | ❌ No |
| `/api/*`, `/_api/*` | `private, no-store` | `api-no-store` | ❌ No |
| `/health` | `private, no-store` | — | ❌ No |

## 4. Cloudflare Configuration (Operator Steps)

### Step 1: Disable Bot Fight Mode

```
Cloudflare Dashboard → getpawsy.pet
→ Security → Bots
→ Bot Fight Mode: OFF
→ JavaScript Detections: OFF
```

**Why:** Bot Fight Mode injects `__cf_bm` cookie → Cloudflare refuses to cache any response with `Set-Cookie`.

### Step 2: Remove Conflicting Page Rules

Check `Rules → Page Rules`. Delete or disable any rules for `getpawsy.pet/*` that set "Cache Level" or "Edge Cache TTL" to avoid conflicts with Cache Rules below.

### Step 3: Create Cache Rules (top-down order)

#### Rule 1 — "Bypass Cart/Checkout/Auth/Admin/API"

```
Expression:
(http.host eq "getpawsy.pet"
 and (starts_with(http.request.uri.path, "/cart")
   or starts_with(http.request.uri.path, "/checkout")
   or starts_with(http.request.uri.path, "/auth")
   or starts_with(http.request.uri.path, "/admin")
   or starts_with(http.request.uri.path, "/api")
   or starts_with(http.request.uri.path, "/_api")))

Action: Bypass cache
```

#### Rule 2 — "Cache Homepage HTML"

```
Expression:
(http.host eq "getpawsy.pet" and http.request.uri.path eq "/")

Actions:
  Cache eligibility: Eligible for cache
  Edge TTL:          Ignore origin → 7200 seconds (2 hours)
  Browser TTL:       Respect origin
```

#### Rule 3 — "Cache All Public HTML"

```
Expression:
(http.host eq "getpawsy.pet"
 and not starts_with(http.request.uri.path, "/cart")
 and not starts_with(http.request.uri.path, "/checkout")
 and not starts_with(http.request.uri.path, "/auth")
 and not starts_with(http.request.uri.path, "/admin")
 and not starts_with(http.request.uri.path, "/api")
 and not starts_with(http.request.uri.path, "/_api"))

Actions:
  Cache eligibility: Eligible for cache
  Edge TTL:          Ignore origin → 7200 seconds (2 hours)
  Browser TTL:       Respect origin
```

**Order matters:** Rule 1 (Bypass) → Rule 2 (Homepage) → Rule 3 (All public). Cloudflare evaluates top-down, first match wins.

### Step 4: Purge Cache

```
Cloudflare Dashboard → Caching → Configuration → Purge Everything
```

Wait 60 seconds before validating.

### Step 5: Validate

```bash
npm run cache:audit
```

Or manually:
```bash
# Request 1 (prime cache)
curl -sI https://getpawsy.pet/ | grep -iE 'cf-cache-status|age:|set-cookie|cache-control|vary'

# Wait 2 seconds

# Request 2 (should be HIT)
curl -sI https://getpawsy.pet/ | grep -iE 'cf-cache-status|age:'
```

## 5. Expected After Fix

### Headers on cacheable HTML

```
HTTP/2 200
cache-control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400
cf-cache-status: HIT
age: 47
vary: Accept-Encoding
x-cache-debug: html-public
# NO set-cookie header
```

### Headers on /cart (non-cacheable)

```
HTTP/2 200
cache-control: no-store, no-cache, must-revalidate
cf-cache-status: DYNAMIC
x-cache-debug: auth-no-store
```

### Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| `cf-cache-status` | `DYNAMIC` | `HIT` |
| TTFB | ~1600ms | **<150ms** |
| LCP | ~4.5s | **<2.5s** |
| FCP | ~2.5s | **<1.0s** |
| Mobile Lighthouse | ~30 | **65-80+** |

> **Note:** PSI field data (CrUX) lags 28 days. Lab data improves immediately. Field data reflects improvement after ~4 weeks of edge cache HITs.

## 6. What Remains Dynamic (By Design)

| Route | Reason | Impact on TTFB/LCP |
|-------|--------|-------------------|
| `/cart/*` | Personalized cart content | None — not LCP path |
| `/checkout/*` | Payment/auth flow | None — not LCP path |
| `/auth/*` | Login/signup | None — not LCP path |
| `/admin/*` | Admin dashboard | None — not public |
| `/api/*`, `/_api/*` | API endpoints | None — XHR only |

## 7. Rollback

If caching causes issues:
1. Disable Cache Rule 2 and 3 in Cloudflare Dashboard
2. Purge Everything
3. All HTML returns to `DYNAMIC` (origin-served)
4. No origin code changes needed — nginx.conf is unchanged
