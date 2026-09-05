# Admin login reliability — diagnosis and minimal fix plan

Diagnosis only. No code, data, config, or deployment changes were made this turn.

## What the evidence shows

Live backend request logs (last 2 days, read-only query) show the data layer is
currently failing intermittently at the network edge, not at the application level:

```text
POST /rest/v1/analytics_funnel_waterfall      522
POST /rest/v1/cci_events                      522
POST /rest/v1/analytics_traffic_classification 522
GET  /rest/v1/                                522   <- API root itself
GET  /storage/v1/object/public/...            544
OPTIONS /rest/v1/... (preflights)             200
```

522 = the edge accepted the request but the origin never answered in time.
The preflights succeed while the real requests time out, so DNS/CORS/keys are fine —
the origin is intermittently unreachable. The same condition explains the 499
`request_cancelled` from the database probe, the analytics "still warming" loops,
and the current production build failure (`products_public page offset=0 failed
after 5 attempts`).

No `auth_logs` rows exist for the period, so a failed sign-in that never reaches the
auth origin leaves no server-side trace — consistent with "intermittent, not a wrong
password".

## 1. Ranked root causes

1. **Transient backend origin unavailability (522/544/499).** Confirmed in logs.
   When the auth POST to `/auth/v1/token` hits this window, the browser fetch fails
   at transport level. On Safari/iOS a failed fetch is a `TypeError` whose message is
   literally **"Load failed"** — which is exactly the text the user sees.
2. **UI error mapping prints the raw transport message.** `src/pages/Auth.tsx`
   `handleLogin` does `toast.error(error.message)` for anything that is not
   "Invalid login credentials", so a network failure is presented as a login failure
   with a meaningless string. No retry, no distinction between "credentials rejected"
   and "backend unreachable".
3. **Post-login admin role check silently degrades to "not admin".**
   `resolveIsAdmin` (`src/lib/auth/isAdmin.ts`) queries `user_roles`; on error it
   logs and returns `false`. `AdminRouteGuard` then renders **Access Denied** even
   though the session is valid. The email fallback list is empty
   (`HARD_FALLBACK_EMAILS: []`), so there is no safety net during a 522 window.
   This is a *backend* failure shown as an *authorization* failure.
4. **No timeout/retry policy on the auth transport.** The Supabase client
   (`src/integrations/supabase/client.ts`, auto-generated) uses the default fetch;
   `signIn` in `AuthContext` performs a single attempt.
5. **iOS Safari cross-origin authenticated POST fragility.** The project already
   documents this class of failure and built a same-origin relay
   (`cloudflare-worker-supabase-relay`), but its allowlist covers only
   `merchant-api-probe` / `merchant-api-shadow`. Auth still goes cross-origin to
   `*.supabase.co`. This aggravates, but does not by itself cause, the intermittency.

Ruled out by inspection: the build-version guard does not clear `sb-*` auth keys;
the legacy fetch guard only intercepts Shopify URLs; the preview auth broker is
inactive on the custom domain (non-preview host → plain `localStorage`).

## 2. Files and functions involved

| File | Role |
| --- | --- |
| `src/pages/Auth.tsx` → `handleLogin` | Surfaces `error.message` verbatim; no retry |
| `src/contexts/AuthContext.tsx` → `signIn`, `applySession`, `checkAdminRole` | Single-attempt sign-in; role check fired via `setTimeout(...,0)` |
| `src/lib/auth/isAdmin.ts` → `resolveIsAdmin` | Returns `false` on query error (cannot distinguish "not admin" from "unreachable") |
| `src/components/auth/AdminRouteGuard.tsx` | Renders Access Denied once `isAdminResolved` is true, regardless of *why* |
| `src/lib/auth/admin.ts` | Empty fallback allowlist |
| `src/hooks/useAnalyticsTruth.ts` | Same 522 window drives the warming loop |

## 3. Auth vs. post-login

Two distinct failures share one symptom:

- **"Load failed" toast right after submitting** = the auth request never completed.
  Auth itself did not reject the credentials; the transport failed.
- **"Access Denied" after a successful sign-in** = auth succeeded, the role lookup
  failed. Post-login bootstrap, not auth.

## 4. Concrete evidence of intermittency

- 522 on `POST /rest/v1/*` and on `GET /rest/v1/` root, repeatedly, minutes apart.
- 544 on public storage objects in the same window.
- 200 on every `OPTIONS` preflight in the same window (edge healthy, origin not).
- 499 `request_cancelled` from the database probe.
- Build failing at catalog prerender after 5 attempts against `products_public`.

## 5. Smallest safe remediation (analytics/admin/auth surfaces only)

1. **Classify the sign-in error** in `Auth.tsx`: treat transport-class failures
   ("Load failed", `Failed to fetch`, `NetworkError`, `AbortError`, timeout,
   `AuthRetryableFetchError`) as *service unavailable*, not bad credentials.
   Show "We couldn't reach the server — try again", keep the form filled.
2. **One bounded retry with backoff** around `signInWithPassword`, only for that
   transport class — never for `Invalid login credentials` (avoids lockout risk).
   Reuse the existing `retryWithBackoff` helper in `src/hooks/useRetryWithBackoff.ts`.
3. **Make the role check tri-state.** `resolveIsAdmin` returns
   `true | false | 'unknown'` (unknown on network/transport error). `AuthContext`
   keeps `isAdminResolved` false for `'unknown'` and retries a bounded number of
   times; `AdminRouteGuard` shows a "reconnecting" state with a Retry button instead
   of **Access Denied** when the answer is unknown. Access Denied stays reserved for
   a confirmed non-admin answer — no weakening of the security model, since a
   definite `false` still denies.
4. **Add a request timeout** so a wedged origin fails in ~10s instead of hanging.
5. Optional, later: extend the same-origin relay allowlist so admin auth avoids the
   cross-origin preflight on iOS. Separate change, separate verification.

None of this changes who is allowed in; it changes how an *unanswered* question is
handled.

## 6. Failure-class separation

- **AUTH FAILURE** — genuinely wrong credentials. Not observed; message would be
  "Invalid login credentials".
- **BACKEND/DATA FAILURE** — confirmed and primary: 522/544/499 against REST,
  storage, and the API root. Not fixable in the frontend; the frontend can only stop
  mistaking it for rejection.
- **UI ERROR-MAPPING FAILURE** — confirmed and fixable: raw "Load failed" toast, and
  Access Denied rendered from an unanswered role query.

## 7. Blast radius

All proposed edits are confined to `src/pages/Auth.tsx`,
`src/contexts/AuthContext.tsx`, `src/lib/auth/isAdmin.ts`, and
`src/components/auth/AdminRouteGuard.tsx`. Storefront, products, checkout,
Pinterest tracking, Strict V3 traffic logic, sitemaps, and feeds are untouched. No
migration, no auth configuration change, no secret rotation.

Note: the backend origin is unhealthy right now, which is also why the production
build is failing. That is an infrastructure condition and needs a backend restart
plus a build re-run — separate from the code hardening above.
