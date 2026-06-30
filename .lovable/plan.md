
# Genesis V3.6 — Persona Attribution & Closed-Loop Learning Engine

A single thin attribution + learning layer that stitches existing engines (PCIE2, Canonical Analytics, Pinterest Growth V3, Audience Intelligence V3.5, MI, Autopilot) into one closed loop. **Zero duplicate analytics, zero placeholder AI, zero new dashboards** — extend `/admin/market-intelligence` only.

---

## Reuse inventory (no duplicates)

- **Creative identity:** already in `pcie2_creatives` (id, persona_id, hook_id, headline, visual_dna, cta, board_id) + `pcie2_visual_dna`. Extend with 4 nullable columns; do **not** create a parallel table.
- **URL attribution:** `pcie2-publish-assembler` already stamps utm_source/medium/campaign/content. Extend the assembler to also embed `creative_id`, `persona_id`, `emotion_id`, `hook_id`, `style_id`, `board_id`, `campaign_id` — no new publisher.
- **Pinterest feedback:** `pinterest_pin_performance`, `pinterest_pin_queue`, `pinterest_board_performance`, `pcie2_pin_performance`. Already live.
- **Website feedback:** `canonical_events`, `canonical_sessions`, `cci_events`, `analytics_funnel_waterfall`. Already canonical.
- **Persona/Audience:** `gv35_audience_personas`, `gv35_product_audience_match`, `gv35_audience_signals_daily`. Reuse — do not fork.
- **Learning:** `gcp_learnings`, `pcie2_trait_weights`, `pcie2_alg_state`, `pei_creative_dna`, `pei_gene_performance`. Reuse.
- **Autopilot:** `autopilot_actions` + `autopilot-dispatch`. Reuse with new `action_kind='persona_creative_combo'`.

## New surfaces (minimal — 1 migration, 2 edge functions, 1 SDK file, 1 tab)

### Migration (single transaction)

1. **Extend** `pcie2_creatives` (additive, nullable):
   - `emotion_id text`, `style_id text`, `palette_id text`, `room_id text`, `camera_id text`, `generation_model text`, `generation_version text`, `campaign_id text`
   - Backfill from existing `visual_dna` JSON where present.
2. **New table** `gv36_attribution_links` — one row per published pin → creative mapping:
   - `pin_id text PK`, `creative_id uuid`, `persona_id uuid`, `emotion_id text`, `hook_id text`, `style_id text`, `board_id text`, `campaign_id text`, `product_id uuid`, `published_at timestamptz`, `last_metric_sync timestamptz`
   - Indexes on creative_id, persona_id, product_id. RLS admin-only; service_role write.
3. **New table** `gv36_combo_performance` — rolled-up per `(persona_id, emotion_id, hook_id, style_id, board_id, product_id)`:
   - impressions, saves, clicks, ctr, atc, checkout, purchases, revenue, aov, confidence_wilson, sample_n, trend_7d, momentum_28d, status (`winning|growing|stable|declining|needs_refresh|retire`), last_evaluated_at, evidence_sources jsonb.
   - Unique composite key with `ON CONFLICT DO UPDATE`.
4. **New table** `gv36_first_sale_memory` — append-only ledger of every purchase, copying winning persona/creative/emotion/hook/board/publish_time/product/category/path snapshots so this becomes permanent reusable knowledge that survives table rewrites.
5. **New view** `gv36_persona_performance_v` — joins `gv36_attribution_links` + `pinterest_pin_performance` + `canonical_sessions/events/orders` → per persona aggregates (impressions, CTR, save rate, click rate, ATC rate, checkout rate, purchase rate, revenue, AOV, confidence, trend, momentum). Invoker security, admin-only via underlying RLS.
6. **New view** `gv36_creative_performance_v` — same joins keyed by creative_id with status classification and per-attribute drill-down (headline weak / cta strong / colour excellent / room average / board poor) computed from existing pattern weights.
7. **GRANTs**: service_role full, authenticated SELECT on views; tables locked to admin role via `has_role(auth.uid(),'admin')`.

### Edge functions (2)

1. `gv36-attribution-stitcher` (every 30 min)
   - Reads new rows from `pinterest_pin_queue` where `status='published'` and `pin_id` is set but missing from `gv36_attribution_links`.
   - Resolves `creative_id`, `persona_id`, `emotion_id`, `hook_id`, `style_id`, `board_id`, `campaign_id`, `product_id` from `pcie2_creatives` + `pcie2_publish_queue` + `pinterest_pin_queue.meta`.
   - Pulls fresh Pinterest metrics for affected pins (calls existing `pinterest-video-metrics-sync` / `pinterest-track` paths — no new Pinterest API surface).
   - Joins to canonical sessions via `utm_content` + `creative_id` and updates `gv36_combo_performance` with `ON CONFLICT DO UPDATE`.
   - Inserts purchases into `gv36_first_sale_memory` (append-only).
2. `gv36-learning-loop` (hourly, chained after `gv34-decision-loop` + `gv35-audience-decision`)
   - Recomputes confidence (Wilson 90%) per combo using `min_evidence = max(5 purchases, 200 sessions)` from `gcp_settings.learning.min_evidence` and EMA decay from `gcp_settings.learning.decay_per_day` — **single shared definition**, identical to V3.5.
   - Writes deltas into `pcie2_trait_weights` (existing table) — never bypasses ALG governor.
   - For combos with confidence ≥0.90 and positive momentum, enqueues `autopilot_actions(action_kind='persona_creative_combo')` with `dedupe_hash = sha1(persona_id|creative_id|product_id|day)`.
   - Respects locked creatives in `pcie2_protected_winners`.

### Publisher integration (no new pipeline)

- Patch `supabase/functions/pcie2-publish-assembler/index.ts` to append `creative_id`, `persona_id`, `emotion_id`, `hook_id`, `style_id`, `board_id`, `campaign_id` to the outbound URL and write the matching row into `gv36_attribution_links` at publish time. Falls back to existing behavior when any id is missing — never blocks publishing.

### SDK + UI (one tab)

- `src/lib/genesisV36.ts` — typed read-paths for the two views + the combo table. Reuses canonical SDK utilities; no new fetch helpers.
- New tab inside existing `src/pages/admin/MarketIntelligencePage.tsx`: **Closed-Loop Learning**, file `src/components/admin/market-intelligence/tabs/ClosedLoopLearningTab.tsx`. Tiles: Persona / Creative / Emotion / Hook / Style performance, Audience Journey, Creative Journey, Top Learning Signals, Highest-Revenue Persona / Emotion / Style / Hook, Weakest & Strongest Creative Families. Filters: date, product, persona, campaign, board. All reads via the SDK — no duplicate fetches.

## Confidence methodology (single shared definition)

- Wilson lower bound at 90% on purchase conversions from canonical events.
- Floor: `min_evidence = max(5 purchases, 200 sessions)`.
- EMA decay per day from `gcp_settings.learning.decay_per_day`.
- `<0.90` → surfaced but non-executable (CIE rule).

## Closed-loop integrity rules

- Never overwrite a creative row — version via `generation_version`.
- Never duplicate Canonical Analytics — V3.6 reads, never writes, canonical tables.
- Never duplicate attribution — V3.6 writes only into its own `gv36_*` tables.
- Never bypass `pcie2_protected_winners` or ALG governor.
- `autopilot_actions` dedupe via partial unique index already in place.

## Quality gates

- `tsgo --noEmit` clean.
- `canonical_validate_consistency()` 0% drift (no canonical edits).
- All new tables admin-only, service_role write; views invoker.
- Dedupe test: duplicate `persona_creative_combo` insert returns 0 rows.
- Smoke: assembler still publishes when persona_id is null.
- Production smoke: end-to-end trace for one live pin (impression → save → click → landing → ATC → purchase → learning row → autopilot enqueue).

## Deliverables

1. One migration (2 column groups, 3 tables, 2 views, GRANTs, RLS, indexes, append-only trigger on first_sale_memory).
2. Two edge functions + two cron entries (30 min + hourly chained).
3. Assembler patch to embed the 7 ids in published URLs.
4. SDK file + one MI tab.
5. Deployment report: attribution coverage %, learning coverage %, persona confidence distribution, creative confidence distribution, closed-loop validation result, GA4 validation, canonical drift, Pinterest pipeline status, autopilot dedupe, production readiness, remaining blockers.

## Out of scope

- New dashboards/pages beyond the MI tab.
- New Pinterest API surface (reuses existing sync functions).
- Direct publishing changes beyond URL parameter additions.
- Replacing PCIE2/PEI/ALG learning loops — V3.6 feeds them, never replaces them.
- Scraping external signals.
