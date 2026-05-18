## Goal
Turn the existing Cinematic Ads infrastructure into a professional Pinterest Vertical Video Ad generator that works for **any product** in the catalog, with a real product picker, premium voiceover selection, full preview-before-render workflow, and end-to-end quality validation.

Most plumbing already exists: `cinematic_ad_jobs` table, `cinematic-ad-prepare/queue-render/render-webhook/validate/push-pinterest` edge functions, Remotion `viral-vertical` composition, `CinematicAdPreviewPage`, and Pinterest publish. This plan layers the missing **professional product-picker UX, voice-style system, copy generation, approval gate, and quality checks** on top of that foundation.

## Scope of changes

### 1. Database — minor additive migration
Add to `cinematic_ad_jobs`:
- `voice_style` text (one of `lifestyle_female`, `pet_parent`, `narrator`, `social_energetic`)
- `pin_title`, `pin_description`, `pin_destination_url` text
- `hashtags` text[]
- `approved_for_render` boolean default false
- `media_warnings` jsonb (asset quality warnings surfaced at prepare-time)

No destructive changes. RLS already restricted to admins.

### 2. Voice style registry (shared)
New `supabase/functions/_shared/voice-styles.ts`:
- Maps style id → `{ voice_id (ElevenLabs), label, persona_prompt, vo_pacing }`.
- 4 styles: `lifestyle_female` (Sarah), `pet_parent` (Matilda warm), `narrator` (Brian calm), `social_energetic` (Liam punchy).
- Used by `cinematic-ad-prepare` to pick voice + steer the VO script tone, and surfaced in the UI as a selector.

### 3. `cinematic-ad-prepare` upgrades
- Accept `product_slug` for **any** product (lookup `products` by slug, fall back to id). Validate product has ≥1 usable image; otherwise populate `media_warnings` and flag `synth_motion=true`.
- Accept `voice_style` and resolve `voice_id` from the registry.
- Extend the AI prompt to also generate Pinterest copy: `pin_title`, `pin_description`, `hashtags`, `overlay_hook`, scene captions, CTA. Store on the job row.
- Generate VO with the selected ElevenLabs voice, with explicit natural pauses (`<break time="350ms"/>`) and a strong final CTA. Save `duration_seconds`, `vo_url`, `voice_id`, `voice_style`, `vo_script`.
- Always set `preset='pin-organic'` (1080x1920) unless overridden.
- Set status `awaiting_approval` (not auto-queued) so the preview gate runs.

### 4. `cinematic-ad-queue-render` gate
- Refuse to queue unless `approved_for_render = true`. New `cinematic-ad-approve` edge function stamps `approved_for_render`, `approved_at`, `approved_by` then calls queue-render.

### 5. `cinematic-ad-push-pinterest` quality validation
Already checks aspect & motion. Extend to also assert:
- VO exists and `output_duration_seconds` ∈ [12, 25].
- `output_mp4_url` returns HTTP 200 with `Content-Type: video/*`.
- `pin_title` / `pin_description` populated.
On success, save `pinterest_pin_url`.

### 6. Frontend — `CinematicAdsPage`
Replace the current free-text slug input with a **searchable product picker**:
- New component `ProductPicker.tsx` — debounced search against `products_public` view filtering on `name`, `slug`, `category`. Shows thumbnail, title, price, category, slug, stock badge, image count. Warns if `< 2 images`.
- Voice style selector (4 options) with audio preview snippet (optional, plain `<audio>` for now).
- "Generate ad concept" button → invokes `cinematic-ad-prepare` with `{ product_slug, voice_style }`.
- After prepare returns, route to `/admin/cinematic-ads/preview/:jobId`.

### 7. `CinematicAdPreviewPage` upgrades
Show full approval panel:
- Selected product card (image, title, price, slug).
- Generated scenes grid (6 scenes with thumbnails + captions + duration).
- Overlay hook text, VO script (collapsible), voice style + voice id, estimated duration.
- Pin title, description, hashtags, destination URL (editable inline).
- Action buttons: **Regenerate hook**, **Regenerate voiceover**, **Approve & Render**, **Render MP4** (after queued), **Publish to Pinterest**, **Download MP4**.
- `Approve & Render` saves any inline edits then calls `cinematic-ad-approve`.
- `Regenerate hook` calls `cinematic-ad-prepare` with `{ job_id, regenerate: 'hook' }`.
- `Regenerate voiceover` calls prepare with `{ job_id, regenerate: 'vo', voice_style }`.

### 8. Quality goal
- Composition is already `viral-vertical` 1080×1920 with Ken Burns, parallax, animated text (built last iteration). No new Remotion work needed beyond ensuring `synth_motion=true` is set when only 1 image is available so the existing `MotionGenerator` kicks in.

## Out of scope
- Music selection UI (still uses default track).
- A/B variant rendering.
- TikTok publish endpoint (preset exists, no publisher yet).
- In-browser VO waveform editor.

## Files

**Create**
- `supabase/migrations/<ts>_cinematic_ads_pro.sql`
- `supabase/functions/_shared/voice-styles.ts`
- `supabase/functions/cinematic-ad-approve/index.ts`
- `src/components/admin/cinematic/ProductPicker.tsx`
- `src/components/admin/cinematic/VoiceStyleSelector.tsx`

**Edit**
- `supabase/functions/cinematic-ad-prepare/index.ts` (any-product lookup, copy gen, voice style, approval status)
- `supabase/functions/cinematic-ad-queue-render/index.ts` (approval gate)
- `supabase/functions/cinematic-ad-push-pinterest/index.ts` (extra validations)
- `src/pages/admin/CinematicAdsPage.tsx` (picker + voice selector)
- `src/pages/admin/CinematicAdPreviewPage.tsx` (full approval workflow + new buttons)

Will report MP4 url, pin url, and validation report back to the user after a test job.