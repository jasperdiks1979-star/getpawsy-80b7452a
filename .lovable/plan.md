# Pinterest CTA Button — Global Repair Plan

## 1. Root-cause fix in the shared compositor

**File:** `supabase/functions/pinterest-deterministic-compositor/compositor.ts` (+ `layouts.ts`)

Current defects:
- CTA pill is a flat `c_pad` rectangle with no corner radius, no shadow, no top highlight → looks like a pasted black box.
- Text is placed with `y = ctaBox.y + (h - ctaSize)/2`, i.e. mathematical centering on font em-height, not optical centering → labels drift high/low depending on ascenders/descenders.
- `ctaBox` width is hard-coded at 400 px in every layout regardless of label length ("View Product", "Explore Product" overflow risk; short labels look cramped).
- `BANNED_TRANSFORMS` currently rejects any `r_\d+` globally, blocking rounded corners on the CTA itself.

Changes:
1. Introduce a `renderCtaButton()` helper that emits **three stacked Cloudinary layers**:
   - Shadow layer (soft dark drop, `r_max` rounded, offset +6 px, low opacity).
   - Main pill (`b_rgb:0F0D0B`, `r_24`, subtle 1 px inner top highlight via a second thin rounded rect at 8% white).
   - Bottom edge darker rounded rect for physical depth.
2. **Dynamic width**: `buttonWidth = clamp(minWidth=420, textWidthEstimate + 2*hPad(48), maxWidth=0.72*CANVAS.w)`. Text width estimated from `ctaText.length * ctaSize * 0.55` (Arial bold approx). Recompute `ctaBox.x` to keep alignment (left-anchored or centered per layout preset).
3. **Optical centering**: use `y = ctaBox.y + Math.round((ctaBox.h - ctaSize) / 2) - Math.round(ctaSize * 0.06)` (Arial cap-height adjustment ≈ 6% lift). Add unit tests for short/medium/long labels.
4. **Height**: bump `ctaBox.h` from 110 → 104 min, keep 22 px min vertical padding, 42 px min horizontal padding.
5. **Radius**: use `r_28` on the CTA pill. Narrow `BANNED_TRANSFORMS` so `r_\d+` is only banned inside the product-layer segment (scope via URL segment position, not global regex). Product layer keeps sharp geometry.
6. Update `auditLayout()` gates: enforce new min height, radius consistency, horizontal-center deviation ≤ 4 px, vertical optical deviation ≤ 5 px, text bounds inside pill bounds with ≥ 22 px / 42 px padding.
7. Update `compositor.test.ts` with:
   - Snapshot of new URL segments (radius + shadow present).
   - Width scales for short ("Shop Now"), medium ("See Details"), long ("Explore Product").
   - Audit rejects if radius is missing.

## 2. Apply the fix in the golden-pin variant

`supabase/functions/pinterest-golden-pin-litter-box/compositor.ts` + `layouts.ts` are vendored copies. Mirror the same changes so the golden-pin regeneration produces the new button.

## 3. Affected-pin inventory (read-only DB scan)

Query `public.pinterest_pins` (or the canonical pins table) for pins whose asset was produced by:
- `pinterest-deterministic-compositor`
- `pinterest-golden-pin-litter-box`
- `pinterest-three-pin-replacement` / `pinterest-v4-replacement` / `pinterest-pin6-v5-replacement` / `pinterest-5-pin-pilot`
- any row where `cta_text ∈ {Shop Now, View Product, See Details, Learn More, Explore Product, Discover More}` AND `template_version < 'cta-v6'`.

Produce a list with `{pin_id, product_id, cta_text, board_id, destination_url, source_asset_url, published_at}`.

## 4. Regeneration + replacement (per pin, sequential, fail-closed)

For each affected pin:
1. Re-run the compositor with the new CTA system (0 paid credits — Cloudinary fetch only).
2. Local audit gate (`auditLayout` + `auditUrl` + geometry checks). If any fails → SKIP, log reason.
3. Preserve title, description, alt, board, destination URL + UTM.
4. Attempt `PATCH /v5/pins/:id` with new media (Pinterest API generally does **not** allow media replace → expected to fail). On failure, fall back to `create pin` on the same board with identical metadata + idempotency key `cta-v6:<old_pin_id>`.
5. Read back new pin URL, verify HTTP 200 + correct board.
6. Only after new pin verified: `DELETE` old pin. Never delete before read-back.
7. Persist mapping (old_pin_id → new_pin_id) in `pinterest_candidate_run_items` or equivalent audit table.

New orchestrator function: `supabase/functions/pinterest-cta-v6-repair/index.ts` (sequential, budget=0 credits, per-run cap = 3 pins for the first canary batch, then unlocked after user re-approval).

## 5. Phased execution

- **Phase A — Code + tests only.** Ship compositor changes + tests. Zero live-pin writes. Produce a rendered PNG contact sheet for the 3 sample CTAs at `/mnt/documents/cta-v6-preview.png` (short / medium / long labels).
- **Phase B — Canary (3 pins).** After user sight-checks the preview, run the repair against exactly the 3 named pins (Foldable Dog Bowl, Steel Litter Box, Smart Self-Cleaning Cat Litter Box). Fail-closed.
- **Phase C — Sweep.** After canary PASS, run the orchestrator over the full inventory from step 3.

## 6. Report

Final `PINTEREST_CTA_BUTTON_GLOBAL_REPAIR_REPORT` in the exact 12-section structure requested.

## 7. Non-goals / preserved

- No changes to headline, benefit copy, product image, background, logo, board, destination, UTMs, alt.
- No paid image-generation credits (Cloudinary fetch URLs only).
- No red review annotations were ever baked into the compositor output — the red circles/arrows in the user's screenshots are external markup; nothing to strip.

---

**Ask before I start:** Approve Phase A → C, or restrict to Phase A only (code + preview) for your sight-check first?
