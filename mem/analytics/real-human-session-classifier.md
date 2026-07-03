---
name: Real-Human Session Classifier
description: Canonical filter used by every mission KPI to exclude bots, smoke tests, admin, crawlers, prefetch and datacenter traffic
type: feature
---

Single source of truth for "is this a real human?" across mission KPIs.

- **Server:** `public.is_real_human_session(...)` (IMMUTABLE, GRANT EXECUTE TO PUBLIC) + `public.real_human_sessions` view (SECURITY INVOKER, LEFT JOIN tsi_session_enrichment) + `public.real_human_sessions_counters_7d` summary view.
- **Client:** `src/lib/realHumanSession.ts` mirrors the SQL logic exactly (`isRealHumanSession`, `filterRealHumans`, `REAL_HUMAN_SESSIONS_VIEW`, `REAL_HUMAN_COUNTERS_VIEW`).

Exclusion rules (must stay in sync between SQL and TS):
1. `tsi_session_enrichment.is_bot=true` / `is_internal=true` / bucket in (`bot`, `search_bot`, `ai_crawler`, `smoke_test`, `lovable_preview`, `ai_worker`, `internal`, `qa`).
2. session_id starts with `atc-`, `smoke-`, `synthetic-`, `e2e-`.
3. landing_page contains `_smoke=`, `smoke_test=`, `__lovable=1`.
4. utm_source/medium in reserved internal set; utm_campaign starts with `smoke`/`internal`/`admin`.
5. referrer contains `lovable.app`, `lovable.dev`, `id-preview--`.
6. `country` or `device` NULL → excluded (bot NULL-trio fingerprint from July 2026 forensics).
7. Pinterest iOS prefetch fingerprint: `screen_wxh='390x844'` + Pinterest referrer.
8. Sub-3s bounce with NULL browser + device + os.
9. `country IN ('NL','Netherlands')` → founder/admin locale, excluded from mission KPIs (US-first).

All mission dashboards (Revenue War Room, Mission Control, Growth Engine, Conversion Forensics, ARIE, CI Layer) MUST query `real_human_sessions` (or apply `isRealHumanSession()`) instead of raw `canonical_sessions` when producing KPIs.