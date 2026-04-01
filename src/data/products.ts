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
 * Static product fallback set — DB-verified slugs only.
 * Used as hydration fallback when the backend is unreachable.
 */
export const products: Product[] = [
  {
    id: '128e0207-8a94-4d71-b428-5b7f5002528f',
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
    name: 'GetPawsy Automatic Cat Litter Box – Self-Cleaning with App Control',
    description: 'Simplify litter box maintenance with this 60L self-cleaning unit. An infrared sensor detects when your cat exits before starting the cleaning cycle. Control schedules and monitor usage from your smartphone. The built-in odor management system helps keep your home fresh. Designed for multi-cat households.',
    price: 268.99,
    image: 'https://getpawsy.pet/images/products/128e0207-8a94-4d71-b428-5b7f5002528f.png',
    images: ['https://getpawsy.pet/images/products/128e0207-8a94-4d71-b428-5b7f5002528f.png'],
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
    name: 'GetPawsy Portable Dog Stroller – Foldable Travel Carrier for Dogs',
    description: 'Help senior, recovering, or small dogs enjoy the outdoors with this portable pet stroller. The foldable aluminum frame is lightweight for transport and storage. Mesh windows provide ventilation and visibility while keeping your pet secure. All-terrain wheels handle pavement, grass, and gravel paths.',
    price: 396.99,
    image: 'https://getpawsy.pet/images/products/18028997-901a-40b8-8790-9e7b3ec558bf.jpg',
    images: ['https://getpawsy.pet/images/products/18028997-901a-40b8-8790-9e7b3ec558bf.jpg'],
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
    name: 'GetPawsy Elevated Cooling Dog Bed – Breathable Outdoor Pet Cot',
    description: 'Keep your dog comfortable in warm weather with this elevated cooling cot. The breathable mesh sleeping surface promotes airflow from all sides. The raised frame lifts your pet off hot or cold floors, making it suitable for indoor and outdoor use. Easy to assemble and clean — ideal for medium to large dogs.',
    price: 127.99,
    image: 'https://getpawsy.pet/images/products/c7177ee4-5509-492f-965f-617402968f5c-2.jpg',
    images: ['https://getpawsy.pet/images/products/c7177ee4-5509-492f-965f-617402968f5c-2.jpg'],
    category: 'Dog Beds',
    tags: ['dog bed', 'cooling', 'elevated'],
    rating: 4.5,
    reviews: 203,
    inStock: true,
    featured: true,
  },
  {
    id: '1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
    slug: 'pawhut-cat-litter-box-enclosure-with-tall-legs-scratching-board-dark-brown',
    name: 'GetPawsy Hidden Cat Litter Box Enclosure – Furniture with Scratching Board',
    description: 'Conceal your cat\'s litter box inside a furniture-style enclosure that blends into your living space. Tall legs keep the unit elevated for easy cleaning beneath. The built-in side scratching board gives your cat a designated scratching spot. A spacious interior fits most standard litter boxes.',
    price: 176.99,
    image: 'https://getpawsy.pet/images/products/1a1302e7-939f-4c94-96b7-d4e0c9d34a37.jpg',
    images: ['https://getpawsy.pet/images/products/1a1302e7-939f-4c94-96b7-d4e0c9d34a37.jpg'],
    category: 'Cat Litter Boxes',
    tags: ['litter box', 'enclosure', 'furniture'],
    rating: 4.4,
    reviews: 112,
    inStock: true,
    featured: true,
  },
  {
    id: '352ddb8f-89f6-41b1-86b8-25af8ab1adb1',
    slug: 'ufo-cat-tree-condo',
    name: 'GetPawsy UFO Cat Tree Condo – 49 Inch Activity Center with Sisal Posts',
    description: '49-inch cat activity center with elevated perch, enclosed capsule-style rest area, hammock, and sisal scratching posts. Designed for climbing, scratching, and lounging indoors. Multi-level structure for active cats.',
    price: 207.99,
    image: 'https://cf.cjdropshipping.com/17689536/4e3c98eb-6e96-49c3-9f77-b7a3c83d78f1.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/4e3c98eb-6e96-49c3-9f77-b7a3c83d78f1.jpg'],
    category: 'Cat Trees & Condos',
    tags: ['cat tree', 'ufo', 'designer'],
    rating: 4.5,
    reviews: 89,
    inStock: true,
    featured: true,
  },
  {
    id: '0381585e-8b6b-48a8-b541-c7298f99b0c9',
    slug: 'expandable-pet-carrier-backpack',
    name: 'GetPawsy Expandable Pet Carrier Backpack – Breathable Travel Bag for Small Dogs & Cats',
    description: 'Expandable pet carrier backpack with mesh ventilation panels and a zip-out expansion area. Designed for small dogs and cats up to 15 lbs. The padded shoulder straps distribute weight evenly for comfortable walks, hikes, and travel. Side pockets hold treats and waste bags.',
    price: 87.99,
    image: 'https://cf.cjdropshipping.com/17689536/0e8b1f85-1dd0-4cb8-bea2-39d361df1ba1.jpg',
    images: ['https://cf.cjdropshipping.com/17689536/0e8b1f85-1dd0-4cb8-bea2-39d361df1ba1.jpg'],
    category: 'Dog Travel',
    tags: ['carrier', 'backpack', 'travel'],
    rating: 4.6,
    reviews: 78,
    inStock: true,
    featured: true,
  },
];

export const getFeaturedProducts = () => products.filter(p => p.featured);
export const getProductsByCategory = (category: string) => products.filter(p => p.category === category);
export const getProductById = (id: string) => products.find(p => p.id === id);
export const getProductBySlug = (slug: string) => products.find(p => p.slug === slug);
export const getProductBySlugOrId = (value: string) => getProductBySlug(value) ?? getProductById(value);
