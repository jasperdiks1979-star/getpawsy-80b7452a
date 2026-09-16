# GetPawsy Commercial Rebuild — Phase 0: Read-Only Catalog Audit

**Date:** 2026-09-16 · **Mode:** READ-ONLY. Nothing was changed, hidden, deleted, repriced, deployed or published.

## Artefacts

| File | Contents |
| --- | --- |
| `catalog-audit.csv` | All 774 products, one row each, every captured field + all 11 score components + gates + role |
| `catalog-audit.json` | Same data as structured JSON |
| `summary.json` | Aggregate counts, gate counts, score distribution, top 25 |
| `scoring-model.md` | Exact scoring rules and hard-gate definitions |
| `findings.md` | Findings, cat-first shortlist shape, recommended next phase |

Reproduce: export the catalog with the psql query documented in `scoring-model.md`, then run
`node scripts/commercial-rebuild-audit.mjs /tmp/audit/products.json`. The script only reads.

## Headline numbers (evidence, from production)

- **774** products in the catalog; **432** active; **342** commercially visible (active, not duplicate, stock > 0).
- **440** have US stock; **236** have no stock anywhere and therefore no US delivery path.
- **773 / 774** have supplier cost on record → margin is measurable almost everywhere.
- **266** products pass every per-product hard gate.
- **220** cat products, **285** dog, **62** both, **207** unclassified.
- 90-day demand: **9,443** product views, **230** add-to-carts, **2** purchase events (one was the $2 live smoke test). Demand data is thin — treat traffic as a weak signal, not proof.

## Preliminary roles (not applied to the catalog)

| Role | Count |
| --- | --- |
| HERO_CANDIDATE | 48 |
| CORE_CANDIDATE | 348 |
| ACCESSORY_CANDIDATE | 56 |
| LONGTAIL | 157 |
| RETIRE_CANDIDATE | 165 |
