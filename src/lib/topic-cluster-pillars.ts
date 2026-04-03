/**
 * Topic Cluster Pillar Architecture
 * 
 * Maps all 75 SEO collections into 12 parent topical pillars.
 * Each pillar is the authority hub for its cluster of sub-collections.
 * Used for internal linking, breadcrumbs, and content strategy.
 */

export interface TopicPillar {
  id: string;
  name: string;
  pillarSlug: string; // The main /collections/ slug
  description: string;
  pillarKeyword: string;
  secondaryKeywords: string[];
  childSlugs: string[]; // Sub-collection slugs that belong to this pillar
  relatedGuidesSlugs: string[]; // Blog/guide slugs that support this pillar
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export const TOPIC_PILLARS: TopicPillar[] = [
  // ========== 1. DOG BEDS ==========
  {
    id: 'dog-beds',
    name: 'Dog Beds',
    pillarSlug: 'orthopedic-calming-dog-beds',
    description: 'Complete guide to dog beds — orthopedic, calming, cooling, waterproof, and breed-specific options for every dog.',
    pillarKeyword: 'best dog beds',
    secondaryKeywords: ['orthopedic dog beds', 'calming dog beds', 'dog beds for large dogs', 'memory foam dog beds'],
    childSlugs: [
      'best-orthopedic-dog-beds',
      'memory-foam-dog-beds',
      'dog-beds-for-anxiety',
      'waterproof-dog-beds',
      'cooling-dog-beds',
      'best-dog-beds-for-large-dogs',
      'dog-bed-for-70-pound-dog',
      'dog-bed-for-senior-dogs',
      'best-elevated-dog-bed',
      'best-elevated-dog-bed-for-large-dogs',
      'best-dog-bed-for-crate-training',
      'best-dog-crate-beds',
      'dog-beds-for-summer',
    ],
    relatedGuidesSlugs: [
      'best-orthopedic-dog-beds-2026',
      'how-to-choose-dog-bed-size',
      'calming-dog-bed-guide',
    ],
    priority: 'critical',
  },

  // ========== 2. CAT FURNITURE (Cat Condos & Trees) ==========
  {
    id: 'cat-furniture',
    name: 'Cat Furniture',
    pillarSlug: 'cat-condos',
    description: 'Premium cat condos, trees, towers, and furniture — from small apartments to multi-cat households.',
    pillarKeyword: 'cat condos',
    secondaryKeywords: ['cat trees', 'cat towers', 'cat furniture', 'cat climbing furniture'],
    childSlugs: [
      'modern-cat-trees',
      'cat-tree-for-two-cats',
      'cat-tree-for-large-cats',
      'cat-condos-for-large-cats',
      'large-cat-condos',
      'best-cat-trees-for-small-apartments',
      'luxury-cat-towers',
      'modern-cat-condos',
      'multi-cat-condos',
      'wooden-cat-condos',
      'small-cat-condos',
      'multi-level-cat-condos',
      'luxury-cat-condos',
      'wall-mounted-cat-furniture',
      'best-cat-window-perches',
      'best-cat-scratching-posts',
      'best-cat-scratching-pad',
    ],
    relatedGuidesSlugs: [
      'best-cat-trees-guide',
      'cat-climbing-behavior-explained',
    ],
    priority: 'critical',
  },

  // ========== 3. CAT LITTER SOLUTIONS ==========
  {
    id: 'cat-litter',
    name: 'Cat Litter Solutions',
    pillarSlug: 'best-cat-litter-boxes',
    description: 'Everything about litter boxes — self-cleaning, odor control, large cat, and furniture-style options.',
    pillarKeyword: 'best cat litter boxes',
    secondaryKeywords: ['self-cleaning litter box', 'litter box furniture', 'odor control litter box'],
    childSlugs: [
      'best-litter-box-for-large-cats',
      'best-litter-box-for-odor-control',
      'cat-litter-box-furniture-guide',
      'self-cleaning-litter-box-guide',
    ],
    relatedGuidesSlugs: [
      'cat-litter-box-problems-solutions',
    ],
    priority: 'critical',
  },

  // ========== 4. INTERACTIVE DOG TOYS ==========
  {
    id: 'dog-toys',
    name: 'Interactive Dog Toys',
    pillarSlug: 'best-interactive-dog-toys',
    description: 'Best interactive, puzzle, and enrichment toys for dogs of all ages and chew styles.',
    pillarKeyword: 'interactive dog toys',
    secondaryKeywords: ['dog puzzle toys', 'dog enrichment toys', 'chew toys', 'indestructible dog toys'],
    childSlugs: [
      'dog-enrichment-toys',
      'best-chew-toys-for-aggressive-chewers',
      'indestructible-dog-chew-toys',
      'indestructible-dog-toys-guide',
      'best-dog-toys-for-puppies',
      'best-dog-toy-for-separation-anxiety',
    ],
    relatedGuidesSlugs: [
      'signs-your-dog-is-bored',
      'mental-stimulation-for-dogs',
      'indoor-dog-games',
      'dog-puzzle-toys-guide',
      'why-dogs-chew-everything',
    ],
    priority: 'critical',
  },

  // ========== 5. CAT ENRICHMENT ==========
  {
    id: 'cat-enrichment',
    name: 'Cat Enrichment & Toys',
    pillarSlug: 'best-cat-toys-for-indoor-cats',
    description: 'Indoor cat enrichment — interactive toys, climbing, and mental stimulation for happy cats.',
    pillarKeyword: 'cat toys for indoor cats',
    secondaryKeywords: ['interactive cat toys', 'indoor cat enrichment', 'cat boredom solutions'],
    childSlugs: [
      'best-cat-toys-for-bored-cats',
      'best-interactive-cat-toys',
      'indoor-cat-enrichment',
    ],
    relatedGuidesSlugs: [
      'indoor-cat-boredom-signs',
      'cat-sleep-patterns-explained',
      'cat-water-fountain-benefits',
    ],
    priority: 'high',
  },

  // ========== 6. DOG TRAVEL ==========
  {
    id: 'dog-travel',
    name: 'Dog Travel',
    pillarSlug: 'dogs',
    description: 'Dog travel gear — car seats, booster seats, travel water bottles, and safety accessories.',
    pillarKeyword: 'dog travel accessories',
    secondaryKeywords: ['dog car seat', 'dog travel water bottle', 'pet travel safety'],
    childSlugs: [
      'dog-car-travel-safety-seats',
      'dog-car-seat-for-small-dogs',
      'best-dog-car-seats',
      'best-dog-travel-water-bottles',
    ],
    relatedGuidesSlugs: [],
    priority: 'high',
  },

  // ========== 7. DOG FEEDING ==========
  {
    id: 'dog-feeding',
    name: 'Dog Feeding Solutions',
    pillarSlug: 'best-slow-feeder-dog-bowls',
    description: 'Slow feeders, no-spill bowls, and smart feeding solutions for healthier mealtimes.',
    pillarKeyword: 'slow feeder dog bowls',
    secondaryKeywords: ['no spill dog bowl', 'elevated dog bowl', 'dog water bowl'],
    childSlugs: [
      'best-slow-feeder-for-dogs-who-eat-too-fast',
      'no-spill-dog-feeding',
      'best-dog-water-bowl-for-messy-drinkers',
    ],
    relatedGuidesSlugs: [
      'benefits-of-slow-feeder-bowls',
      'how-to-stop-dog-eating-too-fast',
    ],
    priority: 'high',
  },

  // ========== 8. DOG GROOMING ==========
  {
    id: 'dog-grooming',
    name: 'Dog Grooming',
    pillarSlug: 'best-dog-grooming-kits',
    description: 'Complete dog grooming — kits, vacuum groomers, and at-home grooming guides.',
    pillarKeyword: 'dog grooming kit',
    secondaryKeywords: ['pet grooming vacuum', 'dog grooming at home', 'grooming supplies'],
    childSlugs: [
      'dog-grooming-at-home-guide',
      'pet-grooming-vacuum-kits',
    ],
    relatedGuidesSlugs: [],
    priority: 'high',
  },

  // ========== 9. CAT BEDS & COMFORT ==========
  {
    id: 'cat-beds',
    name: 'Cat Beds & Comfort',
    pillarSlug: 'best-cat-beds',
    description: 'Cozy cat beds, calming cave beds, and kitten-specific bedding for every comfort need.',
    pillarKeyword: 'best cat beds',
    secondaryKeywords: ['calming cat bed', 'cat bed for kittens', 'cave cat bed'],
    childSlugs: [
      'best-cat-bed-for-kittens',
    ],
    relatedGuidesSlugs: [],
    priority: 'medium',
  },

  // ========== 10. DOG HARNESSES & WALKING ==========
  {
    id: 'dog-walking',
    name: 'Dog Harnesses & Walking',
    pillarSlug: 'best-dog-harnesses',
    description: 'No-pull harnesses, collars, and walking gear for safe, comfortable walks.',
    pillarKeyword: 'best dog harnesses',
    secondaryKeywords: ['no pull dog harness', 'dog harness for pulling', 'dog walking gear'],
    childSlugs: [
      'best-dog-harness-for-pulling',
    ],
    relatedGuidesSlugs: [],
    priority: 'medium',
  },

  // ========== 11. CAT FEEDING ==========
  {
    id: 'cat-feeding',
    name: 'Cat Feeding & Nutrition',
    pillarSlug: 'automatic-cat-feeders',
    description: 'Automatic feeders, wet food dispensers, and smart feeding solutions for cats.',
    pillarKeyword: 'automatic cat feeder',
    secondaryKeywords: ['automatic cat feeder wet food', 'smart cat feeder'],
    childSlugs: [
      'best-automatic-cat-feeder-wet-food',
    ],
    relatedGuidesSlugs: [],
    priority: 'medium',
  },

  // ========== 12. CAT TRAVEL ==========
  {
    id: 'cat-travel',
    name: 'Cat Travel & Carriers',
    pillarSlug: 'best-cat-carriers',
    description: 'Cat carriers for vet visits, travel, and everyday outings — soft-sided, airline-approved, and backpacks.',
    pillarKeyword: 'best cat carriers',
    secondaryKeywords: ['cat carrier for vet visits', 'airline approved cat carrier'],
    childSlugs: [
      'best-cat-carrier-for-vet-visits',
    ],
    relatedGuidesSlugs: [],
    priority: 'medium',
  },
];

// ============= LOOKUP UTILITIES =============

const _slugToPillar = new Map<string, TopicPillar>();
for (const pillar of TOPIC_PILLARS) {
  _slugToPillar.set(pillar.pillarSlug, pillar);
  for (const child of pillar.childSlugs) {
    _slugToPillar.set(child, pillar);
  }
}

/**
 * Find the parent pillar for any collection slug.
 * Returns the pillar if the slug is either a pillar itself or a child.
 */
export function getPillarForCollection(collectionSlug: string): TopicPillar | undefined {
  return _slugToPillar.get(collectionSlug);
}

/**
 * Get sibling collections (same pillar, excluding self).
 */
export function getSiblingCollections(collectionSlug: string): string[] {
  const pillar = getPillarForCollection(collectionSlug);
  if (!pillar) return [];
  return [pillar.pillarSlug, ...pillar.childSlugs].filter(s => s !== collectionSlug);
}

/**
 * Get all pillar slugs (top-level authority pages).
 */
export function getAllPillarSlugs(): string[] {
  return TOPIC_PILLARS.map(p => p.pillarSlug);
}

/**
 * Check if a slug is a top-level pillar page.
 */
export function isPillarPage(slug: string): boolean {
  return TOPIC_PILLARS.some(p => p.pillarSlug === slug);
}

/**
 * Get related guides for a collection based on its pillar.
 */
export function getRelatedGuidesForCollection(collectionSlug: string): string[] {
  const pillar = getPillarForCollection(collectionSlug);
  return pillar?.relatedGuidesSlugs || [];
}

/**
 * Get all collections that are NOT mapped to any pillar (orphans).
 */
export function getOrphanCollections(allSlugs: string[]): string[] {
  return allSlugs.filter(s => !_slugToPillar.has(s));
}
