---
name: Permanent Traffic-Quality Classifier (strict v2)
description: Session-level PROBABLE_HUMAN / POSSIBLE_HUMAN / BOT / INTERNAL classification, source class and commercial intent used by visitor analytics and CSV exports
type: feature
---

`src/lib/trafficQualityClassifier.ts` is the permanent classification layer for
visitor analytics. Additive only — never mutates or drops raw canonical rows.

Classes: `PROBABLE_HUMAN`, `POSSIBLE_HUMAN`, `PROBABLE_BOT_OR_AUTOMATION`,
`INTERNAL_OR_TEST`, `UNKNOWN`.

Strict rules that must not drift:
- Internal/test wins over everything: explicit flag, `__lovable_sha` /
  `__lovable_load_id` params, `lovable.dev` / `lovable.app` referrer,
  `/admin*` or `/dashboard*` landing → `INTERNAL_OR_TEST`, confidence 1.0.
- Burst guard: pageviews/second > 1 (or 0-2s desktop direct multi-pageview with
  no commerce) ⇒ `PROBABLE_BOT_OR_AUTOMATION`. Only hard commerce
  (ATC / checkout / purchase) overrides it.
- No single weak metric qualifies as human: `pv>=3` needs `duration>=5s`;
  `duration>=20s` needs a second signal (pv>=2, coherent source, or product
  engagement). A conversion is still NEVER required.
- Bot clusters are keyed on a behaviour fingerprint
  (`landing | device | duration bucket | pageviews | source_class`), never city.
  City alone never classifies a session as bot.
- Source class separates `PINTEREST_PAID` (needs UTM/ad click evidence) from
  `PINTEREST_ORGANIC`.
- Commercial intent 0-100: product view +15, ATC +25, checkout +25, purchase +40.
- Summary reports both `commerce_human` (probable only) and `commerce_expanded`
  (probable + possible). Zero commerce always stays zero.

Surfaces: `TrafficQualityBlock` (above `TrafficClassSplitPanel` on
`/admin/visitor-world-map-pro`) and additive CSV columns
(`TRAFFIC_QUALITY_CSV_HEADERS`) in the Visitor World Map export.
Realtime/live presence is labelled explicitly and is never a commercial KPI.

Strict baseline (last 10h, 1,209 sessions, 2026-08-28): 4 probable human,
118 possible human, 1,076 bot/automation, 10 internal, 1 unknown. 0 ATC,
0 checkout, 0 purchases — unchanged from raw, no inflation.
