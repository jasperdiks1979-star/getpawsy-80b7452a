/**
 * CTA copy registry — single source of truth for the candidate labels
 * the auto-winner system can rotate through on /go.
 *
 * Each placement has a CALM bank (above-the-fold, pre-urgency reveal)
 * and an URGENT bank (post-60% scroll, after `lp_urgency_revealed`).
 * The labels are intentionally short and TikTok-cold-traffic-tuned.
 *
 * The auto-elector edge function picks the winning LABEL per
 * (placement, mode) based on 48h CTR (≥50 impressions per variant).
 * Only the visible button TEXT changes — UTM, campaign, content,
 * deep-link target and tracking refs are NEVER touched, so funnel
 * attribution stays stable across copy swaps.
 */
export type CtaPlacement = 'bio_primary' | 'bio_secondary' | 'bio_sticky';
export type CtaCopyMode = 'calm' | 'urgent';

export interface CtaCopyOption {
  /** Stable id stored in cta_copy_winners.winning_label and event payloads. */
  label: string;
  /** Visible button text. Only this changes — never the link/UTM. */
  text: string;
}

export const CTA_COPY_REGISTRY: Record<
  CtaPlacement,
  Record<CtaCopyMode, CtaCopyOption[]>
> = {
  bio_primary: {
    calm: [
      { label: 'get_yours_now', text: 'Get Yours Now →' },
      { label: 'see_it_in_action', text: 'See How It Works →' },
      { label: 'shop_the_box', text: 'Shop the Box →' },
    ],
    urgent: [
      { label: 'claim_limited', text: '👉 Claim Yours — Limited Stock' },
      { label: 'order_now_us', text: '🚚 Order Now — Ships from US' },
      { label: 'get_before_restock', text: '⏱ Get Yours Before Restock' },
    ],
  },
  bio_secondary: {
    calm: [
      { label: 'get_yours_now', text: 'Get Yours Now →' },
      { label: 'try_it_today', text: 'Try It Today →' },
      { label: 'shop_the_box', text: 'Shop the Box →' },
    ],
    urgent: [
      { label: 'order_today_24h', text: '🔥 Order Today — Ships in 24h' },
      { label: 'claim_limited', text: '👉 Claim Yours — Limited Stock' },
      { label: 'lock_in_pricing', text: '🛡 Lock In Today’s Price' },
    ],
  },
  bio_sticky: {
    calm: [
      { label: 'get_yours_now', text: 'Get Yours Now →' },
      { label: 'tap_to_shop', text: 'Tap to Shop →' },
      { label: 'see_the_box', text: 'See the Box →' },
    ],
    urgent: [
      { label: 'tap_to_claim', text: '⚡ Tap to Claim Yours' },
      { label: 'claim_limited', text: '👉 Claim Yours — Limited Stock' },
      { label: 'order_today_24h', text: '🔥 Order Today — Ships in 24h' },
    ],
  },
};

/** Default fallback label used while the winners fetch is in flight. */
export const DEFAULT_COPY_LABEL: Record<CtaPlacement, Record<CtaCopyMode, string>> = {
  bio_primary:   { calm: 'get_yours_now', urgent: 'claim_limited' },
  bio_secondary: { calm: 'get_yours_now', urgent: 'order_today_24h' },
  bio_sticky:    { calm: 'get_yours_now', urgent: 'tap_to_claim' },
};

/** Resolve a (placement, mode, label) tuple to its visible text. */
export function resolveCtaCopyText(
  placement: CtaPlacement,
  mode: CtaCopyMode,
  label: string | undefined | null,
): { label: string; text: string } {
  const bank = CTA_COPY_REGISTRY[placement][mode];
  const fallback = bank.find((o) => o.label === DEFAULT_COPY_LABEL[placement][mode]) ?? bank[0];
  if (!label) return fallback;
  const match = bank.find((o) => o.label === label);
  return match ?? fallback;
}

/** All known labels for a placement+mode — used by the elector to enumerate. */
export function copyLabelsFor(placement: CtaPlacement, mode: CtaCopyMode): string[] {
  return CTA_COPY_REGISTRY[placement][mode].map((o) => o.label);
}