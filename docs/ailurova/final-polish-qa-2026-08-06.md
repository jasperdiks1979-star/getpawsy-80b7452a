# Ailurova — Final Polish & QA Pass (2026-08-06)

Live store: https://ailurova.com — theme `gid://shopify/OnlineStoreTheme/202525999436`
Executor: `supabase/functions/ailurova-final-polish` (audit mode first, then apply).

## Mutations applied
| Target | Change |
|---|---|
| `layout/theme.liquid` | Added a guarded `{% unless page_description %}` meta-description fallback (home, cart, policy pages had none because `shop.description` is empty). **No** og:/twitter: tags added — the theme's own meta-tags snippet already emits them. |
| `sections/header.liquid` | Demoted the visually-hidden shop-name `<h1>` to `<p>` — removes the duplicate H1 on every route. |
| Product `15889810194764` | Americanized description copy (moulded → molded, travelling → traveling, colour → color); internal link normalization. |
| Page `faq` | Fixed broken `/pages/returns` link → `/policies/refund-policy`; American English spelling. |

An earlier revision of the head-meta block emitted a full og:/twitter: set and produced
**duplicate metadata**. It was detected in verification and fully reverted in the same pass
(`removed v1 head-meta block`). Current state: exactly 1 `description`, 1 canonical, 1 H1 per page.

## Verification (live, cache-busted, desktop 1440 + mobile 390)
- H1 count: 1 on `/`, `/products/...`, `/pages/about`, `/pages/faq`, `/pages/contact`, `/cart`
- `description`: present on all audited routes; no duplicates
- canonical: 1 per route
- "GetPawsy": absent from all storefront routes (see manual action 1)
- British spellings: absent at origin (some CDN edges served stale copies briefly)
- `/pages/returns` (404): no longer linked anywhere
- Images without `alt`: 0 · Buttons without accessible name: 1 (theme drawer close)
- Horizontal overflow: none at 390px · Console errors: none from the theme
- Prices: $99.00 / compare-at $119.00 · Inventory: in stock · support@ailurova.com sitewide

## MANUAL ACTIONS (cannot be done via the current API token)
1. **Privacy Policy still contains GetPawsy business details.** Shop policies require the
   `write_legal_policies` scope. Edit in Shopify Admin → Settings → Policies → Privacy policy.
2. **Gallery images 2–9 carry baked-in claim text** ("cats under 15 lbs", exact dimensions,
   "leakproof"). These are unverified claims and a Google Ads/Merchant risk. Replace with
   claim-free product photography.
3. **Country/region selector** defaults by geo; consider pinning to United States for paid US traffic.
4. Checkout logo/branding must be applied in Admin (restricted scope).

## Quality score
**86 / 100** — structure, metadata, copy, accessibility and trust signals are clean.
Points withheld for: gallery images with unverified claims (-8), Privacy Policy branding
remnant (-4), sub-40px gallery dot tap targets (-2).

## Verdict
**READY FOR PAID TRAFFIC — conditional on manual action 1 and 2** (both are compliance
risks for Google Ads / Merchant Center review, not conversion blockers).
