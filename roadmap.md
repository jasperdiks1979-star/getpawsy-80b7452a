# GETPAWSY revenue-critical repair roadmap

- [x] P0 — volume discount parity, fake tax removed, discount fail-closed, Pinterest bot classification, tiered incentive UI
- [x] P1 — Stripe key unification, payment-method claims, stable cart_id on funnel events, abandoned-cart idempotency, 5–10 day ETA
- [ ] P2 — scope not defined in project history; awaiting confirmation from the user before any P2 work
- [ ] Deploy review: create-checkout, check-klarna-eligibility, stripe-webhook require deploy; storefront requires publish (both awaiting approval)
- [x] Security A — admin/internal guard on create-cj-order, audit-warehouse-shipping, analytics-health-probe, visitor-map-stabilization-monitor; stabilization caller contract fixed; legacy /dashboard, /admin QA and /diagnostics routes behind AdminRouteGuard; hardcoded-email auth removed from QA page (not deployed, not published)
- [ ] Security A follow-up at deploy time: confirm any scheduled (cron) callers of analytics-health-probe / visitor-map-stabilization-monitor send `x-internal-secret`; DB was unreachable during this batch
