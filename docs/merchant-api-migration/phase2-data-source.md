# Phase 2 — Data-source resolution (STUB)

Status at Phase 1 close: **NOT YET EXECUTED LIVE**.

The `merchant-api-probe` edge function is deployed read-only and requires a valid live OAuth session (the stored access token expired 2026-07-06). A refresh call is safe (no Merchant Center state change) but a human must invoke the probe once from `/admin/integrations/merchant` so the refreshed access token is minted through the existing PKCE path.

Once invoked, this document must be updated with:

- `accountName`: `accounts/5717571566` (confirmed from `merchant_oauth_tokens.merchant_center_id`).
- `dataSources[]` — full list returned by `GET /datasources/v1/accounts/5717571566/dataSources`.
- `apiOwnedDataSourceName` — the single data source whose `input == "API"` and whose `primaryProductDataSource` matches `contentLanguage=en`, `feedLabel=US`.
- `xmlFeedDataSourceName` — data source whose `fileInput.fetchUri` is `https://getpawsy.pet/merchant-feed.xml`.
- `offerIdOverlap` — count of `offerId` collisions between the two data sources across a 100-product sample.

## Fail-closed conditions

- Zero or more than one API data source matching `en`+`US` → halt with `MERCHANT_DATA_SOURCE_CONFLICT_REQUIRES_REVIEW`.
- `offerIdOverlap > 0` → halt with the same verdict; overlap risks the XML feed silently overwriting API writes (or vice versa) during a canary.

## Placeholder resolution (paper analysis)

Content API v2.1 submissions historically default to the `Content API` data source auto-provisioned by Google when Content API is first used. That data source is normally named `Content API` in the MC UI, has `input == "API"`, and is scoped to `feedLabel=US`, `contentLanguage=en` for our account. The XML feed at `https://getpawsy.pet/merchant-feed.xml` is a **separate** file-input data source. Historical `merchant_sync_logs` show 25 products pushed via API vs ~200+ products in the XML feed, so a non-empty offerId overlap is likely.

**Consequence for canary planning**: even after live probe results arrive, the canary plan (Phase 2 next) must select **either** the API data source **or** a new dedicated `Content API [migrated]` data source — never dual-write both feeds simultaneously.