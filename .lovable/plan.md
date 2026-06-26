
# Phase Ω — Autonomous Commerce Intelligence (ACI)

Strictly additive on top of PEC, PGA, PRIE, CPE, SEO Engine, Pinterest Autopilot, Commander, Growth Intelligence. Nothing renamed, removed, or refactored. New surface uses the `aci_*` prefix.

## Guardrails (apply to every wave)

- Never edit existing edge functions, cron jobs, RLS, or dashboards.
- Never auto-execute financial actions (ads activation, budgets, bids, deletions, payments) — those go to `aci_approvals` queue.
- Every metric stored with `source` + `captured_at`; reject any value without provenance.
- After each wave: generate PDF + JSON report into `public/admin-reports/ai-implementation/` and append to manifest.json.
- Deployment gate: regression checklist must pass before activating cron triggers.

---

## Wave 1 — Foundation + Global Data Lake (additive only)

New tables (all `aci_*`, admin-only RLS, service_role full, GRANTed):
- `aci_settings` — feature flags, weights, thresholds.
- `aci_data_sources` — registry of sources (Pinterest, Ads, GA4, GSC, GMC, CJ, orders, inventory, media, SEO, blog) + last sync + health.
- `aci_signals` — normalized signal stream (source, kind, entity_ref, value, captured_at, confidence).
- `aci_run_steps` + `aci_runs` — orchestration audit.
- `aci_budget_ledger` — credit/cost tracking per run.
- `aci_audit_log` — every read/write decision.

Edge functions:
- `aci-orchestrator` — fans out reads to existing syncs (pinterest-analytics-sync, sync-ga4-daily, gsc, cj sync, pinterest-revenue-brain, prie-*, pe-endpoint-matrix). No new external API calls; pure aggregation.
- `aci-data-source-health` — pings each registered source and writes to `aci_data_sources`.

Cron: 1× per hour, debounced; DB triggers on `orders/products/pinterest_pins` insert call `aci_kick()` (5-min debounce, same pattern as PRIE).

---

## Wave 2 — Global Product AI (12 scores per product)

Tables:
- `aci_product_scores` — one row per product: revenue, margin, inventory, pinterest, seo, trend, competition, visual_quality, conversion, virality, customer_interest, overall, plus per-score `source_refs jsonb`.
- `aci_product_rankings` — daily snapshot of overall rank.

Edge function `aci-product-scorer`: reads from existing `product_intelligence`, `pinterest_revenue_scores`, `agp_growth_scores`, `gsc_keywords`, `mi_trends`, `cpe_qa_results`, `orders`. No fabrication: missing inputs → score = NULL + reason in `source_refs`.

UI: extend Commander dashboard with read-only "Global Product AI" panel (top 50). No removal of existing tables.

---

## Wave 3 — Revenue Forecast + Opportunity Engine

Tables:
- `aci_revenue_forecasts` — horizons: today/week/month/quarter/year; mean + p10/p90; method + sample size.
- `aci_opportunities` — ranked top 100; expected_revenue_delta, traffic_delta, profit_delta, confidence, evidence_refs.

Edge function `aci-forecast-engine` (uses Lovable AI gateway, `google/gemini-3-flash-preview`, structured output) — synthesises forecasts + opportunities from `aci_signals` + `aci_product_scores`. Output validated against zod schema; rejected on schema fail.

---

## Wave 4 — Safe Auto-Execution + Approval Queue

Tables:
- `aci_actions` — kind, payload, status (safe_executed | queued_for_approval | rejected | done), idempotency_key.
- `aci_approvals` — restricted actions (any spend/delete/billing) — never auto-fire.

Edge function `aci-executor`:
- Whitelist of SAFE actions only (refresh analytics, refresh scores, repair URLs/metadata/queue, generate pin drafts via existing CPE, generate SEO/blog drafts via existing engines, retry APIs, repair tracking, repair merchant feeds, repair Pinterest metadata).
- All call EXISTING functions — no new write paths to Pinterest/GMC/Ads.
- Anything matching RESTRICTED patterns → `aci_approvals` only.

---

## Wave 5 — Executive AI + Nightly CEO Mode

- `aci-executive-report` — generates morning JSON+PDF (business health, revenue, growth, Pinterest, SEO, products, inventory, AI decisions, forecast, opportunities, problems, expected monthly/annual revenue).
- `aci-ceo-nightly` — runs 03:00 UTC, asks "What should GetPawsy do tomorrow?", produces ranked plan, dispatches safe items to `aci-executor`, queues the rest.
- Self-learning: `aci_learning` — outcome of each action updates confidence weights in `aci_settings`.

---

## Wave 6 — Commander UI extension + Regression Gate

- New tab in existing `CommanderPage`: "ACI — Autonomous Commerce". Sections: Global Brain, Product Rankings, Revenue Forecast, Opportunities, Action Queue, Approval Queue, Executive Reports. Read-only first; "Force refresh" button only.
- Regression script `aci-regression`: pings each existing critical function (PRIE, PGA, PEC, CPE, SEO, Pinterest publish, GA4, GSC, Commander) and confirms 200 + non-empty payload. Writes report.
- Generate the 8 required deployment reports (Architecture, Automation, Performance, Security, Regression, Commerce AI, Revenue Opportunity, Roadmap). Cron only activated after Regression passes; otherwise functions remain manual-trigger.

---

## Technical notes

- All new tables: `GRANT SELECT,INSERT,UPDATE,DELETE TO authenticated` only for admin-policy tables; `GRANT ALL TO service_role`; admin-only RLS via `has_role(auth.uid(),'admin')`.
- All AI calls via Lovable AI Gateway with structured output (zod). No raw fabrication path.
- Idempotency: every executor call carries `idempotency_key`; duplicates within 1h are no-ops.
- No changes to: `pinterest_pins`, `products`, `orders`, `pe_*`, `pga_*`, `prie_*`, `cpe_*`, `cinematic_*`. ACI only reads from them.
- Reports + manifest updated at the end of every wave.

## Execution

I'll run Wave 1 immediately on approval, then 2 → 6 in sequence (each gated by the prior wave's regression). Total ~6 turns. Confirm to proceed.
