# Verdict: "3 issues found" in the Lovable UI (read-only diagnosis)

## What the 3 issues are

A fresh read-only security scan (2026-09-05T10:41 UTC) returns exactly 3 findings, all from the database linter, all severity **warn**, all already marked **ignored_by_user**:

1. **Function Search Path Mutable** (`SUPA_function_search_path_mutable`) — some database functions don't pin `search_path`. Warn. Pre-existing, previously dismissed by you.
2. **Public Can Execute SECURITY DEFINER Function** (`SUPA_anon_security_definer_function_executable`) — a security-definer DB function is callable without sign-in. Warn. Pre-existing, previously dismissed.
3. **Signed-In Users Can Execute SECURITY DEFINER Function** (`SUPA_authenticated_security_definer_function_executable`) — a security-definer DB function is callable by signed-in users. Warn. Pre-existing, previously dismissed.

## Pre-existing or introduced by the auth fix?

**Pre-existing.** All three are database-function linter warnings; the auth/admin reliability fix touched only frontend TypeScript files (`Auth.tsx`, `AuthContext.tsx`, `isAdmin.ts`, `AdminRouteGuard.tsx`, new `transportError.ts`) and created/changed no database functions. The same warning classes were present in scans before today's commits.

## Does any of them block production, auth, or admin login?

**No.** They are warn-level hardening notes about database function configuration, not errors. Nothing in them affects the sign-in path, session persistence, or the admin role check.

Note: a separate older scan also lists one error-level finding about unauthenticated Shopify-mutating edge functions (`OPEN_ENDPOINTS`, dated 2026-09-04). It predates the auth fix and does not affect login, but it is the only error-severity item on record if you want it addressed later.

## Is the latest deploy live?

**Yes.** `https://getpawsy.pet/` serves build `build-mto8w4my-4v6c` (health marker timestamped 2026-09-05T10:33:42Z, after the auth-fix commits), and the published JavaScript bundle contains the new auth code (`AuthRequestTimeoutError`). Home page and `/auth` return HTTP 200.

## Proposed action

None required. The 3 warnings are known, dismissed, and unrelated to the auth work. No code changes, no publish needed.
