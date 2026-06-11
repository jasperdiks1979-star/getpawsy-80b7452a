---
name: Pinterest Competitor Intelligence Engine
description: Nightly competitor pin discovery + pattern extraction + opportunity ranking + original draft generation via Creative Director
type: feature
---
**Edge function:** `pinterest-competitor-intel` (service-role). Actions: `scan`, `generate_drafts`, `run_full`. Accepts `{action, dry_run, limit, product_id}`.

**Cron:** id 129, `15 3 * * *` UTC (30 min after Brain).

**Tables:**
- `pinterest_competitor_pins` (existing, extended) — metadata-only competitor pin rows. Unique on `(product_id, title_hash, source_url)`.
- `pinterest_competitor_patterns` — aggregated `(pattern_type, pattern_value, niche_key)` with rolling `avg_success`.
- `pinterest_competitor_opportunities` — per-product ranked gap score, components, top_patterns, generated_drafts.
- `pinterest_competitor_runs` — per-run counters + health flags.

**Hard caps:** 25 products / run, 20 candidates / product, 100 drafts / run. Product filter: `is_active=true AND image_url NOT NULL AND (margin_percent>=0.3 OR margin_percent IS NULL)`.

**Pipeline:** Firecrawl v2 search (US, EN) → cheap Gemini Flash classification (hook/benefit/cta/visual/keywords/engagement/freshness/intent) → success score 0–100 (relevance 25 + engagement 20 + keyword 15 + intent 10 + freshness 10 + 4×5 fixed) → upsert pins → pattern aggregation → opportunity rank (avg_success + 30) → delegate to `pinterest-creative-director` (`run_full`, `seo_mode=true`, `source=competitor_intel`) → drafts land in `pinterest_pin_queue` with UTM `utm_source=pinterest&utm_medium=social&utm_campaign=competitor_intel`.

**Copyright safety:** title/description samples capped at 200 chars, no images/video stored, AI generator gets pattern hints only (not raw competitor copy).

**Dashboard:** `/admin/pinterest-spy` — dry-run / run / generate / CSV export, last-run health badges, top patterns, top opportunities.