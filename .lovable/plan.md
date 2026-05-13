# Plan: Pinterest Video Covers + Profit Engine Reliability

Two independent fixes, delivered in one round.

---

## Part A — Pinterest Video Publish: Auto Cover Images

**Root cause:** Pinterest `/v5/pins` rejects video pins without one of `cover_image_url`, `cover_image_content_type+data`, or `cover_image_key_frame_time`. We currently send none.

### A1. DB migration — `pinterest_video_assets`
Add columns:
- `cover_image_url text`
- `cover_generated boolean default false`
- `key_frame_second numeric default 1.5`
- `thumbnail_status text default 'pending'` — values: `pending | processing | awaiting_media_ready | thumbnail_generated | publishing | published | failed`
- `cover_attempts int default 0`
- `cover_last_error text`
- `next_retry_at timestamptz`
- `cover_score jsonb` (stop-scroll, ctr, clarity, emotion)

Plus storage bucket `pinterest-video-covers` (public read, admin write).

### A2. Publisher fix (`pinterest-video-publisher/index.ts`)
**Immediate unblock (always works, zero deps):**
- Always include `cover_image_key_frame_time: asset.key_frame_second ?? 1.5` in the `media_source` payload.
- Fallback ladder on `media_timeout` / cover errors: try `1.5 → 0.8 → 2.0 → 3.0`, persisting the working value.
- If `cover_image_url` is set on the asset, send that instead (Pinterest prefers explicit URL).
- Always send `title`, `description`, `link`, `media_source` together.
- Status state machine writes back to `thumbnail_status` at every phase.
- Retry queue: on `media_timeout` set `next_retry_at = now + 90s/180s/360s` (exponential), re-queueable by cron.
- Pre-flight validator: rejects payload with clear error if any required field missing (no Pinterest round-trip).

### A3. Cover generation (`pinterest-video-cover-generate` — new edge function)
Background worker that processes assets where `cover_generated=false`:
- Tries to fetch the source video, extracts a JPEG cover at `key_frame_second` using a server-side approach. Since edge runtime has no ffmpeg, we use a **product-image fallback first**: pull the asset's source product image, render to 1000×1500 (Pinterest 2:3) on a branded backdrop via Canvas (skia-canvas via `npm:` — if unavailable, skip and rely on `key_frame_time`).
- Uploads JPEG to `pinterest-video-covers` bucket → public URL → writes to `cover_image_url`, sets `cover_generated=true`, `thumbnail_status='thumbnail_generated'`.
- If generation fails → keeps `key_frame_second` fallback; publisher still works via `cover_image_key_frame_time`.
- AI scoring via Lovable AI (gemini-flash-lite) writes `cover_score` jsonb. Non-blocking.

### A4. Cron
- Every 10 min: `pinterest-video-cover-generate` (limit 10).
- Every 5 min: re-queue assets with `next_retry_at <= now()` and `thumbnail_status in ('failed','awaiting_media_ready')`.

### A5. Admin UI (`PinterestVideoQueuePage.tsx`)
Per-asset row addition:
- Thumbnail preview (cover_image_url or placeholder + key-frame badge)
- `thumbnail_status` chip
- "Regenerate cover" button → invokes `pinterest-video-cover-generate` with `force:true`
- Last error tooltip

---

## Part B — Profit Engine sync failure

**Symptom:** "Failed to send a request to the Edge Function" on `/admin/profit-engine` Sync button.

### B1. Diagnose first
Read current `profit-engine-sync/index.ts` and `ProfitEnginePage.tsx`, check edge logs to confirm whether the function is throwing on boot (CORS, missing env, deno.lock) or never reachable.

### B2. Hardening (`profit-engine-sync`)
- Strict CORS shared headers, OPTIONS preflight returns 200.
- `Authorization: Bearer` validation via `getClaims()`; admin role check.
- Global `try/catch` returning `{ ok:false, code, phase, message, traceId }` with HTTP 200 (so the client always sees JSON, never network error).
- Phase logging: `auth → fetch_analytics → normalize → score → write → done` to `profit_engine_function_logs` (create if missing).
- Env-var presence check at boot, returns helpful 200-JSON error if missing.
- `AbortController` 25s timeout around external calls.
- Pinterest-metrics fallback: if Pinterest call fails, continue with shop conversions / CTR / outbound clicks / add_to_cart filtered to `country='United States'` and `is_internal=false`.
- Always JSON response, never empty.

### B3. Health endpoint
New `profit-engine-health` (separate function — simpler than path routing in Deno):
```
GET → { ok:true, ts, version, auth_required:true, env_loaded:{supabase:true,pinterest:bool,ga4:bool} }
```

### B4. Frontend (`ProfitEnginePage.tsx`)
- Use `useAuthenticatedFetch.invokeFunction('profit-engine-sync')` (already retries on 401, refreshes token).
- One automatic retry after 5s if the first call returns network/transport error.
- Diagnostics panel: last sync ts, last error, duration ms, rows processed, scoring source — read from `profit_engine_function_logs` last row.
- US-only filter visible in UI as a locked badge.

### B5. US-only data guard
All SQL filters in scoring: `WHERE country = 'United States' AND is_internal = false AND user_agent NOT bot-pattern`. Centralized helper in the function.

---

## Files touched

**New**
- `supabase/functions/pinterest-video-cover-generate/index.ts`
- `supabase/functions/profit-engine-health/index.ts`
- migration: cover columns + `pinterest-video-covers` bucket + `profit_engine_function_logs` table

**Updated**
- `supabase/functions/pinterest-video-publisher/index.ts` — cover_image_key_frame_time + URL + retry ladder + state machine
- `supabase/functions/profit-engine-sync/index.ts` — full hardening
- `src/pages/admin/PinterestVideoQueuePage.tsx` — thumbnail column, regenerate button, status chip
- `src/pages/admin/ProfitEnginePage.tsx` — invokeFunction + retry + diagnostics panel
- cron schedule (insert via `supabase--insert`, not migration)

---

## Out of scope (intentionally deferred)
- True video frame extraction (needs FFmpeg compute worker — not available in Deno edge). We achieve the user's goal via `cover_image_key_frame_time` (Pinterest extracts the frame for us) + branded product-image fallback. This unblocks publishing today.
- Real-time AI thumbnail "stop-scroll" optimization beyond a single Gemini score per asset.

Pinterest will accept and publish video pins as soon as Part A2 ships — even before any cover generation runs — because `cover_image_key_frame_time` alone satisfies their API.