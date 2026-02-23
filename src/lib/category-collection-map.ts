/**
 * Category → SEO Collection URL Mapping
 * 
 * Maps product category names/slugs to their canonical SEO collection URLs.
 * Used to prevent authority leakage to /products?category= filter pages.
 */

const CATEGORY_TO_COLLECTION: Record<string, string> = {
  // Top-level pet types
  'dogs': '/collections/dogs',
  'cats': '/collections/cats',

  // Dog subcategories
  'dog-beds': '/collections/orthopedic-calming-dog-beds',
  'orthopedic-dog-beds': '/collections/best-orthopedic-dog-beds',
  'orthopedic-beds': '/collections/best-orthopedic-dog-beds',
  'memory-foam-dog-beds': '/collections/memory-foam-orthopedic-dog-bed',
  'senior-dog-beds': '/collections/orthopedic-dog-bed-senior-dogs',
  'dog-toys': '/collections/best-interactive-dog-toys',
  'dog-training': '/dog/dog-training-behavior-tools',
  'dog-collars-leashes': '/dog/dog-training-behavior-tools',
  'dog-carriers': '/collections/dog-travel-accessories',
  'dog-car-seats': '/collections/best-dog-car-seats',
  'dog-car-safety': '/collections/dog-car-travel-safety-seats',
  'dog-houses': '/collections/dogs',
  'dog-bowls-feeders': '/collections/best-slow-feeder-dog-bowls',
  'dog-food-treats': '/collections/dogs',
  'dog-grooming': '/collections/best-dog-grooming-kits',
  'dog-clothing': '/collections/dogs',

  // Cat subcategories
  'cat-beds': '/collections/best-cat-beds',
  'cat-trees-and-condos': '/collections/cat-condos',
  'cat-toys': '/collections/best-cat-toys-for-indoor-cats',
  'cat-litter-boxes': '/collections/best-cat-litter-boxes',
  'cat-scratching-posts': '/collections/best-cat-scratching-posts',
  'cat-carriers': '/collections/best-cat-carriers',
  'cat-bowls-feeders': '/collections/automatic-cat-feeders',
  'cat-furniture': '/collections/cat-condos',
  'cat-houses': '/collections/cats',
  'cat-grooming': '/collections/cats',
  'cat-collars-accessories': '/collections/cats',
  'cat-hammocks': '/collections/best-cat-window-perches',
  'cat-exercise-wheels': '/collections/indoor-cat-enrichment',

  // Small pets
  'guinea-pig-cages': '/collections/guinea-pig-cages-playpens',
  'guinea-pig-toys': '/collections/guinea-pig-cages-playpens',
  'hamster-cages': '/collections/dogs', // fallback - no collection yet
  'hamster-wheels': '/collections/dogs',
  'rabbit-cages': '/collections/dogs',
  'rabbits': '/collections/dogs',
  'small-pets': '/collections/dogs',

  // Pet generic
  'pet-beds': '/collections/orthopedic-calming-dog-beds',
  'pet-furniture': '/collections/cat-condos',
  'pet-houses': '/collections/dogs',
  'pet-collars-leashes': '/collections/best-dog-harnesses',
  'pet-training': '/collections/dog-enrichment-toys',
  'pet-bags': '/collections/dog-travel-accessories',
  'pet-supplies': '/collections/dogs',
};

/**
 * Normalize a category name/slug to a lookup key.
 * "Dog Beds" → "dog-beds", "Cat Trees & Condos" → "cat-trees-and-condos"
 */
function normalizeCategory(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get the canonical SEO collection URL for a product category.
 * Falls back to /products?category=X if no mapping exists.
 */
export function getCategoryCollectionUrl(categoryNameOrSlug: string): string {
  const normalized = normalizeCategory(categoryNameOrSlug);
  return CATEGORY_TO_COLLECTION[normalized]
    || `/products?category=${encodeURIComponent(categoryNameOrSlug)}`;
}

/**
 * Check if a category has a dedicated SEO collection page.
 */
export function hasSeoCollection(categoryNameOrSlug: string): boolean {
  const normalized = normalizeCategory(categoryNameOrSlug);
  return normalized in CATEGORY_TO_COLLECTION;
}

/**
 * Get collection URL suitable for breadcrumb schema (full URL).
 */
export function getCategoryCollectionFullUrl(categoryNameOrSlug: string, baseUrl: string): string {
  const path = getCategoryCollectionUrl(categoryNameOrSlug);
  return `${baseUrl}${path}`;
}
