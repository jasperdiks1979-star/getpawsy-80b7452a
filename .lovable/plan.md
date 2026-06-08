# Pinterest URL Recovery + Image↔Product Consistency Audit

Two strict safety rules drive this revision:

1. **Recover before replace.** Replacement pins are only created when the resolver, slug history, alias map, and similar-product matcher all fail. Existing pins keep their SEO value, saves, clicks, impressions, and rankings whenever a 308 redirect can land the click on a live PDP.
2. **Image must match product (≥80) before any future publish.** A pin-image vs product audit gates the publish pipeline going forward.

No checkout, Stripe, pricing, theme, or SEO copy changes.

---

## Architecture

```text
Pinterest click ─▶ /go|/products|/collections|/legacy|/redirect|/old-product/*
                       │
                       ▼
              pinterest-url-resolver (shared)
   exact → slug-history → alias → sku → cj-map → similar → category → 404
                       │
                       ▼
              308 → /products/{current_slug}?<utm preserved>

Future publish ─▶ pinterest-destination-validator (uses resolver)
              + pinterest-image-product-match (≥80 required)
              ─▶ allowed ▷ cron worker posts
```

---

## Phase 1 — Audit (read-only, no pin changes)

`pinterest-url-audit` edge function walks every `pinterest_pin_queue` row (all statuses). For each pin records into new `pinterest_pin_audit`:

- `pinterest_pin_id`, `destination_url`, resolver step that succeeded, `final_resolved_url`, live `http_status`, `product_exists`, `product_active`, `product_in_stock`, `duplicate_product`, `category`, `repair_strategy`.

Report buckets (stored in `pinterest_pin_audit_runs.summary`):
- valid_pins, broken_pins, missing_products, oos_products, inactive_products
- **recoverable_via_redirect**, **recoverable_via_slug_history**, **recoverable_via_alias**, **recoverable_via_similar**, **recoverable_via_category**
- **requires_replacement** (only this bucket is eligible for replacement pins)

## Phase 2 — Recovery resolver

`supabase/functions/_shared/pinterest-url-resolver.ts` with strict 8-step ladder (exact → slug history → alias → sku → cj map → similar → category → 404). Always preserves UTM, `pin_mode`, `hook`, `intent`, `pin_id`, `gclid`, `fbclid`.

## Phase 3 — Slug history + alias

New tables (service-role write, anon read):

```sql
product_slug_history(id, product_id, old_slug UNIQUE, current_slug, reason, created_at)
product_aliases(id, product_id, alias UNIQUE, kind: slug|sku|external_sku|legacy_path, created_at)
```

Trigger on `products.slug` change auto-inserts into history. Migration backfills by scanning historical `pinterest_pin_queue.destination_link` slugs against current catalog (fuzzy match ≥ 0.85 + same category required, otherwise left unmapped — never guess).

## Phase 4 — Redirect engine

`pinterest-redirect` edge function. `public/_redirects` proxies `/go/*`, `/legacy/*`, `/old-product/*`, `/redirect/*` to it (308). SPA shim in `src/App.tsx` for client-side navigation parity. Query strings always preserved verbatim.

## Phase 5 — Pin repair sweep (no API edits, no replacements yet)

`pinterest-pin-repair` updates `pinterest_pin_queue` rows where the resolver succeeded:
- `final_resolved_url`, `validation_status='valid'`, `repaired_at=now()`, `repair_strategy=<step>`.
- Posted pins stay posted — the redirect handles live clicks.
- Rows where resolver returned 404 → `repair_strategy='needs_replacement'`. No pins created yet.

## Phase 6 — Image ↔ Product consistency audit

New function `pinterest-image-product-match` + table `pinterest_pin_image_match`. For every pin:

Inputs compared:
- pin image (URL from `pinterest_pin_queue.image_url`)
- product featured + gallery (`products.image_url`, `product_media`)
- product title, category, tags, description

Scoring (0–100), weighted:
- 40 — Lovable AI vision verdict (`google/gemini-2.5-flash`) classifying pin image vs product reference image: `exact_match | close_match | partial_match | mismatch`
- 25 — category alignment (pin's inferred niche vs product category — reuse `_shared/pinterest-style-dna.ts` `detectNiche`)
- 20 — title keyword overlap (Jaccard on tokens, stopwords stripped)
- 15 — tag/description keyword overlap

Verdict bucket: `exact_match (≥90)`, `close_match (80–89)`, `partial_match (60–79)`, `mismatch (<60)`. Anything `<80` is flagged.

Report: counts per bucket + per-pin scores + reasons.

## Phase 7 — Replacement gate (only after audits)

A replacement pin is enqueued **only if all of**:
- `repair_strategy='needs_replacement'` (Phase 5), **OR** image match `<60`,
- AND the original product is gone or has no viable redirect target,
- AND no live `/products/{current_slug}` resolves.

Replacements go in as `pinterest_pin_queue.status='draft'`, `replacement_for_pin_id=<old>`, human approval required (existing `bulk_approve` flow). Never automatic, never duplicating a working pin.

## Phase 8 — Future protection

- `pinterest-destination-validator` calls the resolver — reject reasons: `destination_404`, `product_not_found`, `product_inactive`, `product_oos`, `wrong_destination_url`.
- `pinterest-cron-worker` additionally requires `image_match_score >= 80` (sourced from `pinterest_pin_image_match`). Drafts without a match score get scored on-the-fly before publishing.
- Creative-director keeps emitting canonical `/products/{slug}` URLs only.

## Phase 9 — Admin dashboard

`/admin/pinterest-url-recovery` (lazy-loaded, admin-gated):

- KPI tiles: total / working / broken / recoverable-by-redirect / recoverable-by-slug / recoverable-by-alias / requires-replacement / image-match<80.
- Tabs: **URL Recovery** and **Image Consistency**.
- Per-pin table: Pinterest ID, image thumb, destination, final URL, HTTP, repair strategy, image-match score + bucket, "Re-resolve" / "Re-score" buttons.
- Action buttons (admin only): Run URL audit · Run repair sweep · Run image audit · Queue replacements for non-recoverable.

## Phase 10 — Execute & report

Order (single button + curl-runnable):
1. URL audit → publish report.
2. Repair sweep → live redirects working.
3. URL audit re-run → verify ≥95% historical posted pins resolve HTTP 200.
4. Image audit → score every pin.
5. **Pause for human review of `requires_replacement` and `mismatch` buckets.**
6. Only after explicit approval: enqueue replacement drafts.

Success criteria:
- ≥95% historical posted pins resolve to HTTP 200 via redirect or direct match.
- 0 future pins publish with destination !200 or image-match <80.
- 0 unnecessary replacements (every replacement has a documented `requires_replacement` reason).

---

## Files

**Create**
- `supabase/migrations/<ts>_pinterest_url_recovery.sql` — slug-history, aliases, pin-audit, image-match tables + trigger + RLS + GRANTs
- `supabase/functions/_shared/pinterest-url-resolver.ts`
- `supabase/functions/pinterest-redirect/index.ts`
- `supabase/functions/pinterest-url-audit/index.ts`
- `supabase/functions/pinterest-pin-repair/index.ts`
- `supabase/functions/pinterest-image-product-match/index.ts`
- `src/pages/admin/PinterestUrlRecoveryPage.tsx`

**Edit**
- `supabase/functions/_shared/pinterest-destination-validator.ts` (use resolver)
- `supabase/functions/pinterest-cron-worker/index.ts` (new reject reasons + image-score gate)
- `src/App.tsx` (lazy admin route + /go shim)
- `public/_redirects` (legacy paths → edge function 308)
- memory note for resolver + image-match contract

---

## Out of scope

Checkout, Stripe, pricing, theme/design, SEO copy, new tracking pixels, mass replacement pin generation without human approval.

---

**Approve to proceed.** I'll ship in two reviewable batches:

- **Batch A:** Phases 1–5 (migration + resolver + slug history + redirect engine + URL audit + repair sweep + dashboard skeleton). Read/redirect only — zero risk to existing pins.
- **Batch B:** Phases 6–10 (image audit + validator/worker gates + replacement queue + final report). Runs only after Batch A's report shows recovery numbers.