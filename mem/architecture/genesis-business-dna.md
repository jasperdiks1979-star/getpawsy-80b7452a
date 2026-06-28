---
name: Genesis Business DNA
description: Permanent knowledge layer (10 modules, versioned facts, knowledge graph, learnings ledger) consulted by every AI engine before strategic decisions. Accessed via gbd-api edge function and src/lib/gbd/client.ts. Admin UI at /admin/business-dna.
type: feature
---

# Genesis Business DNA

**Rule:** No engine may make strategic, creative, commercial or operational decisions without first consulting Business DNA. Never duplicate knowledge — read it from `gbd-api`, write learnings back via `recordLearning`, propose fact changes via `upsertFact`.

## Modules (10)
identity · product · customer · pricing · shipping · brand · marketing · psychology · competitive · knowledge

## Surface
- Tables: `gbd_modules`, `gbd_facts` (+ `gbd_fact_history`), `gbd_graph_nodes`, `gbd_graph_edges`, `gbd_learnings`, `gbd_conflicts`, `gbd_engine_consultations`.
- RPCs: `gbd_upsert_fact`, `gbd_search_knowledge`.
- Edge: `gbd-api` — actions: getBusinessIdentity, getCustomerProfile, getPricingStrategy, getBrandGuidelines, getPsychologyProfile, getMarketingStrategy, getProductKnowledge, getCompetitiveLandscape, getBusinessObjectives, searchKnowledge, listModules, getModuleStatus, upsertFact, recordLearning, detectConflicts.
- Client: `src/lib/gbd/client.ts` (export `gbd`).
- Admin UI: `/admin/business-dna`.

## Invariants
- Facts are versioned and append-only via `gbd_upsert_fact`; previous versions stay readable with `is_current=false`.
- Every consultation is logged (`gbd_engine_consultations`) for explainability.
- Every learning carries why · evidence · confidence · expected vs actual outcome.
- Reads: admin-only via RLS. Writes: service-role only (engines use the edge function).