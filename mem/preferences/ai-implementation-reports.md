---
name: AI implementation report after every run
description: After every completed implementation run, auto-generate a PDF + JSON report under public/admin-reports/ai-implementation/ and append to manifest.json; surface in Admin → Reports → AI Implementation Reports.
type: preference
---
**Rule:** Every implementation run is NOT complete until BOTH artifacts are generated and stored:

1. `public/admin-reports/ai-implementation/<YYYY-MM-DD>-<slug>.pdf` — professionally formatted report (reportlab).
2. `public/admin-reports/ai-implementation/<YYYY-MM-DD>-<slug>.json` — same data, machine-readable.
3. Update `public/admin-reports/ai-implementation/manifest.json` (prepend entry: slug, title, run_id, generated_at, status, score, pdf, json).

**PDF sections (required, in order):** Executive Summary · Implementation Summary · Files · Database · API Changes · AI Usage · Cloud Usage · Media · Pinterest · Quality Control · Performance · Security · Next Recommendations (High/Medium/Low) · Final Scorecard (overall + architecture, performance, reliability, automation, scalability, security, maintainability, ai_readiness, growth_readiness, all 0–100). Include screenshots/diagrams when available.

**JSON:** mirror the PDF content as structured data for future AI analysis.

**Surfacing:** Reports auto-appear in `/admin/reports` under the "AI Implementation Reports" section, which reads `manifest.json` at runtime. PDF preview + PDF/JSON download buttons per report.

**How to apply:** At the end of every run, write a Python reportlab script (model on `/tmp/gen_wave1_report.py` pattern) populating real values from the run, then update the manifest. QA the PDF by rendering pages to JPEG and inspecting before declaring the run complete.