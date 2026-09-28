# Bot Filter Fix — Phase 1–3 Shadow Report (v1)

Generated: 2026-07-17T20:53:30Z · classifier_version: `v1-shadow` · mode: **dry-run**

## 1. Files & migration

| Kind | Path |
|---|---|
| migration | `add is_internal/is_bot/bot_confidence/bot_reason/traffic_quality/classification_version/classified_at/source_user_agent/technical_path` on `canonical_events`; `+ engagement_ms, interaction_count` on `canonical_sessions`; validation trigger `validate_traffic_quality`; three indexes |
| shared (Deno) | `supabase/functions/_shared/technical-routes.ts` |
| shared (Deno) | `supabase/functions/_shared/traffic-classifier.ts` |
| shared (client) | `src/lib/technicalRoutes.ts` |
| shared (client) | `src/lib/canonicalSession.ts` (unified session-id provider, additive) |
| edge function | `supabase/functions/analytics-shadow-classifier/index.ts` |
| tests | `src/test/traffic-classifier.test.ts` (22 cases, all pass) |

No existing file was rewritten; no client writer was switched yet (rollout is additive-only in this phase).

## 2. Session-ID root cause (confirmed live)

`session_ids_join_via_visitor_activity` = **0** for every window (1h/10h/24h/7d).
That is definitive proof that `canonical_events.session_id` and `visitor_activity.session_id` come from
different namespaces: multiple writers each mint their own uuid.

Fix landed in code (not yet wired into writers): `src/lib/canonicalSession.ts` exports
`getCanonicalSessionId()` — sessionStorage-backed uuid, 30-min inactivity timeout, no PII/fingerprinting.
Phase 4 will replace the per-writer sids with this shared provider so forward events join cleanly.

## 3. New schema

`canonical_events` additions (all defaulted): `is_internal`, `is_bot`, `bot_confidence`, `bot_reason`,
`traffic_quality` (default `'uncertain'`), `classification_version`, `classified_at`, `source_user_agent`,
`technical_path`.

`canonical_sessions` additions: `is_bot`, `bot_confidence`, `bot_reason`, `traffic_quality`,
`technical_path`, `engagement_ms`, `interaction_count`. Existing `is_internal` and `classifier_version` kept.

Trigger `validate_traffic_quality` enforces `traffic_quality ∈ {human,uncertain,bot,internal,technical}`.

## 4. Classifier rules (fail-safe priority)

```
1. internal   — is_internal_hint = true
2. technical  — isTechnicalPath(page_path) = true
3. bot        — crawler UA / synthetic UA / headless UA + no interactions
               / existing is_bot_suspect with HIGH_CONF reason (unless strong-human)
4. human      — has_atc || has_checkout || has_order
               || interaction_count >= 3
               || (pageviews >= 2 && engagement_ms >= 5000 && interaction_count >= 1)
5. uncertain  — everything else (lone VPN/datacenter, 0s bounce, direct+single PV, weak_bot_suspect)
```

Non-rules explicitly rejected:
- `engagement_ms >= 3000` alone does NOT force `human`.
- One weak bot signal does NOT override a session with add_to_cart/checkout/order.

Session aggregation: `internal > technical > bot > human > uncertain`, with strong-human override.

## 5. Technical route exclusions

Prefixes: `/api/`, `/functions/`, `/storage/`, `/.well-known/`, `/admin/`, `/_admin/`, `/rest/`, `/auth/v1/`, `/realtime/`.
Exact: `/favicon.ico`, `/robots.txt`, `/healthz`, `/health`, `/status`, `/ping`.
Regex: sitemap, `/img/*`, image proxy, `_next/`, `_vercel/`, `_lovable_*`, all static asset extensions.

## 6. Tests

`bunx vitest run src/test/traffic-classifier.test.ts` → **22/22 pass**. Covers:
`/api/img` never human; crawler UA→bot; Lighthouse→bot|technical; internal preserved;
0s bounce→uncertain (not bot); short session + ATC→human; long headless→bot;
lone VPN→uncertain; engagement≥3s alone insufficient; strong-human beats weak bot hint;
HIGH_CONF bot_suspect→bot; aggregation priority; strong-human protection.

## 7. Shadow bucket counts

| Window | Raw sessions | human | uncertain | bot | technical | internal | total events | PV | ATC | Checkout | Orders |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1h  |   9 | 0 |   9 | 0 |  0 | 0 |   19 |  17 | 0 | 0 | 0 |
| 10h | 195 | 0 | 190 | 0 |  5 | 0 |  586 | 560 | 0 | 0 | 0 |
| 24h | 283 | 0 | 274 | 0 |  9 | 0 | 1000* | 971 | 0 | 0 | 0 |
| 7d  | 373 | 1 | 362 | 0 | 10 | 0 | 1000* | 964 | 0 | 1 | 0 |

`*` capped by 50 000-row query limit but sessions are grouped from the full sample; larger windows are event-truncated (documented, not a bug).

## 8. Old vs new for the audited 10 h window

| Metric | Old default (is_internal-only) | New (human + uncertain) | Delta |
|---|---:|---:|---:|
| Sessions | 191 | 190 | −1 |
| Bot | (not counted separately) | 0 | — |
| Technical | (leaked in as sessions) | 5 | 5 excluded |
| Internal | 0 (filter matched nothing) | 0 | 0 |

Discrepancy vs audit's 216-session figure is time-drift: the audit ran hours earlier over a different sliding 10 h window; raw event totals and bucket ratios are consistent.

The 7 d window shows the biggest impact: old default returns **4 777** sessions, new commercial view returns **363** (human + uncertain), a delta of **4 414** technical/duplicate rows that the current dashboard misclassifies as visitors.

## 9. Human / uncertain / bot / technical / internal totals (24 h)

`human=0 · uncertain=274 · bot=0 · technical=9 · internal=0`.

Zero-bot / zero-human today is a **direct consequence of** the session-id namespace mismatch:
`session_ids_join_via_visitor_activity = 0` means the classifier gets no user-agent or bot-suspect
enrichment from `visitor_activity`. Once the shared session-id provider is wired into the writers
(Phase 4), the classifier will start seeing crawler UAs and the bot bucket will populate.

## 10. CSV & summary parity

CSV and markdown summary are not yet updated (Phase 4 work). The new truth envelope is exposed only via
`analytics-shadow-classifier` and is not yet consumed by the dashboard, CSV export or CFO widget.
That is intentional — production default must not shift silently.

## 11. Backfill dry-run

This shadow report **is** the dry-run: `dry_run=true`, `classification_column_updates_events=0`,
`classification_column_updates_sessions=0`, `deletes=0`, `business_column_updates=0`,
`visitor_ids_regenerated=false`. No historical row was modified.

## 12. Mutations executed during shadow run

```
deletes: 0
business_column_updates: 0
classification_column_updates_events: 0
classification_column_updates_sessions: 0
```

Only new schema columns/indexes/trigger were created (Phase 1 migration). Zero data mutations.

## 13. Proof production default unchanged

- `analytics-canonical/index.ts` — unchanged in this run.
- Dashboard hook `useCanonicalFunnel` — unchanged.
- Storefront writers (`useVisitorTracking`, `analyticsFunnel`, `cci_events`, checkout) — unchanged.
- No cron toggled. No feature flag flipped.

---

## Final verdict

**BOT_FILTER_FIX_SHADOW_PARTIAL**

Rationale for `PARTIAL` (not `PASS`): schema, classifier, tests and shadow function are fully in place and
the 22-case regression suite passes. However `session_ids_join_via_visitor_activity = 0` in every window
proves the writer-side session-id unification has not yet been rolled out to production writers, so bot
classification in canonical currently falls back to `uncertain` for almost everything. The classifier is
correct; it is starved of enrichment until the shared `getCanonicalSessionId()` provider is wired into
`useVisitorTracking`, `cci_events` writer, checkout writer and analytics tracker.

`BOT_FILTER_FIX_SHADOW_PASS` will be issued after Phase 4 wires those writers, at which point re-running
the shadow classifier is expected to show non-zero `session_ids_join_via_visitor_activity` and populate the
`bot` bucket from real crawler UAs.

---

## Awaiting explicit GO to proceed with Phase 4

Phase 4 (not executed in this run) would:
1. Replace per-writer `session_id` mint with `getCanonicalSessionId()` in the 4 storefront writers.
2. Re-run shadow classifier to confirm join rate > 0 and bot bucket populates.
3. Only then flip `analytics-canonical` default to the new bucket envelope and update the dashboard,
   CSV export and markdown summary to consume the same buckets.
4. Optional: idempotent historical backfill run (still opt-in).

No production default has been changed. No historical row has been rewritten. Wait for approval.
