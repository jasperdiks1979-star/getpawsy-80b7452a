## Executive briefing — Genesis v2 consolidation

**Current state (evidence).** The platform now holds ~550 Postgres tables, ~50+ namespaced AI engines (PCIE, PCIE2, PCIEv2, PEI, PIE, ARIE, AGD, MIL, AGAL, AOS, GAEE, TRPE, GVCAE, AICOS, ROE, SPE, AEE, EDE, KGRE, 7 Genesis DNAs, CIE, PRE, PPE, ALG, XAI, MI, EC, Growth/Taste/Master Director, Evolution Engine, Collective Intelligence, Evidence Governor, Organic OIE/ODE, FOS…) and ~25 admin dashboards. CIE is now the supreme gate; most non-revenue/non-Pinterest engines have shipped at "Phase 1" with seed tables and a single dashboard but no measured business outcome.

**Problem.** Architectural completeness has overtaken business value. We have:
- 6+ overlapping "intelligence/decision" layers (AGD, MIL, EDE, AEC, AGAL, AOS, GAEE, AICOS, KGRE) that all reason over the same DNA snapshots.
- 4+ overlapping creative engines (PCIE, PCIE2, PCIEv2, GCD, CPE) with separate weight tables.
- 5+ overlapping health/scorecard surfaces (TRPE, GVCAE, commander, AOS health, CIE health, Pinterest Health, ARIE health).
- 3 attribution/funnel stacks (ARIE, CIE, GI) writing similar events.
- 12+ cron jobs touching the same nightly window with no priority arbitration.

Every duplicate burns AI credits, blocks CIE from converging on a single truth, and makes any future schema change a multi-week migration.

**Recommendation.** Pause all "new engine" work. Run a structured consolidation in 5 waves. Wave 1 protects revenue today; Waves 2–5 collapse the architecture without losing Genesis intent.

---

### Phase 1 — Architecture map (deliverable: report, no code)
Generate `public/admin-reports/architecture/genesis-v2-audit.{json,md}`:
- Inventory: every table prefix → owning engine → dashboard route → cron schedule → edge fn.
- Edge-fn call graph (who invokes whom) extracted from `supabase/functions/**`.
- Dashboard route → table dependency matrix.
- Top 20 hottest tables (writes/day) vs top 20 coldest (zero writes in 30d → deprecation candidates).

### Phase 2 — Genesis gap classification
For each Genesis pillar (Business, Customer Psychology, Pinterest, Creative, Analytics, Product, Market, KGRE, EDE, AEE, ROE, SPE, AICOS, GVCAE, GAEE, TRPE, CIE, PRE, PPE) tag: `keep / merge / replace / rewrite / delete / defer`. Output table in the same report.

### Phase 3 — Overlap collapse targets (proposed)
```text
Intelligence/decision  AGD + MIL + EDE + AEC + KGRE  →  one "Council" service (EDE shell, KGRE memory)
Creative engines       PCIE / PCIE2 / PCIEv2 / GCD   →  PCIE2 canonical; others read-only archive
Health/scorecards      TRPE + GVCAE + AOS health     →  one /admin/health (TRPE shell)
Attribution/funnel     ARIE + GI + CIE               →  CIE canonical; ARIE/GI become adapters
Governance/audit       AGAL + Evidence Governor      →  AGAL canonical
Knowledge              KGRE + AOS knowledge + Genesis DNA graph edges  →  KGRE canonical
Notifications          Guardian + commander alerts + monitoring_alerts  →  one bus
```
No table drops in this wave — only writes are redirected and dashboards consolidated. Old tables become read-only for 30 days, then archived.

### Phase 4 — Dependency graph + criticality
Generate `gvcae_modules` rows for every engine with: inputs, outputs, criticality (P0/P1/P2/P3), business owner = founder, observed AI credit cost (from `ai_gateway_logs`), 30-day write volume. Surface at `/admin/architecture`.

### Phase 5 — ROI scoring
Score every *unbuilt* Genesis capability and every *consolidation target* on: revenue impact, profit impact, eng cost, AI cost, risk. Persist in `gvcae_value_analysis`. Anything ROI < 1.5 → defer.

### Phase 6 — Execution waves
```text
Wave 1 — Revenue/reliability (this week)
  - CIE GA4 cron already live → add Pinterest + TikTok + Meta confidence adapters (currently 0, blocking AI training)
  - Revenue-truth divergence alert wired to Guardian (today: dashboards only)
  - Kill 12 redundant nightly crons that recompute the same DNA snapshots
  - PRE + Pinterest Integrity Guard SLO: <2% false-reject (today unmeasured)

Wave 2 — Highest-ROI commercial (next 2 weeks)
  - Consolidate Creative → PCIE2 only; freeze PCIE/PCIEv2/GCD writes
  - One Pinterest Health dashboard (collapse 7 panels into 4 tabs)
  - Pricing/profit recommendations from ROE wired into PCIE2 product selection

Wave 3 — Knowledge consolidation
  - All engine "learnings" write to KGRE only
  - Genesis DNA modules become KGRE views, not separate tables
  - Retire gad_/aos_/mil_ knowledge tables (read-only → drop after 30d)

Wave 4 — Executive intelligence
  - One Council service replacing AGD+MIL+EDE+AEC; one nightly briefing
  - One /admin/health replacing TRPE/GVCAE/AOS health

Wave 5 — Long-term evolution
  - GAEE proposals act only on KGRE evidence with CIE gating_ok=true
  - Quarterly architecture review automated via GVCAE
```

### Phase 7–10 — Quality gates, business validation, self-review
Every consolidation PR must include: KPI it improves, measurement method, rollback (the read-only window is the rollback), and a 14-day review entry in `gvcae_reviews`.

---

### What I need from you before touching code

1. **Approve the 7 consolidation targets** in Phase 3 (or veto specific merges).
2. **Confirm Wave 1 scope** — Pinterest/TikTok/Meta CIE adapters + cron cull + Guardian revenue-truth alert. Estimated AI credit savings from cron cull alone: ~40%.
3. **Anything off-limits** — engines you want preserved as-is regardless of ROI (e.g. CIE, PRE, Pinterest Integrity Guard are non-negotiable from my side; confirming you agree).

I will not start consolidation refactors without explicit approval — they touch 50+ tables and 25+ dashboards and an unannounced merge would break your daily admin workflow. Phase 1 (the audit report) I can run immediately on approval and it changes no production code.

### Technical notes
- Audit runs as a one-shot edge function `gvcae-genesis-audit` reading `pg_catalog`, `cron.job`, `supabase/functions/**`, and `src/pages/admin/**`. Output to `public/admin-reports/architecture/`.
- Consolidation uses the existing `gvcae_*` schema — no new tables.
- Read-only window is enforced via RLS revoke on `service_role` insert/update for deprecated tables, with a one-line restore path.

Reply with: **approve audit only**, **approve audit + Wave 1**, or **revise plan**.