# Phase 1 — Merchant API contract (verified 2026-07-20)

Discovery source: `https://developers.google.com/merchant/api/reference/rest` (live index).

## Selected stable versions

| Sub-API | Selected version | Doc slug | Notes |
|---|---|---|---|
| Accounts | **v1 (GA)** | `accounts_v1/accounts` | v1beta and v1alpha still published; use v1. |
| Data sources | **v1 (GA)** | `datasources_v1/accounts.dataSources` | v1beta available; use v1. |
| Products | **v1 (GA)** | `products_v1/accounts.productInputs`, `accounts.products` | Includes `productInputs.insert/delete/list` and processed `products.get/list`. |
| Reports | **v1 (GA)** | `reports_v1/accounts.reports` | `reports.search` with `product_view` and `product_performance_view`. |
| Inventories | v1 (GA) | `inventories_v1/accounts` | Not required in Phase 1. |
| Issue resolution | v1 (GA) | `issueresolution_v1/accounts` | Optional; item-level issues also available from `product_view`. |

**Change vs the prior audit.** The prior read-only audit proposed `v1beta` targets. Every proposed `v1beta` endpoint now has a stable `v1` equivalent and Phase 1 pins to `v1` accordingly. If a caller needs a field that is still `v1beta`-only, it is called out below.

## Endpoints Phase 1 will use

Host: `https://merchantapi.googleapis.com`

| Capability | Method + Path | Replaces |
|---|---|---|
| Insert / upsert product | `POST /products/v1/{parent=accounts/*}/productInputs:insert?dataSource={dataSourceName}` | `POST content/v2.1/{mid}/products` |
| Delete product input | `DELETE /products/v1/{name=accounts/*/productInputs/*}?dataSource={dataSourceName}` | `DELETE content/v2.1/{mid}/products/{id}` |
| List product inputs | `GET /products/v1/{parent=accounts/*}/productInputs` | `GET content/v2.1/{mid}/products` |
| Get processed product | `GET /products/v1/{name=accounts/*/products/*}` | `GET content/v2.1/{mid}/products/{id}` (processed view) |
| List processed products | `GET /products/v1/{parent=accounts/*}/products` | `GET content/v2.1/{mid}/products` |
| Product statuses / issues | `POST /reports/v1/{parent=accounts/*}/reports:search` with query on `product_view` | `GET content/v2.1/{mid}/productstatuses` |
| List data sources | `GET /datasources/v1/{parent=accounts/*}/dataSources` | (new capability; no v2.1 equivalent) |

Resource-name formats:

- Account: `accounts/{account}` — `{account}` is the numeric MC id, e.g. `accounts/5717571566`.
- Data source: `accounts/{account}/dataSources/{dataSource}`.
- Product input: `accounts/{account}/productInputs/{productInput}` where `{productInput}` is `{contentLanguage}~{feedLabel}~{offerId}` percent-encoded per segment.
- Processed product: `accounts/{account}/products/{product}` with the same identity tuple.

## OAuth

- Accepted scope: `https://www.googleapis.com/auth/content` (unchanged from Content API).
- No re-consent required. Existing `merchant_oauth_tokens.scopes` value is compatible.
- Access-token refresh mechanism is unchanged — Google OAuth2 refresh-token grant against `https://oauth2.googleapis.com/token`.

## Identity, idempotency, quotas

- `productInputs.insert` is upsert-by-name. Repeated inserts with identical `contentLanguage`/`feedLabel`/`offerId` update the same `ProductInput`.
- `dataSource` query parameter is **required** on insert and delete — the API refuses ambiguous writes.
- Quota class matches Content API (per-account/per-day and per-minute). Retry on `429` and `5xx` with exponential backoff + jitter. Do not retry `4xx` other than `429`.
- `ProductInput` = what we submit. Processed `Product` = what Google returns after enrichment (may differ in category, image, availability inference). Diff both sides in Phase 6.

## Known gaps / follow-ups

- `customBatch` has no direct v1 replacement. We do not use it, so no code path is affected.
- `productstatuses` legacy shape (`destinationStatuses`, `itemLevelIssues`) is replaced by `product_view` columns: `id`, `offer_id`, `title`, `aggregated_reporting_context_status`, `item_issues`, `feed_label`, `content_language`, `availability`, `price`, `sale_price`, `brand`, `gtin`, `mpn`, `condition`, `image_link`, `click_potential`, `product_type_l1..l5`, `google_product_category`.
- Client-side we still send prices as `{amountMicros, currencyCode}` — v2.1 accepted both micros and the older `{value, currency}` shape; v1 accepts only `Price` with `amountMicros` (string) + `currencyCode`.

## Deadline

Content API for Shopping shutoff: **2026-08-18**. Phase 1 completed 2026-07-20 (29 days of runway).