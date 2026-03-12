/**
 * Collection Product Mapping Configuration
 * 
 * Defines multi-signal matching rules for each SEO collection.
 * The filter engine uses these rules in priority order:
 * 1. Category match (exact DB category via ILIKE)
 * 2. Title/name keyword match
 * 3. Fallback keywords (broader semantic match)
 * 
 * IMPORTANT: Collection membership is INDEPENDENT of:
 * - seo_tier (never restrict by tier)
 * - sitemap inclusion
 * - index control / noindex status
 * - pruning logic
 */

export interface CollectionMapEntry {
  /** Primary category values to match via ILIKE */
  categoryPatterns: string[];
  /** Primary keywords to match in product name */
  keywords: string[];
  /** Broader fallback keywords if primary match < minProducts */
  fallbackKeywords: string[];
  /** Minimum products before fallback triggers */
  minProducts: number;
  /** Absolute minimum — if below this, log critical warning */
  criticalMin: number;
}

export const COLLECTION_MAP: Record<string, CollectionMapEntry> = {
  'cat-trees-and-condos': {
    categoryPatterns: ['Cat Trees & Condos', 'Cat Trees', 'Cat Condos'],
    keywords: ['cat tree', 'cat condo', 'cat tower', 'kitty tower'],
    fallbackKeywords: ['cat furniture', 'cat climbing', 'scratching post', 'cat perch'],
    minProducts: 20,
    criticalMin: 6,
  },
  'best-cat-litter-boxes': {
    categoryPatterns: ['Cat Litter Boxes', 'Litter Boxes'],
    keywords: ['litter box', 'litter pan', 'self cleaning litter', 'automatic litter'],
    fallbackKeywords: ['odor control litter', 'cat litter', 'litter enclosure', 'litter furniture'],
    minProducts: 20,
    criticalMin: 6,
  },
  'cat-condos': {
    categoryPatterns: ['Cat Trees & Condos'],
    keywords: ['cat condo', 'cat house condo', 'cat tree condo'],
    fallbackKeywords: ['cat hideaway', 'cat tower', 'cat tree'],
    minProducts: 12,
    criticalMin: 4,
  },
  'best-cat-scratching-posts': {
    categoryPatterns: ['Cat Scratching Posts'],
    keywords: ['scratching post', 'scratcher', 'sisal'],
    fallbackKeywords: ['cat scratch', 'scratch pad'],
    minProducts: 8,
    criticalMin: 4,
  },
  'best-cat-beds': {
    categoryPatterns: ['Cat Beds'],
    keywords: ['cat bed', 'cat cushion', 'cat donut'],
    fallbackKeywords: ['cat sleeping', 'cat cave', 'cat hammock'],
    minProducts: 8,
    criticalMin: 4,
  },
  'best-cat-toys-for-indoor-cats': {
    categoryPatterns: ['Cat Toys'],
    keywords: ['cat toy', 'interactive cat', 'wand toy'],
    fallbackKeywords: ['cat play', 'cat puzzle', 'cat enrichment'],
    minProducts: 8,
    criticalMin: 4,
  },
  'best-cat-carriers': {
    categoryPatterns: ['Cat Carriers'],
    keywords: ['cat carrier', 'cat backpack', 'cat travel'],
    fallbackKeywords: ['pet carrier', 'airline cat'],
    minProducts: 4,
    criticalMin: 2,
  },
  'slow-feeder-dog-bowls': {
    categoryPatterns: ['Dog Bowls', 'Slow Feeders', 'Dog Feeding'],
    keywords: ['slow feeder', 'anti gulp', 'puzzle feeder', 'slow bowl'],
    fallbackKeywords: ['dog bowl', 'feeding bowl', 'interactive feeder', 'dog feeder'],
    minProducts: 8,
    criticalMin: 4,
  },
  'dog-toys': {
    categoryPatterns: ['Dog Toys'],
    keywords: ['dog toy', 'chew toy', 'tug toy', 'rope toy', 'squeaky toy', 'fetch toy'],
    fallbackKeywords: ['interactive dog', 'puzzle toy', 'plush dog', 'ball toy', 'dog play'],
    minProducts: 12,
    criticalMin: 4,
  },
  'dog-beds': {
    categoryPatterns: ['Dog Beds'],
    keywords: ['dog bed', 'orthopedic dog bed', 'memory foam dog bed', 'calming dog bed'],
    fallbackKeywords: ['elevated dog bed', 'waterproof dog bed', 'bolster bed', 'donut bed'],
    minProducts: 12,
    criticalMin: 4,
  },
  'dog-harness': {
    categoryPatterns: ['Dog Harnesses', 'Dog Collars & Leashes'],
    keywords: ['dog harness', 'no-pull harness', 'no pull harness', 'front clip harness'],
    fallbackKeywords: ['padded harness', 'reflective harness', 'step-in harness', 'vest harness', 'adventure harness'],
    minProducts: 6,
    criticalMin: 3,
  },
  'cat-toys': {
    categoryPatterns: ['Cat Toys'],
    keywords: ['cat toy', 'interactive cat', 'wand toy', 'catnip toy', 'feather toy'],
    fallbackKeywords: ['cat puzzle', 'cat enrichment', 'mouse toy', 'laser toy', 'cat ball'],
    minProducts: 8,
    criticalMin: 4,
  },
  'cat-litter-boxes': {
    categoryPatterns: ['Cat Litter Boxes', 'Litter Boxes'],
    keywords: ['litter box', 'self cleaning litter', 'automatic litter', 'litter pan'],
    fallbackKeywords: ['covered litter box', 'top entry litter', 'odor control litter', 'litter enclosure'],
    minProducts: 8,
    criticalMin: 4,
  },
  'cat-scratching-posts': {
    categoryPatterns: ['Cat Scratching Posts'],
    keywords: ['scratching post', 'cat scratcher', 'sisal post', 'scratch pad'],
    fallbackKeywords: ['cardboard scratcher', 'wall scratcher', 'scratching board', 'scratch lounge'],
    minProducts: 8,
    criticalMin: 4,
  },
  'automatic-cat-feeders': {
    categoryPatterns: ['Cat Feeders', 'Pet Feeders'],
    keywords: ['automatic feeder', 'cat feeder', 'timed feeder', 'smart feeder'],
    fallbackKeywords: ['food dispenser', 'wifi feeder', 'portion control', 'programmable feeder', 'auto feeder'],
    minProducts: 4,
    criticalMin: 2,
  },
  'pet-grooming-tools': {
    categoryPatterns: ['Pet Grooming', 'Dog Grooming', 'Cat Grooming'],
    keywords: ['grooming', 'deshedding', 'nail clipper', 'grooming glove'],
    fallbackKeywords: ['brush', 'comb', 'trimmer', 'grooming kit', 'fur remover', 'undercoat rake'],
    minProducts: 6,
    criticalMin: 3,
  },
};

/**
 * Get collection config by slug. Returns undefined for unmapped collections
 * (those will use the legacy category/keyword filter from the DB).
 */
export function getCollectionConfig(slug: string): CollectionMapEntry | undefined {
  return COLLECTION_MAP[slug];
}

/**
 * Check if a product matches a collection's rules.
 * Returns a relevance score (0 = no match, higher = better match).
 */
export function scoreProductForCollection(
  product: { name: string; category: string | null },
  config: CollectionMapEntry,
): number {
  const pName = product.name.toLowerCase();
  const pCat = (product.category || '').toLowerCase();
  let score = 0;

  // Category match = strongest signal (score 10)
  for (const pattern of config.categoryPatterns) {
    if (pCat.includes(pattern.toLowerCase())) {
      score += 10;
      break;
    }
  }

  // Primary keyword match in name (score 3 per multi-word, 1 per single-word)
  for (const kw of config.keywords) {
    if (pName.includes(kw)) {
      score += kw.includes(' ') ? 3 : 1;
    }
  }

  return score;
}

/**
 * Score using fallback keywords (broader match).
 */
export function scoreProductFallback(
  product: { name: string; category: string | null },
  config: CollectionMapEntry,
): number {
  const pName = product.name.toLowerCase();
  const pCat = (product.category || '').toLowerCase();
  let score = 0;

  for (const kw of config.fallbackKeywords) {
    if (pName.includes(kw) || pCat.includes(kw)) {
      score += kw.includes(' ') ? 2 : 1;
    }
  }

  return score;
}
