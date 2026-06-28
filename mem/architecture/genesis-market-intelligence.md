---
name: Genesis Market Intelligence DNA
description: Seventh Genesis layer. gmd_* permanent external awareness. 14 modules. gmd-api at /admin/market-intelligence. Recommendations only — never auto-changes pricing/inventory/supplier/budgets.
type: feature
---
# Genesis Market Intelligence DNA

Permanent external awareness layer. Continuously answers: what is changing, why, how it affects GetPawsy, what to do.

## Modules (14)
global, region, category, trend, search, competitor, pricing, economic, season, regional, social, opportunity, risk, forecast.

## Tables (gmd_*)
- Identity/versioning: `gmd_modules`, `gmd_concepts` + `gmd_concept_history` (auto-snapshot trigger).
- Markets: `gmd_regions` (US primary; CA/UK/AU/EU secondary), `gmd_regional_profiles`, `gmd_categories`.
- Signals: `gmd_trends` (emerging/exploding/stable/declining/dead + business_impact), `gmd_search_signals`, `gmd_social_trends`, `gmd_economic_signals`, `gmd_competitor_observations` (principles only).
- Commercial: `gmd_pricing_landscape` (premium/mid/budget tiers, elasticity, promo windows).
- Time: `gmd_seasons` (16 seasons with DOY ranges) + `gmd_season_recommendations` (creative/product/inventory/publishing).
- Decisions: `gmd_opportunities`, `gmd_risks` (probability × severity × horizon), `gmd_forecasts` (CI required).
- Graph & audit: `gmd_graph_nodes`/`gmd_graph_edges`, `gmd_engine_consultations`, `gmd_assumption_log`, `gmd_settings`.

## Governance (non-negotiable)
- **First-party data prioritized.** External signals generate hypotheses; first-party data validates before strategy changes.
- **Recommendations only.** Pricing, inventory, supplier and marketing budgets never auto-applied. Approval gates in `gmd_settings.approval_gates`.
- **Competitor principles only.** Never copy creatives or copy.
- **All concept changes versioned forever.** Confidence intervals required on every forecast.

## API — supabase/functions/gmd-api
`consult`, `recordTrend`, `recordSearchSignal`, `upsertCategory`, `recordCompetitorObservation`, `recordPricingLandscape`, `recordEconomicSignal`, `addSeasonRecommendation`, `upsertRegionalProfile`, `recordSocialTrend`, `openOpportunity`, `recordRisk`, `forecast` (blends category × trend × economy with CI), `recommend({kind})`, `searchKnowledge`, `logAssumption`, `retireAssumption`, `stats`. Every call audited in `gmd_engine_consultations`.

## Client / UI
`src/lib/gmd/client.ts` exports `GMD`. Dashboard `/admin/market-intelligence` with market pulse, trend radar, category health, opportunity queue, risk dashboard, social trends, knowledge search, and assumption log.