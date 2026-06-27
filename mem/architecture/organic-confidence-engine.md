# Organic Confidence Engine — Configurable, Versioned, Self-learning

## Single source of truth
- DB: `organic_confidence_models` (versioned), `organic_confidence_predictions` (learning), `organic_confidence_change_log` (audit).
- RPC: `get_active_organic_confidence_model()`.
- Runtime: `supabase/functions/organic-confidence` loads the active model and computes scores. No engine may compute Organic Confidence independently.
- Admin: `supabase/functions/organic-confidence-config` (CRUD + simulate + accuracy + suggest).
- UI: `/admin/organic-confidence-config`.
- Lib: `src/lib/organicConfidence.ts` — `scoreOrganicConfidence(input, model)` accepts a model; no hardcoded weights, only fallbacks when DB lookup fails.

## Configuration
- Positive weights (e.g. `organic_visitors`, `organic_conversion`, `organic_revenue`, `returning_quality`, `paid_independence`, plus trend/quality/inventory signals).
- Negative weights subtracted from score (`bounce_rate`, `high_paid_dependence`, `declining_organic_trend`, `creative_fatigue`, ...).
- Thresholds for the 5-level confidence pyramid are configurable.
- `market_demand_boost` configurable.
- All weight changes go through the admin UI → write to `organic_confidence_models` + `organic_confidence_change_log`. No code changes, no deployments, no migrations required to retune.

## Versioning
- Every model row stores: version, name, description, reason, status (`draft|active|experimental|archived`), parent_version, created_by, activated_at, archived_at.
- Activation archives the prior active row. Rollback = activate a prior version.
- Predictions and recommendations record `model_version` for full traceability.

## Experiment support
- Growth Lab can mark a model `experimental` and run side-by-side simulations via the `simulate` action on `organic-confidence-config` (uses `override_model` on `organic-confidence`, never persists).
- Winners are promoted only through the Execution Center approval flow that already wraps activation.

## Self-learning
- `organic_confidence_predictions` stores predicted score per entity + model version. A nightly job (existing growth-loop) fills `actual_score`/`error_abs` once outcomes are observed.
- `accuracy` action returns MAE + bias by entity type. `suggest` action proposes weight nudges. Suggestions are surfaced in the admin UI and **never auto-applied**.

## Consumers (must use the engine)
Sales Commander, Growth Commander, Execution Center, Revenue OS, Pinterest Growth Engine, Pinterest Market Intelligence, AI Content Brain, Growth Lab, AI CEO, Product Intelligence, Recommendation Engine.

## Validation
- TypeScript: clean.
- Lib API is backwards compatible (`ORGANIC_CONFIDENCE_WEIGHTS` retained as deprecated alias).
- `organic-confidence` edge function returns full `model` block so downstream UIs can display the active version.