
- Never query cron.job_run_details by start_time alone (MIN/MAX, date filters/sorts, per-job time summaries, "remaining old rows?"); always bound by indexed runid first (e.g. runid > max(runid) - N). Why: only runid is indexed and platform owns the table; unbounded diagnostics caused ~95% of its heavy reads (2026-09-25).
- For one-off organic Pinterest waves, target exact creative IDs in the PCIE2 assembler and exact queue IDs in the PCIE2 publisher; never drain unrelated READY pins. Why: a whole-queue drain can publish content outside a narrow approval.
