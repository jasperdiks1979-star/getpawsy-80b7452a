/**
 * Supercluster Link Engine
 * 
 * Unified internal linking configuration for the 5 core topic clusters.
 * Maps every cluster to its pillar, collection hub, guide spokes, product categories,
 * and priority commercial pages for link equity concentration.
 * 
 * Rules:
 * - Species silo isolation (dog pages never link to cat, vice versa)
 * - Anchor text diversity: 30% exact / 40% partial / 30% semantic
 * - No duplicate link targets per page
 * - Priority pages receive 40%+ more inbound links
 */

// ============= TYPES =============

export interface SuperclusterConfig {
  id: string;
  label: string;
  species: 'dog' | 'cat' | 'multi';
  /** Pillar guide slug (3000-4000 word authority page) */
  pillarSlug: string;
  /** Primary collection hub slug */
  collectionSlug: string;
  /** Additional related collection slugs */
  relatedCollections: string[];
  /** All cluster guide slugs (spoke pages) */
  guideSlugs: string[];
  /** Product category names for product→guide linking */
  productCategories: string[];
  /** High-priority commercial pages receiving extra link equity */
  priorityPages: { slug: string; type: 'guide' | 'collection'; boost: number }[];
  /** Sibling cluster IDs for cross-linking (same species only) */
  siblingClusterIds: string[];
  /** Anchor text variations for this cluster */
  anchors: {
    exact: string[];
    partial: string[];
    semantic: string[];
  };
}

export interface SuperclusterLinkRecommendation {
  targetPath: string;
  targetType: 'guide' | 'collection' | 'product' | 'pillar';
  anchor: string;
  anchorType: 'exact' | 'partial' | 'semantic';
  priority: number;
}

// ============= CLUSTER DEFINITIONS =============

export const SUPERCLUSTERS: SuperclusterConfig[] = [
  // ─────────────── CAT TREES ───────────────
  {
    id: 'cat-trees',
    label: 'Cat Trees & Condos',
    species: 'cat',
    pillarSlug: 'cat-tree-buying-guide',
    collectionSlug: 'cat-trees-and-condos',
    relatedCollections: ['cat-condos', 'modern-cat-condos', 'large-cat-condos', 'best-cat-scratching-posts'],
    guideSlugs: [
      'best-cat-trees-large-cats-2026',
      'modern-cat-trees-home-design',
      'best-luxury-cat-tree',
      'best-cat-tree-for-kittens',
      'best-cat-tree-maine-coon',
      'best-cat-trees-small-apartments',
      'best-cat-tree-for-two-cats',
      'best-cat-tree-for-bengal-cats',
      'cat-condo-vs-cat-tree-2026',
      'best-cat-trees-2026',
      'best-cat-trees-for-indoor-cats',
      'how-tall-should-cat-tree-be',
      'cat-tree-stability-guide',
      'choosing-safe-cat-tree-indoor',
      'how-to-stop-cat-scratching-furniture',
      'sisal-vs-carpet-scratching-posts',
      'best-cat-scratching-post',
      'best-cat-condo-for-multiple-cats',
      'are-cat-condos-worth-it',
      'best-cat-scratcher',
    ],
    productCategories: ['Cat Trees & Condos', 'Cat Furniture', 'Cat Scratching Posts'],
    priorityPages: [
      { slug: 'best-cat-trees-large-cats-2026', type: 'guide', boost: 1.4 },
      { slug: 'best-luxury-cat-tree', type: 'guide', boost: 1.3 },
      { slug: 'modern-cat-trees-home-design', type: 'guide', boost: 1.3 },
      { slug: 'cat-trees-and-condos', type: 'collection', boost: 1.5 },
    ],
    siblingClusterIds: ['cat-litter', 'cat-toys'],
    anchors: {
      exact: ['best cat trees', 'cat trees and condos', 'cat tree guide'],
      partial: ['cat climbing furniture', 'indoor cat trees', 'cat tower picks'],
      semantic: ['vertical play structures for cats', 'feline activity centers', 'climbing furniture for indoor cats'],
    },
  },

  // ─────────────── CAT LITTER BOXES ───────────────
  {
    id: 'cat-litter',
    label: 'Cat Litter Boxes',
    species: 'cat',
    pillarSlug: 'cat-litter-box-guide',
    collectionSlug: 'best-cat-litter-boxes',
    relatedCollections: ['self-cleaning-litter-box-guide', 'best-litter-box-for-odor-control'],
    guideSlugs: [
      'best-cat-litter-box-2026',
      'best-self-cleaning-litter-box-2026',
      'best-cat-litter-for-odor-control',
      'best-litter-boxes-multi-cat',
      'best-extra-large-litter-boxes',
      'best-litter-box-kittens',
      'best-litter-box-senior-cats',
      'best-low-tracking-litter-box',
      'best-high-sided-litter-box',
      'best-litter-boxes-apartments-2026',
      'how-many-litter-boxes-per-cat',
      'how-to-clean-cat-litter-box',
      'best-cat-litter-box-furniture-enclosures-2026',
      'best-odor-control-litter-box',
      'best-cat-litter-box-for-large-cats',
      'covered-vs-open-litter-box',
      'litter-box-placement-guide',
      'how-to-stop-cat-litter-smell',
      'best-litter-box-small-apartments',
      'best-litter-box-under-100',
    ],
    productCategories: ['Cat Litter Boxes'],
    priorityPages: [
      { slug: 'best-cat-litter-box-2026', type: 'guide', boost: 1.5 },
      { slug: 'best-self-cleaning-litter-box-2026', type: 'guide', boost: 1.4 },
      { slug: 'best-cat-litter-boxes', type: 'collection', boost: 1.5 },
    ],
    siblingClusterIds: ['cat-trees', 'cat-toys'],
    anchors: {
      exact: ['best cat litter boxes', 'cat litter box guide', 'litter box reviews'],
      partial: ['top litter boxes', 'odor-control litter solutions', 'self-cleaning litter picks'],
      semantic: ['keeping your home fresh with cats', 'best feline waste solutions', 'litter management essentials'],
    },
  },

  // ─────────────── DOG BEDS ───────────────
  {
    id: 'dog-beds',
    label: 'Dog Beds',
    species: 'dog',
    pillarSlug: 'dog-bed-buying-guide',
    collectionSlug: 'orthopedic-calming-dog-beds',
    relatedCollections: ['best-dog-beds-large-dogs', 'best-dog-crate-beds'],
    guideSlugs: [
      'best-dog-bed-2026',
      'best-orthopedic-dog-bed-2026',
      'best-orthopedic-dog-bed-large-dogs-2026',
      'best-dog-beds-large-breeds-2026',
      'orthopedic-dog-beds-for-senior-dogs',
      'calming-dog-bed-anxiety',
      'best-elevated-dog-bed',
      'waterproof-orthopedic-dog-beds-guide',
      'how-to-choose-the-right-dog-bed-size',
      'memory-foam-vs-egg-crate-dog-beds',
      'best-dog-bed-under-100',
      'best-dog-bed-hip-dysplasia',
      'how-to-wash-a-dog-bed-properly',
      'best-outdoor-dog-bed',
      'best-dog-bed-for-small-dogs',
      'best-dog-bed-for-crate',
      'best-dog-bed-for-golden-retrievers',
      'best-dog-beds-for-arthritis',
      'signs-dog-needs-joint-support',
      'machine-washable-dog-bed-guide',
    ],
    productCategories: ['Dog Beds', 'Dog Houses'],
    priorityPages: [
      { slug: 'best-orthopedic-dog-bed-2026', type: 'guide', boost: 1.4 },
      { slug: 'best-dog-beds-large-breeds-2026', type: 'guide', boost: 1.4 },
      { slug: 'calming-dog-bed-anxiety', type: 'guide', boost: 1.3 },
      { slug: 'orthopedic-calming-dog-beds', type: 'collection', boost: 1.5 },
    ],
    siblingClusterIds: ['dog-toys', 'dog-travel'],
    anchors: {
      exact: ['best dog beds', 'orthopedic dog beds', 'dog bed guide'],
      partial: ['joint-support beds for dogs', 'comfortable dog sleeping', 'calming beds for anxious dogs'],
      semantic: ['rest & recovery solutions for dogs', 'canine sleep comfort', 'supportive bedding for senior pups'],
    },
  },

  // ─────────────── DOG TOYS ───────────────
  {
    id: 'dog-toys',
    label: 'Dog Toys & Enrichment',
    species: 'dog',
    pillarSlug: 'dog-toy-guide',
    collectionSlug: 'best-interactive-dog-toys',
    relatedCollections: ['indestructible-dog-chew-toys'],
    guideSlugs: [
      'best-toys-for-aggressive-chewers',
      'best-toys-for-bored-dogs',
      'best-dog-puzzle-toys',
      'best-interactive-dog-toys',
      'best-dog-chew-toys',
      'how-to-train-dog-with-toys',
      'outdoor-dog-games-2026',
      'how-to-tire-out-a-dog-fast',
      'backyard-enrichment-for-dogs',
      'summer-dog-activities',
      'puppy-chewing-solutions',
      'best-dog-toys-mental-stimulation',
      'best-dog-toy-for-puppies',
      'best-dog-cooling-mat',
    ],
    productCategories: ['Dog Toys'],
    priorityPages: [
      { slug: 'best-toys-for-aggressive-chewers', type: 'guide', boost: 1.4 },
      { slug: 'best-dog-toys-mental-stimulation', type: 'guide', boost: 1.3 },
      { slug: 'best-interactive-dog-toys', type: 'collection', boost: 1.5 },
      { slug: 'indestructible-dog-chew-toys', type: 'collection', boost: 1.4 },
    ],
    siblingClusterIds: ['dog-beds', 'dog-travel'],
    anchors: {
      exact: ['best dog toys', 'interactive dog toys', 'dog toy guide'],
      partial: ['tough toys for power chewers', 'boredom-busting dog toys', 'puzzle toys for smart dogs'],
      semantic: ['mental enrichment for canines', 'keeping dogs entertained indoors', 'durable play solutions'],
    },
  },

  // ─────────────── PET TRAVEL ───────────────
  {
    id: 'pet-travel',
    label: 'Pet Travel Accessories',
    species: 'multi',
    pillarSlug: 'pet-travel-guide',
    collectionSlug: 'dogs',
    relatedCollections: ['best-dog-car-seats', 'best-cat-carriers', 'best-pet-strollers', 'dog-car-travel-safety-seats'],
    guideSlugs: [
      'best-pet-carrier-airline-approved',
      'best-dog-car-seat',
      'best-dog-stroller',
      'best-portable-pet-water-bottle',
      'dog-travel-safety-guide',
      'traveling-with-dogs-tips',
      'pet-travel-checklist',
      'how-to-travel-with-cat',
      'dog-car-harness-guide',
      'best-dog-car-seat-for-small-dogs',
      'crash-tested-dog-car-seat-guide',
      'dog-booster-seat-vs-car-hammock',
      'best-dog-ramp-for-car',
      'are-dog-car-seats-safe',
      'how-to-train-dog-to-use-car-seat',
      'best-dog-stroller-for-large-dogs',
      'best-dog-carriers-for-travel',
      'best-cat-carrier',
      'best-cat-carrier-backpack',
      'dog-travel-safety-equipment-guide',
    ],
    productCategories: ['Dog Carriers', 'Cat Carriers', 'Dog Car Seats', 'Pet Strollers'],
    priorityPages: [
      { slug: 'best-dog-car-seat', type: 'guide', boost: 1.4 },
      { slug: 'best-pet-carrier-airline-approved', type: 'guide', boost: 1.3 },
      { slug: 'dogs', type: 'collection', boost: 1.5 },
      { slug: 'best-dog-car-seats', type: 'collection', boost: 1.4 },
    ],
    siblingClusterIds: ['dog-beds', 'dog-toys'],
    anchors: {
      exact: ['pet travel accessories', 'dog car seats', 'airline approved pet carriers'],
      partial: ['travel gear for dogs', 'safe car travel with pets', 'pet carrier reviews'],
      semantic: ['on-the-go solutions for pet owners', 'road trip essentials for dogs', 'flying with your furry companion'],
    },
  },

  // ─────────────── CAT TOYS (bonus cluster) ───────────────
  {
    id: 'cat-toys',
    label: 'Cat Toys & Enrichment',
    species: 'cat',
    pillarSlug: 'cat-toy-buying-guide',
    collectionSlug: 'best-interactive-cat-toys',
    relatedCollections: ['indoor-cat-enrichment'],
    guideSlugs: [
      'best-automatic-cat-toy',
      'best-toys-for-bored-indoor-cats',
      'best-interactive-cat-toys-that-work',
      'best-cat-toys',
      'best-cat-enrichment-ideas-indoor-cats-2026',
      'how-to-entertain-an-indoor-cat',
      'best-cat-tunnel',
      'best-cat-water-fountain',
    ],
    productCategories: ['Cat Toys'],
    priorityPages: [
      { slug: 'best-interactive-cat-toys-that-work', type: 'guide', boost: 1.3 },
      { slug: 'best-interactive-cat-toys', type: 'collection', boost: 1.4 },
    ],
    siblingClusterIds: ['cat-trees', 'cat-litter'],
    anchors: {
      exact: ['best cat toys', 'interactive cat toys'],
      partial: ['boredom-busting cat toys', 'indoor cat entertainment'],
      semantic: ['keeping indoor cats mentally stimulated', 'enrichment for feline companions'],
    },
  },
];

// ============= LOOKUP UTILITIES =============

const clusterMap = new Map(SUPERCLUSTERS.map(c => [c.id, c]));

/** Find which supercluster a guide belongs to */
export function getClusterForGuide(guideSlug: string): SuperclusterConfig | undefined {
  return SUPERCLUSTERS.find(c => c.guideSlugs.includes(guideSlug) || c.pillarSlug === guideSlug);
}

/** Find which supercluster a collection belongs to */
export function getClusterForCollection(collSlug: string): SuperclusterConfig | undefined {
  return SUPERCLUSTERS.find(c =>
    c.collectionSlug === collSlug || c.relatedCollections.includes(collSlug)
  );
}

/** Get supercluster by ID */
export function getSupercluster(id: string): SuperclusterConfig | undefined {
  return clusterMap.get(id);
}

/** Get sibling clusters (same species only) */
export function getSiblingSuperclusters(clusterId: string): SuperclusterConfig[] {
  const cluster = clusterMap.get(clusterId);
  if (!cluster) return [];
  return cluster.siblingClusterIds
    .map(id => clusterMap.get(id))
    .filter((c): c is SuperclusterConfig => !!c);
}

// ============= LINK RECOMMENDATION ENGINE =============

/**
 * Generate link recommendations for a guide page.
 * Returns: 1 pillar + 2-4 sibling guides + 1 collection + money page boosts
 * 
 * Money pages receive priority placement and higher link density.
 */
export function getGuideLinks(guideSlug: string): SuperclusterLinkRecommendation[] {
  const cluster = getClusterForGuide(guideSlug);
  if (!cluster) return [];

  const recs: SuperclusterLinkRecommendation[] = [];
  const isPillar = guideSlug === cluster.pillarSlug;
  const currentPath = `/guides/${guideSlug}`;

  // Track added paths to avoid duplicates
  const added = new Set<string>();
  const addRec = (rec: SuperclusterLinkRecommendation) => {
    if (!added.has(rec.targetPath)) {
      added.add(rec.targetPath);
      recs.push(rec);
    }
  };

  // 0. Money page boost — prioritize links to top-30 commercial pages
  const moneyGuides = cluster.priorityPages
    .filter(pp => `/guides/${pp.slug}` !== currentPath && `/collections/${pp.slug}` !== currentPath)
    .slice(0, isPillar ? 6 : 3);

  moneyGuides.forEach((pp, i) => {
    const path = pp.type === 'guide' ? `/guides/${pp.slug}` : `/collections/${pp.slug}`;
    const anchorPool: ('exact' | 'partial' | 'semantic')[] = ['exact', 'partial', 'semantic'];
    addRec({
      targetPath: path,
      targetType: pp.type === 'guide' ? 'guide' : 'collection',
      anchor: pp.slug.replace(/-/g, ' '),
      anchorType: anchorPool[i % 3],
      priority: 11 + pp.boost, // Money pages get highest priority
    });
  });

  // 1. Link to pillar (unless this IS the pillar)
  if (!isPillar) {
    addRec({
      targetPath: `/guides/${cluster.pillarSlug}`,
      targetType: 'pillar',
      anchor: cluster.anchors.exact[0] || cluster.label,
      anchorType: 'exact',
      priority: 10,
    });
  }

  // 2. Link to collection hub
  addRec({
    targetPath: `/collections/${cluster.collectionSlug}`,
    targetType: 'collection',
    anchor: cluster.anchors.partial[0] || `shop ${cluster.label.toLowerCase()}`,
    anchorType: 'partial',
    priority: 9,
  });

  // 3. Sibling guides (2-4, or 20 for pillars)
  const siblings = cluster.guideSlugs
    .filter(s => s !== guideSlug && s !== cluster.pillarSlug)
    .slice(0, isPillar ? 20 : 4);

  siblings.forEach((slug, i) => {
    const anchorPool: ('exact' | 'partial' | 'semantic')[] = ['exact', 'partial', 'semantic'];
    addRec({
      targetPath: `/guides/${slug}`,
      targetType: 'guide',
      anchor: slug.replace(/-/g, ' '),
      anchorType: anchorPool[i % 3],
      priority: 7 - Math.floor(i / 2),
    });
  });

  // 4. Related collections
  cluster.relatedCollections.slice(0, 2).forEach(coll => {
    addRec({
      targetPath: `/collections/${coll}`,
      targetType: 'collection',
      anchor: coll.replace(/-/g, ' '),
      anchorType: 'semantic',
      priority: 6,
    });
  });

  // 5. Cross-cluster pillar link (1 max)
  const siblings2 = getSiblingSuperclusters(cluster.id);
  if (siblings2.length > 0) {
    const cross = siblings2[0];
    addRec({
      targetPath: `/guides/${cross.pillarSlug}`,
      targetType: 'pillar',
      anchor: cross.anchors.semantic[0] || cross.label,
      anchorType: 'semantic',
      priority: 5,
    });
  }

  return recs.sort((a, b) => b.priority - a.priority);
}

/**
 * Generate link recommendations for a collection page.
 * Returns: 1 pillar + 3-8 guides (money pages prioritized) + related collections
 */
export function getCollectionLinks(collectionSlug: string): SuperclusterLinkRecommendation[] {
  const cluster = getClusterForCollection(collectionSlug);
  if (!cluster) return [];

  const recs: SuperclusterLinkRecommendation[] = [];
  const added = new Set<string>();
  const addRec = (rec: SuperclusterLinkRecommendation) => {
    if (!added.has(rec.targetPath)) {
      added.add(rec.targetPath);
      recs.push(rec);
    }
  };

  // 1. Pillar link
  addRec({
    targetPath: `/guides/${cluster.pillarSlug}`,
    targetType: 'pillar',
    anchor: cluster.anchors.exact[0] || `${cluster.label} buying guide`,
    anchorType: 'exact',
    priority: 10,
  });

  // 1b. Money page guides first (boosted priority)
  const moneyGuides = cluster.priorityPages
    .filter(pp => pp.type === 'guide' && `/collections/${collectionSlug}` !== `/collections/${pp.slug}`)
    .slice(0, 4);

  moneyGuides.forEach((pp, i) => {
    const anchorPool: ('exact' | 'partial' | 'semantic')[] = ['exact', 'partial', 'semantic'];
    addRec({
      targetPath: `/guides/${pp.slug}`,
      targetType: 'guide',
      anchor: pp.slug.replace(/-/g, ' '),
      anchorType: anchorPool[i % 3],
      priority: 9 + pp.boost,
    });
  });

  // 2. Remaining cluster guides (3-8)
  cluster.guideSlugs.slice(0, 8).forEach((slug, i) => {
    const anchorPool: ('exact' | 'partial' | 'semantic')[] = ['exact', 'partial', 'semantic'];
    addRec({
      targetPath: `/guides/${slug}`,
      targetType: 'guide',
      anchor: slug.replace(/-/g, ' '),
      anchorType: anchorPool[i % 3],
      priority: 8 - Math.floor(i / 3),
    });
  });

  // 3. Related collections
  const otherCollections = [cluster.collectionSlug, ...cluster.relatedCollections]
    .filter(s => s !== collectionSlug)
    .slice(0, 3);

  otherCollections.forEach(coll => {
    addRec({
      targetPath: `/collections/${coll}`,
      targetType: 'collection',
      anchor: coll.replace(/-/g, ' '),
      anchorType: 'partial',
      priority: 6,
    });
  });

  return recs.sort((a, b) => b.priority - a.priority);
}

/**
 * Generate link recommendations for a product page.
 * Returns: 1 guide + 1 collection + optional buying guide
 */
export function getProductLinks(productCategory: string | null, productName: string): SuperclusterLinkRecommendation[] {
  if (!productCategory) return [];

  const catLower = productCategory.toLowerCase();
  const cluster = SUPERCLUSTERS.find(c =>
    c.productCategories.some(pc => pc.toLowerCase() === catLower)
  );
  if (!cluster) return [];

  const recs: SuperclusterLinkRecommendation[] = [];

  // 1. Related guide
  const topGuide = cluster.guideSlugs[0];
  if (topGuide) {
    recs.push({
      targetPath: `/guides/${topGuide}`,
      targetType: 'guide',
      anchor: `${cluster.label} buying guide`,
      anchorType: 'semantic',
      priority: 8,
    });
  }

  // 2. Collection
  recs.push({
    targetPath: `/collections/${cluster.collectionSlug}`,
    targetType: 'collection',
    anchor: `browse all ${cluster.label.toLowerCase()}`,
    anchorType: 'partial',
    priority: 7,
  });

  // 3. Pillar (learn more)
  recs.push({
    targetPath: `/guides/${cluster.pillarSlug}`,
    targetType: 'pillar',
    anchor: `complete ${cluster.label.toLowerCase()} guide`,
    anchorType: 'natural' as any,
    priority: 6,
  });

  return recs;
}

// ============= REPORTING =============

export interface SuperclusterReport {
  clusterId: string;
  label: string;
  pillarSlug: string;
  totalGuides: number;
  totalCollections: number;
  priorityPages: number;
  estimatedInternalLinks: number;
}

export function generateSuperclusterReport(): {
  clusters: SuperclusterReport[];
  totalGuides: number;
  totalCollections: number;
  totalEstimatedLinks: number;
} {
  const clusters = SUPERCLUSTERS.map(c => {
    const guideLinks = c.guideSlugs.length * 8; // avg 8 links per guide
    const collectionLinks = (1 + c.relatedCollections.length) * 6; // avg 6 per collection
    const pillarLinks = 20; // pillar page links
    const estimatedInternalLinks = guideLinks + collectionLinks + pillarLinks;

    return {
      clusterId: c.id,
      label: c.label,
      pillarSlug: c.pillarSlug,
      totalGuides: c.guideSlugs.length,
      totalCollections: 1 + c.relatedCollections.length,
      priorityPages: c.priorityPages.length,
      estimatedInternalLinks,
    };
  });

  return {
    clusters,
    totalGuides: clusters.reduce((s, c) => s + c.totalGuides, 0),
    totalCollections: clusters.reduce((s, c) => s + c.totalCollections, 0),
    totalEstimatedLinks: clusters.reduce((s, c) => s + c.estimatedInternalLinks, 0),
  };
}
