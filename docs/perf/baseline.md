# GetPawsy Performance Baseline — Phase 2

**Date**: 2026-02-25
**Build**: phase2-cwv-perf

## Bundle Leakage Audit (Phase 1 findings)

### Issues Found & Fixed

| Issue | Impact | Fix |
|---|---|---|
| `AdminRouteGuard` + `AdminLayout` eagerly imported in App.tsx | Admin auth logic + sidebar + 15+ lucide icons pulled into main bundle | Converted to `lazy()` with combined Promise.all loader |
| `LiveCheckoutWidget` rendered on every page via `<Suspense>` in App.tsx | Admin checkout widget in storefront critical path | Removed from global render |
| `LiveVisitorBadge` in storefront Layout.tsx | Admin visitor tracking in storefront shell | Removed from Layout, stays admin-only |

### Chunk Architecture (Post-Fix)

| Chunk Group | Contents | Load Condition |
|---|---|---|
| `react-vendor` | react, react-dom | Always (critical) |
| `router` | react-router-dom | Always (critical) |
| `query` | @tanstack/react-query | Always |
| `supabase` | @supabase/supabase-js | Deferred (lazy singleton) |
| `admin-dashboard` | /pages/admin/*, /components/admin/* | Only on /admin/* routes |
| `seo-engine` | SEO agent/command/growth libs | Only on admin SEO pages |
| `animations` | framer-motion | Deferred |
| `icons` | lucide-react | Tree-shaken per-icon imports |
| `editor` | @tiptap, prosemirror | Only on admin editor pages |
| `mapbox` | mapbox-gl | Only on /live-map |
| `forms` | zod, react-hook-form | Deferred |
| `carousel` | embla-carousel | On pages with carousels |

### Storefront Critical Path (What loads on homepage)

1. `index.html` — static hero shell (LCP element)
2. `react-vendor` chunk
3. `router` chunk
4. `query` chunk
5. `Index.tsx` (eagerly imported — only page not lazy)
6. `Navbar` + `Footer` (via Layout, eagerly imported)
7. Marketing widgets deferred 5s / interaction / grid paint

### Known Bottlenecks (To Address in Phase 3)

1. **JS Payload**: ~50+ admin lazy routes still defined in App.tsx — each `lazyWithRetry()` call is trivial but the route definitions add ~2KB parsed JS. Consider route config array.
2. **framer-motion**: Still used in 60+ files (product pages, about, contact, etc.) — deferred/lazy but adds ~60KB gzip per chunk that uses it. Consider CSS animation replacements for remaining files.
3. **SeoPageWrappers**: Eagerly imported in App.tsx line 268 — pulls in `SeoPillarPage` and `SeoIntentPage` synchronously via wrapper components.
4. **Image payload**: Product grid images from CJ dropshipping have no CDN optimization (PROVIDER=none). Enable Cloudinary/Imgix for responsive delivery.
5. **3rd-party**: Pinterest tag, visitor tracker, chat widget — all deferred but still load.

## Phase 2 Changes (2026-02-25)

| Change | File(s) | Impact |
|---|---|---|
| CookieConsent: replaced framer-motion with CSS transitions | `CookieConsent.tsx` | ~60KB gzip saved from cookie banner chunk |
| SearchSuggestions: deferred supabase import | `SearchSuggestions.tsx` | ~138KB off search chunk critical path |
| TrendingNowStrip: fixed height for CLS prevention | `TrendingNowStrip.tsx` | Eliminates CLS from trending strip |
| Footer: collapsible sections on mobile | `Footer.tsx` | ~80 fewer DOM nodes on mobile initial render |

## Conclusion

**Primary bottleneck**: Admin code leaking into storefront bundle (fixed Phase 1). Phase 2 removed framer-motion from cookie banner, deferred supabase in search, and reduced footer DOM on mobile. Remaining: framer-motion in product pages + image CDN optimization.
