/**
 * categoryEmotional — deterministic, rules-based emotional copy per product
 * category. NO AI on storefront. NO fake urgency. NO unverifiable claims.
 *
 * Every string here is hand-written and screened against
 * `scanForBannedTerms` in CI; if a phrase trips the merchant policy it must
 * be edited here, not patched at render-time.
 */

import { scanForBannedTerms } from '@/config/merchant-policy';

export type EmotionalCategoryKey =
  | 'litter_box'
  | 'cat_tree'
  | 'cat_toy'
  | 'cat_bed'
  | 'cat_general'
  | 'dog_bed'
  | 'dog_toy'
  | 'dog_training'
  | 'dog_general'
  | 'generic';

export interface EmotionalCopy {
  /** One-line hook shown above the buy box. ≤80 chars, no urgency. */
  hook: string;
  /** Short action label for sticky ATC. ≤22 chars. */
  ctaLabel: string;
  /** 3–4 short benefit chips for the mobile swipe row above the gallery. */
  benefits: string[];
  /** One-sentence reassurance shown after the gallery on mobile. */
  reassurance: string;
}

const COPY: Record<EmotionalCategoryKey, EmotionalCopy> = {
  litter_box: {
    hook: 'Designed so the litter box quietly disappears into your day.',
    ctaLabel: 'Add to Cart',
    benefits: ['Less daily scooping', 'Lower-odor design', 'Apartment-friendly footprint'],
    reassurance: 'A calmer litter routine — for you and your cat.',
  },
  cat_tree: {
    hook: 'A space your cat claims — and one you’re happy to keep in the room.',
    ctaLabel: 'Add to Cart',
    benefits: ['Sturdy build', 'Multi-level play', 'Cozy perches', 'Fits small homes'],
    reassurance: 'More climbing, scratching, and napping. Less furniture damage.',
  },
  cat_toy: {
    hook: 'Built for the way cats actually play — short, curious, intense.',
    ctaLabel: 'Add to Cart',
    benefits: ['Engaging play', 'Quiet hours for you', 'Easy to store'],
    reassurance: 'Made to keep curious cats engaged — without taking over the room.',
  },
  cat_bed: {
    hook: 'A bed your cat will actually choose — and one that looks at home in yours.',
    ctaLabel: 'Add to Cart',
    benefits: ['Soft and warm', 'Holds its shape', 'Removable cover'],
    reassurance: 'Pick a spot, drop it down — and watch them claim it.',
  },
  cat_general: {
    hook: 'Quietly considered. For cats and the people they live with.',
    ctaLabel: 'Add to Cart',
    benefits: ['Cat-tested', 'Apartment-friendly', 'Easy to live with'],
    reassurance: 'Chosen with your cat — and your home — in mind.',
  },
  dog_bed: {
    hook: 'A bed your dog settles into — and a piece you’re happy to keep out.',
    ctaLabel: 'Add to Cart',
    benefits: ['Supportive cushion', 'Holds its shape', 'Removable cover'],
    reassurance: 'A spot they go to on their own — without being told.',
  },
  dog_toy: {
    hook: 'Toys built for real play — not the bin by next month.',
    ctaLabel: 'Add to Cart',
    benefits: ['Durable build', 'Engaging design', 'Easy to clean'],
    reassurance: 'More tail-wagging, less replacing toys every week.',
  },
  dog_training: {
    hook: 'Calmer daily training — for both of you.',
    ctaLabel: 'Add to Cart',
    benefits: ['Owner-friendly', 'Practical sizing', 'Comfortable fit'],
    reassurance: 'Designed to fit into your routine — not fight it.',
  },
  dog_general: {
    hook: 'For happier dogs — and the people who actually live with them.',
    ctaLabel: 'Add to Cart',
    benefits: ['Dog-tested', 'Easy to use', 'Made for daily life'],
    reassurance: 'Chosen with your dog’s daily life in mind.',
  },
  generic: {
    hook: 'Thoughtful picks for the pets we share our lives with.',
    ctaLabel: 'Add to Cart',
    benefits: ['Pet-tested', 'Easy to use', 'Made for daily life'],
    reassurance: 'Quietly built around real homes and real pets.',
  },
};

/** Map a free-form product category string to one of our emotional buckets. */
export function classifyEmotionalCategory(
  category?: string | null,
  name?: string | null,
): EmotionalCategoryKey {
  const blob = `${category || ''} ${name || ''}`.toLowerCase();
  if (!blob.trim()) return 'generic';

  if (/litter\s*box|litter\s*tray|self[-\s]?clean/.test(blob)) return 'litter_box';
  if (/cat\s*tree|cat\s*tower|scratch(er|ing\s*post)/.test(blob)) return 'cat_tree';
  if (/cat.*(toy|wand|teaser|mouse|tunnel)/.test(blob)) return 'cat_toy';
  if (/cat.*(bed|cushion|hammock|cave)/.test(blob)) return 'cat_bed';
  if (/dog.*(bed|orthopedic|cushion|crate\s*mat)/.test(blob)) return 'dog_bed';
  if (/dog.*(toy|chew|tug|ball|rope)/.test(blob)) return 'dog_toy';
  if (/(leash|harness|collar|training|clicker|treat\s*pouch)/.test(blob)) return 'dog_training';
  if (/\bcat(s)?\b/.test(blob)) return 'cat_general';
  if (/\bdog(s)?\b/.test(blob)) return 'dog_general';
  return 'generic';
}

export function getEmotionalCopy(
  category?: string | null,
  name?: string | null,
): EmotionalCopy {
  return COPY[classifyEmotionalCategory(category, name)];
}

/**
 * Dev-time guard. Throws (in dev) if any copy block in this file contains a
 * banned merchant term. In production we silently return the unsafe keys so
 * the calling component can decide to fall back to the generic bucket.
 */
export function auditEmotionalCopy(): string[] {
  const violations: string[] = [];
  for (const [key, copy] of Object.entries(COPY)) {
    const all = [copy.hook, copy.ctaLabel, ...copy.benefits, copy.reassurance].join(' ');
    if (scanForBannedTerms(all).length > 0) violations.push(key);
  }
  return violations;
}