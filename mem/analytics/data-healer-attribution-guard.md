---
name: DataHealer must never touch attribution / identity localStorage keys
description: DataHealer allow-list is limited to cart/array keys; wiping raw-string keys broke Pinterest attribution and consent
type: constraint
---
## Rule
`src/lib/data-healer.ts` may ONLY read/write these keys: `cart`, `pawsy-cart`, `recentlyViewed`, `wishlist`. `shouldSkipKey` enforces this via the `OWNED_KEYS` allow-list. The `JSON.parse` catch branch must NEVER call `localStorage.removeItem` on unknown keys, and the `beforeunload` runner is forbidden.

## Why
Prior version JSON.parsed every localStorage key and removed anything that wasn't valid JSON. Attribution and identity subsystems store raw scalars (`first_utm_source=pinterest`, `gp_visitor_id=<uuid>`, `first_seen_at=<iso>`, `gp_cookie_consent=granted`, `gp_utm_*`, `__lovable_anonymous_id`). All of these were wiped on every page load (evidence 2026-07-06: `first_utm_source` removed 35×, `gp_visitor_id` 481×, `__lovable_anonymous_id` 576×, `gp_cookie_consent` 148× in 24h). Result: 808 Pinterest visitors in 30d collapsed to 17 canonical sessions, attribution flipped to `(none)/(none)`, and consent banner re-fired every visit blocking GA4/TikTok/Pinterest CAPI. Root cause of the "hundreds of visitors, zero sales" incident.

## How to apply
- Any new persisted attribution/identity key must live outside DataHealer (do NOT add it to `OWNED_KEYS`).
- If you need a new structured JSON key managed by DataHealer, add it to `OWNED_KEYS` AND write a matching heal function; never rely on generic sanitization.
- Never re-add `beforeunload` runs — they nuke cart/UTM state mid-navigation to `/checkout`.