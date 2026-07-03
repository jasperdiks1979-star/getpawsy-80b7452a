---
name: Real Human Intelligence Constitution
description: Every business KPI, AI learning weight and dashboard metric must be filtered through the real_human_* views. Never query raw canonical_sessions/canonical_events/analytics_session_quality for business KPIs.
type: constraint
---

**Law:** Real human behaviour is the highest authority for every business decision in Genesis. Bots, smoke tests, admin (NL), crawlers, Lovable preview and datacenter traffic contribute **zero** weight to KPIs, AI winners, product ranking and Pinterest optimisation.

**Single source of truth (SQL, never duplicate):**
- `public.is_real_human_session(...)` — deterministic classifier (SECURITY INVOKER)
- `public.real_human_sessions` — filtered session view
- `public.real_human_sessions_counters_7d` — total / human / excluded / US counters
- `public.real_human_funnel_7d` — PDP → ATC → Checkout → Purchase over real humans
- `public.real_human_channel_quality_7d` — per-channel humans, bots, ATC, purchase, revenue, confidence
- `public.real_human_product_ranking_7d` — product ranking on real buyers only
- `public.real_human_classifier_confidence_7d` — self-validation (FP/FN suspects, confidence %)

**Client mirror:** `src/lib/realHumanSession.ts` (`isRealHumanSession`, `filterRealHumans`, `REAL_HUMAN_SESSIONS_VIEW`, `REAL_HUMAN_COUNTERS_VIEW`). SQL and TS must stay in lockstep.

**Surfaces:** Mission Control + Executive War Room render `RealHumanIntelligencePanel` (single reusable component). No new dashboards, no new tables — extend these two pages when adding new real-human KPIs.

**Certification:** Snapshots are written to `evidence_documents` with `document_type='certification'`, `subcategory='real_human_intelligence'`, SHA-256 payload fingerprint and full rollback plan. Never persist real-human KPIs to a bespoke table.

**Forbidden:** raw `canonical_sessions` / `canonical_events` / `analytics_session_quality` counts in any business KPI, AI training set, Winner DNA, Pinterest ranker, product ranker, CEO/executive report or channel allocation decision. Use the `real_human_*` views instead.