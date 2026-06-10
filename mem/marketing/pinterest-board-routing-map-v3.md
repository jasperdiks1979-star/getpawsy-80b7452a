---
name: Pinterest board routing map v3
description: Allowed-board whitelist (10 boards) + category→board routing rules. Cat Essentials and all generic-twin boards are blacklisted and never receive pins.
type: feature
---
**Allowed production boards (Pinterest Growth Engine + cron worker):**
1. Smart Pet Gadgets — `1117103951261719234`
2. Smart Self-Cleaning Cat Litter Box — `1117103951261719235`
3. Best Cat Trees 2026 — `1117103951261719219`
4. Indoor Cat Setup — `1117103951261719230`
5. Cat Furniture — `1117103951261719222`
6. GetPawsy Products — `1117103951261719228`
7. Luxury Pet Beds — `1117103951261719231`
8. Pet Parent Hacks — `1117103951261719232`
9. Dog Walking Essentials — `1117103951261719227`
10. Dog Travel Accessories — `1117103951261719226`

**Excluded production-twin boards** (set `is_blacklisted=true`, reason `not_in_allowed_routing_set_v3_2026_06_10`): Cat Essentials, Cat Care Essentials, Cat Products, Cat Tree Buying Guide, Cat Trees for Large Cats. Plus all 16 legacy sandbox boards. Total excluded = 21.

**Routing map (by product slug/category):**
- `litter` (slug or category) → Smart Self-Cleaning Cat Litter Box, fallback Smart Pet Gadgets
- `cat-tree`/`cat-climb`/category `Cat Trees & Condos` → Best Cat Trees 2026, fallback Indoor Cat Setup
- `dog-travel`/`dog-car`/`car-seat-dog` → Dog Travel Accessories
- `dog-leash`/`dog-harness`/`dog-walk` → Dog Walking Essentials
- `bed`/category `Bed*` → Luxury Pet Beds
- `cat-furniture`/`enclosure` → Cat Furniture
- `smart`/`auto`/`gadget`/`app-control` → Smart Pet Gadgets
- everything else → Pet Parent Hacks

Cat Essentials is permanently retired from routing — its 46-pin historical CTR was 0.

**Self-healing publish gate:** pg_cron job `deploy-verify-4h` (id 121, `0 */4 * * *`) POSTs to `/functions/v1/deploy-verify` every 4 h. Freshness window is 720 min, so the gate has 3× redundancy and re-opens automatically without manual `POST /deploy-verify` calls.