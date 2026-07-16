## 3-Pin Cost-Controlled Dog Wave — Execution Plan

Reuse the validated canonical `pinterest-wave-runner` path proven by canary `5c3b19c6-fae4-4582-a742-dd8de8e6ef90`. No code changes unless a runtime error blocks execution. Photo-lock only, zero paid image calls, ≤0.30 credit total.

### Phase 1 — Run bootstrap
1. Mint fresh production `run_id` (UUID v4).
2. Insert `pinterest_run_config` row with: `requested_pin_count=3`, `product_category=dog`, `max_credit_spend=0.30`, `max_credit_spend_per_pin=0.10`, `max_paid_image_calls_per_pin=0`, `max_paid_qa_calls_per_image_hash=1`, `max_total_paid_calls=10`, `allow_pro_image=false`, `manual_resume=true`, `dry_run=false`, `hero_priority_slugs=[]`, `status='awaiting_manual_resume'`.
3. Arm `pinterest_runtime_settings.wave_isolation_active_run_id = <run_id>`.

### Phase 2 — Zero-cost prefilter (dog catalog)
SQL against `products` with: `primary_species IN ('dog')`, `is_active=true`, `stock_quantity>0`, `us_eligible=true`, `pinterest_eligible=true`. Exclude:
- previously posted or queued/processing (`pinterest_pin_queue` join)
- the 4 already-terminal products (aluminum carrier, dog bath brush, fish treat dispenser, agility ramp) + any row in `pinterest_terminal_rejections`
- policy-unsafe patterns via `isPolicyUnsafe` (shock/prong/e-fence)
- mixed cat/dog if dog-only alternative exists
- duplicate slugs / duplicate hero image hashes

Then PDP HTTP 200 check on `getpawsy.pet/products/{slug}` — H1, price, Add to Cart, no Shopify redirect. Hero image decode ≥1000px longest side, no watermark/supplier-text/collage (cached checks only).

Rank survivors by `us_audience_score` DESC; take top ~15 as ordered evaluation list.

### Phase 3 — Sequential source preflight
For each candidate in order (stop when 3 pass OR paid-call cap OR budget cap):
1. Check `pinterest_qa_score_cache` by image hash + scoring_version.
2. On miss: one `google/gemini-2.5-flash` vision call via `_shared/pinterest-source-preflight.runSourcePreflight` (goes through `runScoredWithCache` and `assertBudget`).
3. Enforce hard thresholds unchanged: occupancy ≥0.40, identity ≥0.98, PDP sim ≥0.97, species ≥0.95, variant/color PASS, watermark/supplier_text/collage = 0, decode PASS.
4. Record each candidate result (cache hit or paid) in ledger + evaluation log for the final report.

### Phase 4 — Mix selection
From the 3+ passing candidates prefer variety (comfort/home, feeding/travel/practical, toy/walking/enrichment) but **quality wins over diversity** — take the 3 highest-quality passers.

### Phase 5 — Queue insertion (deterministic composite)
For each of the 3 chosen products, call `pinterest-wave-runner` (`manual_resume=true`) with the pre-selected slugs so it inserts rows with:
- `run_id=<run_id>`, `strategy='composite_photo_lock'`, `photo_lock=true`, `product_regeneration=false`, 1200×1800 2:3
- Copy: 6-word headline, 9-word benefit, CTA from {View Product, See Details, Explore More}
- No price/discount/urgency/reviews/badges/claims
- SEO: title 45–75 chars, description 300–500 chars, 8–15 dog keywords, factual alt
- Destination: `https://getpawsy.pet/products/{slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=dog_cost_controlled_wave_2026_07&utm_content={run_id}_{index}`

Board routing per map (Luxury Pet Beds / Dog Walking Essentials / Dog Travel Accessories / Pet Parent Hacks fallback). Do NOT force agility→Travel; use most relevant owned board.

### Phase 6 — Gate stack (unchanged)
Each queued row must pass in this order before publish: QA PASS, native PASS, PRE overall ≥95 (visibility/expectation/click intent/landing/shopping all ≥95), integrity guard, destination integrity, species/variant/visual identity. Zero retries, zero threshold reductions.

### Phase 7 — Publication + verification
Publish via `pinterest-cron-worker` (isolation-aware). Per pin: POST `/v5/pins` with resolved `board_id`, store `pinterest_pin_id`+`posted_at`, then read-only GET to verify public state, image, title, destination, actual board. If actual board ≠ intended but pin is correct → `POSTED_WITH_BOARD_WARNING` (do not delete). Persist DB status to match live state.

### Phase 8 — Terminal
Clear `pinterest_runtime_settings.wave_isolation_active_run_id`. Preserve ledger/cache. Do not resume other work.

### Phase 9 — Report
Emit the full candidate-by-candidate table + final-pin table + aggregates exactly as specified (candidates checked, paid vision calls, image-gen calls=0, cache hits, published, board warnings, terminal rejects, total spend, cost/pin, legacy rows=0, duplicates=0, Shopify links=0, isolation cleared).

### Stop conditions
- 3 pins reach terminal state → PASS
- Budget/paid-call cap hit before 3 → PARTIAL with remaining budget
- Isolation/ledger/publication enforcement fails → FAIL
- No code changes unless runtime error blocks execution; if one occurs, apply the minimum patch and continue (same pattern as canary run).

Approve to execute.
