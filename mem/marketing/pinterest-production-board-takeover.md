---
name: Pinterest production board takeover (2026-06-10)
description: 15 legacy Pinterest boards were sandbox-only; replaced with fresh production-twin boards. Old boards are archived/blacklisted.
type: feature
---
On 2026-06-10 the live pin repair workflow exposed that every Pinterest board created before app graduation was tagged sandbox-only by Pinterest, returning `HTTP 400: Cannot add non-sandbox pins on sandbox boards.` even when called against `api.pinterest.com/v5`.

Resolution: the 16 legacy boards were renamed with the `(Archive)` suffix and 15 production-twin boards were created with the original names (the "Products" board could not be renamed due to a Pinterest 500, so its prod twin was skipped). All `pinterest_pin_queue.board_id` references and the active live-pin repair queue were remapped to the new production IDs. Existing pins on the legacy archive boards were left untouched.

Permanent contract:
- `pinterest_boards.is_sandbox = TRUE` AND `is_blacklisted = TRUE` for every legacy board; selectors and the executor must filter `is_sandbox = FALSE AND is_blacklisted = FALSE` before resolving any `board_id`.
- `production_verified = TRUE` is required on every board the cron worker/publisher uses.
- The repair executor (`pinterest-live-pin-repair-execute`) resolves boards via `board_name` lookup against the production set first, only falling back to a stored `board_id` if that ID is present in the production set.
- Pinterest's spam throttle (HTTP 429 "block (Pins)") triggers after ~30 publishes in a short window; future bulk repair runs must space requests or back off when 429 is observed.

New production board IDs (post-takeover): `1117103951261719219` Best Cat Trees 2026, `1117103951261719220` Cat Care Essentials, `1117103951261719221` Cat Essentials, `1117103951261719222` Cat Furniture, `1117103951261719223` Cat Products, `1117103951261719224` Cat Tree Buying Guide, `1117103951261719225` Cat Trees for Large Cats, `1117103951261719226` Dog Travel Accessories, `1117103951261719227` Dog Walking Essentials, `1117103951261719228` GetPawsy Products, `1117103951261719230` Indoor Cat Setup, `1117103951261719231` Luxury Pet Beds, `1117103951261719232` Pet Parent Hacks, `1117103951261719234` Smart Pet Gadgets, `1117103951261719235` Smart Self-Cleaning Cat Litter Box.