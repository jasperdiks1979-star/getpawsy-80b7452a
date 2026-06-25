## Revenue Recovery Program V1 — Staged Plan

Scope is too large for one autonomous run (10 phases, infra + UI + edge functions + Stripe + Pinterest + tests + reports). I'll execute in 4 controlled waves, each ending with PDF/JSON report + dashboard you can inspect before approving the next. This avoids shipping unverifiable "all green" claims.

**Guiding rule:** every step must produce real evidence (DB rows, screenshots, Stripe IDs). No simulated "healthy" verdicts.

---

### Wave A — Diagnose & Stop the Bleeding (Phases 1, 2, 6 partial)
Goal: prove where the funnel actually breaks today, then fix the top blocker.

1. **Funnel Validator edge function** (`rr-funnel-validator`) — runs synthetic + real-data checks for each step (landing→PDP→ATC fire→checkout session→webhook→order→GA4 event→Pinterest CAPI). Writes to new `rr_funnel_checks` table. Cron every 15 min.
2. **ATC deep audit** — Playwright suite on `/products/<top-10-slugs>` across mobile+desktop, capture console/network, assert `add_to_cart` GA4 event + CAPI outbox row fire. Output: per-product red/green matrix.
3. **Stripe checkout audit** — query last 30 days of `checkout_funnel_events` + Stripe sessions, classify failure reasons, surface in dashboard.
4. **Revenue Recovery dashboard v1** at `/admin/revenue-recovery` showing funnel validator status + ATC matrix + Stripe failure reasons.
5. Auto-repair the #1 blocker found (likely ATC handler regression or webhook routing).

### Wave B — Attribution + Board Routing (Phases 4, 5)
1. Audit current Pinterest pin URLs in `pinterest_pin_queue` + live `pinterest_pins`, find pins missing utm/pin_id, backfill via `pinterest-link-stamping`.
2. Rebuild board scoring in `pinterest-creative-director` using taxonomy + keyword embeddings + historical board CTR/saves; add confidence score + fallback rules. Add regression test that no >40% of pins route to a single board.
3. Attribution health panel in dashboard.

### Wave C — Live Replay + Self-Healing (Phases 3, 9)
1. Lightweight session replay using existing `visitor_activity` + new `rr_session_events` (rage-click, dead-click, ATC-fail markers). No third-party rrweb (cost). Replay UI in admin.
2. Self-healing worker `rr-self-healer` covering the concrete cases we've actually seen: stuck pin queue, expired locks, stale crons, failed webhook redelivery. Approval gate for destructive actions.

### Wave D — Real Purchase E2E + Final Report (Phases 7, 8, 10)
1. Controlled real Stripe purchase (test mode by default; live mode behind explicit env flag + your confirmation) end-to-end with refund.
2. Revenue Command Center extension (channel/board/campaign/pin revenue) on top of existing `RevenueCommandCenterPage`.
3. Final `2026-06-25-revenue-recovery-program-v1.pdf` + JSON.

---

### Technical notes
- New tables: `rr_funnel_checks`, `rr_atc_audit`, `rr_stripe_failures`, `rr_session_events`, `rr_self_heal_log` — all admin-only RLS + service_role grants.
- New edge functions: `rr-funnel-validator`, `rr-atc-audit-runner`, `rr-stripe-auditor`, `rr-self-healer`, `rr-purchase-e2e`.
- Reuses existing: `CartContext` event_id work, `pinterest_capi_outbox`, `checkout_funnel_events`, `revenue-command-center`.
- Live Stripe test purchases need `STRIPE_LIVE_E2E_ALLOWED=true` secret + explicit chat approval per run.

### What I need from you
1. **Approve Wave A to start now**, or change order.
2. Confirm: live-mode Stripe test purchases allowed in Wave D, or test-mode only?
3. Any phases to drop (e.g. session replay if you'd rather keep using Clarity)?

After your approval I'll execute Wave A and ship the report before touching Wave B.