## Goal

Create a temporary, admin-only page that (a) lets you sign in with a magic link (no password), (b) shows live session/JWT info, and (c) runs the full Pinterest Ad Studio render pipeline end-to-end with a single click — returning every job id, status, and timestamp. Tear it down after verification.

## Scope (admin allowlist)

Only `jasperdiks@hotmail.com` (the sole `admin` in `user_roles`) can request a link. All other emails get a generic "If your account is authorized, a link has been sent" response — no enumeration.

## Files

### 1. `src/pages/admin/AdminE2eVerify.tsx` (new) — route `/admin/e2e-verify`

- **Unauthenticated state**
  - Email input (prefilled with `jasperdiks@hotmail.com`)
  - "Send magic link" → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/admin/e2e-verify` } })`
  - Client-side allowlist check before calling (single hard-coded admin email)
  - Toast: "Check your inbox — link expires in 1 hour"
- **Authenticated state**
  - Auth gate: re-validate via `supabase.auth.getUser()` + role check against `user_roles`
  - Session panel:
    - Authenticated user (email + id)
    - Role (`admin` confirmed)
    - Session status (`active` / `expired`)
    - JWT expiry (`exp` decoded from access token + live countdown)
    - "Refresh now" button → `supabase.auth.refreshSession()`
  - Product picker (defaults to `automatic-cat-litter-box-self-cleaning-app-control`, 256 in stock)
  - **"Run Full E2E Verification" button** → calls new edge function `cinematic-ad-e2e-verify`
  - Live trace table: one row per stage, each with status / ms / timestamp / payload preview
  - On `output_mp4_url` present → shows inline `<video>` preview + "Open Pinterest Ad Studio" deep link + publish-readiness verdict
- After completion: prominent "**Disable magic-link route**" button → calls `disable-e2e-route` edge function (sets a feature flag — see #4)
- JWT persistence: relies on existing `AuthProvider` (already uses `localStorage` + `autoRefreshToken: true`); refresh test = page reload button that re-reads session

### 2. `src/App.tsx` — add lazy route

```tsx
const AdminE2eVerify = lazy(() => import("@/pages/admin/AdminE2eVerify"));
// ...
<Route path="/admin/e2e-verify" element={<AdminE2eVerify />} />
```

Route is gated by a runtime check against the `e2e_route_enabled` flag from `app_config` — if disabled, redirect to `/`.

### 3. `supabase/functions/cinematic-ad-e2e-verify/index.ts` (new)

- Admin gate: `auth.getUser()` + `user_roles` admin check (returns 403 otherwise)
- Body: `{ product_slug, hook_variant?: "problem_solution" }`
- Orchestrates in series, capturing `{ name, status, ms, started_at, finished_at, payload }` per step:
  1. **prepare** → `POST /cinematic-ad-prepare` with `{ product_slug, hook_variant, force_new: true }` → capture `job_id`
  2. **preflight** → `POST /cinematic-ad-preflight` with `{ job_id }` → capture `preflight_status`
  3. **queue** → `POST /cinematic-ad-queue-render` with `{ job_id }` → capture `render_queued_at`
  4. **dispatch** → `POST /cinematic-ad-worker-control` `{ action: "self_heal" }` using `x-render-secret: RENDER_WORKER_SECRET` → confirms slot was reserved and GH workflow_dispatch HTTP 204
  5. **claim** → poll `cinematic_ad_jobs` every 5s up to 90s for `render_started_at != null`
  6. **render** → continue polling every 10s up to 7 min for `output_mp4_url != null`
  7. **preview** → HEAD the `output_mp4_url`, confirm 200 + `content-type` starts with `video/`
  8. **publish_ready** → check `preflight_status='pass' && output_mp4_url && pin_title && pin_description && pin_destination_url` → `publish_enabled: true/false` + reason
- Returns:
  ```json
  {
    "ok": true,
    "traceId": "...",
    "product_slug": "...",
    "job_id": "...",
    "preflight_status": "pass",
    "render_queued_at": "...",
    "render_started_at": "...",
    "render_completed_at": "...",
    "output_mp4_url": "...",
    "preview_url": "https://.../admin/pinterest-ad-studio?focus=<job_id>",
    "publish_enabled": true,
    "publish_blockers": [],
    "steps": [ { name, status, ms, started_at, finished_at, payload } ],
    "total_ms": 412381
  }
  ```
- Forwards the caller's `Authorization` header to the downstream admin-gated functions (prepare/preflight/queue) — no service-role bypass for those steps; service-role admin client only used for the DB polling + worker-control dispatch (which requires `RENDER_WORKER_SECRET`, already set).

### 4. `supabase/functions/cinematic-ad-e2e-verify-disable/index.ts` (new)

- Admin gate
- Writes `e2e_route_enabled = false` to a tiny `app_config` table (`key text primary key, value jsonb`)
- Frontend reads it on `/admin/e2e-verify` mount; when disabled, render a 404 immediately

### 5. Migration

`app_config` table with one seeded row `('e2e_route_enabled', 'true')`. Standard grants (authenticated SELECT; service_role ALL; no anon). RLS: only admins may SELECT/UPDATE; service_role bypasses.

## Teardown (one-click after verification)

Clicking "Disable magic-link route" on the page:
1. Flips `e2e_route_enabled` to `false` via the disable function
2. Future loads of `/admin/e2e-verify` 404 immediately (route still exists in code, but inert)
3. Magic-link OTP delivery still works at the Supabase level (it's the normal email auth), but the page that triggers it is gone

When you're fully done, tell me "remove the e2e route" and I'll delete the page + functions + migration in a single follow-up.

## Security notes

- Hard-coded single-email allowlist on client *and* server-side (`shouldCreateUser: false` means a non-existent email can't be created via OTP regardless)
- E2E function never escalates: prepare/preflight/queue all run as **your** admin JWT, not service role
- Only `worker-control self_heal` uses `RENDER_WORKER_SECRET` (already required for that endpoint — no new attack surface)
- Disable flag is enforced server-side (the edge function refuses to run if `e2e_route_enabled=false`) *and* client-side (route 404s)

## Approve to build?

I'll create the migration first, then ship the edge functions and page in a single follow-up.
