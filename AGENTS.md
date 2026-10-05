
- Never query cron.job_run_details by start_time alone (MIN/MAX, date filters/sorts, per-job time summaries, "remaining old rows?"); always bound by indexed runid first (e.g. runid > max(runid) - N). Why: only runid is indexed and platform owns the table; unbounded diagnostics caused ~95% of its heavy reads (2026-09-25).
- For one-off organic Pinterest waves, target exact creative IDs in the PCIE2 assembler and exact queue IDs in the PCIE2 publisher; never drain unrelated READY pins. Why: a whole-queue drain can publish content outside a narrow approval.

- Spreadsheet exports use src/utils/excelExport.ts (JSZip); do not re-add xlsx. Why: xlsx >=0.19 is off-npm (scanner cannot parse it) and 0.18.5 carries two high advisories.
- Homepage featured products must pass active, positive-stock, non-duplicate, merch-visible, non-blocked gates. Why: a technically purchasable PDP is not sufficient when catalog merchandising has explicitly blocked the product.
- SEO indexability (sitemap + prerender) comes from scripts/seo-indexability.mjs, which reads the existing TS policy sources; prerendered pages are written as <route>/index.html. Why: one policy for sitemap, raw HTML and runtime, and the host only resolves directory indexes.
