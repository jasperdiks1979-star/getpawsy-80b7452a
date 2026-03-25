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
  { id: 'cats', name: 'Cats', icon: '🐈', description: 'Purrfect products for feline friends' },
  { id: 'dogs', name: 'Dogs', icon: '🐕', description: 'Everything for your canine companion' },
  { id: 'pets', name: 'All Pets', icon: '🐾', description: 'Products for all pets' },
];

export const products: Product[] = [
  {
    id: 'getpawsy_128e0207-8a94-4d71-b428-5b7f5002528f',
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat',
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
    id: 'getpawsy_05556879-2201-4d30-8373-4eded8e7dcb8',
    slug: 'covered-cat-litter-box-with-lid-scoop-deodorizing-bags-for-odor-control-privacy-easy-to-clean-green',
    name: 'GetPawsy Enclosed Cat Litter Box – Covered Design with Scoop & Odor Control',
    description: 'Enclosed cat litter box with flap door, scoop, and deodorizing bags for odor control and privacy. Easy to clean with removable lid.',
    price: 98.99,
    image: 'https://cf.cjdropshipping.com/41c43a7d-1ba5-4eaa-801f-ac5407d34421.jpg',
    images: ['https://cf.cjdropshipping.com/41c43a7d-1ba5-4eaa-801f-ac5407d34421.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Litter Boxes',
    tags: ['litter box', 'enclosed', 'odor control'],
    rating: 4.5,
    reviews: 189,
    inStock: true,
  },
  {
    id: 'getpawsy_1454395a-9a13-4c93-94a5-4264cb44434d',
    slug: 'flower-cat-tree-no-shipments-on-weekends-1',
    name: 'GetPawsy Flower Cat Tree Condo – Multi-Level Scratching Post for Cats',
    description: 'Flower-themed cat tree condo with multiple levels, scratching surfaces, and soft resting areas. Designed for indoor cats that like to climb, scratch, and lounge. Decorative style with practical play and rest functions.',
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
    slug: '44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-cats-gray',
    name: 'Cat Tree – Multi-Level 44 Inch Condo with Spacious Perch & Hammock for Cats',
    description: '44-inch multi-level cat tree condo with spacious top perch, condo, and hammock. Sturdy construction for indoor cats who love to climb and relax.',
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
    id: 'getpawsy_0ea308d2-5e80-4a8e-9505-8c6cf7ca3aba',
    slug: 'dog-potty-tray-stainless-steel-for-small-and-medium-dogs-dog-training-tray-for-porch-bathroom-balcon',
    name: 'Dog Potty Training Tray – Stainless Steel Toilet for Small & Medium Dogs – Stainless Steel Compact',
    description: 'Stainless steel indoor/outdoor dog potty training tray for small and medium dogs. Durable, easy to clean, suitable for porch, bathroom, or balcony use.',
    price: 131.99,
    image: 'https://cf.cjdropshipping.com/500de4b7-c34f-4866-a601-7c42829c97e0.jpg',
    images: ['https://cf.cjdropshipping.com/500de4b7-c34f-4866-a601-7c42829c97e0.jpg'],
    category: 'dogs',
    productType: 'Pet Supplies > Dog Training',
    tags: ['potty tray', 'training', 'stainless steel'],
    rating: 4.3,
    reviews: 67,
    inStock: true,
  },
  {
    id: 'getpawsy_0139036c-d1b8-4b8a-996b-1ec8d5c0a908',
    slug: 'dog-anti-pull-automatic-retractable-leash-auto-retracting',
    name: 'Leash for Dogs – Automatic Retractable',
    description: 'Automatic retractable dog leash with anti-pull design. Comfortable grip and reliable locking mechanism for safe walks.',
    price: 47.99,
    image: 'https://oss-cf.cjdropshipping.com/product/2026/01/16/02/331ccf3d-dd92-482a-b0f5-b94c02db254e_fine.jpeg',
    images: ['https://oss-cf.cjdropshipping.com/product/2026/01/16/02/331ccf3d-dd92-482a-b0f5-b94c02db254e_fine.jpeg'],
    category: 'dogs',
    productType: 'Pet Supplies > Dog Collars & Leashes',
    tags: ['leash', 'retractable', 'anti-pull'],
    rating: 4.5,
    reviews: 203,
    inStock: true,
  },
  {
    id: 'getpawsy_0c484864-54ef-4068-a223-62fe828f7569',
    slug: 'foldable-pet-stroller-for-small-dogs-cats',
    name: 'Foldable Stroller – & Carrier for Small for Dogs – Foldable Compact',
    description: 'Foldable pet stroller and carrier for small dogs and cats. Lightweight, compact, and easy to store for outdoor adventures.',
    price: 150.99,
    image: 'https://cf.cjdropshipping.com/bdc5471c-702f-4f83-a399-6d69a3ee3187.jpg',
    images: ['https://cf.cjdropshipping.com/bdc5471c-702f-4f83-a399-6d69a3ee3187.jpg'],
    category: 'pets',
    productType: 'Pet Supplies > Dog Carriers',
    tags: ['stroller', 'carrier', 'foldable'],
    rating: 4.6,
    reviews: 156,
    inStock: true,
    featured: true,
  },
  {
    id: 'getpawsy_1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
    slug: 'pawhut-cat-litter-box-enclosure-with-tall-legs-scratching-board-dark-brown',
    name: 'Litter Box for Cats',
    description: 'Furniture-style cat litter box enclosure with tall legs and built-in scratching board. Blends with home decor while providing privacy for your cat.',
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
    slug: 'extra-large-fully-enclosed-flip-top-cat-litter-box-anti-splash-anti-tracking-odor-locking-cat-toilet',
    name: 'Litter Box for Cats – Large',
    description: 'Extra-large enclosed flip-top cat litter box with anti-splash and odor-locking design. Easy to clean with flip-top lid access.',
    price: 74.97,
    image: 'https://cf.cjdropshipping.com/0a1c6804-660e-4a52-990e-d428c5a6cfad.jpg',
    images: ['https://cf.cjdropshipping.com/0a1c6804-660e-4a52-990e-d428c5a6cfad.jpg'],
    category: 'cats',
    productType: 'Pet Supplies > Cat Litter Boxes',
    tags: ['litter box', 'large', 'enclosed'],
    rating: 4.3,
    reviews: 87,
    inStock: true,
  },
];

export const getFeaturedProducts = () => products.filter(p => p.featured);
export const getProductsByCategory = (category: string) => products.filter(p => p.category === category);
export const getProductById = (id: string) => products.find(p => p.id === id);
export const getProductBySlug = (slug: string) => products.find(p => p.slug === slug);
export const getProductBySlugOrId = (value: string) => getProductBySlug(value) ?? getProductById(value);
