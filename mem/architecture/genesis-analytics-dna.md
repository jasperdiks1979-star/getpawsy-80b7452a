---
name: Genesis Analytics DNA
description: Permanent trust layer; observes only and exposes verified metrics, attribution, anomalies, and decision audit to every engine
type: feature
---
# Genesis Analytics DNA (GAD)

Schema prefix `gad_`. Admin-read; writes via `gad-api` (service role). **SAFETY: observes only — never mutates production data.**

## Tables
- `gad_modules` (11): sources, events, truth, causal, attribution, confidence, anomaly, funnel, experiments, forecasts, ai_audit
- `gad_concepts` + `gad_concept_history` (versioned)
- `gad_data_sources` (trust per source)
- `gad_events` (normalized stream w/ session, visitor, utm, pinterest/tiktok ids, revenue, trust)
- `gad_metrics` (rollups; auto confidence from completeness/freshness/sampling/consistency)
- `gad_truth_validations` (cross-source reconciliation w/ status match/warn/mismatch)
- `gad_anomalies` (z-score severity grading)
- `gad_funnel_snapshots` (landing→repeat per day)
- `gad_attributions` (multi-model rows per conversion)
- `gad_root_causes` (chained hypothesis ledger)
- `gad_experiments` (hypothesis/observed/p-value/winner)
- `gad_forecasts` (predicted vs actual + accuracy score)
- `gad_ai_decision_audit` (decision → expected → actual → financial impact)
- `gad_graph_nodes/edges`, `gad_engine_consultations`, `gad_settings`

## Confidence formula
`completeness 0.30 · freshness 0.20 · sampling 0.15 · consistency 0.35` (override in `gad_settings.confidence_weights`).

## Truth status
`<2%` delta = match · `<10%` = warn · else mismatch.

## API (`gad-api` edge function)
`consult`, `recordEvent`, `recordMetric`, `validateTruth`, `reportAnomaly`,
`recordAttribution`, `recordForecast`, `resolveForecast`, `auditDecision`, `resolveDecision`, `stats`.

Client: `src/lib/gad/client.ts` → `GAD.*`.

## Rules for engines
- Strategic/operational/creative decisions **must** call `GAD.consult()` first and `GAD.auditDecision()` on commit.
- Forecasts **must** be logged via `recordForecast` and resolved via `resolveForecast`.
- Cross-source revenue/conversion claims **must** pass `validateTruth` before activation.
- Never present a number without confidence — read from `gad_metrics.confidence`.

## Admin
`/admin/analytics-dna` — modules, source trust, funnel, truth reconciliation, anomalies.