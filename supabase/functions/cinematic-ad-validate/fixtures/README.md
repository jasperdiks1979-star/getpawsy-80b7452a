# V7 Evaluator — Real Sample Fixtures

This directory holds **real upload artifacts** (actual `.mp4` / `.png` files
plus the JSON job payload the cinematic pipeline produces around them) that
the V7 evaluator is exercised against in
`../v7_eval_fixtures_test.ts`.

Each `*.json` fixture mirrors the production shape stored in
`cinematic_ad_jobs` (the same columns `cinematic-ad-validate` reads at
runtime): `scene_plan`, `scene_assets`, `beats_v5`, `vo_script`,
`hook_text`, `cta_text`, plus a `product_ctx`. Asset entries reference
real files in `./media/` so a reader can open them and confirm the input
is what the test claims it is.

| Fixture | Media | Expected V7 verdict |
|---|---|---|
| `single_image_ken_burns.json` | `media/single_image_hero.png` (1 still, looped with zoom/pan) | **REJECT** — `ken_burns_zoom_only`, missing closeup/lifestyle/demo/cta |
| `valid_multi_scene.json` | `media/valid_multi_scene.mp4` (6 distinct cuts, 7.2 s @ 30 fps) | **APPROVE** — all V7 rules satisfied |
| `borderline_retry_recovers.json` | `media/valid_multi_scene.mp4` | **APPROVE via retry** — strict pass misses lifestyle/demo/cta, retry haystack recovers them from captions/beats |
| `app_product_missing_control.json` | `media/valid_multi_scene.mp4` | **REJECT** — `missing_app_control_shot` (smart litter box without phone/app scene) |
| `app_product_with_control.json` | `media/valid_multi_scene.mp4` + `media/app_control_screen.png` | **APPROVE** — app-control scene present |

The media files are generated, deterministic, and tiny (kB-sized) so the
repo stays light, but they are *real* encoded video and image bytes that
`ffprobe` can decode — not stubs. The test verifies each referenced media
path exists on disk before running the evaluator, so the fixture cannot
silently drift away from the asset it claims to describe.