# Cloudflare Edge Caching — getpawsy.pet

## Architecture

```
Browser → Cloudflare Edge → Origin (nginx static files)
```

Origin serves fully static HTML (`index.html` via SPA fallback) with cache-friendly headers.
Cloudflare caches at the edge when configured correctly.

## Origin Headers (set in nginx.conf)

| Route pattern | Cache-Control | X-Cache-Debug |
|---|---|---|
| `/` (SPA fallback) | `public, max-age=0, s-maxage=28800, stale-while-revalidate=60` | `html-public` |
| `/assets/*` (hashed) | `public, max-age=31536000, immutable` | `asset-immutable` |
| `/robots.txt`, `/sitemap*.xml`, `/merchant-feed.xml` | `public, max-age=300, s-maxage=3600, stale-while-revalidate=60` | `seo-public` |
| `/admin/*`, `/auth/*` | `no-store, no-cache, must-revalidate` | `auth-no-store` |
| `/~api/*`, `/api/*` | `private, no-store` | `api-no-store` |

Origin does **not** set any `Set-Cookie` header on public routes.

## Why `__cf_bm` appears

The `__cf_bm` cookie is injected by **Cloudflare Bot Management / Bot Fight Mode** at the edge layer, **not** by the origin server. This cookie can prevent Cloudflare from caching HTML because:

1. Cloudflare sees a `Set-Cookie` in the response and marks it as uncacheable, OR
2. The `Vary: Cookie` interaction fragments the cache per-visitor.

**Solution:** Disable Bot Fight Mode for the site, or create a Cache Rule that forces caching despite this cookie.

## Why missing Cache-Control prevents edge caching

Without explicit `Cache-Control` headers from the origin, Cloudflare treats HTML responses as `DYNAMIC` (uncacheable). Even with a Cache Rule set to "Eligible for cache", Cloudflare relies on origin headers (`s-maxage`) to determine Edge TTL when configured to "Respect origin headers". Missing headers = no caching.

## Required Cloudflare Configuration

### 1. Cache Rule for HTML (public pages)

- **When:** Hostname = `getpawsy.pet` AND URI Path does not start with `/admin` AND URI Path does not start with `/auth` AND URI Path does not start with `/api` AND URI Path does not start with `/~api`
- **Then:**
  - Cache eligibility: **Eligible for cache**
  - Edge TTL: **Respect origin headers** (origin sends `s-maxage=28800` = 8 hours)
  - Browser TTL: **Respect origin headers** (origin sends `max-age=0`)

### 2. Cache Rule for static assets

- **When:** Hostname = `getpawsy.pet` AND URI Path starts with `/assets`
- **Then:**
  - Cache eligibility: **Eligible for cache**
  - Edge TTL: **30 days** (or respect origin `max-age=31536000`)

### 3. Bot Fight Mode

- **Security → Bots → Bot Fight Mode: OFF**
- This prevents `__cf_bm` cookie injection that fragments/prevents HTML caching.
- Alternative: Create a Skip rule for known-good paths.

### 4. Other settings

| Setting | Value | Why |
|---|---|---|
| Origin Cache Control | **ON** | Respect `s-maxage` from origin |
| Brotli | ON | Smaller payloads |
| Early Hints | ON | Faster preloads |
| HTTP/3 | ON | Faster connections |
| Rocket Loader | **OFF** | Breaks React hydration |

## How to Verify

### Using the audit script

```bash
node tools/cf-cache-audit.js
```

### Manual curl check

```bash
# HTML — expect s-maxage=28800, X-Cache-Debug: html-public, no Set-Cookie from origin
curl -sI https://getpawsy.pet/ | grep -iE 'cache-control|cf-cache|set-cookie|x-cache-debug'

# Second request should show CF-Cache-Status: HIT
curl -sI https://getpawsy.pet/ | grep -i cf-cache-status

# SEO files — expect s-maxage=3600, X-Cache-Debug: seo-public
curl -sI https://getpawsy.pet/robots.txt | grep -iE 'cache-control|x-cache-debug'
curl -sI https://getpawsy.pet/sitemap.xml | grep -iE 'cache-control|x-cache-debug'

# Asset — expect immutable, CF-Cache-Status: HIT
curl -sI https://getpawsy.pet/assets/index-abc123.js | grep -iE 'cache-control|cf-cache'
```

### Expected CF-Cache-Status transitions

| URL type | 1st request | 2nd request | Notes |
|---|---|---|---|
| HTML (`/`) | `MISS` or `DYNAMIC` | `HIT` | Requires Cache Rule |
| SEO (`/robots.txt`) | `MISS` | `HIT` | 1h edge TTL |
| Asset (`/assets/*`) | `HIT` (or `MISS`) | `HIT` | Usually cached by default |
| API (`/~api/*`) | `DYNAMIC` | `DYNAMIC` | Never cached |

If HTML stays `DYNAMIC` after rules are applied:
1. Check Bot Fight Mode is OFF
2. Verify Origin Cache Control is ON
3. Purge cache: Cloudflare Dashboard → Caching → Purge Everything
4. Re-test with curl

## Redirect Policy

| Source | Status | Target |
|---|---|---|
| `www.getpawsy.pet/*` | 301 | `https://getpawsy.pet/*` |
| `*.lovable.app/*` | 301 | `https://getpawsy.pet/*` |
| Trailing slash (non-root) | 301 | Without trailing slash |

Note: The www→apex redirect is handled at the Cloudflare edge layer. If the edge returns 302 instead of 301, update the Cloudflare Redirect Rule to use status 301 (permanent).
