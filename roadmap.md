# GETPAWSY revenue-critical repair roadmap

- [x] P0 — volume discount parity, fake tax removed, discount fail-closed, Pinterest bot classification, tiered incentive UI
- [x] P1 — Stripe key unification, payment-method claims, stable cart_id on funnel events, abandoned-cart idempotency, 5–10 day ETA
- [ ] P2 — scope not defined in project history; awaiting confirmation from the user before any P2 work
- [x] Security A — admin/internal guard on create-cj-order, audit-warehouse-shipping, analytics-health-probe, visitor-map-stabilization-monitor; legacy admin/diagnostics routes behind AdminRouteGuard; hardcoded-email auth removed
- [ ] Security A follow-up at deploy time: confirm scheduled (cron) callers of analytics-health-probe / visitor-map-stabilization-monitor send `x-internal-secret`
- [x] Commerce J — authoritative payment state, webhook event dedupe, server-verified success page, atomic exactly-once fulfillment claim, paid-state reconciliation
- [x] Commerce K — exact variant identity preserved cart → checkout → order → fulfillment, server-authoritative price with fail-closed mismatch, no variant substitution
- [x] Commerce L — server-side inventory + shipping eligibility before checkout, fail closed on sold out / unshippable, 5–10 business-day promise preserved
- [x] Commerce M — payment/fulfillment/refund state separated, refund ledger + dry-run refund execution architecture, exception + deterministic recovery queue, guest lookup ownership fail-closed, /my-claims and /track-order routes restored
- [ ] Deploy review (awaiting approval): create-checkout, check-klarna-eligibility, stripe-webhook, create-cj-order, lookup-guest-order require deploy; new functions verify-payment-session, admin-refund-order, order-recovery-queue require first deploy; storefront requires publish
- [ ] Deploy-time note: `verify-payment-session` must be live before the storefront is published, otherwise the success page shows "couldn't confirm" for every order
- [ ] Deploy-time note: real refunds stay disabled until the `REFUNDS_ENABLED` secret is set to `true`; until then admin-refund-order is dry-run only
