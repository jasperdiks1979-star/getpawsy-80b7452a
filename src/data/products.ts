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
  { id: 'cats', name: 'Cats', icon: '🐈', description: 'Products for feline friends' },
  { id: 'dogs', name: 'Dogs', icon: '🐕', description: 'Everything for your canine companion' },
  { id: 'pets', name: 'All Pets', icon: '🐾', description: 'Products for all pets' },
];

/**
 * Static product fallback set — DB-verified slugs only.
 * Used as hydration fallback when Supabase is unreachable.
 * Every slug here exists in the products table with is_active = true and stock > 0.
 */
export const products: Product[] = [
  {
    id: 'getpawsy_128e0207-8a94-4d71-b428-5b7f5002528f',
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
    name: 'GetPawsy Automatic Cat Litter Box – App-Controlled Self-Cleaning Design',
    description: 'Automatic cat litter box with app control, deodorizing support, and infrared sensor-based operation. Designed to reduce manual cleaning and maintain a cleaner litter area. Suitable for multi-cat households.',
    price: 268.99,
    image: 'https://cf.cjdropshipping.com/18f614cb-6909-40a2-a031-1d251708ebae.png',
    images: ['https://cf.cjdropshipping.com/18f614cb-6909-40a2-a031-1d251708ebae.png'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Litter Boxes',
    tags: ['litter box', 'automatic', 'self-cleaning', 'smart'],
    rating: 4.7,
    reviews: 312,
    inStock: true,
    featured: true,
  },
  {
    id: 'getpawsy_1454395a-9a13-4c93-94a5-4264cb44434d',
    slug: 'flower-cat-tree-no-shipments-on-weekends-1',
    name: 'GetPawsy Flower Cat Tree Condo – Multi-Level Scratching Post for Cats',
    description: 'Flower-themed cat tree condo with multiple levels, scratching surfaces, and soft resting areas. Designed for indoor cats that like to climb, scratch, and lounge.',
    price: 604.99,
    image: 'https://cf.cjdropshipping.com/17689536/fa631739-871c-4f92-94a0-1a2d4163c7a0.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/fa631739-871c-4f92-94a0-1a2d4163c7a0.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Trees & Condos',
    tags: ['cat tree', 'condo', 'scratching post'],
    rating: 4.6,
    reviews: 145,
    inStock: true,
  },
  {
    id: 'getpawsy_0441e51b-d537-468b-8938-66b2dee6e6c9',
    slug: '44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-0441',
    name: 'GetPawsy Cat Tree – 44 Inch Multi-Level Condo with Perch & Hammock',
    description: '44-inch cat tree with spacious perch, enclosed condo, hammock, and scratching areas. Designed for indoor cats that enjoy climbing, resting, and daily activity.',
    price: 128.99,
    image: 'https://cf.cjdropshipping.com/17689536/ac9bfbd3-feb7-489e-9763-91606c12e1f3.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/ac9bfbd3-feb7-489e-9763-91606c12e1f3.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Trees & Condos',
    tags: ['cat tree', 'condo', 'hammock'],
    rating: 4.4,
    reviews: 98,
    inStock: true,
  },
  {
    id: 'getpawsy_0c484864-54ef-4068-a223-62fe828f7569',
    slug: 'dog-stroller-pet-stroller',
    name: 'GetPawsy Portable Dog Stroller – Travel Carrier for Senior & Injured Dogs',
    description: 'Portable dog stroller for senior, recovering, or small dogs that need extra support during outings. Suitable for travel, walks, and vet visits.',
    price: 396.99,
    image: 'https://cf.cjdropshipping.com/17689536/a0135b83-b2d6-4104-ac80-2b56858109c3.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/a0135b83-b2d6-4104-ac80-2b56858109c3.jpg'],
    category: 'dogs',
    productType: 'Pet Supplies > Dog Carriers',
    tags: ['stroller', 'carrier', 'travel'],
    rating: 4.6,
    reviews: 156,
    inStock: true,
    featured: true,
  },
  {
    id: 'getpawsy_1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
    slug: 'pawhut-cat-litter-box-enclosure-with-tall-legs-scratching-board-dark-brown',
    name: 'GetPawsy Hidden Cat Litter Box Enclosure – Furniture with Tall Legs & Scratching Board',
    description: 'Furniture-style cat litter box enclosure with tall legs, interior privacy space, and side scratching board. Helps keep litter areas more discreet.',
    price: 176.99,
    image: 'https://cf.cjdropshipping.com/8c7d9c65-6f57-40ac-b639-1ac694c256f0.jpg',
    images: ['https://cf.cjdropshipping.com/8c7d9c65-6f57-40ac-b639-1ac694c256f0.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Litter Boxes',
    tags: ['litter box', 'enclosure', 'furniture'],
    rating: 4.4,
    reviews: 112,
    inStock: true,
  },
  {
    id: 'getpawsy_156ed3db-e926-482c-951a-4c1fcb61779d',
    slug: 'cat-litter-box-enclosure-with-barn-door-cat-hole-31-5-x-21-x-20-white',
    name: 'Cat Litter Box Enclosure – Barn Door Furniture Style with Cat Hole',
    description: 'Furniture-style cat litter box enclosure with barn door design and side cat entry. Helps conceal the litter area while providing privacy for indoor cats.',
    price: 176.99,
    image: 'https://cf.cjdropshipping.com/17664480/f56eb834-2643-4b70-884a-fbf1330a1d82.jpg',
    images: ['https://cf.cjdropshipping.com/17664480/f56eb834-2643-4b70-884a-fbf1330a1d82.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Litter Boxes',
    tags: ['litter box', 'enclosure', 'furniture'],
    rating: 4.3,
    reviews: 87,
    inStock: true,
  },
  {
    id: 'getpawsy_dog-cot-cooling-3',
    slug: 'dog-cot-cooling-pet-bed-3',
    name: 'Orthopedic Dog Bed – Elevated Cooling Cot for Large & Medium Dogs',
    description: 'Elevated cooling dog bed with breathable mesh sleeping surface for indoor or outdoor use. Raised design supports airflow and everyday resting comfort.',
    price: 127.99,
    image: 'https://cf.cjdropshipping.com/17695584/cea797a4-58d8-4007-be42-58c3eeaa8723.jpg',
    images: ['https://cf.cjdropshipping.com/17695584/cea797a4-58d8-4007-be42-58c3eeaa8723.jpg'],
    category: 'dogs',
    productType: 'Pet Supplies > Dog Beds',
    tags: ['dog bed', 'cooling', 'elevated'],
    rating: 4.5,
    reviews: 203,
    inStock: true,
  },
  {
    id: 'getpawsy_133cdc48-0117-40d5-9aaf-1a81131ca9bb',
    slug: '35-inch-modern-cat-tree-for-indoor-adult-cats-with-wooden-scratching-posts-cat-133c',
    name: 'GetPawsy Modern Cat Tree – 35 Inch Wooden Scratching Post & Bed',
    description: 'Modern 35-inch cat tree with wooden scratching surfaces, elevated bed, and compact multi-level design. Built for indoor cats.',
    price: 158.99,
    image: 'https://cf.cjdropshipping.com/17664480/e75f68d4-a5f5-46e0-ae2d-217cc563ed2f.jpg',
    images: ['https://cf.cjdropshipping.com/17664480/e75f68d4-a5f5-46e0-ae2d-217cc563ed2f.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Trees & Condos',
    tags: ['cat tree', 'modern', 'scratching post'],
    rating: 4.5,
    reviews: 89,
    inStock: true,
  },
];

export const getFeaturedProducts = () => products.filter(p => p.featured);
export const getProductsByCategory = (category: string) => products.filter(p => p.category === category);
export const getProductById = (id: string) => products.find(p => p.id === id);
export const getProductBySlug = (slug: string) => products.find(p => p.slug === slug);
export const getProductBySlugOrId = (value: string) => getProductBySlug(value) ?? getProductById(value);
