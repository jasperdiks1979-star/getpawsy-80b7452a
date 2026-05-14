# GetPawsy Cinematic Render Worker

External worker that polls Supabase for `render_queued` cinematic ad jobs,
renders them with `ffmpeg`, uploads the MP4 to the `cinematic-ads` storage
bucket, and reports status via the secured webhook.

## Why external?

Lovable Cloud edge functions cannot run `ffmpeg` or Chromium. This worker
runs anywhere Node 20 + ffmpeg + bun are available (Render.com, Railway,
Fly.io, a VPS, your laptop).

## Required environment variables

| Var | Where to get it |
|-----|-----------------|
| `SUPABASE_URL` | Lovable Cloud → Settings → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud → Settings → Service role key |
| `RENDER_WORKER_SECRET` | Same value as the `RENDER_WORKER_SECRET` secret in Lovable Cloud |
| `POLL_INTERVAL_MS` | optional, default `120000` (2 min) |
| `RENDER_WORKER_ID` | optional, defaults to a random id |
| `PORT` | optional. If set, exposes health endpoints (use Render **Web Service** instead of Background Worker) |
| `MAX_CONSECUTIVE_FAILURES` | optional, default `5` (process exits for restart) |
| `CLAIM_TIMEOUT_MS` | optional, default `15000` |
| `RENDER_TIMEOUT_MS` | optional, default `1200000` (20 min) |

## Health endpoints (when `PORT` is set)

| Path | Purpose |
|------|---------|
| `/health` | liveness — process is up |
| `/health/worker` | poll/render stats, busy state, current job |
| `/health/supabase` | upstream connectivity to Lovable Cloud |
| `/debug/runtime` | node version, env presence (booleans only), full state |

All endpoints return JSON. No secrets are exposed.

## Run locally

```bash
# install ffmpeg + bun first
# then:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... RENDER_WORKER_SECRET=... \
  npm --prefix render-worker start
```

## Deploy to Render.com

1. New → **Web Service** (so health checks work) → connect this repo
2. **Environment**: Node 20
3. **Root Directory**: leave blank (repo root). Worker lives at `render-worker/` relative to repo root, full path on Render is `/opt/render/project/src/render-worker/`.
4. **Build command**:
    ```
    apt-get update && apt-get install -y ffmpeg && curl -fsSL https://bun.sh/install | bash && npm --prefix render-worker install && npm --prefix render-worker run build
    ```
5. **Start command**: `npm --prefix render-worker start`
6. **Health check path**: `/health`
7. Add env vars from the table above (Settings → Environment), including `PORT` (Render sets this automatically for Web Services)
8. Deploy

### Troubleshooting ENOENT `render-worker/package.json`
If Render logs show `npm error path /opt/render/project/src/render-worker/package.json` / `ENOENT`, the GitHub sync did not include the `render-worker/` folder. Verify in GitHub UI that `render-worker/package.json` and `render-worker/start.mjs` exist on the branch Render is deploying. If not, re-trigger sync from Lovable and redeploy.

## Deploy to Railway

1. New project → Deploy from GitHub repo
2. Variables: same env vars
3. Build command: `apt-get update && apt-get install -y ffmpeg && npm --prefix render-worker install`
4. Start command: `npm --prefix render-worker start`

## Behavior

- Polls `cinematic-ad-claim-job` every 2 min (configurable)
- Renders **one** job at a time (server-side single-render guard + local `busy` flag)
- Failed renders are re-queued automatically up to **2 attempts**, then marked `failed`
- Run a single render and exit: `npm --prefix render-worker run once`