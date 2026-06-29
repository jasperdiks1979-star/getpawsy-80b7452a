# Purchase Confidence Match + Mismatch Breakdown

Today `ga4_purchase` confidence is a blunt ratio of GA4 event count vs internal order count and the dashboard only shows one number per metric. We will match individual GA4 purchases to internal orders (by transaction_id and revenue), score the result, and render a clear mismatch panel per metric.

## 1. GA4 adapter — true purchase reconciliation

File: `supabase/functions/cie-ga4-adapter/index.ts`

- Run a second GA4 report scoped to `eventName = purchase` with dimensions `transactionId` + metrics `eventCount`, `totalRevenue`.
- Pull internal orders for the same window (status in `paid, completed, fulfilled`) with `id`, `stripe_session_id`, `stripe_payment_intent_id`, `total_amount`, `currency`.
- Build a lookup keyed on every known transaction id (`id`, `stripe_session_id`, `stripe_payment_intent_id`) and match GA4 rows against it. Produce:
  - `matched` / `ga4_only` / `orders_only`
  - `revenue_ga4_cents`, `revenue_orders_cents`, `revenue_delta_pct`
  - `id_match_rate` (matched / GA4 purchases)
  - `count_match_rate` (min/max of the two counts)
- New `purchaseConfidence({ ga4Count, orderCount, idMatchRate, revenueDeltaPct })`:
  - 0 if no GA4 purchases.
  - Weighted blend: 50% id match, 30% revenue parity (`max(0, 1 - |delta|/0.1)`), 20% count parity. Clamp 0–100.
  - Rationale text summarises the three sub-scores.
- Same pattern keeps `ga4_page_view` / `ga4_session_start` as volume-based.

## 2. Persisted mismatch breakdown

New table `cie_metric_mismatches` (migration) so the dashboard can render structured detail without overloading `rationale`:

```text
metric            text         -- e.g. ga4_purchase
scope             text         -- 'global'
window_hours      int
breakdown         jsonb        -- { matched, ga4_only, orders_only, id_match_rate,
                                    revenue_ga4_cents, revenue_orders_cents,
                                    revenue_delta_pct, sample_ids: [...] }
evaluated_at      timestamptz
unique (metric, scope)
```

Admin-only RLS + grants per repo convention. Adapter upserts the row for `ga4_purchase`. Existing adapters for Pinterest/TikTok can opt in later by writing the same shape; this PR wires GA4 only.

## 3. Dashboard — Mismatch Breakdown panel

File: `src/pages/admin/ConversionIntegrityPage.tsx` + `src/lib/cie/client.ts`

- Add `fetchMetricMismatches()` returning rows ordered by `metric`.
- New card "Per-Metric Mismatch Breakdown" below "Per-Metric Confidence":
  - One row per metric with chips: Matched, GA4-only, Orders-only, ID-match%, Revenue Δ%, GA4 $, Orders $.
  - Red chip when `id_match_rate < 0.9` or `|revenue_delta_pct| > 1%`; amber for 1–5%; green otherwise.
  - Empty state when no breakdown row exists yet for a metric.

## 4. Technical notes

- GA4 `transactionId` requires `purchase` events to ship the `transaction_id` parameter; that already maps to `orders.id` via the existing `purchase` emit (`src/lib/analytics.ts`).
- Window alignment: use the same `days` parameter for both GA4 report and the `orders` query (`created_at >= now() - days`).
- All writes use service role inside the edge function; no client-side schema change.
- Confidence floor (`ai_training_min_confidence`) and `gating_ok` semantics stay unchanged — only the score and its rationale improve.

## Out of scope

- No changes to Pinterest/TikTok scoring this round.
- No backfill job; the breakdown is written on the next `Sync GA4` / hourly cron.
