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
  type CtaCopyMode,
  type CtaPlacement,
} from '@/lib/ctaCopyRegistry';
import { useVisitorHook } from '@/hooks/useVisitorHook';

type WinnerMap = Partial<Record<CtaPlacement, Partial<Record<CtaCopyMode, string>>>>;

export function useCtaCopyWinner() {
  const [winners, setWinners] = useState<WinnerMap>({});
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
        const { data, error } = await supabase
          .from('cta_copy_winners')
          .select('placement, mode, winning_label');
        if (cancelled || error || !data) {
          setLoading(false);
          return;
        }
        const next: WinnerMap = {};
        for (const row of data) {
          const p = row.placement as CtaPlacement;
          const m = row.mode as CtaCopyMode;
          if (!next[p]) next[p] = {};
          next[p]![m] = row.winning_label as string;
        }
        setWinners(next);
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
    const resolved = resolveCohortCopy(
      placement,
      mode,
      hook?.hook_family ?? null,
      electedLabel,
    );
    return {
      label: resolved.label,
      text: resolved.text,
      source: resolved.source,
      hook_family: hook?.hook_family ?? null,
      hook_source: hook?.source ?? null,
    };
  }

  return { pickCopy, loading, hook };
}