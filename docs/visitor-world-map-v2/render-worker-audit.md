# Render Worker — Stage 8 Diagnostic Audit (parallel track)

_Scope: read-only audit. No worker code, no Render config, and no map UI is
changed by this document. Findings only; remediation lands in a separate
dedicated PR._

## Required env vars (per `render-worker/start.mjs`)

Hard-required at boot; missing values keep the health server up but disable
job pickup:

| Variable | Purpose | Fatal if missing? |
| --- | --- | --- |
| `SUPABASE_URL` | Target backend for `cinematic-ad-claim-job` and `render-worker-heartbeat`. Must equal `https://nojvgfbcjgipjxpfatmm.supabase.co`. | Yes — worker refuses to poll if missing or if host ≠ `EXPECTED_SUPABASE_HOST`. |
| `RENDER_WORKER_SECRET` | Bearer token the edge functions use to authorize this worker. Must equal the `RENDER_WORKER_SECRET` set in Lovable Cloud secrets. | Yes — worker cannot claim jobs without it. |

Optional (defaults shown in `start.mjs`): `EXPECTED_SUPABASE_HOST`,
`POLL_INTERVAL_MS` (5000), `HEARTBEAT_MS` (30000), `RENDER_WORKER_ID`,
`PORT` (10000), `MAX_CONSECUTIVE_FAILURES` (5), `CLAIM_TIMEOUT_MS` (15000),
`RENDER_TIMEOUT_MS` (1200000), `WORKER_SAFE_MODE` (default on; set `0` to
disable), `STARTUP_TIMEOUT_MS` (20000), `MAX_RETRIES` (1).

## Common failure modes (from code paths in `start.mjs`)

1. **Missing `SUPABASE_URL` or `RENDER_WORKER_SECRET`.** `start.mjs:37–38`
   fails the `REQUIRED` check and the worker enters a health-only mode. Fix:
   set both in the Render service's Environment tab, redeploy.
2. **`SUPABASE_URL` points at the wrong backend.** `start.mjs:74` logs a
   fatal mismatch and refuses to poll. Fix: ensure the URL matches
   `EXPECTED_SUPABASE_HOST` (default `nojvgfbcjgipjxpfatmm.supabase.co`).
3. **Safe mode boot loop.** `WORKER_SAFE_MODE !== "0"` and
   `STARTUP_TIMEOUT_MS` guard the first successful heartbeat; if the edge
   function `render-worker-heartbeat` is unreachable within 20s the worker
   restarts. Fix: verify the edge function is deployed and the secret token
   matches on both sides.
4. **Configuration drift after redeploy.** Render env vars are workspace-
   level; a new Render service or an environment reset drops them silently.
   Fix: after any Render service recreation, re-add both required vars from
   the Lovable Cloud secret values.

## Verification checklist (run manually before closing Stage 8)

- `GET /health` on the Render service returns HTTP 200 with
  `envPresent: { SUPABASE_URL: true, RENDER_WORKER_SECRET: true }`.
- Logs show `[CINEMATIC WORKER] env: SUPABASE_URL set=true RENDER_WORKER_SECRET set=true`.
- Heartbeat entries appear in the `render_worker_heartbeats`-equivalent
  table (see `supabase/functions/render-worker-heartbeat`).
- No `[fatal]` lines mentioning `SUPABASE_URL points to the wrong backend`.

## Not in scope for this document

- Editing `render-worker/start.mjs` or `render-worker/Dockerfile`.
- Adding new env vars.
- Rotating `RENDER_WORKER_SECRET` (must be coordinated with the edge
  function that validates it).

Any of the above requires its own PR and its own certification.