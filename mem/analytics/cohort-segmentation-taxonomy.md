---
name: Cohort segmentation taxonomy
description: first_session vs returning cohort labelling on /go (Clarity tag + lp_funnel_events.cohort column) for heatmap and CTR comparison
type: feature
---
Cohort dimension lives in `src/lib/visitorCohort.ts` (`getVisitorCohort()`).
Values: 'first_session' (no `gp_visitor_id` in localStorage on first call this tab) | 'returning'.
Decision is locked per tab via `sessionStorage.gp_cohort` so it stays stable after the visitor id is minted.

Wired into:
- Clarity tag `cohort` (set once on /go mount) → primary heatmap filter dimension
- `lp_funnel_events.cohort` (text column) → server-side segmentation
- GA4 events `lp_view`, `lp_cta_impression`, `lp_cta_click` (cohort param)

Admin surfaces:
- /admin/placement-overview → cohort dropdown + side-by-side cold-vs-returning table
- RPCs: `get_placement_overview(p_cohort)`, `get_placement_overview_trend(p_cohort)`, `get_placement_overview_by_cohort()`