# Phase 4 — Content API v2.1 → Merchant API ProductInput field map

`ProductInput` (v1) uses a top-level identity block and an `attributes` sub-object for the bulk of product data. Money fields switch from `{value, currency}` to `{amountMicros, currencyCode}` where `amountMicros` is a string encoding an integer number of micros (1 USD = 1_000_000).

## Identity

| v2.1 | v1 ProductInput | Notes |
|---|---|---|
| `offerId` | `offerId` | Identity; must match `[a-zA-Z0-9._~-]{1,50}` after our `getpawsy_<uuid>` prefix. Enforced. |
| `channel` | fixed `"ONLINE"` in resource name; not needed on payload | v1 does not accept `LOCAL` in this integration. |
| `contentLanguage` | `contentLanguage` | `en`. |
| `targetCountry` | `feedLabel` | `US`. Distinct concept (feedLabel is a data-source-scoped bucket) but for our single-country US feed the mapping is 1:1. |

## Core attributes

| v2.1 | v1 `attributes.*` | Handling |
|---|---|---|
| `title` | `title` | Direct string. |
| `description` | `description` | Direct string. |
| `link` | `link` | Absolute HTTPS URL. |
| `imageLink` | `imageLink` | Absolute HTTPS URL. |
| `additionalImageLinks[]` | `additionalImageLinks[]` | Preserve order. |
| `availability` | `availability` | Enum: `in_stock` / `out_of_stock` / `preorder` / `backorder`. |
| `condition` | `condition` | Enum. |
| `brand` | `brand` | Direct. |
| `gtin` | `gtin` | Direct. Omit if empty. |
| `mpn` | `mpn` | Direct. Omit if empty. |
| `identifierExists` | `identifierExists` | Boolean. |
| `googleProductCategory` (string or numeric) | `googleProductCategory` | Prefer numeric id string. |
| `productTypes[]` (v2.1 uses `productType` string) | `productTypes[]` | v1 accepts an array; we split on `>` to preserve breadcrumb. |
| `adult` | `adult` | Boolean. |
| `multipack` | `multipack` | Integer. |
| `isBundle` | `isBundle` | Boolean. |
| `itemGroupId` | `itemGroupId` | Optional variant grouping id. |

## Money fields (shape change)

| v2.1 | v1 |
|---|---|
| `price: {value: "12.99", currency: "USD"}` | `attributes.price: {amountMicros: "12990000", currencyCode: "USD"}` |
| `salePrice: {value: "9.99", currency: "USD"}` | `attributes.salePrice: {amountMicros: "9990000", currencyCode: "USD"}` |

`amountMicros` is always emitted as a **string** encoding the integer micros. Rounding uses banker's rounding on the second decimal times 10_000.

## Shipping and tax

| v2.1 shipping element | v1 shipping element (`attributes.shipping[]`) | Notes |
|---|---|---|
| `country` | `country` | Direct. |
| `service` | `service` | Direct. |
| `price: {value, currency}` | `price: {amountMicros, currencyCode}` | Money-shape change. |
| `minHandlingTime`/`maxHandlingTime` | same | Direct. |
| `minTransitTime`/`maxTransitTime` | same | Direct. |
| `region` | `region` | Direct. |
| `postalCode` | `postalCode` | Direct. |

`attributes.shippingWeight`, `shippingLength`, `shippingWidth`, `shippingHeight` use the v1 `Weight` / `Dimension` shape: `{value: number, unit: "kg"|"lb"|"cm"|"in"}` (unchanged).

Tax rows (`attributes.tax[]`) keep the same shape; not currently populated by GetPawsy.

## Custom labels and misc

| v2.1 | v1 |
|---|---|
| `customLabel0..4` | `attributes.customLabel0..4` | Direct. |
| `ageGroup`, `color`, `gender`, `material`, `pattern`, `size`, `sizeSystem`, `sizeType` | Same paths under `attributes.*`. |
| `energyEfficiencyClass` | `attributes.energyEfficiencyClass` | Not used. |
| `installment` | `attributes.installment` | Not used. |

## Fields with semantic differences (called out explicitly)

- `channel`: v2.1 required `online`/`local`; v1 hoists channel into the API surface and defaults to `ONLINE` for productInputs. We do not send it.
- `contentLanguage` + `feedLabel` combined with `offerId` form the resource name — case-sensitive; we uppercase feedLabel (`US`) and lowercase contentLanguage (`en`).
- `productType`: v2.1 accepts a single string with `>` separators; v1 accepts an array. We split on `>` and trim each segment.
- `expirationDate` (v2.1) → `attributes.expirationDate` (v1). Same ISO date; not currently populated.
- `destinations`, `includedDestinations`, `excludedDestinations` (v2.1) → `attributes.includedDestinations` / `excludedDestinations` (v1). We do not currently filter destinations.
- `shopping_ads_excluded_countries` (v2.1) → `attributes.excludedDestinations` semantics differ; not used.
- Item-level issues are no longer part of the product resource; fetch via `reports.search` on `product_view.item_issues`.

## No silent drops

`contentV21ToProductInput` collects any unknown top-level v2.1 keys into `warnings[]` on the mapping result. The caller (dark adapter only) logs and refuses to send when `warnings.length > 0` under a strict-mode flag.

## Removed / not mapped

- `customAttributes[]` (v2.1 free-form): not used; ignored with a warning.
- `warnings`, `productLevelIssues`: read-only in v2.1, not applicable on ProductInput.
- `automatedDiscounts`: not used.

## Testing coverage

See `supabase/functions/_shared/__tests__/mapping.test.ts`.