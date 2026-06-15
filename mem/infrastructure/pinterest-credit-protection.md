---
name: Pinterest Credit Protection
description: Auto-pauses Pinterest creative generation on AI Gateway 402, never touches publish pipeline, 10-min cron probe auto-resumes.
type: feature
---
# Pinterest Credit Protection

Centralized credit-guard for all Pinterest functions hitting `ai.gateway.lovable.dev`.

## Shared module
`supabase/functions/_shared/pinterest-credit-guard.ts` exposes:
- `isCreditPaused(supabase)` — fast singleton check
- `recordCreditEvent(supabase, evt)` — appends to `pinterest_credit_events`, recomputes 1h counters, mutates `pinterest_credit_state`, files `monitoring_alerts` row + `warning` event on red flip (6h cooldown)
- `aiGatewayFetch(...)` — wrapper that records success/402/429/error automatically

## State table (singleton id=1)
`pinterest_credit_state.state ∈ {green, orange, red}`, `paused boolean`.
- 402 from any AI gateway call → state=red, paused=true
- 200 → state=green (or orange if 402 in same 1h window), paused=false, counters reset
- Probe success on a previously paused state → records `resumed` event

## Wiring
- `pinterest-creative-director`: short-circuits with HTTP 402 when paused; `tagGatewayResp` records every gateway response
- `pinterest-regen-autopilot`: when paused, returns early without consuming open jobs and fires probe
- `pinterest-credit-probe`: 1-token gemini-2.5-flash-lite request every 10 min (cron `pinterest-credit-probe-10min`)
- `pinterest-credit-status`: dashboard data endpoint (no auth needed; service-role internal)
- Admin route `/admin/pinterest-credit-protection` (`PinterestCreditProtectionPage`)

## Critical rule
**Publish pipeline (`pinterest-pipeline-drain`, validator, promoter, publish-now) is NEVER paused.** Only generation halts on credit exhaustion. Drafts and queued pins continue flowing to Pinterest while paused.

## Recovery
Topping up Lovable AI credits → next 10-min cron tick probe returns 200 → state flips green → next autopilot tick resumes generation automatically. No manual intervention required.

## Heuristic for "estimated credits %"
Lovable AI does not expose a live balance. Status endpoint derives capacity from 1h success/failure ratio: 100% if no 402 in last hour, 0% if paused, scaled otherwise.