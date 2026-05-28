# CI-8 — AI Homepage Personalization + Dynamic Winner Routing

A fully feature-flagged, additive personalization layer. Default OFF in storefront render path until verified; flag flip enables it instantly. Static homepage remains the fallback at every layer.

## Goals
- Lift homepage→PDP CTR, ATC, scroll depth on cold TikTok/Pinterest mobile traffic.
- Zero Lighthouse / SEO / canonical / checkout impact.
- No popup spam, no fake urgency, no manipulative copy.

## Scope (this phase)

### 1. Database (migration, additive only)
- `public.ai_homepage_variants` — variant_key (unique), traffic_source, geo_tier, device_quality, hero_category, hero_product_id, emotional_angle, headline, subheadline, primary_cta, confidence_score, performance_score, impressions, clicks, atc, purchases, bounce_delta, active, created_at.
- `public.homepage_variant_events` — session_id, variant_key, event_type (`impression|hero_click|pdp_view|atc|purchase|bounce`), product_id, created_at.
- GRANTs: `service_role` ALL on both. `authenticated` SELECT on `ai_homepage_variants` (admin via `has_role`). NO anon writes — all writes go through edge function with service role.
- RLS:
  - `ai_homepage_variants`: admins can select/insert/update/delete (`has_role(auth.uid(),'admin')`).
  - `homepage_variant_events`: admins can select; inserts only via service role (no anon/auth insert policy).
- Indexes: `(variant_key)`, `(traffic_source, geo_tier, device_quality)`, `(created_at desc)` on events.

### 2. Edge function `ai-homepage-engine`
- Public (verify_jwt false), tiny payload: `{ traffic_source, geo_quality, device_quality, returning, session_id }`.
- Reads top winners from `product_priority` / `bestsellers` + recent ATC velocity (cached 5 min in-memory per isolate).
- Optional Gemini Flash call (`google/gemini-2.5-flash`) to pick an emotional angle headline from a small whitelist — 400ms hard timeout, single attempt, no retry. On 429/402/timeout → returns rule-based decision.
- Response: `{ variantKey, hero: { category, productId, headline, subheadline, primaryCta }, categoryBias: string[], blockOrder: string[], ttlSeconds }`.
- Always returns a valid decision; never throws to client. Records nothing itself — client fires `impression` via a separate lightweight `ai-homepage-event` endpoint (or reuses funnel events).

### 3. Client lib `src/lib/homepagePersonalization.ts`
- `shouldUsePersonalization()` — gated on `getConversionFlag('aiHomepage')` AND not bot AND not internal traffic AND not admin route. Returns false for `unknown` device confidence < 60.
- `getHomepageVariant()` — sessionStorage cache (`gp_hp_variant_v1`, TTL 15 min). Fire-and-forget fetch; resolves to `null` quickly if not ready so first paint is always static.
- `getHeroBias()`, `getCategoryBias()` — pure readers from the cached variant.
- `trackHomepageVariant(event, payload)` — `navigator.sendBeacon` to the event endpoint, never throws, never awaits.

### 4. Conversion flag
- Add `aiHomepage: false` to `src/lib/conversionFlags.ts` (default OFF — flip after admin QA).

### 5. Homepage modular blocks (presentation only, no logic change when flag off)
Refactor `HomePage.tsx` to render an ordered list of blocks based on `blockOrder` when personalization is active; otherwise render the exact current order. Block components are the existing sections — no new layout work this phase, just an ordering wrapper:
- `HeroSectionPremium` (with overridden headline/sub/CTA when variant provides them)
- existing trust strip suppression already in place
- `BenefitsSection`, `CuratedProductSection` (re-ranked by `categoryBias`), `SocialProofSection`, `SoftEmailCapture`, `HowItWorks`, `ProblemSolutionSection`, `HomepageFAQ`, `TrustTransparencySection`, `FinalCtaSection`.

Hero override: when variant has `headline`/`subheadline`/`primaryCta`, `HeroSectionPremium` accepts optional props and uses them; otherwise falls back to the CI-7 defaults. No layout shift — same DOM shape, only text swap after hydration.

### 6. Admin panel `/admin/homepage-ai` (lazy-loaded)
- Route added to admin router, behind existing `has_role('admin')` guard.
- Tabs: Variants (leaderboard sorted by performance_score), Traffic-source breakdown, Hero winner tracker, Emotional-angle performance.
- Per-variant toggle (active on/off), rollback (deactivate all → static).
- Pure read from new tables + small RPC for aggregates; zero storefront bundle impact (separate chunk).

### 7. Measurement
Reuse existing funnel events where possible; new events table only captures variant-attributed signals. Aggregates computed in admin via SQL views (`ai_homepage_variant_stats`).

## Out of scope (explicit)
- Checkout / cart UI (untouched).
- Canonical, sitemap, robots, SEO meta (untouched).
- New popups, countdowns, urgency badges (forbidden by brand rules).
- Pro-tier AI models.

## Safety
- All new code paths gated by `aiHomepage` flag (default false).
- Engine failure → static homepage, no user-visible error.
- Migration is purely additive (CREATE only, no ALTER/DROP).
- No changes to `products`, `bestsellers`, `product_priority`, or any indexed/SEO-relevant table.
- Admin route lazy-loaded, not in main bundle.

## Order of execution
1. Migration (await approval).
2. Edge function + event endpoint.
3. Client lib + flag + Hero prop overrides + block ordering wrapper.
4. Admin route (lazy).
5. Verify: static homepage unchanged with flag OFF (screenshot 390×844), engine returns decision in <500ms, admin route loads behind role guard.

Say **approve** to start with the migration.
