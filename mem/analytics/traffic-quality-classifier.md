---
name: Permanent Traffic-Quality Classifier
description: Session-level PROBABLE_HUMAN / POSSIBLE_HUMAN / BOT / INTERNAL classification, source class and commercial intent used by visitor analytics and CSV exports
type: feature
---

`src/lib/trafficQualityClassifier.ts` is the permanent classification layer for
visitor analytics. Additive only — never mutates or drops raw canonical rows.

Classes: `PROBABLE_HUMAN`, `POSSIBLE_HUMAN`, `PROBABLE_BOT_OR_AUTOMATION`,
`INTERNAL_OR_TEST`, `UNKNOWN`.

Rules that must not drift:
- Human evidence: any commerce event (product view / ATC / cart / checkout /
  purchase), duration >= 20s, or >= 3 pageviews. A conversion is NOT required.
- Bot requires MULTIPLE weak synthetic signals (<=2s + <=2 pageviews + no
  referrer/UTM + desktop) or a bot UA. City alone (e.g. Ashburn) never
  classifies a session as bot.
- Internal/test wins over everything.
- Source class separates `PINTEREST_PAID` (needs UTM/ad click evidence) from
  `PINTEREST_ORGANIC` (plain pinterest referrer).
- Commercial intent 0-100: product view +15, ATC +25, checkout +25, purchase +40.
- Cluster boost only raises bot confidence for repeated city+device+landing
  patterns that are not human-heavy.

Surfaces: `TrafficQualityBlock` (rendered above `TrafficClassSplitPanel` on
`/admin/visitor-world-map-pro`) and additive CSV columns
(`TRAFFIC_QUALITY_CSV_HEADERS`) in the Visitor World Map export.
Realtime/live presence is labelled explicitly and is never a commercial KPI —
commercial performance uses 10h/24h windows.

Validation baseline (last 10h, 1065 sessions, 2026-08-28): 17.6% probable human,
80.8% probable bot/automation, 1.4% unknown, 0.2% internal. Zero commerce events
stayed zero — no inflation.
