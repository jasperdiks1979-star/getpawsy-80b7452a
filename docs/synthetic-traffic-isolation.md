# Synthetic visitor isolation — staged rollout

Explicit Playwright browser tests mark their tab with `sessionStorage.gp_synthetic_traffic_v1=playwright-e2e` before application scripts run. The global visitor tracker suppresses its commercial analytics dispatch for these tabs. It does not suppress the storefront, cart or checkout functionality.

This is a first-stage safeguard, **not a claim of end-to-end analytics isolation**. Audit other independent writers (product detail ATC, visitor_activity, CCI, GA4, heartbeat, server/edge workers) before treating synthetic counts as fully removed. Those pipelines may emit events outside the global tracker. The global tracker also mounts a heartbeat hook independently; this needs separate verification.

Never classify `?cb=`, short visits, direct traffic, US desktop users or cart actions alone as bots. Retain historical data and label uncertain sessions as unknown. Compare session timestamps against CI runs only as supporting evidence; a timestamp overlap does not establish identity.

Acceptance before production: tests for marked E2E browsing/cart/checkout, unmarked US visitor events, reloads, new tabs, attribution persistence, typecheck, build, mobile E2E, analytics truth parity, and real live validation. Do not deploy based on this branch alone.
