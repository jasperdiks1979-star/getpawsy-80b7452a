---
name: Pinterest priority-category hybrid cap
description: Priority categories (smart litter / cat-trees / cat-furniture / luxury beds / smart gadgets) combined max 40% of any growth-engine slate
type: constraint
---
**Rule:** `PRIORITY_CATEGORY_CAP = 0.4` in `_shared/pinterest-priority-categories.ts`. The old `PRIORITY_CATEGORY_FLOOR` name is now an alias for back-compat — same value, opposite meaning.

**Enforced in:** `pinterest-growth-engine` slate picker — 3-pass selection: (1) priority up to 40%, (2) non-priority fills ≥60%, (3) priority overflow only if non-priority pool exhausted. Per-category cap (`maxCategoryShare = 0.25`) still applies on top.

**Why:** Prior 70% floor caused Pinterest queue monoculture (39/40 queued pins shared one litter headline). Hybrid keeps Cat-Trees-focus SEO priority but forces creative breadth across Dogs/Toys/Feeding/etc.

**Do NOT revert to 70% floor.** Update Cat-Trees-focus memory if the SEO strategy changes — the cap is a publishing-volume rule only, not an SEO content rule.