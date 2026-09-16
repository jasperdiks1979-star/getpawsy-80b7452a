# Phase 11 — Approved external activations (2026-09-16)

User approved exactly two external actions: send the three supplier spec requests, and enable
genuine review-request emails. Paid advertising remains explicitly NOT approved and is untouched.

## 1. Supplier specification requests — SENT

Channel: CJ Dropshipping Ticket API (`POST /api2.0/v1/ticket/create`), authenticated with the
existing cached CJ access token. Ticket type **Sourcing Issue → Unclear Product Description**
(`1480753706080276480` / `1480754507821486080`) — the category CJ defines for missing product
specification detail. One ticket per hero product, sent serially (1 req/s limit), 2026-09-16 16:15 UTC.

| Ticket no | Hero | Supplier product id | SKU submitted | Status |
|---|---|---|---|---|
| T202609161615150281 | Hero 1 — Enclosed Cat Litter Box, Dual Opening | 2022147992715550722 | CJTC276169401AZ | AWAITING_CJ_REPLY |
| T202609161615210411 | Hero 4 — Interactive Cat Puzzle Toy | 1993160057093906434 | CJTE261988601AZ | AWAITING_CJ_REPLY |
| T202609161615272491 | Hero 5 — Stainless Steel Cat Litter Box With Lid | 1976569563728994306 | CJFT255460101AZ | AWAITING_CJ_REPLY |

Each message carries the full variant list (vid + SKU) and the unchanged 9-point checklist from
`docs/commercial-rebuild/phase9/SUPPLIER-SPEC-PACKETS.md`: assembled dimensions, materials, weight
limit, assembly, cleaning/care, package contents, certification, net weight, and dispatch time from
the US warehouse **only if substantiable**. Per-hero extra questions (hero 1 weight conflict, hero 4
chew/food safety, hero 5 steel grade and basin dimensions) were included verbatim. No order, sample,
cancellation or payment was created. No secret value appears in any log or document.

Duplicate check: ticket list before sending held only three unrelated 2025 tickets.

## 2. Review-request emails — ENABLED

- Secret `REVIEW_REQUEST_EMAILS_ENABLED=true` set; `send-review-request` redeployed.
- Live readback: function returns `{"processed":0,"results":[]}` — enabled, and it sent nothing,
  because no order qualifies. No customer email was sent.
- Schedule: cron job `send-review-requests-daily`, `0 10 * * *` (once a day), active.

Safeguards verified in code and locked by `src/test/review-request-safeguards.test.ts`:

- **Delivered only** (`status = 'delivered'`), never merely shipped.
- **Owner/test orders excluded** — new `isInternalOrder` mirrors the KPI rule
  (`jasperdiks@hotmail.com`, `jasperdiks1979@gmail.com`, and any charge ≤ $2).
- **No back-sending** — the query window is orders created 5–10 days ago only; all five historical
  owner/smoke orders are outside it and are internal anyway. Production check: zero delivered orders
  in the last 30 days.
- **No duplicates** — an existing `review_requests` row for the order short-circuits the send.
- **Unsubscribe honoured** — inactive `newsletter_subscribers` rows are suppressed; every email
  carries an unsubscribe link.
- **Order binding** — CTA links to `/products/{slug}?order={order_id}#reviews`, so a review can be
  matched to a paid order; only order-matched reviews can ever show the verified-buyer badge.

## 3. Not touched

`send-abandoned-cart-email`, `send-remarketing-email`, `send-claim-followup`, `send-email-campaign`,
`send-seo-nurture-email` all remain gated by `OUTBOUND_CUSTOMER_EMAIL_ENABLED`, which is not set.
No paid ad spend, no Pinterest/TikTok/Google publication, no Stripe payment or refund, no CJ order.

Verification: 1072 tests pass, typecheck clean.
