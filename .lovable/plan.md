
# Cinematic Video Engine V3 — Implementation Plan

Scope is strictly the cinematic ad pipeline. Pinterest publishing, product imports, checkout, Runway merge workflow, and existing infrastructure are **not** modified — V3 runs alongside V2 behind a feature flag and only feeds the Pinterest queue once a job passes QA ≥ 95.

## Guiding principle

> The product is sacred. The animal is fake until proven real.

V3 never asks a generative model to invent a product or an animal. Every frame either composites the **real stored product media** or uses **abstract cinematic motion graphics** built from that same media.

---

## 1. Architecture

New, isolated module: `supabase/functions/cinematic-v3-*` + a new `cinematic_v3_jobs` table. The existing `cinematic_ad_jobs` table and Runway merge pipeline are untouched.

```text
┌─────────────────────────────────────────────────────────────────┐
│ cinematic-v3-orchestrator  (single entry point per job)         │
│                                                                 │
│  1. RULE-1 Product accuracy gate                                │
│       • load product + media + reviews                          │
│       • require ≥ N high-res images, no AI-generated tag        │
│       • reject if accuracy_confidence < 95                      │
│                                                                 │
│  2. Script writer (Lovable AI: gpt-5-mini)                      │
│       • Hook → Problem → Agitate → Solution → Benefit → Trust → CTA│
│       • returns 7 scenes w/ timing, VO line, on-screen caption  │
│                                                                 │
│  3. Voiceover (ElevenLabs, mp3)                                 │
│       • RULE-5 mandatory — abort job on failure                 │
│       • per-line stitching (previous_text / next_text)          │
│       • saved to storage: voiceovers/<jobId>/line-<n>.mp3       │
│                                                                 │
│  4. Visual layer (NO AI animals, NO AI products)                │
│       • Scene type = one of:                                    │
│         – product_pan   (Ken-Burns on real product image)       │
│         – product_parallax (multi-layer cut-out + bg blur)      │
│         – authentic_clip (real CJ/uploaded video, trimmed)      │
│         – motion_graphic (typography + product silhouette)      │
│       • All frames are deterministic ffmpeg compositions —      │
│         NO Runway / NO Veo / NO image generation here.          │
│                                                                 │
│  5. Caption + safe-frame engine                                 │
│       • 1080×1920, top safe 150px, bottom safe 350px            │
│       • drawtext via textfile= (no inline escaping)             │
│       • font auto-scales: max 2 lines × 8 words, binary-search  │
│         font size until bbox fits safe band                     │
│                                                                 │
│  6. Mux                                                         │
│       • concat scenes → overlay captions → mux VO + bg music    │
│       • -ar 44100 -c:a aac -b:a 192k -c:v libx264 -preset slow  │
│                                                                 │
│  7. QA engine (RULE-8) — see §3                                 │
│       • score 0-100 per category, refuse < 95 overall           │
│                                                                 │
│  8. On pass → enqueue to existing Pinterest queue               │
│     On fail → job stays in `needs_review`, never published      │
└─────────────────────────────────────────────────────────────────┘
```

Reuses existing infra:
- GitHub Actions render runner (the working `render-cinematic-runway-merge.yml`)
- Storage bucket `cinematic-runway`
- Pinterest queue table (only inserts happen, no schema change)

---

## 2. Database (one migration)

`cinematic_v3_jobs`
- product_id, status, script (jsonb), scenes (jsonb)
- voiceover_url, final_mp4_url
- qa_scores (jsonb), qa_total, qa_passed (bool)
- failure_reasons (text[])
- timestamps

RLS: admin-only read/write, service_role full. No anon access.

---

## 3. QA engine (RULE-8, hard gate)

Each category scored 0–100. Final = min of all (one failure fails the job).

| Category | How it's measured |
|---|---|
| Product accuracy | SSIM between source product image and a sampled frame's product crop ≥ 0.92 |
| Visual consistency | frame-to-frame perceptual hash drift below threshold |
| Text visibility | OCR (tesseract) bbox vs safe zone, contrast ratio ≥ 4.5 |
| Voiceover presence | ffprobe: audio stream exists, RMS > -30 dB, duration ≥ video − 1s |
| Audio quality | LUFS between -18 and -14 (commercial loudness) |
| Aspect ratio | exactly 1080×1920 |
| Safe zones | no OCR text crossing 0–150 or 1570–1920 |
| Caption timing | each caption's on-screen window ≥ its VO line duration |
| Pinterest compliance | duration 6–60s, mp4/h264, < 2 GB, < 16 MB/s |

`qa_passed = (every category ≥ 95)`. Anything else → `needs_review`, never auto-published.

---

## 4. Voiceover (ElevenLabs)

- Standard connector for `ELEVENLABS_API_KEY` (will prompt if not linked).
- Voice: `JBFqnCBsd6RMkjVDRZzb` (George — warm/trustworthy US male) by default; admin can override.
- Model: `eleven_multilingual_v2` for quality; `eleven_turbo_v2_5` fallback.
- Per-scene generation with request stitching for smooth prosody.
- Saved to Lovable Cloud storage; URL stored on the job.

If voiceover generation returns non-2xx → job aborts with `failure_reasons: ['voiceover_failed']`. No video is produced.

---

## 5. No-AI-animal guarantee (RULE-2)

Enforced at three layers:
1. Script writer system prompt forbids referencing animals visually; copy may *say* "your cat" but never instruct the renderer to show one.
2. Scene type whitelist (see §1) — there is no scene type that can produce an animal frame.
3. QA OCR + a lightweight image classifier (open-source MobileNet via the render worker) scans 8 sampled frames; if "cat"/"dog"/"person" confidence > 0.6 anywhere and no authentic source clip is tagged for that scene → fail.

---

## 6. Admin UI

New page `src/pages/admin/CinematicV3QaPage.tsx` linked from the admin sidebar under "Cinematic":

- Job list with thumbnail, duration, QA total, per-category scores as chips
- Filter: passed / needs_review / failed
- Detail drawer: script, VO player, final MP4 player, frame-by-frame QA evidence
- "Re-render" button (admin-only)
- "Approve to Pinterest queue" button (only enabled when `qa_passed = true`)

Pinterest queue insertion is the **only** integration point and uses the existing insert path — no change to publishing logic.

---

## 7. Rollout

1. Ship migration + V3 functions behind admin-only access.
2. Generate 3 pilot jobs from existing top products; review QA dashboard.
3. Only after the user confirms the 3 pilots look like commercial ads do we open V3 to feed the Pinterest queue.
4. V2 jobs already in flight are untouched.

---

## Open questions before I start

1. **ElevenLabs**: link the standard connector now? (preferred — keeps the key managed). If you'd rather use a manual `ELEVENLABS_API_KEY` secret, say so.
2. **Background music**: include a small royalty-free music bed at -22 LUFS under the VO, or VO-only? (commercial ads almost always have a bed)
3. **Pilot products**: pick the first 3 product slugs to validate against, or let me auto-pick the top 3 winners by revenue?
4. **Voice**: default to George (warm US male) or do you want a female voice (Sarah / Jessica)?

Once you answer these I'll execute the full build in one pass: migration → edge functions → render-worker changes → admin QA page → 3 pilot renders. No existing infrastructure will be touched.
