export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  comparePrice?: number;
  image: string;
  images: string[];
  category: string;
  tags: string[];
  rating: number;
  reviews: number;
  inStock: boolean;
  featured?: boolean;
}

export const categories = [
  { id: 'dogs', name: 'Dogs', icon: '🐕', description: 'Everything for your canine companion' },
  { id: 'cats', name: 'Cats', icon: '🐈', description: 'Purrfect products for feline friends' },
  { id: 'toys', name: 'Toys', icon: '🎾', description: 'Fun toys for endless playtime' },
  { id: 'food', name: 'Food & Treats', icon: '🦴', description: 'Nutritious meals and tasty treats' },
  { id: 'accessories', name: 'Accessories', icon: '🎀', description: 'Collars, leashes, and more' },
  { id: 'health', name: 'Health & Wellness', icon: '💊', description: 'Keep your pets healthy and happy' },
];

export const products: Product[] = [
  {
    id: 'prod-001',
    name: 'Premium Orthopedic Dog Bed',
    description: 'Memory foam dog bed with waterproof liner and removable washable cover. Perfect for dogs of all sizes with joint support technology.',
    price: 79.99,
    comparePrice: 99.99,
    image: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&q=80',
      'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&q=80'
    ],
    category: 'dogs',
    tags: ['bed', 'comfort', 'orthopedic'],
    rating: 4.8,
    reviews: 234,
    inStock: true,
    featured: true
  },
  {
    id: 'prod-002',
    name: 'Interactive Cat Puzzle Feeder',
    description: 'Stimulate your cats mind with this engaging puzzle feeder. Multiple difficulty levels to keep your cat entertained and mentally sharp.',
    price: 24.99,
    image: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=600&q=80'
    ],
    category: 'cats',
    tags: ['puzzle', 'feeder', 'interactive'],
    rating: 4.6,
    reviews: 156,
    inStock: true,
    featured: true
  },
  {
    id: 'prod-003',
    name: 'Durable Rope Tug Toy',
    description: 'Heavy-duty rope toy perfect for tug-of-war. Made from natural cotton fibers, safe for your dogs teeth and gums.',
    price: 14.99,
    image: 'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=600&q=80'
    ],
    category: 'toys',
    tags: ['rope', 'tug', 'durable'],
    rating: 4.5,
    reviews: 89,
    inStock: true
  },
  {
    id: 'prod-004',
    name: 'Organic Chicken Training Treats',
    description: 'All-natural, organic chicken treats perfect for training. Low calorie, high protein, and irresistible to dogs.',
    price: 18.99,
    comparePrice: 22.99,
    image: 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=600&q=80'
    ],
    category: 'food',
    tags: ['treats', 'organic', 'training'],
    rating: 4.9,
    reviews: 312,
    inStock: true,
    featured: true
  },
  {
    id: 'prod-005',
    name: 'Adjustable LED Safety Collar',
    description: 'Keep your pet visible at night with this rechargeable LED collar. Multiple light modes and adjustable sizing.',
    price: 29.99,
    image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600&q=80'
    ],
    category: 'accessories',
    tags: ['collar', 'LED', 'safety'],
    rating: 4.7,
    reviews: 178,
    inStock: true
  },
  {
    id: 'prod-006',
    name: 'Calming Hemp Oil for Pets',
    description: 'Natural hemp oil to help reduce anxiety and promote relaxation in dogs and cats. Vet-approved formula.',
    price: 34.99,
    image: 'https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?w=600&q=80'
    ],
    category: 'health',
    tags: ['hemp', 'calming', 'wellness'],
    rating: 4.4,
    reviews: 98,
    inStock: true
  },
  {
    id: 'prod-007',
    name: 'Self-Cleaning Cat Litter Box',
    description: 'Automatic self-cleaning litter box with odor control. Works with most clumping litters. Quiet motor operation.',
    price: 149.99,
    comparePrice: 189.99,
    image: 'https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?w=600&q=80'
    ],
    category: 'cats',
    tags: ['litter box', 'automatic', 'self-cleaning'],
    rating: 4.3,
    reviews: 267,
    inStock: true,
    featured: true
  },
  {
    id: 'prod-008',
    name: 'Retractable Dog Leash - 26ft',
    description: 'Premium retractable leash with ergonomic handle and one-button brake system. Perfect for walks and outdoor adventures.',
    price: 32.99,
    image: 'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=600&q=80',
    images: [
      'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=600&q=80'
    ],
    category: 'accessories',
    tags: ['leash', 'retractable', 'walking'],
    rating: 4.6,
    reviews: 145,
    inStock: true
  }
];

export const getFeaturedProducts = () => products.filter(p => p.featured);
export const getProductsByCategory = (category: string) => products.filter(p => p.category === category);
export const getProductById = (id: string) => products.find(p => p.id === id);
