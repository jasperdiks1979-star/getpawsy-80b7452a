## Pinterest Performance Mode — GetPawsy

Transition Pinterest automation from experimental to production-grade. **Quality over volume.** The hero product (Automatic Cat Litter Box) is the only product allowed to publish. Every pin goes through Generate → Review → Approve → Publish.

Most of the foundation is already in place from prior work (QA gate, allowlist, draft-first inserts, analytics quarantine, sandbox/production toggle, BATCH_SIZE=3). This plan closes the remaining gaps to reach "production quality".

---

### 1. Lock down hero-product-only mode (Phases 1, 2, 11)

- Confirm `PINTEREST_ALLOWED_SLUGS` only contains `automatic-cat-litter-box-self-cleaning-app-control` (already done) and remove every other code path that can bypass it:
  - `pinterest-scheduler` currently generates pins for *any* active product → restrict it to allowed slugs or disable it entirely.
  - `pinterest-automation` `bulk_generate` / `scale_100` already disabled — verify and remove dead UI buttons.
- Enforce a hard daily cap of **3 pins/day** in `pinterest-cron-worker` (count `posted` rows in last 24h before publishing).
- Hide non-hero products from the admin "Generate" form.

### 2. Pin Quality Engine (Phases 3, 4, 8, 9)

Refactor `pinterest-viral-batch` so every draft is built from a **constrained creative spec**:

- **Layouts:** only Style A (hero + soft backdrop), Style B (before/after), Style C (problem/solution). Reject anything else at QA.
- **Hooks:** introduce `_shared/pinterest-hooks.ts` exporting only the approved PAIN / TIME-SAVING / TRANSFORMATION / SOCIAL-PROOF / CURIOSITY lists. Generator picks from this list; `runPinQa` adds a `weak_hook` reason if the title/overlay isn't a member.
- **SEO fields:** title (≤100 chars), description (200–500 chars, includes 1 target keyword), 5 fixed hashtags, board = `Cat Essentials` or `Smart Cat Products`. Alt text mirrors title.
- **Visual:** keep the Cloudinary 9:16 backdrop pipeline; add `low_resolution` check (reject < 1000×1500), `duplicate_asset` check (hash of `pin_image_url` already used in last 14 days).

### 3. Strengthen the QA gate (Phase 5)

Extend `_shared/pinterest-qa.ts` with the missing reason codes from the brief:

- `unreadable_overlay` (replaces ambiguous `unreadable_text` — keep both for back-compat)
- `low_resolution`
- `malformed_url`
- `spam_payload` (runs the event-sanitizer's `isCleanString` on title/description/overlay)
- `duplicate_asset`
- `weak_hook`

`runPinQa` returns the union; the worker still refuses to publish if `qa_reasons` is non-empty OR `approved_at` is null.

### 4. Human review pipeline (Phase 6)

Admin UI `/admin/pinterest-automation` already has Approve / Reject / Purge. Add:

- **Regenerate** button on each draft → calls `pinterest-viral-batch` with `{ regenerate_id }` to swap copy/backdrop.
- **Bulk approve** / **Bulk reject** with a confirm dialog (limit 10 at a time).
- Visible badges for every new QA reason code with tooltip explaining the failure.

### 5. Analytics hardening verification (Phase 7)

The quarantine table + sanitizer modules already exist. Verify and tighten:

- `pinterest-viral-batch` rejects malformed `destination_link` → quarantine (already done).
- Add a small `useRejectedSpamCount` widget on the Pinterest dashboard so spikes are visible alongside pin metrics.

### 6. Performance dashboard (Phase 10)

New page `src/pages/admin/PinterestPerformancePage.tsx` (route `/admin/pinterest-performance`) showing:

- Last 30 days: impressions, outbound clicks, saves, CTR, add-to-cart rate (joined from `lp_funnel_events` where `utm_source = 'pinterest'`), checkout rate.
- Top hooks / best board / best layout / best CTA tables (group by `pin_variant`, `board_name`, `overlay_text` first segment).
- Best publishing hour-of-day.
- Worst-performing pins (lowest CTR with ≥100 impressions).
- Rejected-spam-events counter.

Data source: existing `pinterest_pin_queue` (status, posted_at, external_url) joined to `lp_funnel_events` via `utm_content = product_slug` + `utm_campaign`.

### 7. Smart scaling guardrails (Phase 11)

Add `pinterest_runtime_settings.scale_unlocked` boolean (default false). The cron worker reads it: while false, hard cap = 3/day, single product. A nightly job evaluates last-7-day CTR and surfaces an "Unlock scaling" recommendation in the admin UI — but the toggle stays manual.

---

### Technical Details

**Files to create**
- `supabase/functions/_shared/pinterest-hooks.ts` — approved hook bank + `pickHook(category)` + `isApprovedHook(text)`.
- `src/pages/admin/PinterestPerformancePage.tsx` + route in `App.tsx`.
- Migration: add `scale_unlocked boolean default false` to `pinterest_runtime_settings`; add `image_hash text` + index to `pinterest_pin_queue` for duplicate detection.

**Files to edit**
- `supabase/functions/_shared/pinterest-qa.ts` — new reason codes, hook validation, image-hash dedup, `isCleanString` for spam.
- `supabase/functions/pinterest-viral-batch/index.ts` — generator uses approved hook bank, computes `image_hash`, enforces layout enum.
- `supabase/functions/pinterest-cron-worker/index.ts` — daily cap, scale-unlocked check, re-runs QA last.
- `supabase/functions/pinterest-scheduler/index.ts` — gate by `PINTEREST_ALLOWED_SLUGS` (or disable entirely).
- `src/pages/admin/PinterestAutomationPage.tsx` — Regenerate, Bulk approve/reject, new QA badges, hide non-hero products.

**Out of scope**
- TikTok, Google Ads, other channels.
- Any change to existing Pinterest OAuth / sandbox-vs-production toggle (already correct).
- Volume scaling — explicitly deferred behind `scale_unlocked`.

Approve this plan and I'll implement it in order (QA + hooks → batch generator → worker cap → admin UI → dashboard → migration).
