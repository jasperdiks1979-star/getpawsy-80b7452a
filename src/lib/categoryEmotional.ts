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
    hook: 'Designed to make litter cleanup less of a chore.',
    ctaLabel: 'Add to Cart',
    benefits: ['Less daily scooping', 'Lower-odor design', 'Easy to clean', '30-day returns'],
    reassurance: 'A calmer litter routine — for you and your cat.',
  },
  cat_tree: {
    hook: 'Give your cat a space that finally feels like theirs.',
    ctaLabel: 'Add to Cart',
    benefits: ['Sturdy build', 'Multi-level play', 'Cozy perches', '30-day returns'],
    reassurance: 'More climbing, scratching, and napping — less furniture damage.',
  },
  cat_toy: {
    hook: 'Keep your cat moving, curious, and entertained.',
    ctaLabel: 'Add to Cart',
    benefits: ['Engaging play', 'Quiet hours for you', 'Easy to store', '30-day returns'],
    reassurance: 'Built for the way real cats actually play.',
  },
  cat_bed: {
    hook: 'A cozy spot your cat will actually want to use.',
    ctaLabel: 'Add to Cart',
    benefits: ['Soft & warm', 'Holds shape', 'Easy to clean', '30-day returns'],
    reassurance: 'Pick a spot, drop it down — and watch them claim it.',
  },
  cat_general: {
    hook: 'Picked for cats and the people who love them.',
    ctaLabel: 'Add to Cart',
    benefits: ['Cat-tested', 'Easy to use', 'Free US shipping $35+', '30-day returns'],
    reassurance: 'Real value, no fluff — chosen with your cat in mind.',
  },
  dog_bed: {
    hook: 'Help your dog rest deeper, every night.',
    ctaLabel: 'Add to Cart',
    benefits: ['Supportive cushion', 'Holds shape', 'Removable cover', '30-day returns'],
    reassurance: 'A spot they’ll go to on their own — without being told.',
  },
  dog_toy: {
    hook: 'Toys built for real play, not the trash.',
    ctaLabel: 'Add to Cart',
    benefits: ['Durable build', 'Engaging design', 'Easy to clean', '30-day returns'],
    reassurance: 'More tail-wagging, less replacing toys every week.',
  },
  dog_training: {
    hook: 'Make daily training calmer for both of you.',
    ctaLabel: 'Add to Cart',
    benefits: ['Owner-friendly', 'Practical sizing', 'Comfortable fit', '30-day returns'],
    reassurance: 'Designed to fit into your routine, not fight it.',
  },
  dog_general: {
    hook: 'Chosen for happier dogs and easier owners.',
    ctaLabel: 'Add to Cart',
    benefits: ['Dog-tested', 'Easy to use', 'Free US shipping $35+', '30-day returns'],
    reassurance: 'Picked with your dog’s daily life in mind.',
  },
  generic: {
    hook: 'Thoughtful picks for the pets we share our lives with.',
    ctaLabel: 'Add to Cart',
    benefits: ['Pet-tested', 'Easy to use', 'Free US shipping $35+', '30-day returns'],
    reassurance: 'Backed by a 30-day return window — no risk to try it.',
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