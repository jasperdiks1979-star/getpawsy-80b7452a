# Revenue Operating System — Governance Audit
_Date: 2026-06-28_

## Maturity
**LEVEL 2 — Operational Ledger + Outcome Loop** (up from Level 1).

## Single source of truth
- Table: `public.governance_decision_log` (only governance table — no parallel logs).
- Writers: `public.gov_record_decision()` / `public.gov_update_outcome()` (SECURITY DEFINER, dedupe-enforced).
- Client helper: `src/lib/governanceLedger.ts`.
- Server helper: `supabase/functions/_shared/governanceLedger.ts`.
- Operator: `supabase/functions/governance-operator` (`action=evaluate` | `action=briefing`).
- Cron: `governance-operator-nightly` @ 04:15 UTC (jobid 237) — closes pending decisions older than 24h with real `orders` evidence.

## Engine integrations (Phase: connect existing systems)
| Engine | Wired | Path |
|---|---|---|
| AI CEO | ✅ | `AiCeoPage.triggerLoop` → one row per recommendation, deduped by `ai_ceo:<rec_id>` |
| Revenue AI (Revenue Brain) | ✅ | `RevenueBrainPage.run` → `revenue_brain:<action>:<hour>` |
| Commander (Creative Approvals) | ✅ | `CreativeCommandPage.approveToQueue` → `creative_approve:<asset>` |
| BOS | ✅ | Bootstrap row + future strategic decisions through `recordDecision` |
| Executive Board / Guardian / Organic Intelligence / Growth Lab / Pinterest Engine / SEO Engine / Pricing / Inventory / Email / Analytics | 🟡 Helper-ready; call sites added incrementally as those flows next produce a strategic decision. No parallel tables. |

## Outcome loop
`governance-operator` (evaluate) computes `actual_value` from `orders.total_amount` in the decision-to-now window, sets `outcome ∈ {success, partial, failure, neutral}`, writes `roi = actual/expected`, and flips `learning_status → evaluated`. Briefing aggregates per-engine accuracy = success / evaluated.

## Anti-duplication guarantees
- `governance_decision_log.dedupe_key UNIQUE` — repeat writes return existing id.
- All integrations pass a stable `dedupeKey`.
- No new tables added in this phase.

## Evidence (live DB at audit time)
- Rows in ledger: `1` (bootstrap `bos/phase1_smoke`, id `7c1c7e0a-…`).
- Future rows will appear automatically the next time AI CEO / Revenue Brain / Commander run.
- Nightly evaluator scheduled.

## Highest-ROI next actions (evidence-only)
1. Trigger AI CEO loop once to populate first wave of real recommendations → ledger rows.
2. Approve a Pinterest creative from Commander → first commander ledger row.
3. Let the nightly evaluator close them at 04:15 UTC; review briefing.

## Stop conditions honoured
No new directives. No new core AI layers. No new tables. No duplicated logs. Every future engine reuses `recordDecision` / `updateOutcome`.