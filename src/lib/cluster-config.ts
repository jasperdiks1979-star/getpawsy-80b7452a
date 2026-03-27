/**
 * Topical Authority Cluster Configuration
 * 4 master clusters for Dog & Cat Training, Comfort, Health, and Enrichment.
 */

export type ClusterId = 
  | 'dog-training-behavior'
  | 'dog-comfort-recovery'
  | 'cat-enrichment-furniture'
  | 'cat-hygiene-litter';

export interface ClusterConfig {
  id: ClusterId;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  guidePath: string;
  keywords: string[];
  categories: string[];
}

export const CLUSTERS: Record<ClusterId, ClusterConfig> = {
  'dog-training-behavior': {
    id: 'dog-training-behavior',
    label: 'Dog Training & Behavior',
    shortLabel: 'Dog Training',
    description: 'Expert-reviewed tools and guides for dog training, behavior correction, and obedience.',
    icon: '🐕',
    guidePath: '/collections/dog',
    keywords: ['training', 'behavior', 'obedience', 'leash', 'collar', 'harness', 'toy', 'puzzle'],
    categories: ['Dog Training', 'Dog Collars & Leashes', 'Dog Toys'],
  },
  'dog-comfort-recovery': {
    id: 'dog-comfort-recovery',
    label: 'Dog Comfort & Recovery',
    shortLabel: 'Dog Comfort',
    description: 'Orthopedic beds, carriers, grooming essentials, and recovery products for dogs.',
    icon: '🛏️',
    guidePath: '/collections/dog',
    keywords: ['bed', 'comfort', 'orthopedic', 'carrier', 'travel', 'grooming', 'recovery', 'feeding'],
    categories: ['Dog Beds', 'Dog Houses', 'Dog Carriers', 'Dog Bowls & Feeders', 'Dog Grooming', 'Dog Food & Treats'],
  },
  'cat-enrichment-furniture': {
    id: 'cat-enrichment-furniture',
    label: 'Cat Enrichment & Furniture',
    shortLabel: 'Cat Enrichment',
    description: 'Cat trees, scratching posts, interactive toys, and furniture for indoor enrichment.',
    icon: '🐈',
    guidePath: '/collections/cat',
    keywords: ['cat tree', 'scratching', 'enrichment', 'furniture', 'condo', 'toy', 'play', 'climbing'],
    categories: ['Cat Trees & Condos', 'Cat Toys', 'Cat Scratching Posts', 'Cat Houses', 'Cat Beds', 'Cat Carriers', 'Cat Bowls & Feeders', 'Cat Collars & Accessories'],
  },
  'cat-hygiene-litter': {
    id: 'cat-hygiene-litter',
    label: 'Cat Hygiene & Litter Solutions',
    shortLabel: 'Cat Hygiene',
    description: 'Litter boxes, self-cleaning solutions, and grooming products for a clean home.',
    icon: '🧹',
    guidePath: '/collections/cat',
    keywords: ['litter', 'litter box', 'self-cleaning', 'hygiene', 'grooming', 'odor', 'deodorizer'],
    categories: ['Cat Litter Boxes', 'Cat Grooming'],
  },
};

export const ALL_CLUSTER_IDS = Object.keys(CLUSTERS) as ClusterId[];

/** Get cluster config from a cluster ID, returns null if invalid */
export function getCluster(id: string | null | undefined): ClusterConfig | null {
  if (!id) return null;
  return CLUSTERS[id as ClusterId] ?? null;
}

/** Derive cluster from a product category string */
export function inferClusterFromCategory(category: string): ClusterId | null {
  const cat = category.toLowerCase();
  for (const cluster of Object.values(CLUSTERS)) {
    if (cluster.categories.some(c => c.toLowerCase() === cat)) {
      return cluster.id;
    }
  }
  return null;
}
