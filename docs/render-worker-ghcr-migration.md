# Render Worker — Migration to GHCR Existing Image (Path A)

Goal: stop consuming Render build-pipeline minutes by serving the worker
as a pre-built image from **GitHub Container Registry (GHCR)** instead of
letting Render build from the Git repo.

- Image: `ghcr.io/jasperdiks1979-star/getpawsy-render-worker:latest`
- Builder: `.github/workflows/build-render-worker-image.yml`
- Image source: `render-worker/Dockerfile`
- Net change for the app: **none** — same env vars, same Supabase project,
  same Pinterest pipeline, same `render_worker_heartbeats` /
  `render_worker_deploys` writes, same V3 / V4 job claim logic.

---

## What changes vs. the old service

| Aspect | Old service (Git build) | New service (Existing Image) |
|---|---|---|
| Source | GitHub repo + Render builds | Pre-built image on GHCR |
| Render pipeline minutes | Burns ~3–6 min per deploy | **0** |
| Build location | Render | GitHub Actions (separate quota) |
| Redeploy mechanism | Git push → build → run | `docker push :latest` → pull |
| Env vars | (existing) | **Identical — copy as-is** |
| Heartbeats | `render_worker_heartbeats` | Same table, same writes |
| Deploy log | `render_worker_deploys` | Same table, same writes |
| Pinterest publisher | unchanged | unchanged |
| Cinematic V3 / V4 | unchanged | unchanged |

---

## One-time setup (manual — Render dashboard only)

Everything else has already been implemented in this repo.

### 1. Confirm the GHCR image exists

After merging to `main` (or running the workflow manually via
*Actions → Build Render Worker Image (GHCR) → Run workflow*), confirm:

```
https://github.com/jasperdiks1979-star/getpawsy-render-worker/pkgs/container/getpawsy-render-worker
```

You should see tags: `latest`, `sha-<commit>`, and a timestamped tag.

### 2. Make the GHCR package public (recommended)

On the package page → *Package settings* → *Change visibility* → **Public**.

Public = Render can pull with no registry credentials. If you keep it private,
create a GitHub PAT with `read:packages` scope and add it to the Render
service as registry credentials.

### 3. Create the Render "Existing Image" service

Render dashboard → **New** → **Deploy an Existing Image**.

| Field | Value |
|---|---|
| Image URL | `ghcr.io/jasperdiks1979-star/getpawsy-render-worker:latest` |
| Service type | **Web Service** (so `/health` is reachable) |
| Region | Same as old service (Frankfurt / `oregon` — match the old one) |
| Instance type | Same as old service (Starter or higher) |
| Port | `10000` |
| Health Check Path | `/health` |
| Auto-Deploy | **On** (so a new `:latest` push redeploys automatically) |

### 4. Copy environment variables from the old service

On the old service → *Environment* → copy every variable. Paste **the
same values** into the new service. Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RENDER_WORKER_SECRET`

Optional (only if previously set):

- `POLL_INTERVAL_MS`
- `RENDER_WORKER_ID` (give the new service a distinct id so heartbeats
  are distinguishable, e.g. `render-ghcr-1`)
- `MAX_CONSECUTIVE_FAILURES`
- `CLAIM_TIMEOUT_MS`
- `RENDER_TIMEOUT_MS`
- `EXPECTED_SUPABASE_HOST`

Do **not** change `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` — that
would break the project-ref self-check in `render-worker/start.mjs`.

### 5. Copy the Render Deploy Hook URL

New service → *Settings* → *Deploy Hook* → **Copy URL**. Then in Lovable
Cloud → Edge Function Secrets, update:

- `RENDER_WORKER_DEPLOY_HOOK_URL` → the new URL
- `RENDER_WORKER_DEPLOY_SECRET` → unchanged

(`.github/workflows/render-worker-deploy.yml` already fails loudly if the
GitHub Actions secret `RENDER_WORKER_DEPLOY_SECRET` is missing.)

### 6. First deploy

Render will pull the image and start. Watch the *Logs* tab — the worker
should log structured JSON within ~30 s:

```
{"level":"info","msg":"worker boot",...}
{"level":"info","msg":"heartbeat ok",...}
```

Then verify in the admin UI:

- `/admin/worker-recovery` → at least one row in
  `render_worker_heartbeats` newer than the boot time
- A row in `render_worker_deploys` with `ok=true`

### 7. Decommission the old service

Once the new service has been healthy for at least one full poll cycle
(2 min default) and has claimed and rendered one job successfully,
**suspend** (don't delete) the old Git-based service. Keep it suspended
for a week as a rollback safety net, then delete it.

---

## Rolling back

Two-tier rollback, both reversible in seconds:

1. **Bad image push** → on the Existing Image service, change the image
   tag from `:latest` to a known-good `:sha-<commit>` tag and redeploy.
2. **Total regression** → resume the old Git-based service, then move
   `RENDER_WORKER_DEPLOY_HOOK_URL` back to its hook.

---

## Verification checklist (post-cutover)

- [ ] GHCR shows a fresh `latest` tag whose digest matches the running
      Render container (Render → service → *Events* shows the digest).
- [ ] `render_worker_deploys` has a new `ok=true` row.
- [ ] `render_worker_heartbeats` has rows newer than the cutover time.
- [ ] `/admin/worker-recovery` shows `active_workers >= 1`.
- [ ] One V4 job (`cinematic_v4_jobs`) progresses
      `queued → rendering → uploaded` and a final MP4 lands in the
      `cinematic-ads` bucket.
- [ ] V4 quality gate runs and returns a score (no bypass).
- [ ] Pinterest publisher resumes its normal cadence — visible in
      `pinterest_publish_logs` and `pinterest_autopilot_decisions`.

Only after every box is checked should V3 / Pinterest autopilot publishing
be unpaused.