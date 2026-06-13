---
name: Pinterest Integrity Guard
description: Permanent pre-insert + pre-publish gate. Confidence <95% blocks. No emergency override.
type: constraint
---
**Module:** `supabase/functions/_shared/pinterest-integrity-guard.ts` — `verifyPinIntegrity()`.

**Wired in two places (fail-closed):**
- `pinterest-creative-director/index.ts` — inside `uploadAndInsertDraft`, after governor, before `pinterest_pin_queue.insert`. Throws on fail.
- `pinterest-cron-worker/index.ts` — top of per-pin publish loop, before QA + diversity gates. Marks row `status='rejected'`, `rejection_reason='integrity_guard_blocked'`, logs to `pinterest_post_logs`.

**Checks (all must pass; confidence ≥ 0.95 required):**
1. `destination_url` — must contain `/products/{slug}` + `utm_source=pinterest`.
2. `image_url` — present, HTTPS.
3. `product_exists` + `product_active` + `slug_match` against `products`.
4. `species_niche` + `species_title` — block when product.primary_species (cat|dog) contradicts niche or pin title tokens. `both`/`multi` products are species-agnostic.
5. `media_audit` — block if `product_media_audit` has critical/high `matches_title=false` row newer than `products.updated_at`. Stale audits (before last product correction) are ignored.

**No emergency override.** The previous `pinterest-emergency-publish` flags do NOT bypass this guard. To re-enable a blocked product, fix the underlying product record (rename, fix image, re-classify species) and the guard auto-passes on the next run.