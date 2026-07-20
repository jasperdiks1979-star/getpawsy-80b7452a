# GetPawsy — Merchant API Phase 1 Implementation Plan

Purpose: prepare the migration off `shoppingcontent.googleapis.com/content/v2.1` onto `merchantapi.googleapis.com` before the 18 Aug 2026 shutoff. Phase 1 is staging only. Nothing production-facing changes.

## Non-negotiable guardrails (repeated in code and CI)

- No cron edits. No XML feed edits. No Merchant Center config edits.
- No product insert/update/delete against Merchant Center in this phase.
- No secret rotation, no token exposure in logs.
- Existing Content API code paths remain the default and untouched at runtime.
- All new behavior gated by three env flags, default `false`:
  `MERCHANT_API_READ_ENABLED`, `MERCHANT_API_WRITE_ENABLED`, `MERCHANT_API_DELETE_ENABLED`.
- Fail closed on any unresolved account / data source / language / feedLabel / offer identity.

## Phase 1 — Official API contract verification

Fetch and pin the current Google Merchant API reference for:

- Products sub-API: confirm whether `products/v1` (stable) or `products/v1beta` is the current GA endpoint for `productInputs.insert|delete|list` and processed `products.get|list`.
- Reports sub-API: confirm `reports/v1` vs `reports/v1beta` for `reports.search` and `product_view` / `product_performance_view` fields.
- Accounts sub-API: confirm `accounts/v1` for `accounts.dataSources.list`.
- Accepted OAuth scope (expected: `https://www.googleapis.com/auth/content`, unchanged).
- Resource-name formats: `accounts/{account}`, `accounts/{account}/dataSources/{dataSource}`, `accounts/{account}/productInputs/{productInput}`.
- ProductInput vs processed Product semantics (input is what we submit; processed is what Google returns after enrichment; identity is `contentLanguage~feedLabel~offerId`).
- Idempotency rules (`productInputs.insert` is upsert-by-name), quota class, backoff guidance (429 + 5xx exponential w/ jitter).

Deliverable: `docs/merchant-api-migration/phase1-api-contract.md` with the exact endpoint, version, and doc URL per capability, plus a diff versus the earlier audit (which proposed `v1beta` everywhere).

## Phase 2 — Data-source resolution (read-only)

New read-only edge function `merchant-api-probe` (default `verify_jwt=false`, admin-only via existing admin token check) that:

1. Loads the existing `merchant_oauth_tokens` row, decrypts refresh token, mints access token.
2. Calls `accounts/v1/accounts/{mid}/dataSources`.
3. Emits, redacted: data source `name`, `displayName`, `input` (`API` / `FILE` / `UI`), `primaryProductDataSource.{contentLanguage,feedLabel,countries}`, `feedFileInput` details.
4. Classifies which data source owns Content API submissions (input = `API`, matching `en` + `US`).
5. Flags overlap risk with the XML feed at `https://getpawsy.pet/merchant-feed.xml` by comparing 100 sample `offerId`s from the XML against the API-owned data source's product listing.

If (a) more than one API data source matches `en`+`US`, or (b) offerId overlap with the XML feed data source exceeds 0, halt and return `MERCHANT_DATA_SOURCE_CONFLICT_REQUIRES_REVIEW`. Resolved value is written only to `docs/merchant-api-migration/phase2-data-source.md` — never to a table that a scheduled job could pick up.

## Phase 3 — Shared client

New file `supabase/functions/_shared/merchant-api.ts` exporting a typed client:

- `getAccessToken()` — reuses existing PKCE refresh path; caches per-invocation.
- `resolveAccount()` / `resolveDataSource()` — read `merchant_oauth_tokens.merchant_center_id`; data source name from Phase 2 doc / env override `MERCHANT_API_DATA_SOURCE_NAME` (default unset → fail closed on writes).
- `insertProductInput(input)` / `deleteProductInput(name)` / `listProductInputs()` / `getProduct(name)`.
- `reportsSearch(query)` with typed row shape for `product_view` and `product_performance_view`.
- `withRetry()` — 4 tries max, base 500ms, jitter, retry on `429`/`5xx` only; classify `401` as auth-refresh-once, `403` as fatal-permission, `404` as not-found, `409` as conflict.
- `redactError()` — strips access tokens, refresh tokens, PII from Google error envelopes before logging.
- Structured logger `mlog(event, fields)` that never accepts a raw token.

No caller wired to production paths yet.

## Phase 4 — Payload mapping

New file `supabase/functions/_shared/merchant-api-mapping.ts` with pure function `contentV21ToProductInput(product) → ProductInput` and inverse `productInputToLegacy(input)` for parity tests.

Map matrix documented in `docs/merchant-api-migration/phase4-field-map.md`:

| Content API v2.1 | Merchant API ProductInput | Notes |
|---|---|---|
| offerId | offerId | identity |
| contentLanguage | contentLanguage | |
| targetCountry | feedLabel | US → `US` |
| title/description/link/imageLink/additionalImageLinks | attributes.* | |
| availability/price/salePrice/condition/brand | attributes.* | Price → `{amountMicros, currencyCode}` |
| gtin/mpn/identifierExists | attributes.gtin/mpn/identifierExists | |
| googleProductCategory (numeric) | attributes.googleProductCategory | keep numeric ID |
| productTypes[] | attributes.productTypes[] | |
| shipping[] | attributes.shipping[] | shape parity documented per field |
| customLabel0..4 | attributes.customLabel0..4 | |
| adult/multipack/isBundle/itemGroupId | attributes.* | |

Any field with a semantic change (e.g. `price` money shape) is called out explicitly. Nothing dropped silently — unknown fields raise a mapping-time warning captured in the report.

## Phase 5 — Function-by-function adapters (dark, flag-gated)

For each caller, add a sibling adapter file, imported but only executed when the relevant flag is `true`. Original code path is unchanged.

- `supabase/functions/merchant-sync/merchant-api-adapter.ts` — insert/delete/list via new client.
- `supabase/functions/merchant-cleanup/merchant-api-adapter.ts` — safe delete by resolved resource name; report-based status inspection.
- `supabase/functions/geip-sync-merchant/merchant-api-adapter.ts` — `reports.search` on `product_view` replacing `productstatuses`.
- `supabase/functions/cj-google-sync/merchant-api-adapter.ts` — ProductInput insertion path.

Each `index.ts` gets a top-of-handler guard:

```ts
const useApi = Deno.env.get("MERCHANT_API_WRITE_ENABLED") === "true";
if (useApi) { /* adapter — currently unreachable in prod */ }
// existing Content API path unchanged
```

Cron entries are untouched. No feature flag is set in prod.

## Phase 6 — Read-only shadow tests

New edge function `merchant-api-shadow` (admin-gated, read-only, invokable manually):

1. Pick 10 sample products from `products_public`.
2. For each: fetch legacy v2.1 `products.get`, fetch Merchant API processed `products.get`, and DB source-of-truth row.
3. Diff on: offerId, title, price, availability, link, imageLink, feedLabel, contentLanguage, approval state, item issue codes.
4. Emit JSON report `docs/merchant-api-migration/phase6-shadow-report.json` + human summary.

No writes. No deletes. Explicit assertion in code that only `GET` methods are used.

## Phase 7 — Testing & CI

Deno unit tests co-located under `supabase/functions/_shared/__tests__/`:

- `mapping.test.ts` — every field including sale price, missing GTIN/MPN, out-of-stock, duplicate offerIds, malformed input.
- `client.test.ts` — token refresh, 401→refresh-once, 429 backoff, 5xx retry, 403 no retry, redaction.
- `resource-name.test.ts` — account and data-source URL encoding.
- `delete-safety.test.ts` — refuses when data source unresolved.
- `reports.test.ts` — parses `product_view` rows including item_issues.
- `xml-overlap.test.ts` — throws when candidate offerId is present in the XML feed data source.

All Google calls mocked via `fetch` stub. Zero real network calls in tests.

Repo-residual scanner script `scripts/merchant-api-residual-scan.mjs` lists every direct `shoppingcontent.googleapis.com` reference and marks each as `legacy-expected` (existing files) or `unexpected` (anything new outside Content API paths). CI advisory only in Phase 1.

## Deliverables

Files created (new):

```text
docs/merchant-api-migration/phase1-api-contract.md
docs/merchant-api-migration/phase2-data-source.md
docs/merchant-api-migration/phase4-field-map.md
docs/merchant-api-migration/phase6-shadow-report.json
supabase/functions/_shared/merchant-api.ts
supabase/functions/_shared/merchant-api-mapping.ts
supabase/functions/_shared/__tests__/*.test.ts
supabase/functions/merchant-api-probe/index.ts
supabase/functions/merchant-api-shadow/index.ts
supabase/functions/merchant-sync/merchant-api-adapter.ts
supabase/functions/merchant-cleanup/merchant-api-adapter.ts
supabase/functions/geip-sync-merchant/merchant-api-adapter.ts
supabase/functions/cj-google-sync/merchant-api-adapter.ts
scripts/merchant-api-residual-scan.mjs
```

Files changed (minimal, guarded):

```text
supabase/functions/merchant-sync/index.ts        (flag-gated import only)
supabase/functions/merchant-cleanup/index.ts     (flag-gated import only)
supabase/functions/geip-sync-merchant/index.ts   (flag-gated import only)
supabase/functions/cj-google-sync/index.ts       (flag-gated import only)
```

No migrations. No cron changes. No secret changes. No changes to `merchant-feed-full`, admin UI behavior, Shopify types, Google Ads, GSC, checkout, or pricing.

## Final report

`GETPAWSY_MERCHANT_API_PHASE_1_IMPLEMENTATION_REPORT` containing all 14 required sections and one of the allowed verdicts.

## What Phase 1 explicitly does NOT do

- No dual-write.
- No canary traffic.
- No removal of Content API code.
- No enabling of any of the three flags in any environment.
- No changes to `merchant-feed.xml` generation.
- No Merchant Center dashboard changes.

Approve to proceed. On approval I execute Phases 1–7 in order and return the report.
