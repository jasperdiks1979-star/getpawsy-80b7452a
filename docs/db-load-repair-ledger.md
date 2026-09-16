# Database load repair ledger (recurring jobs)

Evidence: `pg_stat_statements` showed the top DB consumers were repeated raw
reads of `canonical_events` (7,442 calls, mean 4.3 s, 8.9 h total), then
`canonical_sessions` (2,083 calls, mean 7.4 s) and `visitor_activity`
(2,505 calls, mean 2.7 s). Indexes already exist on all of these and the
tables are small (33–65 MB), so this is call-volume saturation from the
scheduled-job fleet, not a missing index. Under that load a simple storefront
catalog read took 4–80 s and intermittently returned 500/503/504.

Before: ~270 active jobs, 80 of them sub-hourly — 6 every minute, 2 every
2 min, 1 every 3 min, 23 every 5 min, 9 every 10 min, 16 every 15 min,
11 every 30 min (plus the 12-job `acw-*` warmer family).

After: 0 every minute, 0 every 2–3 min (one duplicate disabled, one moved to
5 min), 2 every 5 min, 4 every 10 min, 14 every 15 min, the rest at 30 min,
hourly or multi-hourly.

## Protected — untouched

`catalog-recovery-tick-5min`, `stock-refresh-monitor-every-10min`,
`process-scheduled-campaigns`, `revenue-alert-monitor`, `site-monitor-every-10min`,
`check-heartbeat-liveness`, `monitoring-p1-every-30min`, `alerting-hub-check`,
`marketing-job-worker`, `pinterest-capi-relay-every-10`, and every
checkout / payment / webhook / order-settlement / recovery / CJ / refund /
auth-security job.

## Changed (all reversible with `cron.alter_job(<jobid>, schedule := '<old>')`)

| jobid | job | before | after |
|---|---|---|---|
| 225 | analytics-health-probe-1min | `* * * * *` | `*/15 * * * *` |
| 65 | cinematic-ad-watchdog-60s | `* * * * *` | `*/15 * * * *` |
| 213 | pcie2-creative-worker-backstop | `* * * * *` | `*/15 * * * *` |
| 319 | pinterest-recovery-jobs-worker-tick | `* * * * *` | `*/10 * * * *` |
| 318 | pinterest-recovery-worker-tick | `* * * * *` | `*/10 * * * *` |
| 171 | pipeline-failure-retry-1min | `* * * * *` | `*/10 * * * *` |
| 279 | canonical-ingest-2min | `*/2 * * * *` | disabled (duplicate of 306) |
| 306 | canonical-ingest-recent-3min | `*/3 * * * *` | `*/5 * * * *` |
| 188 | product-intelligence-supervisor-2min | `*/2 * * * *` | `*/30 * * * *` |
| 343 | acw-1h-all | `*/5 * * * *` | `*/15 * * * *` |
| 344 | acw-1h-us | `1-59/5 * * * *` | `5-59/15 * * * *` |
| 345 | acw-24h-all | `2-59/5 * * * *` | `10-59/30 * * * *` |
| 346 | acw-24h-us | `3-59/5 * * * *` | `25-59/30 * * * *` |
| 347 | acw-7d-all | `4-59/10 * * * *` | `5 */2 * * *` |
| 348 | acw-7d-us | `9-59/10 * * * *` | `35 */2 * * *` |
| 349 | acw-14d-all | `6-59/10 * * * *` | `15 */4 * * *` |
| 350 | acw-14d-us | `11-59/10 * * * *` | `45 */4 * * *` |
| 351 | acw-30d-all | `8-59/15 * * * *` | `20 */6 * * *` |
| 352 | acw-30d-us | `13-59/15 * * * *` | `50 */6 * * *` |
| 353 | acw-90d-all | `17-59/30 * * * *` | `30 3 * * *` |
| 354 | acw-90d-us | `27-59/30 * * * *` | `30 4 * * *` |
| 337 | gp-analytics-cache-warm | `*/10 * * * *` | `*/30 * * * *` |
| 224 | acos-alert-notifier-5min | `*/5` | `*/15` |
| 223 | acos-health-watchdog-5min | `*/5` | `*/15` |
| 226 | analytics-alert-evaluator-5min | `*/5` | `*/30` |
| 269 | aos-resource-monitor-5min | `*/5` | `*/30` |
| 260 | arie-session-stitcher-5m | `*/5` | `*/15` |
| 307 | canonical-ingest-monitor-5min | `*/5` | `*/30` |
| 280 | canonical-refresh-5min | `*/5` | `*/15` |
| 320 | canonical-session-attribution-5min | `*/5` | `*/15` |
| 281 | canonical-validate-5min | `*/5` | `*/30` |
| 61 | cinematic-ad-alert-monitor | `*/5` | `*/30` |
| 94 | cinematic-ad-kick-pending-5min | `*/5` | `*/15` |
| 62 | cinematic-ads-auto-heal | `*/5` | `*/15` |
| 308 | cjie-build-5min | `*/5` | `*/30` |
| 309 | genesis-golden-customer-5min | `*/5` | `*/30` |
| 214 | pcie2-self-healer-5min | `*/5` | `*/30` |
| 241 | pinterest-verify-drain-5min | `*/5` | `*/15` |
| 170 | pipeline-health-monitor-5min | `*/5` | `*/30` |
| 235 | shil-orchestrator-5min | `*/5` | `*/30` |
| 177 | revenue-ai-queue-guard | `*/5` | `*/15` |
| 144 | pinterest-credit-probe-10min | `*/10` | `*/30` |
| 238 | pinterest-cron-worker-10min | `*/10` | `*/15` |
| 156 | pinterest-destination-guard-10min | `*/10` | `*/30` |
| 152 | pinterest-flow-monitor-10min | `*/10` | `*/30` |
| 268 | aos-orchestrator-15min | `*/15` | `*/30` |
| 261 | arie-validator-15m | `*/15` | `*/30` |
| 112 | cinematic-fidelity-auto-regen-15m | `*/15` | `0 * * * *` |
| 163 | cinematic-v3-auto-dispatcher | `*/15` | `*/30` |
| 162 | cinematic-v3-reaper | `*/15` | `0 * * * *` |
| 195 | cj-media-derivative-worker-15min | `*/15` | `*/30` |
| 59 | github-sync-check-15min | `*/15` | `0 * * * *` |
| 206 | pe-matrix-15min | `*/15` | `0 * * * *` |
| 207 | pe-operator-15min | `*/15` | `*/30` |
| 147 | pinterest-attribution-tick-15m | `*/15` | `*/30` |
| 316 | pinterest-autonomous-orchestrator-tick | `*/15` | `*/30` |
| 240 | pinterest-creative-factory-work-15min | `*/15` | `*/30` |
| 295 | pinterest-editor-in-chief-15min | `*/15` | `0 * * * *` |
| 140 | pinterest-revenue-engine-v2-archive-15min | `*/15` | `0 * * * *` |
| 210 | prie-auto-orchestrator-15min | `*/15` | `0 * * * *` |
| 48 | tracking-heartbeat-15min | `*/15` | `*/30` |
| 262 | arie-drop-detector-30m | `*/30` | `0 * * * *` |
| 103 | cinematic-performance-ingest-30min | `*/30` | `5 * * * *` |
| 288 | gv36-attribution-stitcher-30m | `*/30` | `0 * * * *` |
| 239 | pinterest-creative-factory-refill-30min | `*/30` | `10 * * * *` |
| 296 | prepublish-gate-simulate-30m | `*/30` | `20 * * * *` |
| 173 | revenue-ai-perf-rollup | `*/30` | `25 * * * *` |
| 49 | tracking-session-validator-30min | `*/30` | `0 * * * *` |
| 331 | wow-recovery-v3-dispatcher | `*/30` | `0 * * * *` |

No data was deleted; no prices, stock, orders, Stripe/CJ/Pinterest state or
customer data were touched. Only job cadence changed.
