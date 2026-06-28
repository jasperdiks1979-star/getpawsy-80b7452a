---
name: PCIE-V2 Creative Director (foundation)
description: Config-driven, pipeline-based creative engine intended to replace legacy pinterest-creative-factory. Every catalog (styles/typography/hooks/cameras/emotions/CTAs/scenes/scoring axes/signals/pipeline stages) is a database table.
type: feature
---
**Edge fn:** `supabase/functions/pcie-v2-creative-director/index.ts` — loads every catalog from DB on each invocation, runs the configured pipeline stages in `order_index` order, dedupes by attribute fingerprint, self-critiques via Lovable AI Gateway, scores against all enabled axes, and publish-gates at `pcie_v2_config.publish_gate_threshold`.

**Catalog tables (all admin-read, service-write, RLS on):**
- `pcie_v2_config` (key/value) + `pcie_v2_feature_flags` — toggles per capability, never hardcoded.
- `pcie_v2_style_families` (40 seeded), `pcie_v2_typography_systems` (8), `pcie_v2_hook_categories` (22) + `pcie_v2_hooks` (~528), `pcie_v2_camera_presets` (10), `pcie_v2_emotions` (12), `pcie_v2_cta_styles` (8), `pcie_v2_scene_generators` (10).
- `pcie_v2_scoring_axes` (9 seeded; `hard_reject`+`pass_threshold` per axis), `pcie_v2_performance_signals` (12: CTR→Revenue→ROAS→bounce→PDP scroll), `pcie_v2_pipeline_stages` (12 ordered handlers).

**Provenance per creative:**
- `pcie_v2_creatives` — full snapshot (prompt, model, seed, fingerprint, novelty_total, decisions jsonb, scores jsonb, pipeline_trace jsonb, pinterest_pin_id, pinterest_queue_id, reject_reason).
- `pcie_v2_creative_decisions` — one row per attribute decision (`attribute`,`value_slug`,`source`) → training data.
- `pcie_v2_novelty_scores` — per-axis score + passed flag + evidence.
- `pcie_v2_combo_fingerprints` — rolling dedupe (default 300).
- `pcie_v2_events` — full ledger (accept/reject/regenerate/score).
- `pcie_v2_attribute_weights` — per `(attribute,value_slug,signal_slug)` EMA + confidence; consumed by `pickWeighted()` so genetic learning is automatic when a future job ingests new performance signals.

**Pipeline order:** product_context → story → style → emotion → typography → hook → composition → camera → cta → qa → self_critique → publish. Each stage is a pure handler in `STAGE_HANDLERS` keyed by `pipeline_stages.handler`. Adding a stage = INSERT row + add handler key. Disabling a stage = `enabled=false`.

**Extensibility rules (do NOT violate):**
- Never hardcode lists of styles/hooks/etc. — always select from the DB catalog with `enabled=true`.
- New scoring axis = INSERT into `pcie_v2_scoring_axes` (+ optional new evaluator key). No code refactor.
- New performance signal = INSERT into `pcie_v2_performance_signals`. Genetic engine already keys on it.
- New external engine (Trend/Season/Weather/Inventory/Price) = wrap as a stage that mutates `ctx.decisions`/weights.
- Replacement of legacy `pinterest-creative-factory` is gated by feature flag `pcie_v2_replace_legacy` (default false).

**Admin UI:** `PcieV2Panel` on `/admin/pinterest-health`. Shows catalog counts, feature flag toggles, recent runs, recent creatives with decisions + reject reasons.

**Image rendering is intentionally NOT yet wired** in the first slice — pipeline produces prompts + decisions + scores + dedupe, persists everything, and gates publishing. Add `image_render` stage (handler that calls Lovable AI image model + uploads to storage + sets `image_url`) once dry-run quality is verified.