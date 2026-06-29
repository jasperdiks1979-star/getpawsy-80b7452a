---
name: Conversion Integrity Engine (CIE) — Genesis V2 supreme gate
description: CIE is the single source of truth for tracking, attribution, funnel, and revenue. No AI engine may learn or optimize on data below the configured confidence floor.
type: constraint
---

## Hard rules

- **No AI may learn from bad data.** Any engine (PRE, PPE, PCIE, ARIE, AGAL, PEI, EE, MIL, AGD, AEE, ROE, SPE, AICOS, GAEE, TRPE…) must read `cie_confidence_scores.gating_ok` for the relevant metric before training, weight evolution, or scaling decisions. If `gating_ok = false`, the engine must STOP learning and surface the block.
- **CIE is the publish/scaling gate.** No campaign may scale and no creative may be promoted on the basis of attribution sources whose CIE confidence is below `cie_settings.ai_training_min_confidence` (default 90).
- **Revenue truth is authoritative.** When `cie_revenue_truth.max_divergence_pct` exceeds `cie_settings.revenue_divergence_tolerance_pct` (default 1.0), an incident must be opened (category `revenue_truth`) and revenue-driven AI loops pause until status returns to `ok`.
- **Auto-repair floor.** CIE may apply automatic fixes only when the proposed RCA has `confidence ≥ cie_settings.autorepair_min_confidence` (default 95). Every repair must be logged in `cie_auto_repairs` with `before_state` and `after_state`.
- **No untracked source.** TikTok/Pinterest/Meta clicks misclassified as `direct`/`organic`/`referral` must open an `cie_attribution_incidents` row; the affected channel's confidence is clamped to ≤ 80 until resolved.

## Surfaces

- Dashboard: `/admin/conversion-integrity`
- Edge function: `cie-orchestrator` (actions: `cycle`, `funnel`, `revenue`, `confidence`) — admin JWT required.
- Client lib: `src/lib/cie/client.ts`.
- Tables: `cie_sessions`, `cie_journey_steps`, `cie_events`, `cie_attribution_incidents`, `cie_funnel_snapshots`, `cie_root_cause_analyses`, `cie_auto_repairs`, `cie_health_snapshots`, `cie_confidence_scores`, `cie_synthetic_runs`, `cie_revenue_truth`, `cie_incidents`, `cie_settings`.

## Adapter status (Phase 1)

`tracking`, `sessions`, `revenue`, `checkout`, `purchase` are wired against internal data. GA4, Pinterest and TikTok adapters are live and write per-channel confidence + evidence. Meta adapter (`cie-meta-adapter`) is wired into the orchestrator and reports 0 confidence with rationale `meta adapter pending: missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID` until those secrets are set — it intentionally keeps Meta-driven AI training paused.

## Guardian revenue-truth alert

An `AFTER INSERT` trigger on `cie_revenue_truth` queues a Guardian email in `guardian_notification_queue` whenever a snapshot is written with `status = 'diverged'`. The drained-by `guardian-notify-drain` worker delivers it via the standard transactional email path.