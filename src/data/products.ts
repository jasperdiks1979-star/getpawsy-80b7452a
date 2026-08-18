export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  comparePrice?: number;
  image: string;
  images: string[];
  category: string;
  productType?: string;
  tags: string[];
  rating: number;
  reviews: number;
  inStock: boolean;
  featured?: boolean;
}

export const categories = [
  { id: 'cat-trees', name: 'Cat Trees & Condos', icon: '🐈', description: 'Premium climbing towers, condos & scratching trees for cats' },
  { id: 'cat-litter', name: 'Cat Litter Boxes', icon: '🐱', description: 'Self-cleaning, enclosed & furniture-style litter boxes' },
  { id: 'dog-beds', name: 'Dog Beds', icon: '🐕', description: 'Elevated cooling beds & outdoor pet cots' },
  { id: 'dog-travel', name: 'Dog Travel', icon: '✈️', description: 'Strollers, carriers & travel gear for dogs' },
];

/**
 * DEPRECATED as a product source of truth.
 *
 * The live catalog (products_public / products_detail) is the ONLY authoritative
 * source for shopper-facing product data. This array is intentionally empty so a
 * stale local copy can never resurrect a deleted, inactive or zero-stock product.
 * The helpers below are kept for type/API compatibility with legacy callers and
 * simply resolve to nothing.
 */
export const products: Product[] = [];

export const getFeaturedProducts = () => products.filter(p => p.featured);
export const getProductsByCategory = (category: string) => products.filter(p => p.category === category);
export const getProductById = (id: string) => products.find(p => p.id === id);
export const getProductBySlug = (slug: string) => products.find(p => p.slug === slug);
export const getProductBySlugOrId = (value: string) => getProductBySlug(value) ?? getProductById(value);
