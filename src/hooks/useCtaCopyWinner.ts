/**
 * useCtaCopyWinner — fetches the auto-elected winning copy label per
 * (placement, mode) from `cta_copy_winners`. While the network round-trip
 * is in flight we surface the build-time DEFAULT_COPY_LABEL so the page
 * never renders a blank button.
 *
 * The elector runs server-side (cta-copy-winner-elector edge function)
 * every hour and only promotes a label when ALL candidate variants have
 * ≥50 impressions in the last 48h. That keeps the winner stable for cold
 * TikTok traffic and prevents copy from flipping on noise.
 *
 * Returns a resolver: `pickCopy(placement, mode)` → `{ label, text }`,
 * which the page passes to `<TikTokDeepLinkButton label={text} />`. The
 * label string is also surfaced so it can be stamped on every CTA event
 * for downstream attribution.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  resolveCohortCopy,
  resolveCtaCopyText,
  type CtaCopyMode,
  type CtaPlacement,
} from '@/lib/ctaCopyRegistry';
import { useVisitorHook } from '@/hooks/useVisitorHook';

type WinnerMap = Partial<Record<CtaPlacement, Partial<Record<CtaCopyMode, string>>>>;
/** placement → mode → hook_family → label (Phase 24 learned winners). */
type HookWinnerMap = Partial<
  Record<CtaPlacement, Partial<Record<CtaCopyMode, Record<string, string>>>>
>;

export function useCtaCopyWinner() {
  const [winners, setWinners] = useState<WinnerMap>({});
  const [hookWinners, setHookWinners] = useState<HookWinnerMap>({});
  const [loading, setLoading] = useState(true);
  // Phase 23 — visitor cohort resolved from mi_audience_clusters.
  // When present, the winning hook_family overrides the auto-elected
  // label per placement/mode (see HOOK_FAMILY_COPY_PREFERENCE). Falls
  // through gracefully if no cohort match exists.
  const { hook } = useVisitorHook();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [globalRes, hookRes] = await Promise.all([
          supabase.from('cta_copy_winners').select('placement, mode, winning_label'),
          supabase
            .from('cta_copy_winners_by_hook')
            .select('placement, mode, hook_family, winning_label, guardrail_blocked'),
        ]);
        if (cancelled) return;
        if (globalRes.error || !globalRes.data) {
          setLoading(false);
          return;
        }
        const next: WinnerMap = {};
        for (const row of globalRes.data) {
          const p = row.placement as CtaPlacement;
          const m = row.mode as CtaCopyMode;
          if (!next[p]) next[p] = {};
          next[p]![m] = row.winning_label as string;
        }
        setWinners(next);

        if (!hookRes.error && hookRes.data) {
          const nextHook: HookWinnerMap = {};
          for (const row of hookRes.data) {
            // Phase 30 — guardrail: if a cohort is currently underperforming the
            // global winner, skip the cohort override so the resolver falls back
            // to the global elected winner.
            if ((row as any).guardrail_blocked) continue;
            const p = row.placement as CtaPlacement;
            const m = row.mode as CtaCopyMode;
            const fam = row.hook_family as string;
            if (!nextHook[p]) nextHook[p] = {};
            if (!nextHook[p]![m]) nextHook[p]![m] = {};
            nextHook[p]![m]![fam] = row.winning_label as string;
          }
          setHookWinners(nextHook);
        }
      } catch {
        /* silent — defaults will win */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickCopy(placement: CtaPlacement, mode: CtaCopyMode) {
    const electedLabel = winners[placement]?.[mode];
    const hookFamily = hook?.hook_family ?? null;
    // Priority:
    //   1. learned cohort winner (Phase 24 — cta_copy_winners_by_hook)
    //   2. hardcoded HOOK_FAMILY_COPY_PREFERENCE seed (Phase 23)
    //   3. global elected winner (cta_copy_winners)
    //   4. build-time DEFAULT_COPY_LABEL
    const learnedCohortLabel = hookFamily
      ? hookWinners[placement]?.[mode]?.[hookFamily]
      : undefined;
    let resolved: { label: string; text: string };
    let finalSource: 'cohort' | 'elected' | 'default';
    if (learnedCohortLabel) {
      resolved = resolveCtaCopyText(placement, mode, learnedCohortLabel);
      finalSource = 'cohort';
    } else {
      const r = resolveCohortCopy(placement, mode, hookFamily, electedLabel);
      resolved = { label: r.label, text: r.text };
      finalSource = r.source;
    }
    return {
      label: resolved.label,
      text: resolved.text,
      source: finalSource,
      hook_family: hook?.hook_family ?? null,
      hook_source: hook?.source ?? null,
    };
  }

  return { pickCopy, loading, hook };
}