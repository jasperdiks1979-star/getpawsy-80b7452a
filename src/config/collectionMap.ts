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
  // ═══ Cat Collections ═══
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
  // ═══ Dog Core Collections ═══
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
  // ═══ Cat Core Collections ═══
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
  // ═══ New Dog Collections ═══
  'interactive-dog-toys': {
    categoryPatterns: ['Dog Toys'],
    keywords: ['interactive', 'puzzle', 'enrichment', 'treat dispensing', 'snuffle'],
    fallbackKeywords: ['brain toy', 'mental stimulation', 'smart toy', 'dog puzzle'],
    minProducts: 8,
    criticalMin: 4,
  },
  'aggressive-chewer-dog-toys': {
    categoryPatterns: ['Dog Toys'],
    keywords: ['aggressive chewer', 'indestructible', 'tough', 'heavy duty', 'durable chew'],
    fallbackKeywords: ['rubber toy', 'nylon bone', 'power chewer', 'chew toy'],
    minProducts: 8,
    criticalMin: 4,
  },
  'dog-car-seats': {
    categoryPatterns: ['Dog Car Seats'],
    keywords: ['car seat', 'booster seat', 'dog car', 'car safety'],
    fallbackKeywords: ['car harness', 'seatbelt', 'vehicle', 'travel seat'],
    minProducts: 6,
    criticalMin: 3,
  },
  'tactical-dog-harness': {
    categoryPatterns: ['Dog Harnesses'],
    keywords: ['tactical', 'military', 'molle', 'heavy duty harness'],
    fallbackKeywords: ['working dog', 'patrol', 'service harness', 'reinforced harness'],
    minProducts: 4,
    criticalMin: 2,
  },
  'dog-training-tools': {
    categoryPatterns: ['Dog Training'],
    keywords: ['training', 'clicker', 'treat pouch', 'training pad'],
    fallbackKeywords: ['obedience', 'recall', 'whistle', 'training mat'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-grooming-tools': {
    categoryPatterns: ['Dog Grooming'],
    keywords: ['grooming', 'deshedding', 'nail clipper', 'grooming kit'],
    fallbackKeywords: ['brush', 'slicker', 'rake', 'trimmer', 'comb'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-water-bottles': {
    categoryPatterns: [],
    keywords: ['water bottle', 'portable water', 'travel water', 'dog bottle'],
    fallbackKeywords: ['hydration', 'drinking', 'hiking water'],
    minProducts: 4,
    criticalMin: 2,
  },
  'dog-travel-accessories': {
    categoryPatterns: [],
    keywords: ['travel', 'car seat', 'car cover', 'travel crate', 'collapsible bowl'],
    fallbackKeywords: ['road trip', 'portable', 'carrier', 'airplane'],
    minProducts: 8,
    criticalMin: 4,
  },
  'dog-collars': {
    categoryPatterns: ['Dog Collars', 'Dog Collars & Leashes'],
    keywords: ['dog collar', 'adjustable collar', 'reflective collar'],
    fallbackKeywords: ['nylon collar', 'leather collar', 'personalized collar'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-leashes': {
    categoryPatterns: ['Dog Leashes', 'Dog Collars & Leashes'],
    keywords: ['dog leash', 'retractable leash', 'training leash'],
    fallbackKeywords: ['walking leash', 'long line', 'rope leash', 'hands-free leash'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-crates': {
    categoryPatterns: ['Dog Crates'],
    keywords: ['dog crate', 'wire crate', 'kennel', 'dog cage'],
    fallbackKeywords: ['folding crate', 'soft crate', 'travel crate', 'heavy duty crate'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-bowls': {
    categoryPatterns: ['Dog Bowls', 'Dog Feeding'],
    keywords: ['dog bowl', 'elevated bowl', 'slow feeder', 'stainless steel bowl'],
    fallbackKeywords: ['raised bowl', 'non-tip bowl', 'feeding bowl', 'ceramic bowl'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-coats-jackets': {
    categoryPatterns: [],
    keywords: ['dog coat', 'dog jacket', 'dog sweater', 'dog vest'],
    fallbackKeywords: ['winter coat', 'rain jacket', 'cooling vest', 'fleece', 'parka'],
    minProducts: 4,
    criticalMin: 2,
  },
  'dog-anxiety-products': {
    categoryPatterns: [],
    keywords: ['calming', 'anxiety', 'thundershirt', 'calming bed'],
    fallbackKeywords: ['stress relief', 'soothing', 'pheromone', 'relaxation'],
    minProducts: 4,
    criticalMin: 2,
  },
  'dog-backpacks': {
    categoryPatterns: [],
    keywords: ['dog backpack', 'carrier backpack', 'dog carrier'],
    fallbackKeywords: ['hiking carrier', 'front carrier', 'pet backpack'],
    minProducts: 4,
    criticalMin: 2,
  },
  'small-dog-accessories': {
    categoryPatterns: [],
    keywords: ['small dog', 'toy breed', 'xs', 'miniature'],
    fallbackKeywords: ['chihuahua', 'yorkie', 'pomeranian', 'teacup', 'small breed'],
    minProducts: 6,
    criticalMin: 3,
  },
  'large-dog-supplies': {
    categoryPatterns: [],
    keywords: ['large dog', 'big dog', 'xl', 'xxl', 'giant breed'],
    fallbackKeywords: ['large breed', 'extra large', 'oversized', 'heavy duty'],
    minProducts: 8,
    criticalMin: 4,
  },
  'puppy-supplies': {
    categoryPatterns: [],
    keywords: ['puppy', 'new puppy', 'starter', 'teething'],
    fallbackKeywords: ['puppy toy', 'puppy bed', 'puppy crate', 'training pad'],
    minProducts: 8,
    criticalMin: 4,
  },
  'dog-toys-large-breeds': {
    categoryPatterns: ['Dog Toys'],
    keywords: ['large breed', 'xl toy', 'big dog toy', 'giant toy'],
    fallbackKeywords: ['oversized', 'extra large', 'heavy duty toy', 'tough toy'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-beds-washable': {
    categoryPatterns: ['Dog Beds'],
    keywords: ['washable', 'machine washable', 'removable cover'],
    fallbackKeywords: ['waterproof', 'easy clean', 'antimicrobial'],
    minProducts: 6,
    criticalMin: 3,
  },
  'dog-treats-training': {
    categoryPatterns: [],
    keywords: ['training treat', 'high value treat', 'soft treat'],
    fallbackKeywords: ['freeze dried', 'liver treat', 'reward', 'small treat'],
    minProducts: 4,
    criticalMin: 2,
  },
  'dog-dental-care': {
    categoryPatterns: [],
    keywords: ['dental', 'teeth', 'toothbrush', 'dental chew'],
    fallbackKeywords: ['oral', 'breath', 'plaque', 'tartar', 'dental stick'],
    minProducts: 4,
    criticalMin: 2,
  },
  'dog-poop-bags': {
    categoryPatterns: [],
    keywords: ['poop bag', 'waste bag', 'biodegradable bag'],
    fallbackKeywords: ['dog bag', 'dispenser', 'cleanup', 'compostable'],
    minProducts: 4,
    criticalMin: 2,
  },
  'outdoor-dog-gear': {
    categoryPatterns: [],
    keywords: ['outdoor', 'hiking', 'camping', 'adventure', 'trail'],
    fallbackKeywords: ['reflective', 'portable', 'booties', 'dog boots'],
    minProducts: 6,
    criticalMin: 3,
  },
  // ═══ New Cat Collections ═══
  'interactive-cat-toys': {
    categoryPatterns: ['Cat Toys'],
    keywords: ['interactive', 'automatic', 'electronic', 'puzzle', 'motion'],
    fallbackKeywords: ['laser', 'feather', 'smart toy', 'robotic'],
    minProducts: 6,
    criticalMin: 3,
  },
  'self-cleaning-litter-box': {
    categoryPatterns: ['Cat Litter Boxes'],
    keywords: ['self cleaning', 'self-cleaning', 'automatic litter', 'robot litter'],
    fallbackKeywords: ['smart litter', 'auto scoop', 'sensor litter'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-grooming-tools': {
    categoryPatterns: ['Cat Grooming'],
    keywords: ['cat grooming', 'cat brush', 'deshedding', 'nail trimmer'],
    fallbackKeywords: ['grooming glove', 'slicker', 'self grooming', 'cat comb'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-carriers': {
    categoryPatterns: ['Cat Carriers'],
    keywords: ['cat carrier', 'backpack carrier', 'airline carrier'],
    fallbackKeywords: ['soft sided', 'expandable', 'travel carrier', 'vet visit'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-travel-accessories': {
    categoryPatterns: [],
    keywords: ['cat travel', 'cat harness', 'portable litter', 'cat carrier'],
    fallbackKeywords: ['travel litter', 'calming spray', 'cat leash'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-beds': {
    categoryPatterns: ['Cat Beds'],
    keywords: ['cat bed', 'cave bed', 'heated cat bed', 'window bed'],
    fallbackKeywords: ['donut bed', 'cat cushion', 'calming bed', 'cat hammock'],
    minProducts: 8,
    criticalMin: 4,
  },
  'cat-furniture': {
    categoryPatterns: ['Cat Trees & Condos', 'Cat Furniture'],
    keywords: ['cat furniture', 'cat tree', 'cat shelf', 'climbing'],
    fallbackKeywords: ['wall mount', 'cat tower', 'cat condo', 'perch', 'platform'],
    minProducts: 12,
    criticalMin: 6,
  },
  'cat-harnesses': {
    categoryPatterns: [],
    keywords: ['cat harness', 'escape proof', 'vest harness', 'walking harness'],
    fallbackKeywords: ['adventure cat', 'cat leash', 'cat walking'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-food-bowls': {
    categoryPatterns: [],
    keywords: ['cat bowl', 'elevated cat bowl', 'whisker', 'cat slow feeder'],
    fallbackKeywords: ['ceramic cat bowl', 'raised cat bowl', 'food bowl'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-calming-products': {
    categoryPatterns: [],
    keywords: ['cat calming', 'cat anxiety', 'pheromone', 'feliway'],
    fallbackKeywords: ['calming treat', 'diffuser', 'stress relief'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-tunnels': {
    categoryPatterns: ['Cat Toys'],
    keywords: ['cat tunnel', 'crinkle tunnel', 'play tunnel'],
    fallbackKeywords: ['cat tube', 'collapsible tunnel', 'hideout'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-trees-small-spaces': {
    categoryPatterns: ['Cat Trees & Condos'],
    keywords: ['compact', 'small apartment', 'space saving', 'narrow'],
    fallbackKeywords: ['slim', 'corner', 'wall mount', 'mini cat tree'],
    minProducts: 6,
    criticalMin: 3,
  },
  'cat-scratching-pads': {
    categoryPatterns: ['Cat Scratching Posts'],
    keywords: ['scratch pad', 'scratching board', 'cardboard scratcher'],
    fallbackKeywords: ['horizontal scratcher', 'scratch lounge', 'sisal pad'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-trees-large-cats': {
    categoryPatterns: ['Cat Trees & Condos'],
    keywords: ['large cat', 'big cat', 'maine coon', 'heavy duty cat tree'],
    fallbackKeywords: ['sturdy', 'reinforced', 'extra large', 'heavy cat'],
    minProducts: 8,
    criticalMin: 4,
  },
  'cat-litter': {
    categoryPatterns: ['Cat Litter'],
    keywords: ['cat litter', 'clumping', 'crystal litter', 'natural litter'],
    fallbackKeywords: ['dust free', 'lightweight', 'odor control', 'pine litter'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-window-perches': {
    categoryPatterns: [],
    keywords: ['window perch', 'window seat', 'window hammock', 'suction cup'],
    fallbackKeywords: ['window mount', 'cat perch', 'bird watching'],
    minProducts: 4,
    criticalMin: 2,
  },
  'cat-litter-accessories': {
    categoryPatterns: [],
    keywords: ['litter mat', 'litter scoop', 'deodorizer', 'litter liner'],
    fallbackKeywords: ['litter trap', 'odor control', 'litter box mat'],
    minProducts: 4,
    criticalMin: 2,
  },
  // ═══ Pet-General Collections ═══
  'pet-travel-accessories': {
    categoryPatterns: [],
    keywords: ['travel', 'car seat', 'carrier', 'portable'],
    fallbackKeywords: ['road trip', 'travel kit', 'airline', 'collapsible'],
    minProducts: 8,
    criticalMin: 4,
  },
  'pet-safety-products': {
    categoryPatterns: [],
    keywords: ['safety', 'gps', 'tracker', 'reflective', 'first aid'],
    fallbackKeywords: ['pet gate', 'pet proof', 'led collar', 'safety light'],
    minProducts: 4,
    criticalMin: 2,
  },
  'pet-cleaning-supplies': {
    categoryPatterns: [],
    keywords: ['cleaning', 'stain remover', 'odor', 'enzyme'],
    fallbackKeywords: ['pet hair', 'lint roller', 'urine', 'deodorizer'],
    minProducts: 4,
    criticalMin: 2,
  },
  'pet-cameras': {
    categoryPatterns: [],
    keywords: ['camera', 'pet camera', 'wifi camera', 'treat dispenser'],
    fallbackKeywords: ['monitor', 'two-way', 'night vision', 'smart camera'],
    minProducts: 4,
    criticalMin: 2,
  },
  'pet-feeding-stations': {
    categoryPatterns: [],
    keywords: ['feeding station', 'elevated feeder', 'raised bowl', 'feeding stand'],
    fallbackKeywords: ['bowl stand', 'feeder', 'organized feeding'],
    minProducts: 4,
    criticalMin: 2,
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
