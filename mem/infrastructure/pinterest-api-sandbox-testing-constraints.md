---
name: Pinterest API mode toggle
description: PINTEREST_MODE secret switches between sandbox (Trial/Eval access) and production API base
type: feature
---
Pinterest API base is selected at runtime via `PINTEREST_MODE` secret (`sandbox` | `production`, defaults to `sandbox`).
- sandbox → https://api-sandbox.pinterest.com
- production → https://api.pinterest.com
While the app has Trial/Evaluation access only, production /v5/pins returns "Apps with Trial access may not create Pins in production". Keep `PINTEREST_MODE=sandbox` until Pinterest grants production approval. Helpers: `getPinterestMode()`, `getPinterestApiBase()`, plus legacy `PINTEREST_API_BASE` export in `supabase/functions/_shared/pinterest-config.ts`. Admin → Pinterest Scale Mode shows an Approval Readiness card with `approval_check` + `test_publish_sandbox` actions; "success" requires a real `pin_id` from the API.
