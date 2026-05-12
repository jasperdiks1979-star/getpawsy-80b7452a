---
name: CTA Copy Cohort Engine (Phases 22-33)
description: Per-cohort CTA copy auto-election with Wilson LB, guardrails, exploration budget, and min-traffic gate
type: feature
---
End-to-end loop for cohort-aware CTA copy on /go (TikTok bio funnel):

**Resolution priority** (src/hooks/useCtaCopyWinner.ts):
1. Exploration budget (10% of sessions, sticky per session) → random non-winner, source='exploration'
2. Learned cohort winner from cta_copy_winners_by_hook (skipped if guardrail_blocked)
3. Hardcoded HOOK_FAMILY_COPY_PREFERENCE seed
4. Global elected winner (cta_copy_winners)
5. Build-time DEFAULT_COPY_LABEL

**Election** (cta-copy-winner-elector-by-hook, hourly):
- Window: 48h, MIN_IMPRESSIONS=30 per variant
- Rank by Wilson lower bound (95% CI)
- Significance gate: skip if winner LB < runner-up UB (prevents flip-flop)
- Pin TTL: 7 days, auto-decay logged to cohort_copy_pin_history

**Guardrails** (24h window):
- CTR guard: cohort CTR < 70% of global CTR (≥60 imps) → guardrail_blocked
- Min-traffic gate: cohort total <40 imps/24h → guardrail_blocked (low_traffic)
- Auto-clear when cohort recovers AND traffic ≥40

**Audit:** cohort_copy_pin_history logs pin/unpin/decay/guardrail/guardrail_clear with actor + reason.

**Admin UI:** src/components/admin/market-intelligence/tabs/CohortCopyWinnersTab.tsx
