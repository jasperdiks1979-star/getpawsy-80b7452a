/**
 * Sprint Products (INTERNAL ANALYTICS ONLY — not a shopper-facing source of truth)
 *
 * Shopper-facing rails must use `@/lib/catalog-eligibility` (live products_public).
 * This list only feeds internal link-equity / revenue-tier diagnostics.
 *
 * Sprint Products — DB-verified product slugs for Trending Now strip.
 * Every slug here has been validated against the active product catalog.
 * No slug may be added without confirming it exists in the products table.
 */

export interface SprintProduct {
  slug: string;
  name: string;
  price: number;
  margin: number;
  emotionalTrigger: string;
  primaryKeyword: string;
  conversionScore: number;
  contentCluster: string;
  image: string;
}

export const SPRINT_PRODUCTS: SprintProduct[] = [
  {
    slug: 'cat-litter-box-enclosure-with-barn-door-cat-hole-31-5-x-21-x-20-white',
    name: 'Litter Box Furniture',
    price: 176.99,
    margin: 52,
    emotionalTrigger: 'Discreet litter enclosure for home',
    primaryKeyword: 'cat litter box furniture',
    conversionScore: 86,
    contentCluster: 'litter-boxes',
    image: '/__l5e/assets-v1/51b88be6-fc1f-49f8-8694-11c8772f079e/litter-box-furniture.webp',
  },
  {
    slug: '44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-0441',
    name: 'Multi-Level Cat Tree',
    price: 128.99,
    margin: 54,
    emotionalTrigger: 'Multi-level tower for active indoor cats',
    primaryKeyword: 'multi level cat tree',
    conversionScore: 84,
    contentCluster: 'cat-trees',
    image: '/__l5e/assets-v1/a30cd536-86f8-49b9-b02c-f2fb53f71f04/multi-level-cat-tree.webp',
  },
  {
    slug: 'dog-bed-pet-sofa',
    name: 'Dog Sofa Bed',
    price: 282.99,
    margin: 58,
    emotionalTrigger: 'Comfortable sofa-style bed for dogs',
    primaryKeyword: 'dog sofa bed',
    conversionScore: 78,
    contentCluster: 'dog-beds',
    image: '/__l5e/assets-v1/412679b1-deaa-4d37-9446-c572129dd461/dog-sofa-bed.webp',
  },
];

/** Slugs for quick lookup */
export const SPRINT_SLUGS = new Set(SPRINT_PRODUCTS.map(p => p.slug));

/** Check if a product is a sprint product */
export const isSprintProduct = (slug: string): boolean => SPRINT_SLUGS.has(slug);

/** Get sprint products sorted by conversion score */
export const getTopSprintProducts = (count = 5) =>
  [...SPRINT_PRODUCTS].sort((a, b) => b.conversionScore - a.conversionScore).slice(0, count);
