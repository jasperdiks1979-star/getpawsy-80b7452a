/**
 * intentMatch — CI-3 client-side intent-match scorer.
 *
 * Decides how strongly a visitor's landing-page intent (Pinterest hook, ad
 * keyword, paid utm_source, organic referrer) aligns with the product they
 * just opened. The score gates which PDP variations the storefront shows so
 * we don't surface a "cooling" hero on a winter cat-tree shopper or override
 * the headline for a visitor who arrived from organic search.
 *
 * Pure & deterministic. No network calls, no AI. Reads only URL params and
 * the product category that the page already has in memory.
 */

import type { AdIntent } from '@/hooks/useAdIntent';

export type IntentTier = 'strong' | 'medium' | 'weak' | 'none';

export interface IntentMatch {
  /** 0–1 numeric score. */
  score: number;
  tier: IntentTier;
  /** Best-guess source bucket (pinterest, paid, organic, direct, unknown). */
  source: 'pinterest' | 'paid' | 'organic' | 'direct' | 'unknown';
  /**
   * True when we should let `adIntent.headline` / `subline` override the
   * default PDP copy. False keeps the original premium PDP intact.
   */
  allowHeadlineOverride: boolean;
  /**
   * True when supplemental conversion blocks (sticky trust bar, reassurance
   * callout, swipe chips) are appropriate. Weak/none traffic still sees the
   * baseline PDP but not the full emotional stack.
   */
  allowEmotionalStack: boolean;
  /** Short human-readable reason — surfaced in admin tooling only. */
  reason: string;
}

/** Pinterest hook keys → category families they make sense for. */
const HOOK_TO_CATEGORY: Record<string, RegExp> = {
  'large-dogs': /dog|bed|crate|harness/i,
  'cooling': /bed|mat|outdoor|cooling/i,
  'orthopedic': /bed|senior|joint|orthopedic/i,
  'travel': /carrier|travel|stroller|crate/i,
  'outdoor': /outdoor|patio|yard|cooling/i,
  'senior': /bed|joint|orthopedic|senior/i,
  'puppy': /puppy|dog|chew|training/i,
  'cat-tree': /cat\s*tree|cat\s*condo|scratch/i,
  'litter-box': /litter|cat/i,
  // Pinterest "hook groups" map broadly — they are not category-specific.
  problem: /.*/,
  solution: /.*/,
  comparison: /.*/,
  transformation: /.*/,
};

function detectSource(params: URLSearchParams, referrer: string): IntentMatch['source'] {
  const utm = (params.get('utm_source') || '').toLowerCase();
  if (utm.includes('pinterest') || /pinterest\./i.test(referrer)) return 'pinterest';
  if (utm.includes('google_ads') || utm === 'google' && params.get('gclid')) return 'paid';
  if (params.get('gclid') || params.get('fbclid') || params.get('ttclid')) return 'paid';
  if (/google\.|bing\.|duckduckgo\.|yahoo\./i.test(referrer)) return 'organic';
  if (!referrer) return 'direct';
  return 'unknown';
}

export function computeIntentMatch(
  adIntent: Pick<AdIntent, 'keyword' | 'source'>,
  category?: string | null,
  options?: { search?: string; referrer?: string },
): IntentMatch {
  const search =
    options?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const referrer =
    options?.referrer ?? (typeof document !== 'undefined' ? document.referrer : '');
  const params = new URLSearchParams(search);
  const source = detectSource(params, referrer);
  const cat = (category || '').toLowerCase();

  // No keyword/hook → score purely from source. Organic/direct gets a medium
  // baseline (we trust the category copy already on the page); paid without
  // a hook is treated as weak so we don't override copy blindly.
  if (!adIntent.keyword) {
    if (source === 'organic' || source === 'direct') {
      return {
        score: 0.5,
        tier: 'medium',
        source,
        allowHeadlineOverride: false,
        allowEmotionalStack: true,
        reason: 'no-hook · trusted source',
      };
    }
    return {
      score: 0.25,
      tier: 'weak',
      source,
      allowHeadlineOverride: false,
      allowEmotionalStack: true,
      reason: 'no-hook · ambiguous source',
    };
  }

  const matcher = HOOK_TO_CATEGORY[adIntent.keyword];
  const categoryMatch = matcher ? matcher.test(cat) : false;

  // Strong = hook matches category AND source is a known paid/social channel.
  if (categoryMatch && (source === 'pinterest' || source === 'paid' || adIntent.source === 'ad' || adIntent.source === 'pinterest')) {
    return {
      score: 0.9,
      tier: 'strong',
      source,
      allowHeadlineOverride: true,
      allowEmotionalStack: true,
      reason: `hook "${adIntent.keyword}" matches category`,
    };
  }

  // Medium = hook matches category, but source is fuzzy (e.g. referrer-only).
  if (categoryMatch) {
    return {
      score: 0.65,
      tier: 'medium',
      source,
      allowHeadlineOverride: true,
      allowEmotionalStack: true,
      reason: `hook "${adIntent.keyword}" matches category · source unclear`,
    };
  }

  // Hook present but category mismatch → never override copy, keep baseline.
  return {
    score: 0.2,
    tier: 'weak',
    source,
    allowHeadlineOverride: false,
    allowEmotionalStack: true,
    reason: `hook "${adIntent.keyword}" does not match "${cat || 'unknown'}"`,
  };
}
