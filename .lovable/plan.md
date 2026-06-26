# Pinterest Zero-Cleanup, Quality Firewall & Full Audit

This is a destructive, multi-system operation across ~939 published pins, ~25 PCIE2 tables, 1,514 creatives, queues, crons, storage, and edge functions. Before I touch anything, I need approval on **scope, deletion authority, and execution order**, because once pins are removed they cannot be restored from Pinterest.

Safety locks stay engaged the entire run:
- `pinterest_publishing_global_stop = true`
- `pcie2_publish_enabled = false`
- No Step 6 enablement
- All mutations logged to `pinterest_cleanup_audit` + new `pinterest_zero_cleanup_runs`

---

## Stage A — Read-only inventory & audit (no mutations)

1. **Phase 1 inventory** — snapshot every Pinterest entity we know about: `pinterest_pins`, `pinterest_pin_queue`, `pinterest_publish_queue`, `pcie2_creatives`, `pcie2_publish_queue`, `pinterest_video_*`, boards, sections. Pull live Pinterest counts via `/v5/boards`, `/v5/pins?page_size=250` paginated, and reconcile against DB. Record orphans (in DB, not on Pinterest) and ghosts (on Pinterest, not in DB).
2. **Phase 2 pin quality audit** — score every live pin using existing `pinterest-integrity-guard`, `media_audit`, `pinterest_pin_audit`, plus a new Gemini 2.5 Flash multimodal pass scoring: image_quality, product_match, title_match, description_match, brand_consistency, ctr_potential, duplicate_signature (pHash + text embedding). Write to new `pinterest_zero_audit_pins(pin_id, verdict, scores jsonb, reasons text[], evidence_url)`. Verdict ∈ KEEP / REGENERATE / DELETE / ARCHIVE / BLOCK.
3. **Phase 5–6 SEO + Visual DNA audit** — reuse `pcie2-learning-engine` embeddings; flag near-duplicates (cosine > 0.92) and keyword spam.
4. **Phase 7–9 system audit** — verify PCIE2 subsystems, cron schedules, worker heartbeats, Pinterest token scopes, queue depths, orphan storage objects under `pinterest-ads/`, `cinematic/`, `pcie2/`. Read-only.
5. **Deliverable A:** `2026-06-26-pinterest-zero-audit.pdf/json` with full counts, sample evidence, and the proposed delete/archive list. **Stop and wait for your approval before Stage B.**

## Stage B — Destructive cleanup (only after you approve Stage A report)

6. **Phase 3 delete** — for every pin marked DELETE: call `DELETE /v5/pins/{id}` (requires `pins:write` — see open blocker below), then mark DB row `status='deleted_zero_cleanup'`. Batch 50/min to respect rate limits. Archive verdicts go DB-only (`status='archived'`, no Pinterest call).
7. **Phase 4 product validation + repair** — for KEEP pins with fixable metadata (wrong UTM, stale slug, wrong board), patch via `pinterest-metadata-repair` (still blocked by `pin_edit` scope per `2026-06-25-pinterest-metadata-repair.json` — will report blocked rows if scope still missing).
8. **Phase 8 DB cleanup** — purge orphan `pcie2_creative_jobs` (status=failed > 7d), zombie workers, unused storage objects with no DB reference (move to `_quarantine/` prefix first, hard-delete after 7d).

## Stage C — Quality Firewall (Phases 10–11) — additive, non-destructive

9. New shared module `supabase/functions/_shared/pinterest-quality-firewall.ts` aggregating existing guards (`pinterest-integrity-guard`, `media_integrity`, governor, diversity, Evolution Guard v2) + new checks: product↔title semantic match, CTR prediction (`pinterest_pin_predictions`), grammar/spell (Gemini), visual fingerprint vs `pcie2_creatives.visual_dna_hash`.
10. Wire firewall as **only** gate in `pcie2-publisher` and at insert into `pinterest_pin_queue` / `pcie2_publish_queue`. Fail-closed, no override.
11. New table `pinterest_firewall_decisions(pin_ref, checks jsonb, verdict, reasons, created_at)` for forensics.

## Stage D — Final report (Phase 12)

12. Generate `2026-06-26-pinterest-zero-cleanup-final.pdf/json` with all counts, Pinterest Health Score (0–100), expected CTR/engagement uplift estimates derived from removed-vs-kept benchmark deltas. Update `manifest.json`.

---

## Known blockers I need a decision on before starting

1. **Pinterest `pins:write` / `pin_edit` scope is still NOT granted** (per `2026-06-25-pinterest-metadata-repair.json` — Pinterest returned restricted-feature error). Without it I cannot DELETE pins from Pinterest or PATCH titles/descriptions. Options:
   - **(a)** Proceed with **DB-only** cleanup (mark deleted/archived, hide from dashboards, leave live on Pinterest). Honest and safe but the bad pins keep serving impressions.
   - **(b)** Pause Stage B until Pinterest grants the scope upgrade, finish Stages A + C + D now.
   - **(c)** Use Pinterest UI bulk-delete manually for the worst offenders after I export the list.
2. **Deletion volume:** the last audit said 98.4% of 382 pins failed quality. Across all 939 we may be deleting 700–900 pins. Confirm you want that scale, or set a cap (e.g. delete only `verdict=DELETE` with `confidence ≥ 0.95`, archive the rest).
3. **Live multimodal scoring of ~939 pins via Gemini 2.5 Flash** ≈ 939 image+text calls. Roughly $4–8 in gateway credits. OK?
4. **Cron scope:** I will NOT re-enable any publishing cron. Confirm I may unschedule any *additional* legacy crons I discover during the audit.

## Technical details

- All new tables follow the GRANT → RLS → policy pattern with `service_role` full + `authenticated` read for admins via `has_role(auth.uid(),'admin')`.
- Pinterest API calls use existing `pinterest_connection` token + `getPinterestApiBase`.
- All Stage B mutations behind a single `dry_run` flag defaulting to `true`; I will run dry-run first, attach the diff to the Stage A report, and only flip to `dry_run=false` after your go.
- No changes to `pinterest_publishing_global_stop` or `pcie2_publish_enabled`.

---

**Please confirm:**
- Which blocker-1 option (a / b / c)?
- Delete cap or full scale?
- Approve ~$4–8 Gemini multimodal spend?
- Approve unscheduling any newly-found legacy crons?

Once you answer, I execute Stage A end-to-end and return with the audit report for your Stage B go/no-go.
