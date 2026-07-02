
# GENESIS Ω∞ — ZERO-WASTE PINTEREST AI ENGINE V2

Goal: cut reject-rate from ~72% to <10% and credits/published pin from ~18 to <2 by making the **existing** `pcie2-*` pipeline strictly **Prediction First**. No parallel systems, no new dashboards — extend what's there.

## Guiding rules

- Zero parallel pipelines. Every phase modifies existing `pcie2-*` / `pinterest-*` functions and existing tables.
- One new dashboard tab inside `MissionControlPage.tsx` — no new admin page.
- All gates default to **hard-block**, not warn. Feature-flagged for instant rollback via `pcie2_frozen_rules`.
- Every decision writes an `evidence` row so we can prove the credit-saving after the fact.

## Phases → files touched

### 1. Pre-Generation Intelligence (Success Probability ≥95)
- Add SQL function `public.pinterest_success_probability(product_id)` returning 0–100 based on: margin, US stock, PDP completeness, images, variants, reviews, price sanity, last-used cooldown, historical CTR, shopping intent, PRE score.
- Extend `pcie2-creative-seed/index.ts`: call the fn; abort seed with `reason='pre_gen_below_95'` when score <95. Write to `pcie2_pipeline_trace`.

### 2. Duplicate DNA Detector (≤20% match, 365d window)
- New table `pcie2_dna_fingerprints` (prompt_hash, image_phash, dna_vector jsonb, camera, angle, lighting, palette, environment, headline_hash, emotion, cta, breed, room, created_at).
- New edge fn `pcie2-dna-guard` — cosine/Jaccard match vs last 365d; abort at >20%.
- Wire into `pcie2-creative-worker` **before** the AI call.

### 3. Prompt Certification (all 16 axes ≥95)
- Extend `pcie2-creative-intelligence` with `certifyPrompt(prompt, product)` → cheap Gemini-flash JSON scorer (single ~0.0005 credit call, cached in `ai_prompt_cache`).
- Abort generation when any axis <95. Persist to `pcie2_ci_scores`.

### 4. Image Budget Controller
- Extend existing `pinterest_credit_state` + `ai_credit_budgets`. Add columns: `projected_waste_pct`, `rolling_reject_rate_100`, `daily_cap`, `weekly_cap`.
- New shared helper `_shared/budget-guard.ts`. Every generation entrypoint calls it first. STOP conditions: waste>10%, buffer<threshold, gateway red, reject-rate(last 100)>15%.
- Fix stale-state bug (from prior forensic): probe TTL cap 15 min; auto-clear on 3 consecutive 200s.

### 5. Post-Generation QA (18 checks ≥95)
- Extend `pcie2-step5-validate`: add vision-based QA via Gemini-flash-image (landing similarity, product visibility, cropping, US household fit, pet emotion, realism, color grading). Reject <95 → recycle prompt seed, do **not** re-generate blindly.

### 6. Self-Learning DNA
- Extend `pcie2-learning-engine` + `pcie2-performance-sync`: every published pin's outcome (impressions→purchase, revenue/AI-credit) mutates `pcie2_trait_weights` and populates `pcie2_creative_winners` (Winner DNA) / new `pcie2_failure_dna` view. Prompt-seed generator biases sampling by weight.

### 7. Failure Prevention (hardening)
- Extend `pcie2-self-healer`: dedupe queue on insert (unique idx on `dna_hash`), empty-prompt guard, sold-out guard (`us_stock=0` abort), broken-URL check, Pinterest-API circuit breaker, retry cap = 2, stale-state watchdog.

### 8. Mission Control tab (no new page)
- Add tab **"Zero-Waste Engine"** to `src/pages/admin/MissionControlPage.tsx` with tiles: credits, credits/pin, reject%, publish%, wasted, saved, predicted waste, real waste, images today, pins today, revenue today, revenue/credit, top winners, worst losers, pipeline health, prediction accuracy, buffer, gateway, queue, gen-success%. Data via one new view `v_zero_waste_dashboard`.

### 9. Autonomous Optimizer (nightly)
- Extend existing `pcie2-nightly-quality-loop` cron: analyze last 24h, mutate `pcie2_trait_weights`, roll board/timing/headline/CTA/keyword winners. No new cron.

### 10. Success criteria certification
- Extend `pcie2-e2e-test`: gate that asserts all KPIs (reject<10%, credits/pin<2, dup=0%, prediction>95%, gen-success>95%, gateway-failures<1%). Emits SHA-256 certificate row into `ceo_production_certificates`.

## Technical details

### New DB objects (single migration)
```
create function public.pinterest_success_probability(_product_id uuid) returns numeric ...
create table public.pcie2_dna_fingerprints (...)  + GRANTs + RLS
create table public.pcie2_failure_dna (...)       + GRANTs + RLS
create view  public.v_zero_waste_dashboard as ... (security_invoker)
alter table public.pinterest_credit_state add column projected_waste_pct, rolling_reject_rate_100, daily_cap, weekly_cap;
create unique index pcie2_publish_queue_dna_uidx on public.pcie2_publish_queue(dna_hash) where status in ('pending','processing');
```

### New shared modules
- `supabase/functions/_shared/budget-guard.ts` — single source of truth for STOP logic.
- `supabase/functions/_shared/dna-hash.ts` — pHash + prompt-DNA vector helpers.

### Edge functions extended (no new fn except `pcie2-dna-guard`)
`pcie2-creative-seed`, `pcie2-creative-worker`, `pcie2-creative-intelligence`, `pcie2-step5-validate`, `pcie2-learning-engine`, `pcie2-performance-sync`, `pcie2-self-healer`, `pcie2-nightly-quality-loop`, `pcie2-e2e-test`.

### Frontend
Only `src/pages/admin/MissionControlPage.tsx` + one new tab component `src/components/admin/mission-control/ZeroWasteEnginePanel.tsx`.

### Rollback plan
Every gate reads `pcie2_frozen_rules.zero_waste_v2_enabled` (default true). Setting it to false restores prior behavior instantly. Migration is additive — no destructive drops.

### Dry-run before persist
Because this touches the credit-critical path, I will run in **shadow mode** (`shadow=true` in `pcie2_frozen_rules`) for the first hour: gates compute scores + log rejections but do not block, so we measure real vs predicted reject-rate against live data before hard-enforcing.

### Evidence deliverable
`/mnt/documents/zero-waste-v2/` will contain: baseline metrics (SQL), post-shadow metrics, config diff, SHA-256 certificate, rollback SQL, file list.

## Estimated impact (from current forensic data)
- Reject rate: 71.9% → target <10% (Phases 1–3 predicted to catch >85% of current rejects pre-generation).
- Credits/published pin: ~18 → target <2.
- Monthly savings at current volume: ≈**16 credits × 1,000 pins/mo = 16k image credits/mo saved**.

## Ask before I build
1. Confirm **shadow-mode first hour** before hard-enforcing (recommended, prevents accidental full-stop).
2. Confirm `pcie2-dna-guard` may use cheap **Gemini-flash-lite** for embedding scoring (~0.0005 credits/call — pays for itself vs one avoided image at ~0.04).
3. Confirm the single Mission Control tab (no new page) is acceptable.

Reply "go" (or with changes) and I will implement all 10 phases in one build pass.
