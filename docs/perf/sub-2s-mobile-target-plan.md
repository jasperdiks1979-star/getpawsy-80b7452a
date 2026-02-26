# GetPawsy — Sub-2s Mobile Target Plan

**Date**: 2026-02-26  
**Target**: PSI Mobile ≥ 80, LCP ≤ 2.0s, CLS ≤ 0.10, TBT < 200ms  
**Current baseline** (PSI mobile estimates): LCP ~4–5s, FCP ~3–4s, TTFB ~1.6s, Total payload ~13MB

---

## TOP 10 IMPACT LIST (highest first)

| # | Action | Metric | Expected PSI Impact | Effort |
|---|--------|--------|-------------------|--------|
| 1 | Eliminate render-blocking Google Fonts CSS | FCP, LCP | 🔴 HIGH (~800–1200ms) | 30 min |
| 2 | Reduce hero image payload (proper sizing + Cloudinary) | LCP | 🔴 HIGH (~500–1000ms) | 30 min |
| 3 | Remove `framer-motion` from Index.tsx critical path (FadeInView) | TBT, LCP | 🔴 HIGH (~300–500ms) | 1 hr |
| 4 | Inline critical CSS + defer Tailwind | FCP, LCP | 🟡 MEDIUM (~200–400ms) | 2 hr |
| 5 | Preconnect to Cloudinary CDN + remove stale preconnects | LCP | 🟡 MEDIUM (~100–300ms) | 10 min |
| 6 | Reduce JS main bundle (tree-shake unused contexts from homepage) | TBT | 🟡 MEDIUM (~150–300ms TBT) | 2 hr |
| 7 | Lazy-load Navbar search + cart drawer (heavy Radix components) | TBT | 🟡 MEDIUM (~100–200ms TBT) | 2 hr |
| 8 | Add proper Cache-Control headers via Cloudflare | TTFB (repeat) | 🟡 MEDIUM (repeat visits) | 1 hr |
| 9 | Remove console errors (hydration mismatches, missing resources) | PSI score | 🟢 LOW (+2–5 points) | 1 hr |
| 10 | Accessibility fixes (aria-labels, contrast, focus) | A11y score | 🟢 LOW (+5–10 a11y points) | 1 hr |

---

## PHASE 1: QUICK WINS (< 2 hours)

### 1.1 — Fix Google Fonts render-blocking

**Reden**: PSI flags "render-blocking resources". The fonts CSS link blocks FCP even with `media="print"` trick — the `onload` handler still downloads a CSS file that blocks rendering on slow connections.

**Actie**:
- In `index.html` line 106: the `media="print" onload="this.media='all'"` pattern is correct but PSI still penalizes the external CSS request chain.
- **Replace** the Google Fonts CSS link with inline `@font-face` declarations pointing to the preloaded woff2 files directly.
- Keep the existing `<link rel="preload" as="font">` on line 103.
- Add a second preload for Playfair Display woff2.

**Files**: `index.html` (lines 99–109)

**Risico**: Laag — fonts already have fallback declarations.

**Verificatie**: PSI → "Eliminate render-blocking resources" → Google Fonts CSS no longer listed.

**Rollback**: Revert index.html font links.

---

### 1.2 — Add Cloudinary preconnect

**Reden**: Product images now go through `res.cloudinary.com` but there's no preconnect for it. DNS + TLS adds ~200ms on mobile.

**Actie**:
```html
<link rel="preconnect" href="https://res.cloudinary.com" crossorigin>
```
Also remove `<link rel="dns-prefetch" href="https://cf.cjdropshipping.com">` (line 98) since images should no longer go direct.

**Files**: `index.html` (lines 96–99)

**Risico**: Laag.

**Verificatie**: DevTools → Network → Cloudinary images load without separate DNS/TLS step.

**Rollback**: Remove the preconnect line.

---

### 1.3 — Hero image: ensure Cloudinary delivery for LCP element

**Reden**: The hero image (`/hero-dog.webp`) is served from the origin, not Cloudinary. This is the LCP element. On Lovable hosting without edge cache, this adds TTFB to image delivery.

**Actie**:
- Option A (recommended): Upload hero images to Cloudinary directly and update `index.html` + `Index.tsx` hero `src`/`srcSet` to point to Cloudinary URLs with explicit dimensions.
- Option B: Use Cloudinary fetch API in the preload link:
  ```html
  <link rel="preload" as="image" href="https://res.cloudinary.com/dlkqycfzn/image/fetch/f_auto,q_auto,w_600/https://getpawsy.pet/hero-dog.webp" ...>
  ```

**Files**: `index.html` (line 87, 222–232), `src/pages/Index.tsx` (lines 364–376)

**Risico**: Medium — hero is the LCP element, must test carefully. Cloudinary fetch of a self-hosted image creates a redirect chain on first request.

**Verificatie**: PSI → LCP element → must show Cloudinary URL. Network → hero image < 100KB.

**Rollback**: Revert to `/hero-dog.webp` URLs.

---

### 1.4 — Remove FadeInView from hero (above-fold animation policy)

**Reden**: `FadeInView` on line 383 of Index.tsx wraps the hero text. Even with `instant=true`, it imports framer-motion or uses IntersectionObserver, adding JS execution during LCP window.

**Actie**: Replace `<FadeInView instant>` with a plain `<div>` in the hero section.

**Files**: `src/pages/Index.tsx` (line 383), check `src/components/ui/FadeInView.tsx`

**Risico**: Laag — `instant=true` already means no visible animation.

**Verificatie**: DevTools → Performance → no framer-motion or observer code in LCP window.

**Rollback**: Re-add `<FadeInView instant>` wrapper.

---

### 1.5 — Fix console errors

**Reden**: PSI penalizes "browser errors logged to console".

**Actie**:
1. Open production site → DevTools Console → document all errors
2. Common suspects:
   - Missing favicon sizes (404s)
   - Hydration mismatches from static hero shell vs React hero
   - Failed network requests (analytics, tracking)
   - `__BOOT_ERRORS__` leftover warnings
3. Fix each — suppress false positives, fix actual bugs

**Files**: Various (depends on errors found)

**Risico**: Laag.

**Verificatie**: Console shows zero errors on homepage load.

**Rollback**: Per-fix basis.

---

### 1.6 — Accessibility quick fixes

**Reden**: PSI accessibility score affects overall score. "Buttons do not have an accessible name", "invalid ARIA", "contrast".

**Actie** (non-branding-breaking):
- Add `aria-label` to all icon-only buttons: cart, search, menu hamburger, close buttons
- Fix any `aria-expanded` / `aria-haspopup` mismatches
- Ensure all `<a>` tags have discernible text (not just icons)
- Check contrast on muted-foreground text — increase opacity if needed

**Files**: `src/components/layout/Navbar.tsx`, `src/components/ui/button.tsx`, various icon buttons

**Risico**: Laag — no visual changes.

**Verificatie**: PSI → Accessibility section → no "buttons without accessible name" warnings.

**Rollback**: Revert aria-label additions.

---

## PHASE 2: ONE-DAY SPRINT

### 2.1 — Inline critical CSS + defer Tailwind

**Reden**: Tailwind's full CSS file is render-blocking. Only ~5% is used above the fold.

**Actie**:
- Use `vite-plugin-critical` or manually extract critical CSS for homepage hero + navbar
- Inline into `<style>` in `index.html`
- Async-load remaining Tailwind CSS via `<link rel="preload" as="style" onload="this.rel='stylesheet'">`

**Files**: `vite.config.ts`, `index.html`

**Risico**: Medium — CSS ordering matters. Test dark mode, mobile menu, all pages.

**Verificatie**: PSI → "Eliminate render-blocking resources" → CSS not listed. Visual: no FOUC.

**Rollback**: Remove critical CSS plugin, restore standard CSS link.

---

### 2.2 — Remove framer-motion from homepage entirely

**Reden**: `framer-motion` is ~60KB gzip. Used in `FadeInView`, various section wrappers. On homepage it adds TBT.

**Actie**:
- Audit all uses in `src/pages/Index.tsx` and components imported there
- Replace with CSS `@keyframes` + `IntersectionObserver` (vanilla) where animation is needed
- Keep framer-motion for PDP/admin where it's lazy-loaded anyway

**Files**: `src/components/ui/FadeInView.tsx`, `src/pages/Index.tsx`, any component rendered on homepage that imports framer-motion

**Risico**: Medium — visual regression possible. Test each animation.

**Verificatie**: Build → check chunk map → no `animations` chunk loaded on homepage. TBT reduction in DevTools Performance.

**Rollback**: Re-add framer-motion imports.

---

### 2.3 — Lazy-load heavy Navbar components

**Reden**: Navbar loads on every page and eagerly imports: search modal, cart drawer, Radix Sheet/Dialog, all icons.

**Actie**:
- Lazy-load search overlay (only opens on user interaction)
- Lazy-load cart drawer (only opens on click)
- Keep logo + nav links + hamburger eager
- Dynamic import Radix Sheet only when cart/menu is opened

**Files**: `src/components/layout/Navbar.tsx`, `src/components/search/`, `src/components/cart/`

**Risico**: Medium — perceived latency on first open of cart/search.

**Verificatie**: DevTools → Network → Radix Sheet/Dialog chunks NOT loaded until user clicks cart/search.

**Rollback**: Revert to eager imports.

---

### 2.4 — Reduce homepage data fetches

**Reden**: Homepage fires 3+ Supabase queries on hydration (featured products, categories, recently viewed). Each adds TTFB + parse time.

**Actie**:
- Merge featured-products + categories into ONE edge function that returns both
- Cache result in Supabase edge function with `Cache-Control: public, max-age=300`
- Homepage calls one fetch instead of three
- Consider SSG/ISR if Lovable supports it (it doesn't — document limitation)

**Files**: New edge function `supabase/functions/homepage-data/`, `src/pages/Index.tsx`

**Risico**: Medium — new edge function needs testing.

**Verificatie**: Network tab → 1 fetch instead of 3 on homepage load.

**Rollback**: Revert to direct Supabase queries.

---

### 2.5 — Cache headers via Cloudflare

**Reden**: PSI flags "Serve static assets with efficient cache policy". Lovable hosting may not set optimal Cache-Control.

**Actie** (Cloudflare dashboard):
1. **Page Rules** or **Cache Rules**:
   - `*.js`, `*.css`: `Cache-Control: public, max-age=31536000, immutable` (Vite hashes filenames)
   - `*.webp`, `*.png`, `*.jpg`: `Cache-Control: public, max-age=86400`
   - `/robots.txt`, `/sitemap*.xml`: `Cache-Control: public, max-age=3600`
   - HTML pages: `Cache-Control: public, max-age=0, must-revalidate` (SPA — always fresh)
2. Enable **Brotli compression** (Cloudflare → Speed → Optimization → Brotli: ON)
3. Enable **HTTP/2** and **HTTP/3** (should be on by default)
4. Verify: `curl -I https://getpawsy.pet/assets/index-xxx.js` → check Cache-Control header

**Files**: Cloudflare dashboard (not code)

**Risico**: Laag — standard CDN config.

**Verificatie**: DevTools → Network → Response headers show proper Cache-Control. PSI → cache warning disappears.

**Rollback**: Remove Cloudflare Page Rules.

**⚠️ Lovable limitation**: Lovable hosting controls origin headers. Cloudflare can override via Transform Rules but can't set headers the origin doesn't support. Test with `curl` first.

---

## PHASE 3: ONE-WEEK DEEP OPTIMIZATION

### 3.1 — Bundle diet: route-based code splitting audit

**Reden**: App.tsx has 90+ `lazyWithRetry()` calls. While each is lazy, the route *definition* code adds ~3KB parsed JS to the main bundle. 50+ admin routes don't need to be defined for storefront visitors.

**Actie**:
- Extract admin routes into a separate `AdminRoutes.tsx` that's only imported when path starts with `/admin`
- Use a single catch-all route `<Route path="/admin/*" element={<LazyAdminRoutes />} />` 
- This removes ~60 `lazyWithRetry()` calls from the main App.tsx parse

**Files**: `src/App.tsx` → split into `src/routes/AdminRoutes.tsx`, `src/routes/StorefrontRoutes.tsx`

**Risico**: Medium — route matching order matters.

**Verificatie**: `bun run build` → main chunk size decreased by ~3–5KB. Production test all admin routes still work.

**Rollback**: Revert to single App.tsx with all routes.

---

### 3.2 — Context tree optimization

**Reden**: Homepage wraps everything in `AuthProvider > CartProvider > CartAnimationProvider > WishlistProvider`. Auth and Wishlist are not needed for initial homepage render.

**Actie**:
- Make AuthProvider lazy — only initialize after hydration gate
- Move WishlistProvider to only wrap pages that need it (wishlist, PDP)
- CartAnimationProvider: evaluate if it's needed on every page or just PDP

**Files**: `src/App.tsx`, context providers

**Risico**: Hoog — auth state affects many components. Need thorough testing.

**Verificatie**: DevTools Performance → reduced JS execution in first 2s. All auth flows still work.

**Rollback**: Revert provider tree changes.

---

### 3.3 — Image payload reduction (13MB → <3MB target)

**Reden**: PSI flags "Avoid enormous network payloads" at ~13MB.

**Actie**:
1. Audit all images loaded on homepage: `DevTools → Network → Img → sort by size`
2. Ensure ALL images go through Cloudinary (verify optimizer is active)
3. Add `sizes` attribute to all `<img>` tags so browser picks correct srcSet width
4. Hero image: serve max 600px wide on mobile (currently serves 1200px)
5. Product grid: cap at 480px wide (currently may serve full-size CJ images)
6. Set Cloudinary `q_auto:eco` for non-hero images (more aggressive compression)

**Files**: `src/lib/image-optimizer.ts`, `src/components/ui/optimized-image.tsx`, `src/pages/Index.tsx`

**Risico**: Medium — image quality may visibly decrease.

**Verificatie**: Network tab → total image payload < 1MB on homepage. Visual: no blurry hero image.

**Rollback**: Revert quality settings.

---

### 3.4 — Service Worker / PWA removal

**Reden**: `index.html` lines 294–300 unregister service workers on EVERY page load. The PWA meta tags (lines 39–48) imply a PWA setup but no service worker is active. This is dead code adding confusion.

**Actie**:
- Remove PWA meta tags if no PWA is intended
- Remove SW unregister code (or keep only as one-time migration)
- Remove cache-busting code from index.html boot protection

**Files**: `index.html`

**Risico**: Laag.

**Verificatie**: Cleaner index.html, no SW-related console messages.

**Rollback**: Re-add PWA meta tags if PWA is planned.

---

### 3.5 — Sourcemap warning fix

**Reden**: PSI warns "source maps missing for large first-party JS". Vite config has `sourcemap: false` (correct for prod) but PSI still flags it.

**Actie**: This is a PSI informational warning, not a scoring penalty. Can be safely ignored. If desired, enable `sourcemap: 'hidden'` to generate source maps uploaded to error tracking but not served to browsers.

**Files**: `vite.config.ts` line 86

**Risico**: Laag.

---

## C) LCP FORENSIC CHECKLIST

### Step 1: Identify the LCP element
```
1. Open https://getpawsy.pet on mobile (or Chrome DevTools mobile emulation)
2. DevTools → Performance → Record → Reload → Stop
3. Look for "LCP" marker in timeline
4. Click it → "Related node" shows the element
5. OR: DevTools → Lighthouse → View Treemap → LCP element highlighted
6. OR: Add ?lcpTrace=1 to URL → console shows LCP timing
```

### Step 2: Diagnose based on LCP element type

| LCP Element | Root Cause | Fix |
|---|---|---|
| **Hero `<img>`** | Image too large, no CDN, no preload | Serve via Cloudinary, preload in `<head>`, max 600w on mobile |
| **Hero `<h1>` text** | Font blocking render (FOIT) | Inline @font-face with local fallback, `font-display: swap` |
| **Product card image** | Grid images loading before hero | Ensure hero has `fetchpriority="high"`, grid images `loading="lazy"` |
| **Background gradient** | CSS render-blocking | Inline critical CSS |
| **Nothing (blank)** | JS bundle blocking entire render | Reduce main bundle, check for TDZ errors |

### Step 3: Verify fix
```
1. Deploy change
2. PSI mobile → LCP time
3. WebPageTest.org → filmstrip view → first meaningful paint frame
4. Chrome UX Report (28-day average) → LCP p75
```

---

## D) TTFB PLAN (Lovable/Cloudflare specific)

### Current situation
- TTFB ~1.6s on mobile (PSI)
- Lovable hosting = static SPA on Lovable's edge infra
- Cloudflare may or may not be in front (verify with `curl -I`)

### Verification steps

```bash
# 1. Check if Cloudflare is active
curl -I https://getpawsy.pet | grep -i "cf-ray\|server\|cache"

# Expected: cf-ray header present, server: cloudflare

# 2. Check cache status
curl -I https://getpawsy.pet | grep -i "cf-cache-status"

# Expected: HIT or DYNAMIC. If MISS every time → caching not working

# 3. Check compression
curl -I -H "Accept-Encoding: br,gzip" https://getpawsy.pet | grep -i "content-encoding"

# Expected: br (Brotli) or gzip
```

### TTFB reduction actions

| Action | Expected TTFB gain | How |
|---|---|---|
| Cloudflare cache HTML (Edge Cache TTL) | -500ms+ | Cache Rules → HTML → Edge TTL: 1 hour |
| Cloudflare Brotli | -50ms | Speed → Optimization → Brotli: ON |
| Cloudflare HTTP/3 | -100ms (mobile) | Network → HTTP/3: ON |
| Reduce index.html size | -50ms | Remove inline scripts, minimize boot protection code |
| Custom domain DNS: proxied | verify | DNS → A record → proxied (orange cloud) |

### ⚠️ Lovable limitations
- Cannot control origin server response time
- Cannot add server-side rendering (SSR) — Lovable is static SPA only
- Cannot set custom origin headers (must use Cloudflare Transform Rules)
- TTFB floor is determined by Lovable's hosting infra (~200–400ms typical)

---

## E) BUNDLE DIET PLAN

### Current bundle analysis

```bash
# Generate bundle analysis
npx vite-bundle-visualizer
# OR check build output sizes
bun run build 2>&1 | grep "dist/"
```

### Targets

| Chunk | Current (est.) | Target | How |
|---|---|---|---|
| Main entry | ~150KB gzip | <80KB | Remove eager contexts, split routes |
| react-vendor | ~45KB gzip | 45KB (fixed) | Cannot reduce |
| router | ~15KB gzip | 15KB (fixed) | Cannot reduce |
| query | ~15KB gzip | 15KB (fixed) | Cannot reduce |
| animations (framer-motion) | ~60KB gzip | 0KB on homepage | Remove from critical path |
| icons (lucide) | ~20KB gzip | <5KB | Only import used icons (already doing per-icon) |

### Specific actions

1. **Measure first**: `bun run build` → note every chunk and size
2. **framer-motion**: Grep for all imports → replace with CSS on homepage
3. **Radix UI**: Cannot split (Safari TDZ) — but can lazy-load components that use it
4. **sonner**: Already deferred. Verify it's not in initial bundle: `grep -r "from 'sonner'" src/pages/Index.tsx`
5. **react-helmet-async**: ~8KB — consider replacing with manual `document.title` for homepage
6. **Route definitions**: Move admin routes to lazy-loaded module

### How to measure

```bash
# Build with stats
VITE_CJS_TRACE=true bun run build

# Check individual chunk sizes
ls -la dist/assets/*.js | sort -k5 -n

# Verify what's in each chunk
# In vite.config.ts, temporarily add:
# build: { rollupOptions: { output: { sourcemap: true } } }
# Then: npx source-map-explorer dist/assets/index-*.js
```

---

## F) CONSOLE ERRORS — SYSTEMATIC PLAN

### Step 1: Reproduce
```
1. Open https://getpawsy.pet in incognito
2. DevTools → Console → Clear → Reload
3. Document every error/warning
4. Navigate to: /collections/cat-trees-and-condos, /product/[any], /cart
5. Document page-specific errors
```

### Step 2: Categorize

| Category | Example | Priority | Fix |
|---|---|---|---|
| Network 404s | Missing favicon sizes, broken image URLs | P1 | Fix paths or remove references |
| Hydration mismatch | Static hero shell → React hero diff | P1 | Ensure static shell HTML matches React output exactly |
| TDZ errors | "Cannot access before initialization" | P0 | Already fixed (deferred analytics) — verify |
| Deprecation warnings | React lifecycle, API changes | P3 | Update when convenient |
| Third-party errors | Analytics, tracking script failures | P3 | Wrap in try/catch, already in MarketingErrorBoundary |

### Step 3: Fix priority
1. P0: Anything that prevents page load
2. P1: Anything PSI specifically flags
3. P2: Anything visible to users
4. P3: Warnings only — address in maintenance sprints

---

## G) ACCESSIBILITY QUICK FIXES

### Non-branding-breaking fixes

| Issue | Fix | File(s) |
|---|---|---|
| Icon-only buttons no name | Add `aria-label="Open cart"`, `aria-label="Search"`, `aria-label="Open menu"` | Navbar.tsx |
| Cart count badge | Add `aria-label={`Cart with ${count} items`}` | CartIcon component |
| Close buttons (X) | Add `aria-label="Close"` | All Dialog/Sheet close buttons |
| Image alt text | Ensure all product images have descriptive alt (already using product name) | OptimizedImage.tsx |
| Color-only links | Add underline on hover or `aria-current` for active nav | Navbar.tsx, Footer.tsx |
| Focus visible | Ensure `focus-visible:ring-2 focus-visible:ring-primary` on all interactive elements | Global CSS or button.tsx |
| Skip to content | Add `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` | Layout.tsx |
| Form labels | Ensure newsletter input has visible or `aria-label` label | Index.tsx newsletter form |
| Contrast | Check `text-muted-foreground` contrast ratio — if < 4.5:1, darken slightly | index.css |

### How to verify
```
1. PSI → Accessibility tab → all warnings resolved
2. Chrome DevTools → Lighthouse → Accessibility → 90+
3. Tab through page → all interactive elements reachable and visible
```

---

## PRE-RELEASE CHECKLIST

- [ ] `bun run build` succeeds with no errors
- [ ] Build output: main chunk < 100KB gzip
- [ ] No new chunks in initial load that weren't there before
- [ ] Visual test: homepage hero renders < 1s (DevTools Performance)
- [ ] Visual test: no layout shift (CLS) during load
- [ ] Console: zero errors on homepage load
- [ ] Network: all product images via Cloudinary
- [ ] Network: no 404s
- [ ] Functional: Add to cart works
- [ ] Functional: Navigation to collections works
- [ ] Functional: Search works
- [ ] Mobile: test on real device or DevTools mobile emulation

## POST-RELEASE CHECKLIST

- [ ] PSI mobile score ≥ 80
- [ ] PSI LCP ≤ 2.5s (target 2.0s)
- [ ] PSI CLS ≤ 0.10
- [ ] PSI TBT < 300ms
- [ ] PSI "render-blocking resources" — no items or ≤1
- [ ] PSI "unused JavaScript" — reduced from baseline
- [ ] PSI "cache policy" — no warnings for hashed assets
- [ ] PSI "console errors" — clear
- [ ] PSI accessibility ≥ 90
- [ ] WebPageTest.org filmstrip: meaningful content at 2s
- [ ] GSC Page Experience → check after 28 days

---

## WAT NU ALS EERSTE — 5 STAPPEN IN VOLGORDE

1. **Fix Google Fonts** (Phase 1.1): Replace external CSS link with inline `@font-face` in index.html → eliminates #1 render-blocking resource. *(30 min, laag risico)*

2. **Add Cloudinary preconnect** (Phase 1.2): Add `<link rel="preconnect" href="https://res.cloudinary.com">` to index.html. *(5 min, laag risico)*

3. **Remove FadeInView from hero** (Phase 1.4): Replace `<FadeInView instant>` with `<div>` in Index.tsx hero section. *(10 min, laag risico)*

4. **Run PSI baseline**: Before any more changes, capture exact PSI mobile scores for homepage as your measurement baseline. Screenshot + save JSON.

5. **Fix console errors** (Phase 1.5): Open production site, document all console errors, fix the top 3. *(1 hr, laag risico)*

These 5 steps together should reduce LCP by 1–2s and eliminate the most impactful PSI warnings with minimal risk.
