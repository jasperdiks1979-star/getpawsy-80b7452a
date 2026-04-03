/**
 * Category → SEO Collection URL Mapping
 * 
 * Maps product category names/slugs to their canonical SEO collection URLs.
 * Used to prevent authority leakage to /products?category= filter pages.
 */

const CATEGORY_TO_COLLECTION: Record<string, string> = {
  // Top-level pet types
  'dogs': '/collections/dog',
  'cats': '/collections/cat',

  // Dog subcategories
  'dog-beds': '/collections/dog-beds',
  'orthopedic-dog-beds': '/collections/best-orthopedic-dog-beds',
  'orthopedic-beds': '/collections/best-orthopedic-dog-beds',
  'memory-foam-dog-beds': '/collections/memory-foam-orthopedic-dog-bed',
  'senior-dog-beds': '/collections/orthopedic-dog-bed-senior-dogs',
  'dog-toys': '/collections/best-interactive-dog-toys',
  'dog-training': '/collections/all',
  'dog-collars-leashes': '/collections/dog-collars-leashes',
  'dog-carriers': '/collections/dog-carriers',
  'dog-car-seats': '/collections/all',
  'dog-car-safety': '/collections/all',
  'dog-houses': '/collections/dog',
  'dog-bowls-feeders': '/collections/best-slow-feeder-dog-bowls',
  'dog-food-treats': '/collections/dog',
  'dog-grooming': '/collections/best-dog-grooming-kits',
  'dog-clothing': '/collections/dog',

  // Cat subcategories
  'cat-beds': '/collections/best-cat-beds',
  'cat-trees-and-condos': '/collections/cat-condos',
  'cat-toys': '/collections/best-cat-toys-for-indoor-cats',
  'cat-litter-boxes': '/collections/cat-litter-boxes',
  'cat-scratching-posts': '/collections/best-cat-scratching-posts',
  'cat-carriers': '/collections/cats',
  'cat-bowls-feeders': '/collections/automatic-cat-feeders',
  'cat-furniture': '/collections/cat-condos',
  'cat-houses': '/collections/cat',
  'cat-grooming': '/collections/cat',
  'cat-collars-accessories': '/collections/cat',
  'cat-hammocks': '/collections/best-cat-window-perches',
  'cat-exercise-wheels': '/collections/indoor-cat-enrichment',

  // Small pets
  'guinea-pig-cages': '/collections/small-pet-accessories',
  'guinea-pig-toys': '/collections/small-pet-accessories',
  'hamster-cages': '/collections/hamster-cages',
  'hamster-wheels': '/collections/small-pet-accessories',
  'rabbit-cages': '/collections/rabbit-hutches',
  'rabbit-hutches': '/collections/rabbit-hutches',
  'rabbits': '/collections/rabbit-hutches',
  'small-pets': '/collections/small-pet-accessories',
  'small-pet-accessories': '/collections/small-pet-accessories',

  // Bird supplies
  'birds': '/collections/bird-houses',
  'bird-cages': '/collections/bird-houses',
  'bird-feeders': '/collections/bird-accessories',
  'bird-bowls-feeders': '/collections/bird-accessories',
  'bird-houses': '/collections/bird-houses',
  'bird-nests': '/collections/bird-houses',
  'bird-accessories': '/collections/bird-accessories',
  'bird-perches': '/collections/bird-accessories',
  'bird-toys': '/collections/bird-accessories',

  // Pet generic
  'pet-beds': '/collections/dog-beds',
  'pet-furniture': '/collections/cat-condos',
  'pet-houses': '/collections/dog',
  'pet-collars-leashes': '/collections/dogs',
  'pet-training': '/collections/all',
  'pet-bags': '/collections/all',
  'pet-supplies': '/products',
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
