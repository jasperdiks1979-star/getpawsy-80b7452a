
# Cinematic Ads — Production-Safe Overhaul

This is a large, multi-surface change. Before I touch any code or run any migrations, I need your approval on scope, because several parts of this carry real risk (credit spend, DB writes against existing jobs, and the autopublish edge function).

## Goals

1. Stop bad/slideshow MP4s from ever reaching Pinterest.
2. Stop credit-burning renders unless a job passes preflight + has a real creative plan.
3. Make `/admin/cinematic-ads` honest about *why* each job is where it is.
4. Leave Pinterest Tag, GMC/Pinterest feeds, GA4, Meta/TikTok pixels, Google Ads, product URLs, checkout, and storefront UX untouched.

## What I will change

### 1. Database (single migration)

Add to `cinematic_ad_jobs`:
- `preflight_status` (`pass | fail | not_run`), `preflight_reasons text[]`
- `qa_score int`, `qa_reasons text[]`, `qa_passed bool`
- `creative_plan jsonb` (the 4-scene script: hook + 3 scenes + CTA, with overlay/camera/duration per scene)
- `render_attempts int default 0`, `last_render_at timestamptz`, `last_render_error text`
- `is_safe_to_publish bool generated/derived`
- Extend `status` taxonomy with: `blocked_preflight`, `rendered_pending_qa`, `rejected_low_quality`, `failed_render`, `failed_publish` (mapped from existing values where possible — no destructive change).

Add table `cinematic_ad_render_budget` (product_slug, last_expensive_render_at) to enforce 1 expensive render / product / 24h.

GRANTs + RLS preserved (authenticated read for admins via existing has_role; service_role full).

### 2. Edge functions

- **`cinematic-ad-preflight`** (new): validates title, URL, image, ≥2 usable assets, pet category, price, in-stock, Pinterest-safe copy. Writes `preflight_status` + reasons. Pure DB + light HTTP HEAD; no paid APIs.
- **`cinematic-ad-plan`** (new): generates the 4-scene script using the existing Lovable AI Gateway (google/gemini-2.5-flash — cheap, no extra key). Category-aware templates (litter boxes / cat trees / beds / dog toys / training / small pet). Writes `creative_plan` only. No video render.
- **`cinematic-ad-validate`** (new): post-render QA. Uses `ffprobe` (already installed in render-worker; for edge it calls a lightweight metadata endpoint we already have or downloads first/last frame via existing thumbnail). Checks: vertical 1080x1920, duration 12–20s, ≥3 distinct scene hashes, overlay text present in plan, not slideshow (mean-frame-diff threshold), file > min bytes. Updates `qa_score` + `qa_reasons` + `is_safe_to_publish`.
- **`cinematic-ad-autopublish`** (edit, surgical): add hard gate — refuse unless `status='approved' AND qa_passed AND is_safe_to_publish AND output_mp4_url AND product_url AND board configured`. No other behavior changes. Existing video-first quality gates remain.
- **Render worker** (`render-worker/`): add `--dry-run`, refuse to start unless `preflight_status='pass' AND creative_plan IS NOT NULL`. Increment `render_attempts`, write `last_render_error`. No automatic retry after `rejected_low_quality`.

### 3. Admin UI (`/admin/cinematic-ads`)

- Tabs: **Needs Attention | Ready to Render | Pending QA | Approved | Published | Failed**
- Warning banner about slideshow blocking.
- Per-job card shows every diagnostic field you listed (title, slug, status, provider, attempts, last error, QA score + reasons, MP4 URL, Pinterest publish status, timestamps, run ID, safe-to-publish badge).
- Buttons: **Generate Script Only**, **Run Preflight**, **Render Now** (disabled until preflight pass), **Re-run QA**, **Rebuild Creative**, **Approve** (disabled until MP4 + QA pass), **Publish Pin** (disabled until approved+safe).
- Bulk actions: Rebuild plan / Re-run QA / Block low quality / Render approved plans.
- Preview modal: video + script + scene breakdown + QA checklist + publish readiness.
- Confirmation dialog before any "Render Now" (expensive) action, showing credit warning.

Existing `PinterestQualityPanel` stays; I'll wire it to the new fields.

### 4. Cleanup of existing jobs (one-time, safe)

A single SQL pass:
- Run preflight inline for every existing job → write `preflight_status`.
- Mark any job with `output_mp4_url` but no `creative_plan` and no QA pass as `rejected_low_quality` with reason `legacy_slideshow_unverified`. Files preserved.
- Jobs currently "Awaiting Approval / validation failed" get `qa_reasons` populated so the admin card explains *why*.
- Nothing is published. Nothing is deleted. Nothing is re-rendered automatically.

### 5. Credit protection

- Hard cap: 1 expensive render per `product_slug` per 24h unless `force=true` is passed from UI (requires confirm dialog).
- No automatic retry after `rejected_low_quality` or `blocked_preflight`.
- Dry-run mode for the worker.
- "Generate Script Only" path never calls render APIs.

## What I will NOT change

- Pinterest Tag (`usePinterestTracking`, `SafePinterestTag`) — frozen.
- Pinterest catalog feed, Google Merchant feed, GA4, TikTok Pixel, Meta Pixel, Google Ads.
- Product URLs, slugs, checkout, PDP, storefront UX.
- Existing MP4 files in storage (only their DB status changes).

## Risk + cost

- **Migration**: additive only, no destructive ALTERs. Reversible.
- **Edge functions**: 3 new + 1 surgical edit to autopublish + worker preflight check.
- **AI cost for script generation**: gemini-2.5-flash, ~$0.0001 per job. Only runs on demand or when you click "Generate Script Only".
- **No expensive render API is called during this rollout.** Existing queued jobs will be re-classified, not re-rendered.

## Final verification report I will deliver

After running the cleanup pass I'll give you the exact counts you asked for (scanned / blocked / rejected / approved / ready / safe to publish), confirmation no Pinterest publish was triggered, confirmation no expensive render API was called, list of changed files, and a step-by-step "test one product safely" walkthrough using Generate Script Only → Preflight → Dry-run render.

---

**Scope is large (~1 migration, 3 new edge functions, 1 edited edge function, render-worker patch, ~4–6 admin UI files, 1 cleanup SQL).** Approve and I'll execute it as one production-safe run. If you want a smaller first slice (e.g. just the publish gate + cleanup, defer the new script/QA generators), say so and I'll cut accordingly.
