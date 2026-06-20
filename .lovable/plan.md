# GetPawsy Production Recovery + Revenue Engine Master Audit

This is a large, evidence-based audit. I want to confirm scope and a few rules before executing — the wrong assumption here can take down publishing, promotion, or orders.

## Scope (9 phases)

1. **System inventory** — every cron job, GH workflow, edge function, queue, worker. Status + last run + failure %.
2. **Pinterest audit** — connection, token, boards, pins (24h/7d/30d), duplicates, broken URLs.
3. **Video pipeline audit** — v3 / v4 / v5 job counts, success %, bottlenecks.
4. **Revenue Engine audit** — winner_products, scoring, top 50 promoted with revenue.
5. **Catalog health** — active/inactive/OOS/discontinued, restorability.
6. **Traffic audit** — GA4 / Pinterest / Stripe / server, funnel dropoff.
7. **Credit consumption audit** — where Lovable credits go, identify waste.
8. **Auto-healing** — repair broken crons, stuck queues, zombie systems. **Do NOT touch:** Stripe webhook, orders, customer data.
9. **Proof** — every claim cited with table + row counts + timestamps.

## How I'll execute

Read-only first across DB + edge logs + GH workflow state, then apply repairs **only where evidence is unambiguous**. Each repair logged to memory.

Method per phase:
- Phase 1: SQL on `cron_job_logs`, `job_runs`, `pinterest_pipeline_health_snapshots`, `cinematic_worker_heartbeats` + filesystem scan of `.github/workflows` + `supabase/functions`.
- Phase 2: SQL on `pinterest_connection`, `pinterest_boards`, `pinterest_pin_queue`, `pinterest_pins`, `pinterest_video_publish_log`, `pinterest_analytics_daily`. Live HEAD against destination URLs for sampled pins.
- Phase 3: SQL on `cinematic_v3_jobs`, `cinematic_v4_jobs`, `cv5_storyboards`, `cinematic_ad_jobs`. Stuck = status in (rendering/trimming/queued) > 2h.
- Phase 4: SQL on `winner_products`, `pinterest_revenue_attribution_v3`, `revenue_ai_pin_performance`, `orders`.
- Phase 5: SQL on `products`, `discontinued_products`, `product_global_inventory`.
- Phase 6: `pinterest_funnel_events`, `checkout_funnel_events`, `orders`, `gi_traffic_sessions`.
- Phase 7: `pinterest_credit_events`, `pinterest_credit_state`, `cron_job_logs` failure rates.
- Phase 8: Targeted repairs (see Auto-repair allowlist).
- Phase 9: Every number in the final report linked to its SQL.

## Auto-repair allowlist (safe, will execute without asking)

- Mark `cinematic_*_jobs` stuck in `rendering`/`trimming` > 6h as `failed` with reason `watchdog_stale`.
- Mark `pinterest_pin_queue` rows stuck in `processing` > 2h as `failed`.
- Deactivate products in `discontinued_products` that still have `is_active=true`.
- Archive `pinterest_pin_queue` drafts pointing to inactive products / 404 destinations.
- Clear `pinterest_video_queue` rows for assets whose source MP4 returns 404.
- Disable cron jobs with **100% failure rate over last 14 days AND > 50 attempts** (legacy zombies only). Will list before disabling.

## NOT auto-repaired (will only report, ask before changing)

- Stripe webhook + orders + customer data — never touched.
- Disabling any cron with <100% failure or with recent success.
- Deleting any product, pin, or SEO URL.
- Changing Revenue AI scoring weights or budgets.
- Changing publish-gate thresholds.
- Rotating any API token.

## Deliverable

Single final report with:
- Health Score 0–100 + 6 sub-scores
- Top 10 issues / quick wins / revenue opportunities
- Direct answers to the 8 closing questions
- Every claim cited to a SQL row count + timestamp
- Full list of repairs applied with before/after counts

## Out of scope

- Building new dashboards or UI for this audit.
- New edge functions or schema migrations (unless required to repair a confirmed broken queue).
- Anything Pinterest video Gold Reference related (still waiting on pin URL from prior turn).

## Confirm before I start

1. **Auto-repair allowlist above OK?** Especially: deactivating discontinued products that snuck back to active, and disabling 100%-failure crons.
2. **Time budget**: this audit is roughly 15–25 tool calls of SQL + log reading. Proceed in one pass, or want it phase-by-phase with checkpoints?
3. **Credit consumption (Phase 7)**: only the workspace billing admin can see Lovable credit usage. If `credits--get_credit_balance` returns permission denied for this role, I'll report Lovable-side credit proxies (Pinterest credit_state, render minutes, AI calls) instead — OK?
