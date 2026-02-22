/**
 * ULTRA GROWTH TRINITY — Sprint Products Config
 * 
 * Top 10 easiest-to-convert products selected by:
 * Margin × Emotional Appeal × Low Competition × Simple Purchase Decision
 * 
 * Each product gets maximum internal link weight, HeroProductBoost,
 * and dedicated content clusters.
 */

export interface SprintProduct {
  slug: string;
  name: string;
  price: number;
  margin: number;          // gross margin %
  emotionalTrigger: string;
  primaryKeyword: string;
  conversionScore: number; // 1-100
  contentCluster: string;
  image: string;
}

export const SPRINT_PRODUCTS: SprintProduct[] = [
  {
    slug: 'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner',
    name: 'Orthopedic Memory Foam Pet Bed',
    price: 69.49,
    margin: 58,
    emotionalTrigger: 'Joint pain relief for aging pets',
    primaryKeyword: 'orthopedic dog bed',
    conversionScore: 95,
    contentCluster: 'orthopedic-beds',
    image: 'https://cf.cjdropshipping.com/c8296810-eabc-444b-8b13-9cd466c098a6.jpg',
  },
  {
    slug: 'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo',
    name: 'Tactical Dog Harness & Safety Bundle',
    price: 63.99,
    margin: 62,
    emotionalTrigger: 'Keep your dog safe during car travel',
    primaryKeyword: 'dog car harness',
    conversionScore: 90,
    contentCluster: 'dog-car-safety',
    image: 'https://cf.cjdropshipping.com/63d3145a-4458-422e-9fe5-b63fc51ad711.jpg',
  },
  {
    slug: 'all-in-one-cactus-cat-tree-with-climbing-frame-and-cozy-nest',
    name: 'Cactus Cat Tree with Climbing Frame',
    price: 88.99,
    margin: 55,
    emotionalTrigger: 'Adorable design cats actually use',
    primaryKeyword: 'cat tree cactus',
    conversionScore: 88,
    contentCluster: 'cat-trees',
    image: 'https://oss-cf.cjdropshipping.com/product/2026/01/15/06/41c2bcde-5615-4832-8d42-0b10485bc94c_trans.jpeg',
  },
  {
    slug: 'dog-cot-cooling-pet-bed-3',
    name: 'Elevated Cooling Dog Bed',
    price: 54.99,
    margin: 60,
    emotionalTrigger: 'Beat the summer heat for your pup',
    primaryKeyword: 'elevated cooling dog bed',
    conversionScore: 86,
    contentCluster: 'dog-beds',
    image: '',
  },
  {
    slug: 'automatic-pet-feeder-6l-smart-food-dispenser',
    name: 'Smart Automatic Pet Feeder 6L',
    price: 72.99,
    margin: 52,
    emotionalTrigger: 'Never worry about feeding times again',
    primaryKeyword: 'automatic pet feeder',
    conversionScore: 84,
    contentCluster: 'pet-feeders',
    image: '',
  },
  {
    slug: 'pet-grooming-vacuum-kit-5-in-1',
    name: '5-in-1 Pet Grooming Vacuum Kit',
    price: 79.99,
    margin: 56,
    emotionalTrigger: 'Salon grooming without the mess',
    primaryKeyword: 'pet grooming vacuum',
    conversionScore: 82,
    contentCluster: 'grooming',
    image: '',
  },
  {
    slug: 'indestructible-dog-chew-toy-heavy-chewers',
    name: 'Indestructible Dog Chew Toy',
    price: 24.99,
    margin: 68,
    emotionalTrigger: 'Finally a toy that survives power chewers',
    primaryKeyword: 'indestructible dog toy',
    conversionScore: 80,
    contentCluster: 'dog-toys',
    image: '',
  },
  {
    slug: 'calming-donut-dog-bed-anti-anxiety',
    name: 'Calming Donut Dog Bed',
    price: 49.99,
    margin: 61,
    emotionalTrigger: 'Reduce anxiety and help them sleep',
    primaryKeyword: 'calming dog bed',
    conversionScore: 78,
    contentCluster: 'calming-beds',
    image: '',
  },
  {
    slug: 'interactive-cat-toy-laser-feather-usb',
    name: 'Interactive Cat Toy Combo',
    price: 29.99,
    margin: 65,
    emotionalTrigger: 'Keep bored indoor cats entertained for hours',
    primaryKeyword: 'interactive cat toy',
    conversionScore: 76,
    contentCluster: 'cat-toys',
    image: '',
  },
  {
    slug: 'portable-dog-water-bottle-travel',
    name: 'Portable Dog Water Bottle',
    price: 19.99,
    margin: 70,
    emotionalTrigger: 'Hydration on every walk and hike',
    primaryKeyword: 'dog water bottle',
    conversionScore: 74,
    contentCluster: 'dog-travel',
    image: '',
  },
];

/** Slugs for quick lookup */
export const SPRINT_SLUGS = new Set(SPRINT_PRODUCTS.map(p => p.slug));

/** Check if a product is a sprint product */
export const isSprintProduct = (slug: string): boolean => SPRINT_SLUGS.has(slug);

/** Get sprint products sorted by conversion score */
export const getTopSprintProducts = (count = 5) =>
  [...SPRINT_PRODUCTS].sort((a, b) => b.conversionScore - a.conversionScore).slice(0, count);
