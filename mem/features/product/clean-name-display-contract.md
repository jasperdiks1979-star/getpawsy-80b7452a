---
name: Clean product name display contract
description: All user-facing product labels must use displayName(product) which prefers products.name_clean over the raw supplier name.
type: feature
---

**Column:** `products.name_clean text` (50–65 char US-shopper headline, written by `sanitize-product-titles` edge function via Lovable AI). Original `products.name` is preserved for rollback.

**Rule:** Every PDP H1, product card, cart row, Stripe line item (via the DB lookup in `create-checkout`), Pinterest pin overlay, GMC feed, and SEO meta MUST resolve the label through `src/lib/displayName.ts` (`displayName(p) = p.name_clean?.trim() || p.name`). Never read `product.name` directly in UI.

**Future passes:** Invoke `sanitize-product-titles` with `{ limit: 40 }` (admin or internal-secret) to keep new SKUs cleaned. The function auto-skips already-cleaned rows unless `force: true`.