/**
 * Category → SEO Collection URL Mapping
 * 
 * Maps product category names/slugs to their canonical SEO collection URLs.
 * ONLY maps to verified active collection destinations.
 * 
 * Active collections (2026-04):
 *   dogs, cats, dog-beds, dog-travel-accessories, cat-trees-and-condos, cat-litter-boxes, all
 */

const CATEGORY_TO_COLLECTION: Record<string, string> = {
  // Top-level pet types
  'dogs': '/collections/dogs',
  'cats': '/collections/cats',

  // Dog subcategories → nearest valid active collection
  'dog-beds': '/collections/dog-beds',
  'orthopedic-dog-beds': '/collections/dog-beds',
  'orthopedic-beds': '/collections/dog-beds',
  'memory-foam-dog-beds': '/collections/dog-beds',
  'senior-dog-beds': '/collections/dog-beds',
  'dog-toys': '/collections/dogs',
  'dog-training': '/collections/dogs',
  'dog-collars-leashes': '/collections/dogs',
  'dog-carriers': '/collections/dog-travel-accessories',
  'dog-car-seats': '/collections/dog-travel-accessories',
  'dog-car-safety': '/collections/dog-travel-accessories',
  'dog-houses': '/collections/dogs',
  'dog-bowls-feeders': '/collections/dogs',
  'dog-food-treats': '/collections/dogs',
  'dog-grooming': '/collections/dogs',
  'dog-clothing': '/collections/dogs',

  // Cat subcategories → nearest valid active collection
  'cat-beds': '/collections/cats',
  'cat-trees-and-condos': '/collections/cat-trees-and-condos',
  'cat-toys': '/collections/cats',
  'cat-litter-boxes': '/collections/cat-litter-boxes',
  'cat-scratching-posts': '/collections/cat-trees-and-condos',
  'cat-carriers': '/collections/cats',
  'cat-bowls-feeders': '/collections/cats',
  'cat-furniture': '/collections/cat-trees-and-condos',
  'cat-houses': '/collections/cats',
  'cat-grooming': '/collections/cats',
  'cat-collars-accessories': '/collections/cats',
  'cat-hammocks': '/collections/cats',
  'cat-exercise-wheels': '/collections/cats',

  // Small pets / birds / non-core → /products
  'guinea-pig-cages': '/products',
  'guinea-pig-toys': '/products',
  'hamster-cages': '/products',
  'hamster-wheels': '/products',
  'rabbit-cages': '/products',
  'rabbit-hutches': '/products',
  'rabbits': '/products',
  'small-pets': '/products',
  'small-pet-accessories': '/products',
  'birds': '/products',
  'bird-cages': '/products',
  'bird-feeders': '/products',
  'bird-bowls-feeders': '/products',
  'bird-houses': '/products',
  'bird-nests': '/products',
  'bird-accessories': '/products',
  'bird-perches': '/products',
  'bird-toys': '/products',

  // Pet generic
  'pet-beds': '/collections/dog-beds',
  'pet-furniture': '/collections/cat-trees-and-condos',
  'pet-houses': '/collections/dogs',
  'pet-collars-leashes': '/collections/dogs',
  'pet-training': '/collections/dogs',
  'pet-bags': '/collections/dog-travel-accessories',
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
 * Falls back to /products if no mapping exists.
 */
export function getCategoryCollectionUrl(categoryNameOrSlug: string): string {
  const normalized = normalizeCategory(categoryNameOrSlug);
  return CATEGORY_TO_COLLECTION[normalized] || '/products';
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
