
## FASE 1 — Auto-trim callback verliest geen metadata meer

**Probleem:** `cinematic-ad-render-webhook` returnt vroeg op duration-overrun (regel 312-361) zonder `body.file_size`, `motion_score`, `width/height`, `black_bars`, `thumbnail_url`, `scene_plan` te persisten. De trim-workflow callback bevat die velden niet → blijven NULL.

**Aanpak:**
1. **In `cinematic-ad-render-webhook/index.ts`** — vóór het dispatchen van de trim-workflow alle metadata uit de eerste (originele) render-call wegschrijven naar de `patch`. Daarna trim-status zetten en return.
2. **Defensieve guard:** een helper `mergePreserve(patch, body, fields)` die alleen toewijst als `body[field]` niet `null/undefined` is, zodat de trim-callback nooit eerder bewaarde waarden overschrijft met NULL.
3. **Trim-callback pad** (regel 365-413) gebruikt dezelfde helper — `output_file_size_bytes`, `motion_score`, `output_black_bars`, `output_thumbnail_url`, `scene_plan` blijven bewaard als trim-callback ze weglaat.
4. **Bonus:** `trim-cinematic-ad.yml` voegt `file_size` (van `stat -c%s /tmp/out.mp4`), `width`, `height` (uit ffprobe) toe aan zijn callback payload — zo blijft de getrimde bestandsgrootte ook accuraat.

## FASE 2 — Schone storage URLs

**Probleem:** `${SUPABASE_URL}/storage/...` in `trim-cinematic-ad.yml` produceert `…supabase.co//storage/…` doordat secret trailing-slash heeft. iPhone Safari kan video soms cachen/weigeren bij dubbele slash.

**Aanpak:**
1. In `trim-cinematic-ad.yml`: `SUPABASE_URL="${SUPABASE_URL%/}"` als eerste preflight stap, daarna gebruiken.
2. In `render-cinematic-ad.mjs`: bestaat al (`SUPABASE_URL_RAW.replace(/\/+$/, "")`) — geen wijziging nodig.
3. **Backfill:** SQL `UPDATE` om bestaande `output_mp4_url` met `//storage` te herstellen naar `/storage`.
4. `Content-Disposition: inline` op storage objects via `cache-control` header bij upload (iPhone Safari speelt MP4 direct).

## FASE 3 — Motion-engine integratie (geen Ken Burns slideshow meer)

**Probleem:** `cinematic-motion-engine` edge function genereert een rijke `motion_storyboard` (parallax, depth_layers, camera_move, tracking_path), maar wordt **nergens** aangeroepen. De renderer (`render-cinematic-ad.mjs`) gebruikt platte ffmpeg zoompan.

**Aanpak — minimal invasive routing:**
1. **In `cinematic-ad-prepare`** na storyboard generatie (regel ~817): roep `cinematic-motion-engine` aan met `job_id`. Resultaat (`motion_storyboard`, `motion_ratio`, `motion_plan_summary`) wordt automatisch op de job rij geschreven door de motion-engine zelf.
2. **In `render-cinematic-ad.mjs`** — uitbreiden van de `REMOTION_TYPES` dispatch (regel 350-374): als `job.motion_storyboard` aanwezig is met `>=4` scenes, route naar `render-cinematic-remotion.mjs` (de echte Remotion compositie met parallax/depth/camera), ook als `content_type` niet in de hardcoded set zit.
3. **In `render-cinematic-remotion.mjs`** — als `motion_storyboard` aanwezig is, gebruik die als input props voor de Remotion compositie i.p.v. flat scene_assets. Dit is alleen een prop-passing wijziging; de bestaande Remotion `MainVideo*` composities ondersteunen al layered backgrounds.
4. **Fallback:** als Remotion render faalt, log waarschuwing en val terug op zoompan (nooit volledige render-fail).

> Belangrijk: dit is een **routing/integratie** wijziging — geen herschrijven van de Remotion composities zelf. De bestaande `MainVideoViralVertical` en `LifestyleScene` componenten doen al parallax. Diepe re-implementatie van depth/foreground-separation in Remotion is een aparte epic.

## FASE 4 — Motion Quality Score met floor 70

**Probleem:** huidige `motion_score` is ffmpeg's `select=gt(scene,0)` count (typisch 0-30 schaal). Geen genormaliseerde 0-100 score, geen auto-regen onder een floor.

**Aanpak:**
1. **DB migratie:** kolom `motion_quality_score INTEGER` op `cinematic_ad_jobs` (genormaliseerd 0-100).
2. **In `render-cinematic-ad.mjs`** — bestaande `motionScore()` blijft, maar bereken extra een `motionQualityScore` op basis van:
   - Scene-change rate (ffmpeg `scdet`) — 35%
   - Optical flow magnitude (`mestimate` filter) — 35%
   - Camera motion variance over storyboard — 30%
   - Output: 0-100 integer, in webhook payload als `motion_quality_score`.
3. **In `cinematic-ad-render-webhook`:** persist `motion_quality_score`.
4. **In `cinematic-ad-validate`:** check `motion_quality_score >= 70`; als lager, zet `status = 'render_queued'` met `motion_regen_attempts++` (max 2 retries). Daarna `needs_scene_regen` voor manual review.
5. **Configurable threshold:** `cinematic_ad_settings.motion_quality_min_score` (default 70).

---

## Wijzigingsoverzicht

```text
FASE 1
  supabase/functions/cinematic-ad-render-webhook/index.ts   (preserveMerge helper)
  .github/workflows/trim-cinematic-ad.yml                   (callback payload uitbreiden)

FASE 2
  .github/workflows/trim-cinematic-ad.yml                   (SUPABASE_URL strip)
  supabase/migrations/<ts>_fix_double_slash_mp4_urls.sql   (UPDATE backfill)

FASE 3
  supabase/functions/cinematic-ad-prepare/index.ts          (invoke motion-engine)
  remotion/scripts/render-cinematic-ad.mjs                  (dispatch op motion_storyboard)
  remotion/scripts/render-cinematic-remotion.mjs            (motion_storyboard prop wiring)

FASE 4
  supabase/migrations/<ts>_motion_quality_score.sql         (kolom + settings)
  remotion/scripts/render-cinematic-ad.mjs                  (motionQualityScore func)
  supabase/functions/cinematic-ad-render-webhook/index.ts   (persist)
  supabase/functions/cinematic-ad-validate/index.ts         (floor=70, auto-regen)
```

## Risico's

- **Phase 3** zonder eind-tot-eind test risico op zwarte render bij motion_storyboard zonder kloppende image URLs. Fallback naar zoompan dempt dat.
- **Phase 4** auto-regen kan een retry-storm geven als score-berekening consistent <70 scoort. Max 2 retries cap is hard.
- Migraties zijn additief, backwards compatible (nieuwe kolommen nullable, defaults).
