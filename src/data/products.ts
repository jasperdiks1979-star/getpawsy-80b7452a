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
  { id: 'cat-trees', name: 'Cat Trees & Condos', icon: '🐈', description: 'Climbing towers, condos & scratching trees for cats' },
  { id: 'cat-litter', name: 'Cat Litter Boxes', icon: '🐱', description: 'Litter boxes, enclosures & litter accessories' },
  { id: 'cat-furniture', name: 'Cat Furniture', icon: '🪑', description: 'Scratching posts, tunnels & cat shelves' },
  { id: 'dog-beds', name: 'Dog Beds', icon: '🐕', description: 'Orthopedic, cooling & cozy beds for dogs' },
  { id: 'dog-travel', name: 'Dog Travel', icon: '✈️', description: 'Carriers, strollers & travel gear for dogs' },
];

/**
 * Static product fallback set — DB-verified slugs only.
 * Used as hydration fallback when the backend is unreachable.
 */
export const products: Product[] = [
  {
    id: '74259a91-2759-4ae6-9dae-1c1423ec99f7',
    slug: 'flower-cat-tree-no-shipments-on-weekends',
    name: 'GetPawsy Flower Cat Tree Condo – Multi-Level Scratching Post for Cats',
    description: 'Multi-level flower-themed cat tree with scratching posts, cozy condos, and elevated perches. Built with natural sisal rope and plush cushions for indoor cats.',
    price: 604.99,
    image: 'https://cf.cjdropshipping.com/17689536/fa631739-871c-4f92-94a0-1a2d4163c7a0.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/fa631739-871c-4f92-94a0-1a2d4163c7a0.jpg'],
    category: 'Cat Trees & Condos',
    tags: ['cat tree', 'condo', 'scratching post'],
    rating: 4.6,
    reviews: 145,
    inStock: true,
    featured: true,
  },
  {
    id: '128e0207-8a94-4d71-b428-5b7f5002528f',
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
    name: 'GetPawsy Automatic Cat Litter Box – App-Controlled Self-Cleaning Design',
    description: 'Self-cleaning cat litter box with smartphone app control, infrared cat detection, and built-in deodorizing system. 60L capacity for multi-cat households.',
    price: 268.99,
    image: 'https://cf.cjdropshipping.com/18f614cb-6909-40a2-a031-1d251708ebae.png',
    images: ['https://cf.cjdropshipping.com/18f614cb-6909-40a2-a031-1d251708ebae.png'],
    category: 'Cat Litter Boxes',
    tags: ['litter box', 'automatic', 'self-cleaning', 'smart'],
    rating: 4.7,
    reviews: 312,
    inStock: true,
    featured: true,
  },
  {
    id: '18028997-901a-40b8-8790-9e7b3ec558bf',
    slug: 'dog-stroller-pet-stroller',
    name: 'GetPawsy Portable Dog Stroller – Travel Carrier for Senior & Injured Dogs',
    description: 'Portable pet stroller for senior, recovering, or small dogs who need support during walks and outings. Foldable frame, mesh windows, all-terrain wheels.',
    price: 396.99,
    image: 'https://cf.cjdropshipping.com/17689536/a0135b83-b2d6-4104-ac80-2b56858109c3.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/a0135b83-b2d6-4104-ac80-2b56858109c3.jpg'],
    category: 'Dog Travel',
    tags: ['stroller', 'carrier', 'travel'],
    rating: 4.6,
    reviews: 156,
    inStock: true,
    featured: true,
  },
  {
    id: 'c7177ee4-5509-492f-965f-617402968f5c',
    slug: 'dog-cot-cooling-pet-bed-3',
    name: 'Orthopedic Dog Bed – Elevated Cooling Cot for Large & Medium Dogs',
    description: 'Elevated cooling dog bed with breathable mesh sleeping surface for indoor or outdoor use. Raised design supports airflow and everyday resting comfort.',
    price: 127.99,
    image: 'https://cf.cjdropshipping.com/17695584/cea797a4-58d8-4007-be42-58c3eeaa8723.jpg',
    images: ['https://cf.cjdropshipping.com/17695584/cea797a4-58d8-4007-be42-58c3eeaa8723.jpg'],
    category: 'Dog Beds',
    tags: ['dog bed', 'cooling', 'elevated'],
    rating: 4.5,
    reviews: 203,
    inStock: true,
  },
  {
    id: '1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
    slug: 'pawhut-cat-litter-box-enclosure-with-tall-legs-scratching-board-dark-brown',
    name: 'GetPawsy Hidden Cat Litter Box Enclosure – Furniture with Tall Legs & Scratching Board',
    description: 'Furniture-style cat litter box enclosure with tall legs, interior privacy space, and a built-in side scratching board.',
    price: 176.99,
    image: 'https://cf.cjdropshipping.com/8c7d9c65-6f57-40ac-b639-1ac694c256f0.jpg',
    images: ['https://cf.cjdropshipping.com/8c7d9c65-6f57-40ac-b639-1ac694c256f0.jpg'],
    category: 'Cat Litter Boxes',
    tags: ['litter box', 'enclosure', 'furniture'],
    rating: 4.4,
    reviews: 112,
    inStock: true,
  },
  {
    id: '133cdc48-0117-40d5-9aaf-1a81131ca9bb',
    slug: '35-inch-modern-cat-tree-for-indoor-adult-cats-with-wooden-scratching-posts-cat-133c',
    name: 'GetPawsy Modern Cat Tree – 35 Inch Wooden Scratching Post & Bed',
    description: 'Modern 35-inch cat tree with wooden scratching surfaces, elevated bed, and compact multi-level design. Built for indoor cats.',
    price: 158.99,
    image: 'https://cf.cjdropshipping.com/17664480/e75f68d4-a5f5-46e0-ae2d-217cc563ed2f.jpg',
    images: ['https://cf.cjdropshipping.com/17664480/e75f68d4-a5f5-46e0-ae2d-217cc563ed2f.jpg'],
    category: 'Cat Trees & Condos',
    tags: ['cat tree', 'modern', 'scratching post'],
    rating: 4.5,
    reviews: 89,
    inStock: true,
  },
  {
    id: 'ecef0b61-7c26-40de-a493-21fbb097e5c1',
    slug: '63-large-dog-crate-furniture-for-double-dog-wooden-dog-kennel-with-2-drawers-ecef',
    name: 'Dog Crate Furniture – Wooden Double Kennel Den with Drawers for Dogs',
    description: 'Wooden double-door dog crate that doubles as end table furniture. Two kennel compartments with lockable doors and side drawers.',
    price: 544.99,
    image: 'https://cf.cjdropshipping.com/17689536/0e8b1f85-1dd0-4cb8-bea2-39d361df1ba1.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/0e8b1f85-1dd0-4cb8-bea2-39d361df1ba1.jpg'],
    category: 'Dog Travel',
    tags: ['dog crate', 'furniture', 'kennel'],
    rating: 4.5,
    reviews: 78,
    inStock: true,
    featured: true,
  },
  {
    id: 'b460b81e-d8d7-4adf-8263-a56c54f4a7ea',
    slug: '4-6-in-dark-gray-cat-tree-tower-with-wide-base-3-large-hinding-condo-11-sisal-b460',
    name: 'Cat Tree Tower – Multi-Level 4.6 ft Dark Gray Condo with Scratch Posts',
    description: 'Standing 4.6 feet tall with 3 large hiding condos, 11 sisal scratching posts, and a wide stable base. Designed for homes with multiple cats.',
    price: 318.99,
    image: 'https://cf.cjdropshipping.com/17689536/4e3c98eb-6e96-49c3-9f77-b7a3c83d78f1.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/4e3c98eb-6e96-49c3-9f77-b7a3c83d78f1.jpg'],
    category: 'Cat Trees & Condos',
    tags: ['cat tree', 'tower', 'large cats'],
    rating: 4.5,
    reviews: 134,
    inStock: true,
  },
];

export const getFeaturedProducts = () => products.filter(p => p.featured);
export const getProductsByCategory = (category: string) => products.filter(p => p.category === category);
export const getProductById = (id: string) => products.find(p => p.id === id);
export const getProductBySlug = (slug: string) => products.find(p => p.slug === slug);
export const getProductBySlugOrId = (value: string) => getProductBySlug(value) ?? getProductById(value);
