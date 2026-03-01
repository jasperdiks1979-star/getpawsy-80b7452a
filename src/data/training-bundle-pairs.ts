/**
 * Training Bundle Pairs — predefined complementary product pairings
 * for the dog training money funnel AOV boost layer.
 * 
 * Used by FrequentlyBoughtTogether and cross-sell modules to suggest
 * high-relevance bundles specific to dog training collections.
 */

export interface TrainingBundlePair {
  /** Keywords to match the primary product */
  primaryKeywords: string[];
  /** Keywords to match complementary products */
  complementKeywords: string[];
  /** Display label for the bundle suggestion */
  label: string;
  /** Discount percentage for this specific bundle type */
  discountPct: number;
}

export const TRAINING_BUNDLE_PAIRS: TrainingBundlePair[] = [
  {
    primaryKeywords: ['potty pad', 'training pad', 'pee pad', 'wee pad'],
    complementKeywords: ['pad holder', 'tray', 'grass mat', 'enzymatic cleaner'],
    label: 'Potty Pad + Holder Bundle',
    discountPct: 10,
  },
  {
    primaryKeywords: ['leash', 'lead', 'training leash'],
    complementKeywords: ['collar', 'training collar', 'harness'],
    label: 'Leash + Collar Training Bundle',
    discountPct: 10,
  },
  {
    primaryKeywords: ['harness', 'no-pull', 'no pull'],
    complementKeywords: ['reflective leash', 'training leash', 'lead'],
    label: 'Harness + Leash Walking Bundle',
    discountPct: 10,
  },
  {
    primaryKeywords: ['clicker', 'training clicker'],
    complementKeywords: ['treat pouch', 'treat bag', 'training treats'],
    label: 'Clicker + Treat Pouch Bundle',
    discountPct: 8,
  },
  {
    primaryKeywords: ['crate', 'kennel'],
    complementKeywords: ['crate pad', 'crate mat', 'crate cover'],
    label: 'Crate + Comfort Bundle',
    discountPct: 12,
  },
  {
    primaryKeywords: ['bark', 'anti-bark', 'ultrasonic'],
    complementKeywords: ['calming', 'anxiety', 'pheromone'],
    label: 'Bark Control + Calming Bundle',
    discountPct: 10,
  },
];

/**
 * Find matching bundle pairs for a given product name.
 * Returns the bundle config if the product matches a primary keyword.
 */
export function findBundlePairForProduct(productName: string): TrainingBundlePair | null {
  const name = productName.toLowerCase();
  return TRAINING_BUNDLE_PAIRS.find(pair =>
    pair.primaryKeywords.some(kw => name.includes(kw))
  ) || null;
}

/**
 * Score how well a candidate product matches a bundle pair's complement keywords.
 * Higher score = better match.
 */
export function scoreBundleComplement(candidateName: string, pair: TrainingBundlePair): number {
  const name = candidateName.toLowerCase();
  return pair.complementKeywords.reduce((score, kw) => 
    name.includes(kw) ? score + 10 : score, 0
  );
}
