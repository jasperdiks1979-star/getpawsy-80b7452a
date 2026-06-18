## V4 Pinterest Revenue Renderer — Audit + Build

Stop generating V3 videos and build a new renderer with a hard quality gate. No new Pinterest pins until V4 passes validation against the existing 30 V3 videos.

---

### Phase 1 — Audit the 30 approved V3 videos (read-only)

Build `supabase/functions/cinematic-v3-quality-audit/index.ts` that scores each of the 30 approved V3 jobs and writes results to a new `cinematic_v3_quality_audit` table.

Per-video checks:
- **Safe area** — extract sample frames via ffprobe/ffmpeg and run OCR; flag text bboxes outside 1080×(15%–80%) center band
- **Caption clipping** — text bbox touches frame edge or extends past safe rect
- **Supplier collage detection** — perceptual hash + edge density heuristic on source `product_media` rows (multi-panel grid signature)
- **Low-res source** — any source image <1000px on shortest side
- **Zoom/pan only** — scene motion vectors uniform across all scenes (no scene cuts, no composition change)
- **Missing hook / benefit / CTA** — inspect `cinematic_v3_jobs.script_json` for Scene 1/3/5 presence + non-empty text
- **Branding** — GetPawsy logo/wordmark missing from final 2s

Output columns:
```
job_id, slug, safe_area_ok, caption_clipped, supplier_collage, low_res_source,
zoom_pan_only, hook_present, benefit_present, cta_present, branding_ok,
quality_score (0-100), issues jsonb, mp4_url
```

Quality score formula: 100 − penalties (safe_area=-25, clipped=-20, collage=-30, lowres=-15, zoom_only=-15, missing_hook=-15, missing_benefit=-10, missing_cta=-20, branding=-10), clamped 0-100. Approve at 90+.

Report page: `/admin/cinematic-v3-quality-audit` — table with score, badges, thumbnail, mp4 preview, issues list. Read-only.

---

### Phase 2 — Build V4 Pinterest Revenue Renderer

#### Database
Migration creates:
- `cinematic_v4_jobs` (mirrors v3 shape: status, slug, product_id, script_json, scene_assets, final_mp4_url, quality_score, quality_report jsonb, rejection_reasons text[], created_at, approved_at)
- `cinematic_v4_safe_zone_config` (canvas, top_reserve_pct=15, bottom_reserve_pct=20, min_font_px, max_lines, brand_logo_url)
- GRANTs + RLS (admin read, service_role all)

#### Renderer architecture
`supabase/functions/cinematic-v4-orchestrator/index.ts` — orchestrates per job:
1. **Script generation** — Lovable AI Gateway (`google/gemini-2.5-flash`) produces 5-scene script with strict schema: `{hook, problem, benefit, key_feature, cta}`. Each scene has `text` (≤max chars for safe area), `b_roll_query`, `duration_s`.
2. **Asset selection** — query `product_media` excluding supplier-collage hashes (from Phase 1 blocklist), require min 1200px, prefer lifestyle > white background. Reject job if no qualifying asset.
3. **Storyboard layout** — pure-function `buildSafeLayout(text, fontFamily, maxWidth=864px=1080-2×108)` that auto-scales font down (96→48px) until text fully fits inside 1080×(288–1632) center band. If still overflows at min size, split lines; if still overflows, **fail the job** with reason `text_exceeds_safe_zone`.
4. **Render dispatch** — push storyboard to existing GitHub Actions render worker (Remotion) using a new composition `MainVideoV4` with five scenes:
   - Scene 1 Hook — full-bleed lifestyle, large hook text, top-anchored within safe area
   - Scene 2 Problem — split-screen / dim overlay, mid copy
   - Scene 3 Benefit — clean white background, product hero, benefit copy
   - Scene 4 Key feature — close-up product detail with callout label
   - Scene 5 CTA — branded end-card with GetPawsy logo + URL pill
5. **Quality gate (server-side, post-render)** — re-runs Phase-1 audit on the produced mp4: safe-area OCR, supplier-collage hash check, branding presence, scene count, scene tags (hook/benefit/cta). Computes `quality_score`. If score <90 → `status=rejected` with `rejection_reasons[]`. ≥90 → `status=approved`.

#### Remotion composition
`remotion/src/MainVideoV4.tsx` + `remotion/src/v4/` scenes:
- `SafeZoneFrame.tsx` — debug overlay (dev only) + runtime guard that throws if a child's measured rect exits the safe rect (catches author errors at build time)
- `BrandEndCard.tsx` — consistent logo + colors
- `AutoFitText.tsx` — measures DOM, shrinks font until contained
- `Scene1Hook`, `Scene2Problem`, `Scene3Benefit`, `Scene4Feature`, `Scene5CTA`
- 30fps, 1080×1920, ~24s total (5+5+5+5+4)

#### UI
- `/admin/cinematic-v4-jobs` — list + filters (approved / rejected / failed), thumbnail, quality score, rejection reasons, mp4 preview, re-queue button
- `/admin/cinematic-v4-quality-gate` — live config: penalty weights, safe-zone reserves, min source resolution, approval threshold

---

### Phase 3 — Validate against V3 baseline

Smoke script `scripts/v4-baseline-validation.mjs`:
1. Pick the 10 slugs from the 30 approved V3 jobs that scored lowest in Phase 1
2. Re-render via V4 orchestrator (one at a time, no Pinterest publish)
3. Print side-by-side table: slug | v3_score | v4_score | v4_status | issues
4. Pass criteria: ≥8/10 V4 outputs score ≥90, none have safe-zone violations, none have supplier collages

---

### Phase 4 — Guards (do NOT proceed without these)

- Pinterest publisher: add hard check — refuse to enqueue any `cinematic_v4_jobs` row with `status != 'approved'`
- V3 dispatcher: leave running for inventory but flag in `pinterest_runtime_settings` `v3_publish_paused=true` so existing V3 jobs are not pushed to Pinterest until V4 lands
- No new Pinterest pins are created during Phases 1–3 (the orchestrator never calls the Pinterest publisher; it only writes to its own tables)

---

### Out of scope (explicit)
- Deleting V3 videos
- Touching V5 / Cinematic engines
- Repairing ElevenLabs key or render-worker heartbeats (separate known issues)
- Building new Pinterest pin queue entries

---

### Technical notes
- OCR: `tesseract.js` inside the audit edge function (lightweight, English only)
- Perceptual hash: 8×8 dHash in pure TS — no native deps
- All edge functions use `corsHeaders` from `npm:@supabase/supabase-js@2/cors`
- Migrations include GRANTs (authenticated SELECT, service_role ALL) per project standard
- Frontend lazy-loads both new admin routes
