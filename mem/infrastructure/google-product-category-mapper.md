---
name: google-product-category-mapper
description: Canonical mapper that assigns the correct numeric Google Product Category ID + taxonomy path to every product based on name + category + description.
type: feature
---
**Canonical source:** `supabase/functions/_shared/google-product-category.ts`
**Frontend mirror:** `src/lib/google-product-category.ts` (must stay byte-identical except header).

API:
- `classifyGoogleProductCategory(name, category?, description?) → GpcMatch`
- `getGoogleProductCategoryId(...)` / `getGoogleProductCategoryPath(...)`
- `GpcMatch.confident=true` when a sub-category rule matched (not just species fallback).

Wired into:
- `supabase/functions/google-shopping-feed` — XML `<g:google_product_category>` numeric ID
- `supabase/functions/export-merchant-feed` — confident match takes priority over legacy `correctCategory()` + `GCAT` lookup; legacy stays as fallback for low-confidence cases

Sub-categories detected: cat trees, litter boxes, litter accessories, cat furniture/perch/hammock, cat beds/toys/carriers/bowls/grooming/collars; dog beds (incl. orthopedic/memory foam), toys, leashes/harnesses/collars, bowls/slow feeders, houses, kennels/crates, carriers/strollers/car seats, grooming, apparel, training pads, waste bags, safety gates; cross-species pet strollers/carriers/feeders.

Bug fix: `Dog Carriers` now correctly maps to id `6980` (was incorrectly `6981` = Dog Houses).