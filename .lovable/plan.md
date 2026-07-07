## Pinterest Reality Recovery V1 — Execution Plan

Canonical published = 212. Live = 32 (28 drifted). Ghosts = 180. Goal: make LIVE == canonical, with evidence, no fabrication.

All work happens in **one new admin-gated edge function** `pinterest-reality-recovery` (dual auth: admin JWT OR `SUPABASE_SERVICE_ROLE_KEY`, same pattern as `pinterest-live-reality-audit`). Uses existing `pinterest_connection.access_token`. No new secrets. No schema changes to protected tables. No touching checkout / GA4 / canonical_events / analytics / OAuth / tracking.

### Storage (single new scratch table, additive only)

`public.pinterest_reality_recovery_runs` — one row per run with phase counters, plus JSONB arrays of before/after snapshots per pin. Admin-only RLS + service_role. No changes to `pinterest_pin_performance` schema; only column writes already present (`status`, `rejection_reason`, `updated_at`, existing metadata columns). Uses existing `deleted_at` / `remote_status` if present; otherwise stores the delete audit in the new run table only (never destructive).

### Phase flow (single function, `?phase=` param, resumable)

```text
phase=audit      → re-fetch live state for all 212 canonical published pins
                   classify: LIVE_MATCH | LIVE_DRIFT | GHOST_404 | API_ERROR
phase=ghosts     → for GHOST_404: UPDATE pinterest_pin_performance
                   SET status='deleted_remote', rejection_reason='ghost_404',
                       updated_at=now()
                   snapshot before/after into run table
phase=repair     → for LIVE_DRIFT: compute per-field confidence
                   PATCH /v5/pins/{id} only when confidence >= 0.99
                   fields: title, description, link, alt_text, board_id
                   store before/after; below threshold → skip + log reason
phase=republish  → for GHOSTS whose product still passes ALL gates:
                   product.active, in_stock, pinterest_enabled,
                   destination HEAD == 200, slug valid, image URL valid,
                   hook_angle present, title+desc+URL unique vs live set,
                   integrity guard passes (existing verifyPinIntegrity)
                   anti-spam: per-product cap (max 6), per-board cap (max 8/run),
                              title-similarity < 0.85 vs live corpus,
                              no duplicate destination on live board
                   throttle: 1 pin every 6–12s, jittered, max 30/run
                   POST /v5/pins → on success insert new row w/ live pin_id
                   on 429/5xx → exponential backoff, max 2 retries, then skip
phase=verify     → GET each newly created pin, assert title/link/board match
                   assert analytics endpoint returns 200 (or documented empty)
                   any mismatch → mark row status='verify_failed'
phase=certify    → emit factual counters (no estimates)
```

Each phase is idempotent and can be re-invoked. Every phase writes to the same run row.

### Anti-spam guardrails (hard-coded, not tunable via UI)

- max 6 pins per product per recovery run
- max 8 new pins per board per run
- title Jaccard similarity ≥ 0.85 vs any live pin → blocked
- destination URL must be unique across the entire live set
- Multi-Cat Cleanliness title family explicitly blocklisted for this run

### Certification output (real numbers only)

```text
canonical_published:        212
live_before:                32
ghosts_detected:            <n>
ghosts_marked_deleted:      <n>
drift_detected:             <n>
drift_repaired_high_conf:   <n>
drift_skipped_low_conf:     <n>
republish_candidates:       <n>
republished_ok:             <n>
republish_skipped_gates:    <n>
republish_failed_api:       <n>
verified_ok:                <n>
verify_failed:              <n>
live_after:                 <n>
duplicate_titles_live:      <n>
duplicate_urls_live:        <n>
boards_used:                <n>
products_represented:       <n>
coverage_pct:               live_after / canonical_published
result:                     PASS | FAIL  (PASS requires all success criteria)
```

### Explicitly NOT doing

- No creative regeneration, no AI image gen
- No schema migrations on `pinterest_pin_performance` or any protected table
- No deletion of Pinterest boards or products
- No touching checkout / GA4 / canonical_* / attribution / tracking / OAuth / secrets
- No overriding integrity guard
- No optimistic reporting — every count comes from the run table

### Admin trigger

Small button in existing Pinterest admin panel: "Run Reality Recovery" → invokes `pinterest-reality-recovery?phase=all` and streams the run row. Phases can also be invoked individually for safety.

### Approval gate before publish phase

`phase=republish` requires an explicit `confirm=true` body param. Ghost-marking and drift-repair run first so you can inspect the run row before authorizing new pin creation.

---

Approve to proceed. On approval I will (1) create the scratch table migration, (2) implement `supabase/functions/pinterest-reality-recovery/index.ts`, (3) add the admin trigger button, (4) run phases audit → ghosts → repair → verify and report counts before requesting republish confirmation.
