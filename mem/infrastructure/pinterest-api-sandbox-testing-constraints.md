---
name: Pinterest API mode toggle
description: Pinterest mode is DB-driven via pinterest_runtime_settings; admin toggles between sandbox and production
type: feature
---
Single source of truth for the active Pinterest API base is `pinterest_runtime_settings.mode` (`sandbox` | `production`, default `sandbox`). The `PINTEREST_MODE` env secret is only a fallback when the DB row is missing. `PINTEREST_FORCE_SANDBOX` and any hardcoded sandbox overrides have been removed.

Helpers in `supabase/functions/_shared/pinterest-config.ts`:
- `getPinterestMode(sb)` — async, reads DB then env, 30s in-memory cache
- `getPinterestApiBase(sb)` — returns `https://api-sandbox.pinterest.com/v5` or `https://api.pinterest.com/v5` (note: `/v5` is now part of the base)
- `markProductionForbidden(sb)` — auto-flips DB row to sandbox on 403 from production
- `PINTEREST_API_BASE` — sync env-only fallback, used by board listing + OAuth token exchange where no `sb` client is handy

Publish flow always logs `{mode, api_base, status, pin_id, external_url}`. Admin → Pinterest Scale Mode shows a SANDBOX/PRODUCTION badge plus a "Switch to Production Mode" button that calls action `set_mode` (admin-only via RLS). Cron worker uses BATCH_SIZE=3 concurrency, MAX_RETRIES=2, 5–15s random delay between posts.
