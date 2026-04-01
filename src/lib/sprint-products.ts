/**
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
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
    name: 'Self-Cleaning Litter Box',
    price: 268.99,
    margin: 55,
    emotionalTrigger: 'Automatic cleaning with app control',
    primaryKeyword: 'automatic cat litter box',
    conversionScore: 95,
    contentCluster: 'litter-boxes',
    image: '/images/products/self-cleaning-litter-box.jpg',
  },
  {
    slug: 'all-in-one-cactus-cat-tree-with-climbing-frame-and-cozy-nest',
    name: 'Cactus Cat Tree',
    price: 88.99,
    margin: 55,
    emotionalTrigger: 'Adorable design cats actually use',
    primaryKeyword: 'cat tree cactus',
    conversionScore: 90,
    contentCluster: 'cat-trees',
    image: '/images/products/cactus-cat-tree.jpg',
  },
  {
    slug: 'dog-cot-cooling-pet-bed-3',
    name: 'Elevated Cooling Dog Bed',
    price: 127.99,
    margin: 60,
    emotionalTrigger: 'Comfortable elevated rest for dogs',
    primaryKeyword: 'elevated cooling dog bed',
    conversionScore: 88,
    contentCluster: 'dog-beds',
    image: '/images/products/elevated-cooling-dog-bed.jpg',
  },
  {
    slug: 'cat-litter-box-enclosure-with-barn-door-cat-hole-31-5-x-21-x-20-white',
    name: 'Litter Box Furniture',
    price: 176.99,
    margin: 52,
    emotionalTrigger: 'Discreet litter enclosure for home',
    primaryKeyword: 'cat litter box furniture',
    conversionScore: 86,
    contentCluster: 'litter-boxes',
    image: '/images/products/litter-box-furniture.jpg',
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
    image: '/images/products/multi-level-cat-tree.jpg',
  },
  {
    slug: 'pawhut-cat-litter-box-enclosure-with-tall-legs-scratching-board-dark-brown',
    name: 'Hidden Litter Box Enclosure',
    price: 176.99,
    margin: 50,
    emotionalTrigger: 'Furniture-style privacy for cats',
    primaryKeyword: 'hidden litter box',
    conversionScore: 82,
    contentCluster: 'litter-boxes',
    image: '/images/products/hidden-litter-box.jpg',
  },
  {
    slug: '35-inch-modern-cat-tree-for-indoor-adult-cats-with-wooden-scratching-posts-cat-133c',
    name: 'Modern Cat Tree',
    price: 158.99,
    margin: 53,
    emotionalTrigger: 'Clean modern design for home',
    primaryKeyword: 'modern cat tree',
    conversionScore: 80,
    contentCluster: 'cat-trees',
    image: '/images/products/modern-cat-tree.jpg',
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
    image: '/images/products/dog-sofa-bed.jpg',
  },
];

/** Slugs for quick lookup */
export const SPRINT_SLUGS = new Set(SPRINT_PRODUCTS.map(p => p.slug));

/** Check if a product is a sprint product */
export const isSprintProduct = (slug: string): boolean => SPRINT_SLUGS.has(slug);

/** Get sprint products sorted by conversion score */
export const getTopSprintProducts = (count = 5) =>
  [...SPRINT_PRODUCTS].sort((a, b) => b.conversionScore - a.conversionScore).slice(0, count);
