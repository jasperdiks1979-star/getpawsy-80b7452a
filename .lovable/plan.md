## Self-Healing Intelligence Layer (SHIL) — v1

**Architectural rule (permanent):** every critical subsystem registers a `probe → diagnose → recover → validate → learn` contract. SHIL is the single brain that runs that contract on a 5-minute heartbeat. It does **not** replace Guardian, Commander, ACOS, OIE, ODE, Production Validation or PCIE2 health surfaces — it consumes them and acts on top.

---

### What's new (kept minimal, reusing existing telemetry)

#### 1. Database — 6 new tables (prefix `shil_`)
| table | purpose |
|---|---|
| `shil_subsystems` | registry of monitored components: name, type, probe ref, severity, owner, current status |
| `shil_incidents` | every detected anomaly: subsystem, signature_id, severity, evidence_jsonb, detected_at, recovered_at, recovery_id, mttd_seconds, mttr_seconds, status |
| `shil_signatures` | learned anomaly fingerprints (hashable JSON of the symptom) + known root cause + confidence |
| `shil_playbooks` | named safe recovery actions (e.g. `restart_pinterest_worker`, `requeue_missing_pin_image_url`, `split_oversize_creative_job`) with required-evidence preconditions and a code-side handler key |
| `shil_recoveries` | every recovery attempt: incident_id, playbook_id, started_at, finished_at, outcome, before_state, after_state, validation_passed |
| `shil_metrics_daily` | rollup: MTTD, MTTR, auto-recovery rate, recurring-incident rate, false-positive rate, availability % per subsystem |

All with RLS: admin SELECT, service_role ALL. GRANTs explicit per cloud rule.

#### 2. Edge functions (3, reuse pattern)
- **`self-healing-orchestrator`** (cron every 5 min): runs all registered probes in parallel, classifies anomalies via `shil_signatures`, opens incidents, dispatches safe playbooks to the recoverer, updates metrics rollup.
- **`self-healing-recoverer`**: executes a single named playbook with strict allow-list mapping → existing edge functions (e.g. `pinterest-cron-worker`, `pcie2-publish-assembler`, `pinterest-recovery-orchestrator`, `pinterest-creative-factory continuous_run`). Never invents actions; never publishes; never duplicates work. Captures before/after state.
- **`self-healing-validator`**: after a recovery, re-runs the original probe + a 2nd-tier validation (Production Validation hook where relevant) and stamps `validation_passed`. If fail, escalates to a notification row in `guardian_notification_queue` (reuses existing).

#### 3. Initial probe set (seeded — reuses existing tables)
| probe | source of truth (no duplication) |
|---|---|
| Creative Director CPU/timeout | `pinterest_creative_factory_jobs` (stalled > 10 min) |
| Pinterest Queue stall | `pcie2_publish_queue` (ready, no progress in 30 min) |
| Missing `pin_image_url` | `pcie2_publish_queue` count where `status='queued' AND pin_image_url IS NULL` |
| OAuth expired | `pinterest_connection` (token_expires_at < now()+1h) |
| Edge function error spikes | `frontend_error_logs` + `pinterest_pipeline_failures` |
| Cron stalled | `cron_job_logs` last_success > expected interval × 3 |
| Checkout funnel collapse | `checkout_funnel_events` (begin_checkout > 0 AND complete_payment == 0 over 24h) |
| Stripe sessions expiring | `orders` (status='expired' AND no payment_intent_id) trending |
| Storage / media missing | `cj_media_asset_registry` 404 sample |
| Analytics ingestion stale | `analytics_funnel_waterfall` last write > 30 min |
| Worker heartbeats | `cinematic_worker_heartbeats`, `render_worker_heartbeats` |

#### 4. Seeded playbooks (safe by default)
- `restart_pinterest_cron_worker` → invoke `pinterest-cron-worker`
- `replenish_creative_factory` → invoke `pinterest-creative-factory` action `continuous_run`
- `requeue_pcie2_missing_images` → invoke `pcie2-publish-assembler` refresh
- `refresh_pinterest_oauth` → invoke `pinterest-recovery-orchestrator`
- `unpause_premium_engine_if_safe` → set `premium_engine_paused = false` only if creative inventory > threshold AND health green (mirrors prior incident pattern)
- `escalate_only` → no action, emit notification (used for checkout, Stripe, security)

Everything destructive (publishing, paying, schema change, security) is **escalate_only**.

#### 5. Frontend — one admin page
`src/pages/admin/SelfHealingPage.tsx` at `/admin/self-healing`:
- Live subsystem grid (color-coded), incidents feed, MTTD/MTTR cards, learned signatures table, playbook history, manual "Run probes now" button (admin-only edge invoke).

Plus a single nav entry under existing Commander cluster — no duplicate dashboards.

#### 6. Cron
`pg_cron`: `*/5 * * * *` invoking `self-healing-orchestrator` with anon key + admin internal header (matches existing pattern used by other orchestrators).

#### 7. Implementation report
Per project memory rule, write `public/admin-reports/ai-implementation/SHIL_v1_2026-06-28.{pdf,json}` and update `manifest.json`.

---

### Out of scope for v1 (called out explicitly)
- No new analytics events. Canonical events untouched.
- No new auth flows.
- No autonomous Stripe / publishing / security actions — all `escalate_only` until proven safe.
- No video generation, no per-user notifications channel (reuses `guardian_notification_queue`).
- No replacement of Guardian, Commander, ACOS dashboards — SHIL links to them.

### Acceptance criteria
1. `shil_subsystems` seeded with ≥ 15 components; all probes return a status row each cron tick.
2. A synthetic injected failure (e.g. fake stalled creative job) opens an incident within ≤ 5 min and a recovery row within the same cycle.
3. After recovery, validator stamps `validation_passed=true` and `mttr_seconds` recorded.
4. Admin page renders live state with zero console errors.
5. Implementation report PDF + JSON exist and `manifest.json` updated.
6. No regressions in test suite (407 passed baseline holds).

### Technical notes
- All new tables follow the `CREATE → GRANT → ENABLE RLS → POLICY` order.
- All new edge functions: `verify_jwt = false` (default) with in-code admin-header check via `admin_secrets` for orchestrator/recoverer manual triggers; cron uses the standard cron header allow-list (matches existing orchestrators).
- Recoverer maps playbook → handler via a static allow-list object — no dynamic eval, no user-supplied function names.
- All probe outputs hashed into a deterministic `signature_hash` for learning + recurrence detection.
- MTTR/MTTD computed from `detected_at` / `recovered_at` timestamps; rolled up nightly into `shil_metrics_daily`.
