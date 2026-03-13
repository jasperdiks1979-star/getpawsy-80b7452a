/**
 * SEO Topic Map — Hub-spoke configuration for the 10 priority clusters.
 *
 * Each cluster defines:
 * - 1 primary collection page (hub)
 * - Related guide slugs (spokes → informational)
 * - Related product categories (spokes → commercial)
 * - Cross-linked sibling clusters for internal linking
 *
 * Used by on-page templates to automatically render contextual cross-links.
 */

export interface TopicCluster {
  /** Unique cluster key */
  id: string;
  /** Display label */
  label: string;
  /** Primary collection slug (the hub) */
  collectionSlug: string;
  /** Species silo */
  species: 'dog' | 'cat' | 'multi';
  /** Primary target keyword */
  primaryKeyword: string;
  /** Guide slugs that belong to this cluster */
  guidesSlugs: string[];
  /** Product category names matching this cluster */
  productCategories: string[];
  /** Sibling cluster IDs for cross-linking */
  siblingClusterIds: string[];
}

export const TOPIC_CLUSTERS: TopicCluster[] = [
  {
    id: 'dog-beds',
    label: 'Dog Beds',
    collectionSlug: 'orthopedic-calming-dog-beds',
    species: 'dog',
    primaryKeyword: 'orthopedic dog beds',
    guidesSlugs: [
      'are-orthopedic-dog-beds-worth-it',
      'how-to-choose-the-right-dog-bed-size',
      'best-dog-bed-materials-explained',
      'calming-dog-bed-anxiety-relief',
      'best-dog-bed-2026',
      'best-orthopedic-dog-bed-2026',
      'best-dog-beds-large-breeds-2026',
      'orthopedic-dog-beds-for-senior-dogs',
      'best-elevated-dog-bed',
      'waterproof-orthopedic-dog-beds-guide',
      'best-dog-bed-hip-dysplasia',
      'best-dog-bed-for-small-dogs',
      'best-dog-bed-for-crate',
      'memory-foam-vs-egg-crate-dog-beds',
      'best-dog-beds-for-arthritis',
    ],
    productCategories: ['Dog Beds', 'Dog Houses'],
    siblingClusterIds: ['dog-toys', 'dog-travel'],
  },
  {
    id: 'slow-feeders',
    label: 'Slow Feeder Dog Bowls',
    collectionSlug: 'best-slow-feeder-dog-bowls',
    species: 'dog',
    primaryKeyword: 'slow feeder dog bowls',
    guidesSlugs: [
      'slow-feeder-bowl-benefits-dogs',
      'best-bowl-for-fast-eating-dog',
      'elevated-vs-floor-dog-bowls',
      'dog-bloat-prevention-tips',
    ],
    productCategories: ['Dog Bowls & Feeders', 'Dog Bowls'],
    siblingClusterIds: ['dog-training', 'dog-beds'],
  },
  {
    id: 'cat-litter-boxes',
    label: 'Cat Litter Boxes',
    collectionSlug: 'best-cat-litter-boxes',
    species: 'cat',
    primaryKeyword: 'best cat litter boxes',
    guidesSlugs: [
      'best-cat-litter-box-2026',
      'litter-box-placement-tips',
      'best-litter-box-for-multiple-cats',
      'how-to-reduce-litter-box-odor',
      'best-self-cleaning-litter-box-2026',
      'best-cat-litter-for-odor-control',
      'best-extra-large-litter-boxes',
      'best-litter-box-kittens',
      'best-litter-box-senior-cats',
      'best-low-tracking-litter-box',
      'best-litter-boxes-apartments-2026',
      'best-cat-litter-box-furniture-enclosures-2026',
      'best-cat-litter-box-for-large-cats',
      'how-to-stop-cat-litter-smell',
    ],
    productCategories: ['Cat Litter Boxes'],
    siblingClusterIds: ['cat-trees', 'cat-toys'],
  },
  {
    id: 'cat-trees',
    label: 'Cat Trees & Condos',
    collectionSlug: 'cat-trees-and-condos',
    species: 'cat',
    primaryKeyword: 'best cat trees',
    guidesSlugs: [
      'best-cat-trees-large-cats-2026',
      'cat-tree-vs-scratching-post',
      'how-to-choose-cat-tree-height',
      'where-to-place-cat-tree-living-room',
      'modern-cat-trees-home-design',
      'best-luxury-cat-tree',
      'best-cat-tree-for-kittens',
      'best-cat-tree-maine-coon',
      'best-cat-trees-small-apartments',
      'best-cat-tree-for-two-cats',
      'best-cat-tree-for-bengal-cats',
      'best-cat-trees-2026',
      'cat-tree-stability-guide',
      'choosing-safe-cat-tree-indoor',
    ],
    productCategories: ['Cat Trees & Condos', 'Cat Furniture', 'Cat Scratching Posts'],
    siblingClusterIds: ['cat-litter-boxes', 'cat-toys'],
  },
  {
    id: 'pet-strollers',
    label: 'Pet Strollers',
    collectionSlug: 'best-pet-strollers',
    species: 'multi',
    primaryKeyword: 'best pet strollers',
    guidesSlugs: [
      'pet-stroller-buying-guide-2026',
      'best-pet-stroller-for-large-dogs',
      'jogging-stroller-vs-standard-pet-stroller',
      'pet-stroller-for-senior-dogs',
      'best-dog-stroller',
      'best-dog-stroller-for-large-dogs',
    ],
    productCategories: ['Pet Strollers', 'Dog Strollers'],
    siblingClusterIds: ['dog-travel', 'dog-beds'],
  },
  {
    id: 'dog-travel',
    label: 'Dog Travel',
    collectionSlug: 'dog-travel-accessories',
    species: 'dog',
    primaryKeyword: 'best dog travel accessories',
    guidesSlugs: [
      'dog-travel-safety-guide',
      'traveling-with-dogs-tips',
      'dog-travel-safety-equipment-guide',
      'dog-car-harness-guide',
      'best-dog-car-seat',
      'crash-tested-dog-car-seat-guide',
      'best-pet-carrier-airline-approved',
      'best-dog-carriers-for-travel',
      'best-portable-pet-water-bottle',
      'best-dog-car-seat-for-small-dogs',
      'best-dog-ramp-for-car',
      'pet-travel-checklist',
    ],
    productCategories: ['Dog Carriers', 'Dog Car Seats'],
    siblingClusterIds: ['pet-strollers', 'dog-toys'],
  },
  {
    id: 'dog-toys',
    label: 'Dog Toys',
    collectionSlug: 'best-interactive-dog-toys',
    species: 'dog',
    primaryKeyword: 'best interactive dog toys',
    guidesSlugs: [
      'best-puzzle-toys-for-dogs-2026',
      'mental-stimulation-games-for-dogs',
      'indestructible-toys-power-chewers',
      'diy-dog-enrichment-activities',
      'best-toys-for-aggressive-chewers',
      'best-toys-for-bored-dogs',
      'best-dog-puzzle-toys',
      'best-dog-chew-toys',
      'best-dog-toys-mental-stimulation',
      'best-dog-toy-for-puppies',
      'puppy-chewing-solutions',
    ],
    productCategories: ['Dog Toys'],
    siblingClusterIds: ['dog-beds', 'dog-travel'],
  },
  {
    id: 'cat-toys',
    label: 'Cat Toys',
    collectionSlug: 'best-interactive-cat-toys',
    species: 'cat',
    primaryKeyword: 'best interactive cat toys',
    guidesSlugs: [
      'best-electronic-cat-toys-2026',
      'indoor-cat-enrichment-guide',
      'laser-toys-safe-for-cats',
      'diy-cat-toy-ideas',
      'best-automatic-cat-toy',
      'best-toys-for-bored-indoor-cats',
      'best-interactive-cat-toys-that-work',
      'best-cat-enrichment-ideas-indoor-cats-2026',
      'how-to-entertain-an-indoor-cat',
    ],
    productCategories: ['Cat Toys'],
    siblingClusterIds: ['cat-trees', 'cat-litter-boxes'],
  },
  {
    id: 'dog-training',
    label: 'Dog Training',
    collectionSlug: 'dog-training-tools',
    species: 'dog',
    primaryKeyword: 'best dog training tools',
    guidesSlugs: [
      'best-dog-training-tools',
      'best-dog-training-collar',
      'dog-leash-control-guide',
      'dog-behavior-training-guide',
      'puppy-training-first-30-days',
      'leash-training-dog-step-by-step',
      'how-to-stop-dog-barking',
      'dog-potty-training-complete-guide',
    ],
    productCategories: ['Dog Training', 'Dog Collars & Leashes'],
    siblingClusterIds: ['dog-toys', 'dog-beds'],
  },
  {
    id: 'orthopedic-dog-beds',
    label: 'Orthopedic Dog Beds',
    collectionSlug: 'best-orthopedic-dog-beds',
    species: 'dog',
    primaryKeyword: 'best orthopedic dog beds',
    guidesSlugs: [
      'are-orthopedic-dog-beds-worth-it',
      'best-dog-bed-materials-explained',
      'how-to-choose-the-right-dog-bed-size',
      'best-dog-bed-for-senior-dogs',
      'best-orthopedic-dog-bed-large-dogs-2026',
      'best-dog-bed-hip-dysplasia',
      'best-dog-beds-for-arthritis',
      'signs-dog-needs-joint-support',
    ],
    productCategories: ['Dog Beds'],
    siblingClusterIds: ['dog-beds', 'dog-travel'],
  },
];

/** Lookup cluster by collection slug */
export function getTopicClusterByCollection(slug: string): TopicCluster | undefined {
  return TOPIC_CLUSTERS.find(tc => tc.collectionSlug === slug);
}

/** Lookup cluster by ID */
export function getTopicCluster(id: string): TopicCluster | undefined {
  return TOPIC_CLUSTERS.find(tc => tc.id === id);
}

/** Get sibling clusters for cross-linking */
export function getSiblingClusters(clusterId: string): TopicCluster[] {
  const cluster = getTopicCluster(clusterId);
  if (!cluster) return [];
  return cluster.siblingClusterIds
    .map(id => getTopicCluster(id))
    .filter((tc): tc is TopicCluster => !!tc);
}

/** Infer topic cluster from product category */
export function inferTopicClusterFromCategory(category: string): TopicCluster | undefined {
  const cat = category.toLowerCase();
  return TOPIC_CLUSTERS.find(tc =>
    tc.productCategories.some(pc => pc.toLowerCase() === cat)
  );
}
