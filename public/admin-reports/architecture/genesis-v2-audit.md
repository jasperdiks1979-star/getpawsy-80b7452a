# Genesis v2 — Architecture Audit

_Generated 2026-06-29T06:37:47.440048Z_

## Summary

- **Public tables:** 1184 across 170 prefixes
- **Cold tables (0 writes/7d):** 594 (50.2% of total)
- **Edge functions:** 754
- **Admin pages:** 311
- **Cron jobs:** 222 active / 222 total

## Top 20 prefixes by table count

| prefix | tables |
|---|---|
| `pinterest_*` | 163 |
| `pcie2_*` | 41 |
| `cinematic_*` | 39 |
| `pcie_*` | 32 |
| `growth_*` | 27 |
| `acos_*` | 24 |
| `gmd_*` | 23 |
| `product_*` | 22 |
| `gpd_*` | 21 |
| `ee_*` | 21 |
| `aci_*` | 20 |
| `pin_*` | 20 |
| `monitoring_*` | 19 |
| `pe_*` | 19 |
| `market_*` | 18 |
| `mi_*` | 18 |
| `gad_*` | 18 |
| `agal_*` | 17 |
| `aicos_*` | 16 |
| `spe_*` | 15 |

## Top 40 tables by 7d write volume

| table | writes 7d | live rows |
|---|---:|---:|
| `cj_webhook_logs` | 9,915,926 | 9,801,278 |
| `cinematic_ad_jobs` | 596,787 | 296 |
| `pinterest_revenue_forecasts` | 534,405 | 1,800 |
| `cinematic_ad_job_events` | 307,587 | 305,590 |
| `cinematic_worker_heartbeats` | 296,835 | 86 |
| `render_worker_heartbeats` | 296,829 | 86 |
| `pcie2_assembly_results` | 277,680 | 277,680 |
| `pinterest_analytics_daily` | 249,680 | 15,359 |
| `pinterest_pin_dimensions` | 245,113 | 1,200 |
| `pinterest_revenue_opportunity_scores` | 178,135 | 600 |
| `pinterest_revenue_attribution_v3` | 158,589 | 177 |
| `pinterest_revenue_product_tiers` | 132,238 | 589 |
| `cinematic_autopilot_state` | 91,615 | 1 |
| `visitor_activity` | 83,090 | 87,318 |
| `pinterest_credit_state` | 60,950 | 1 |
| `shil_subsystems` | 53,258 | 16 |
| `products` | 45,684 | 1,052 |
| `frontend_error_logs` | 36,202 | 72,220 |
| `cron_job_logs` | 32,701 | 23,638 |
| `pinterest_credit_events` | 32,133 | 32,133 |
| `pinterest_pin_queue` | 31,824 | 2,569 |
| `lp_funnel_events` | 26,199 | 20,653 |
| `shil_recoveries` | 25,190 | 10,871 |
| `shil_incidents` | 23,432 | 2,967 |
| `pcie2_creative_jobs` | 22,422 | 7,420 |
| `market_product_scores` | 22,063 | 19,043 |
| `keyword_rankings` | 21,891 | 69,955 |
| `pinterest_revenue_scores` | 21,000 | 2,608 |
| `product_creative_profiles` | 19,104 | 471 |
| `growth_product_scores` | 19,028 | 19,028 |
| `analytics_health_checks` | 16,878 | 16,878 |
| `pin_headline_bank` | 16,500 | 16,203 |
| `pinterest_render_attempts` | 16,090 | 16,090 |
| `tracking_anomalies` | 15,898 | 687 |
| `pcie2_concept_graph` | 14,519 | 12,799 |
| `hot_product_scores` | 13,892 | 13,892 |
| `shil_signatures` | 13,314 | 6 |
| `sync_progress` | 10,729 | 1 |
| `cj_sync_items` | 9,187 | 9,187 |
| `pinterest_video_function_logs` | 8,264 | 10,709 |

## Genesis classification

| pillar | status | recommendation | rationale |
|---|---|---|---|
| CIE Conversion Integrity | implemented | **keep** | Supreme gate; GA4 cron live; needs Pinterest/TikTok/Meta adapters. |
| PRE Product Relevance | implemented | **keep** | Fail-closed vision gate already wired. |
| Pinterest Integrity Guard | implemented | **keep** | Pre-publish guard, no override. |
| PCIE2 Creative Engine | implemented | **keep** | Canonical creative pipeline. |
| PCIE / PCIEv2 / GCD / CPE | duplicate | **merge** | Overlapping creative stacks; collapse into PCIE2. |
| AGD Growth Director | stub-cron | **merge** | Reasons over same DNA as MIL/EDE/AEC; fold into Council. |
| MIL Meta-Intelligence | stub-cron | **merge** | Grades engines that lack outcome data; fold into Council. |
| EDE Executive Decision | stub-cron | **keep** | Use as Council shell. |
| AEC Executive Council | duplicate | **merge** | Merge into EDE; 3 separate crons today. |
| AGAL Audit & Governance | implemented | **keep** | Canonical decision ledger. |
| Evidence Governor (PCIE2) | implemented | **merge** | Promote into AGAL as evidence subsystem. |
| KGRE Knowledge Graph | implemented | **keep** | Canonical knowledge memory. |
| AOS Orchestrator + knowledge | duplicate | **merge** | Knowledge → KGRE; orchestration → AICOS. |
| AICOS Company OS | stub | **defer** | Workflow value unclear; revisit after consolidation. |
| GAEE Evolution Engine | stub | **defer** | Useful only with KGRE+CIE evidence flowing first. |
| TRPE Production Reliability | implemented | **keep** | Use as canonical /admin/health shell. |
| GVCAE Architecture Evolution | implemented | **keep** | Audit + dependency map host. |
| ARIE Funnel Intelligence | duplicate | **merge** | Collapse into CIE adapters. |
| GI Growth Intelligence (gi_*) | duplicate | **merge** | Collapse into CIE adapters. |
| ROE Revenue Optimization | implemented | **keep** | Wire outputs into PCIE2 product selection. |
| SPE Strategic Planning | stub | **defer** | Low evidence base today. |
| AEE Experimentation Engine | implemented | **keep** | Reuse for all Wave-2 KPI tests. |
| Genesis DNAs (7) | implemented | **merge** | Become KGRE views; retire separate gad_/gpi_/gpd_/gcp_/gcd_/gmd_/gbd_ knowledge tables. |
| PEI / PIE / ODE / OIE / FOS | low-traffic | **defer** | No measured outcome; keep tables, freeze new spend. |
| Commander / CMDR / ACI | duplicate | **merge** | Pick one (CMDR) or retire. |
| Cinematic stacks (v3/v4/cv5) | active | **keep** | Out of consolidation scope this round. |

## Overlap collapse targets

- **intelligence_decision** — AGD, MIL, EDE, AEC, AGAL, AOS, GAEE, AICOS, KGRE
- **creative_engines** — PCIE, PCIE2, PCIEv2, GCD, CPE
- **health_scorecards** — TRPE, GVCAE, AOS health, CIE health, Pinterest Health, ARIE health, commander
- **attribution_funnel** — ARIE, GI, CIE
- **governance_audit** — AGAL, Evidence Governor
- **knowledge_memory** — KGRE, AOS knowledge, Genesis DNA graph edges
- **notifications** — Guardian, commander_alerts, monitoring_alerts, analytics_alerts, github_sync_alerts
- **experimentation** — AEE, pcie2_experiments, mi_experiments, aee_experiments, ee_p2_experiments

## Execution waves

### wave1_revenue_reliability
- Add CIE adapters for Pinterest / TikTok / Meta (currently 0 confidence → blocks AI training).
- Wire cie_revenue_truth divergence > tolerance into Guardian notification bus.
- Cull 12 duplicate nightly DNA-snapshot crons (target ~40% AI credit reduction).
- Add SLO: PRE + Integrity Guard false-reject rate < 2%, measured per 7d.

### wave2_commercial
- Freeze writes on PCIE / PCIEv2 / GCD; PCIE2 canonical.
- Collapse 7 Pinterest panels → 4 tabs on /admin/pinterest-health.
- Wire ROE pricing/profit recs into PCIE2 product selection.

### wave3_knowledge
- Route all engine learnings to KGRE only.
- Convert Genesis DNA modules to KGRE views.
- Mark gad_/aos_/mil_ knowledge tables read-only (30d → archive).

### wave4_executive
- Single Council service replacing AGD+MIL+EDE+AEC.
- Single /admin/health (TRPE shell) absorbing GVCAE + AOS health panels.

### wave5_evolution
- GAEE acts only on KGRE evidence with CIE gating_ok=true.
- Automate quarterly architecture review via GVCAE.

## Non-negotiable keeps
- CIE
- PRE
- Pinterest Integrity Guard
- PCIE2
- KGRE
- AGAL
- TRPE
- GVCAE
- AEE
- ROE

## Deferred (low ROI today)
- AICOS
- SPE
- GAEE
- PEI
- PIE
- ODE
- OIE
- FOS
- Commander/ACI duplicates