## Wave 3 — Continued (with mandatory additions)

Continuing the existing Wave 3 implementation. Wave 3A (Foundation) already shipped: 428/428 product intelligence, 403/428 landing validations green, 10 new V2 tables, foundation edge function deployed. Publishing remains paused.

The 7 mandatory additions are folded into the remaining sub-waves below — no rewrite, no scope reset.

---

### Addition 1 — Pinterest Potential Score (0–100) — hard gate ≥70

Lives in `pin_product_intelligence.potential_score` (new column). Composite of:
- landing validator pass rate
- intelligence confidence
- margin_percent
- effective_stock health
- category demand signal (from `pinterest_category_benchmarks`)
- image quality signal (from existing `cj_media_asset_registry`)

Computed in a new step at the end of Wave 3A+ (`pin-potential-scorer`). Every downstream step (hooks, headlines, scene, golden batch, publishing) MUST filter `potential_score >= 70`. Products below 70 get an audit row + reason and never enter the creative pipeline.

### Addition 2 — Scene Engine: 15 visual style families

`pin_scene_style_families` seed table with: Luxury, Scandinavian, Modern Home, Cozy, Outdoor, Minimal, Emotional, Funny, Family, Macro, Lifestyle, POV, Before/After, Premium, Seasonal. Each family has: palette guidance, camera guidance, lighting guidance, banned cliches, allowed pet contexts. Scene Engine in Wave 3B must draw from these families with even rotation per product (≥3 distinct families per product across 10 variants).

### Addition 3 — Diversity validator (8 axes)

New `pin-diversity-validator` step inside the visual scorer. Per axis 0–100, plus pairwise similarity across the 10 variants of a product:
- camera angle, lighting, composition, background, interior, pet breed, color palette, framing

Stored on `pin_creative_scores.diversity_axes` (jsonb). Any pair with mean axis similarity > 0.82 → one variant rejected and regenerated.

### Addition 4 — Adaptive retry logic

`pin_wave3_settings`:
- `retry_min = 3`
- `retry_max = 15`
- early-exit: stop the moment all gates (visual quality, diversity, landing, hook, headline, potential) all > 0.99
- circuit breaker: hard credit cap per run from `pin_wave3_settings.credit_cap_usd`, default $25/run

### Addition 5 — Golden Batch: top 100 × 10 = 1,000 renders

Ranked by `potential_score * confidence * margin_health`. Filtered to `potential_score >= 70`. Each product → 10 variants across ≥3 style families. Winner persisted in `pin_golden_batch`. Losers archived with reasons. Live credit telemetry in the Control Center.

### Addition 6 — Nightly self-learning engine

`pin-self-learning-engine` edge function + nightly cron (03:30 UTC). Reads:
- `pinterest_analytics_daily` (impressions, saves, outbound, closeup)
- GA4 (`gi_ga4_events`, `gi_traffic_sessions`)
- `pinterest_revenue_attribution_v3`

Writes back:
- `pin_hook_library_v2.weight`
- `pin_headline_bank.weight` (new column)
- `pin_scene_style_families.weight` (new column)
- `pinterest_runtime_settings.publish_pacing_per_hour` (clamped 1–3)

All updates capped per cycle to avoid runaway swings (max ±25% per cycle).

### Addition 7 — Pinterest Control Center

New route `/admin/pinterest-control-center` reading from existing tables (no new persisted state beyond a 5-min snapshot view). Panels:
- Credits (today, this month, projected month-end) — from `pinterest_credit_events`
- Render queue depth + age — from `pinterest_pin_queue`
- Live quality score histogram — from `pin_creative_scores`
- Golden Batch progress bar — from `pin_golden_batch`
- CTR / saves / outbound / conversions / revenue (24h, 7d, 30d) — from `pinterest_analytics_daily` + `pinterest_revenue_attribution_v3`
- Top 10 best / worst pins (last 7d)
- Active alerts — from `monitoring_alerts` + `pinterest_health_incidents`
- 30s auto-refresh, admin-only.

---

### Updated sub-wave order

1. **Wave 3A+ (now)** — add `potential_score` column + `pin-potential-scorer` + 15 style families seed + adaptive retry settings.
2. **Wave 3B** — Hooks (500+), Headlines (20/product, only for `potential_score>=70`), Scene Engine v2 using 15 families + diversity hooks, Descriptions (10/product).
3. **Wave 3C** — Visual + Diversity validators, adaptive retry 3–15, **Golden Batch top 100 × 10 = 1,000 renders**, hard credit cap, winners persisted.
4. **Wave 3D** — Autonomous publishing + A/B loop (requires explicit second go-ahead after gate passes).
5. **Self-learning cron** shipped with 3D.
6. **Pinterest Control Center** shipped alongside 3C so you can watch the Golden Batch live.
7. **Step 12** — Final executive PDF.

### Gates unchanged
Golden Batch confidence ≥99%, all visual + diversity + landing + potential ≥ threshold, zero mismatch → only then 3D is even offered. I will NOT auto-unpause publishing.

### Cost note
Golden Batch jumps from 250 → up to 1,000 image renders (+ up to 15× retries per slot, capped by credit cap). I'll enforce the per-run USD cap and stop early once gates pass to keep this sane.

### Next action after approval
Execute Wave 3A+ (potential scorer + style families + retry settings), then Wave 3B in one continuous run. Report back with DB evidence before touching 3C.
