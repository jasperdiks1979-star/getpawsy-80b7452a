---
name: Pinterest diversity caps + CTR/outbound scoring
description: Tightened 5-per-90 caps across all axes plus deterministic CTR and outbound-click scorers used by creative-director
type: feature
---
**Caps (rolling 90 published pins, hard-block in `_shared/pinterest-diversity-guard.ts`):**
- headline: 5  | cta: 5  | hook: 5  | angle: 5  | benefit: 5  | overlay: 5
- Plus last-25 exact-overlay hard-reject (unchanged).

**Why:** Operator request 2026-06 after audit showed 73× repetition of a single litter headline and 222× repetition of "multi-level cat playground" overlay in last 500 queue rows. Old caps (10/8/12/12) were too loose for current publishing volume.

**Pool replacement:** `DiversityGuard.evaluate()` tries `pickFromPool(category, type)` before rejecting. Overlay cap is hard-reject only (no overlay pool exists yet).

**New scorers (pure, deterministic, exported from same file):**
- `scoreCtrIntent(candidate)` → 0-100. Rewards curiosity / transformation / before-after / emotion / problem-solution / social-proof / specific numbers. Penalises generic openers and weak CTAs.
- `scoreOutboundIntent(guard, candidate)` → 0-100. Blend: 50% CTR-intent + 25% strong-CTA verb + 15% commerce-intent cue + 10% variety headroom.

**Wired in:** `pinterest-creative-director` writes both scores into `pinterest_pin_queue.meta.intelligence.{ctr_intent, outbound_intent}` for every accepted draft (`engine_version: v2.2`). Future growth-engine / cron worker rankers should read these instead of recomputing.

**Do NOT** loosen caps without operator approval. If a category cannot produce 5 unique values within 90 pins it should rotate out, not get its cap raised.