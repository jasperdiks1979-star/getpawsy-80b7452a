# Phase 9 — Commercial completion without external side effects

Status: COMPLETE for all internally-executable work. No email sent, no ad spend, no supplier
message, no payment/refund, no external publication.

## Fully complete

### 1. Unsupported claims removed from live surfaces
- **PDP key points were invented from the product category.** The old fallback asserted
  "Automatic cleaning helps reduce daily scooping", "Built-in sensors for pet safety",
  "Supports cats up to 25+ lbs safely", "Non-toxic, pet-safe materials throughout",
  "Fits under most airline cabin seats" — none of which is documented for any stocked product,
  and several of which are false (no stocked litter box is automatic).
  Replaced with `evidenceBenefitBullets()` in `src/lib/product-evidence.ts`: bullets come only
  from VERIFIED evidence fields (dimensions, materials, capacity, assembly, cleaning, included
  items), capped at 5, and render nothing when no source documents anything. Per-SKU verified
  overrides still take precedence.
- **First-party testing claims removed** from `serp-domination-engine.ts`, `seo-route-config.ts`,
  `silo-config.ts`, `SeoIntentPage.tsx`, `BestInteractiveCatToys.tsx`, `CatCondoVsCatTree2026.tsx`,
  `IndoorCatFurnitureGuide.tsx`, `DogCarTravelSafety.tsx` ("crash-tested" product framing).
  GetPawsy does not physically test products; the "how we select products" page says so.
  General CPS/crash-test *education* is retained — it describes the industry, not our products.
- Regression locked by `src/test/phase9-claims.test.ts` (21 assertions).

### 2. Kept deliberately (documented, not fabricated)
- `APPROVED_SHIPPING_LINE` ("Estimated delivery: 5–10 business days", 30-day returns) in
  `src/config/merchant-policy.ts` and the `ProductSchema` JSON-LD fallback. This is a merchant
  commitment applied consistently site-wide and in Google Merchant Center, not a supplier-derived
  ETA. Supplier lane data remains unusable (low-confidence, CN origin vs verified US stock).

### 3. Supplier spec packets — PREPARED, UNSENT
`docs/commercial-rebuild/phase9/SUPPLIER-SPEC-PACKETS.md` holds three ready messages with exact
product IDs, variant IDs and SKUs, and a 9-point fact checklist. Sending requires your approval.

### 4. Review-request email — validated in dry run, still disabled
Gate `REVIEW_REQUEST_EMAILS_ENABLED !== "true"` unchanged; nothing sends. Defects found and fixed
so it is safe to enable later:
- targeted `shipped` as well as `delivered` while the copy said "since your order arrived" —
  now delivered-only;
- no unsubscribe link and no suppression check — now skips `newsletter_subscribers.is_active=false`
  and includes an unsubscribe link;
- the CTA pointed at `/contact`, so a reply could never be matched to an order and could never earn
  a verified-purchase badge — now links to the product page review anchor carrying the order id.
Duplicate protection (one `review_requests` row per order) and the 5–10 day delay were already correct.

**Ready-to-enable checklist:** set `REVIEW_REQUEST_EMAILS_ENABLED=true`; confirm the Resend sending
domain for `noreply@getpawsy.pet`; confirm at least one order has reached `delivered`; watch the
first run's logs before allowing the cron to continue.

### 5. Commercial KPI truth — contamination found and fixed
All five "paid orders" in the database belong to the store owner
(`jasperdiks@hotmail.com`, `jasperdiks1979@gmail.com`), including $0.50 and $1.00 live payment
smoke tests. The dashboard's "$219.98 revenue / 5 paid orders / $44 AOV" was therefore **not
customer revenue**. `CommercialKpiCard` now excludes owner addresses and token-amount smoke tests
(≤ $2) and states how many internal orders were excluded. True customer revenue to date: **$0.00**.

### 6. Unchanged safeguards (re-verified)
- Bundles: 22 existing gate tests cover explicit option selection, sold-out options, same-supplier,
  US stock, exact `${productId}-${vid}` cart lines, no discount claim, warehouse inventory outranking
  the flat stock field.
- 72 placeholder reviews remain unapproved and excluded from every rating surface; verified-buyer
  status is enforced server-side by `trg_product_reviews_guard`.
- Public catalog least-privilege (`products_public` security_invoker) intact.

## Blocked only by external evidence or approval

| Item | Blocker | Needs from you |
| --- | --- | --- |
| Assembled dimensions, materials, weight limits, cleaning, certification for heroes 1, 2, 4, 5 | No internal record holds them; CJ sync tables empty | Approval to send the three prepared supplier packets |
| Hero 1 weight conflict (4.4 lb vs 5.5 lb) | Two internal records disagree | Same supplier request |
| Displayed delivery windows | Only shipping evidence is low-confidence and says CN while stock is US | Real lane data from the supplier or carrier |
| Genuine reviews | No delivered customer order exists yet | Approval to enable review-request emails once a real order is delivered |
| Paid acquisition | Plan written, nothing published | Explicit approval and budget |

## Verification
1059 tests pass (1 skipped), typecheck clean, build OK, `send-review-request` redeployed.
