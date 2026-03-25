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
  tags: string[];
  rating: number;
  reviews: number;
  inStock: boolean;
  featured?: boolean;
}

export const categories = [
  { id: "dogs", name: "Dogs", icon: "🐕", description: "Everything for your canine companion" },
  { id: "cats", name: "Cats", icon: "🐈", description: "Purrfect products for feline friends" },
  { id: "toys", name: "Toys", icon: "🎾", description: "Fun toys for endless playtime" },
  { id: "food", name: "Food & Treats", icon: "🦴", description: "Nutritious meals and tasty treats" },
  { id: "accessories", name: "Accessories", icon: "🎀", description: "Collars, leashes, and more" },
  { id: "health", name: "Health & Wellness", icon: "💊", description: "Keep your pets healthy and happy" },
] as const;

export const products: Product[] = [
  {
    id: "prod-001",
    slug: "getpawsy-orthopedic-dog-bed-memory-foam-joint-support",
    name: "GetPawsy Orthopedic Dog Bed – Memory Foam Joint Support",
    description:
      "Memory foam dog bed with waterproof liner and removable washable cover. Designed to help support joints for dogs of all sizes. Features a pressure-relieving foam layer.",
    price: 79.99,
    comparePrice: 99.99,
    image: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&q=80",
    images: [
      "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600&q=80",
      "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&q=80",
    ],
    category: "dogs",
    tags: ["bed", "comfort", "orthopedic"],
    rating: 4.8,
    reviews: 234,
    inStock: true,
    featured: true,
  },
  {
    id: "prod-002",
    slug: "getpawsy-interactive-cat-puzzle-feeder-mental-stimulation-toy",
    name: "GetPawsy Interactive Cat Puzzle Feeder – Mental Stimulation Toy",
    description:
      "Stimulate your cat's mind with this engaging puzzle feeder. Features multiple difficulty levels to encourage natural foraging behavior and slow down eating.",
    price: 24.99,
    image: "https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=600&q=80"],
    category: "cats",
    tags: ["puzzle", "feeder", "interactive"],
    rating: 4.6,
    reviews: 156,
    inStock: true,
    featured: true,
  },
  {
    id: "prod-003",
    slug: "getpawsy-durable-rope-tug-toy-natural-cotton-fibers",
    name: "GetPawsy Durable Rope Tug Toy – Natural Cotton Fibers",
    description:
      "Heavy-duty rope toy suitable for tug-of-war play. Made from natural cotton fibers that are gentle on teeth and gums.",
    price: 14.99,
    image: "https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=600&q=80"],
    category: "toys",
    tags: ["rope", "tug", "durable"],
    rating: 4.5,
    reviews: 89,
    inStock: true,
  },
  {
    id: "prod-004",
    slug: "getpawsy-organic-chicken-training-treats-low-calorie",
    name: "GetPawsy Organic Chicken Training Treats – Low Calorie",
    description:
      "All-natural organic chicken treats designed for training sessions. Low calorie and high protein, made with simple ingredients dogs love.",
    price: 18.99,
    comparePrice: 22.99,
    image: "https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=600&q=80"],
    category: "food",
    tags: ["treats", "organic", "training"],
    rating: 4.9,
    reviews: 312,
    inStock: true,
    featured: true,
  },
  {
    id: "prod-005",
    slug: "getpawsy-adjustable-led-safety-collar-rechargeable",
    name: "GetPawsy Adjustable LED Safety Collar – Rechargeable",
    description:
      "Rechargeable LED collar designed to improve visibility during nighttime walks. Features multiple light modes and adjustable sizing for a comfortable fit.",
    price: 29.99,
    image: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600&q=80"],
    category: "accessories",
    tags: ["collar", "LED", "safety"],
    rating: 4.7,
    reviews: 178,
    inStock: true,
  },
  {
    id: "prod-006",
    slug: "getpawsy-calming-hemp-oil-for-pets-relaxation-support",
    name: "GetPawsy Calming Hemp Oil for Pets – Relaxation Support",
    description:
      "Natural hemp oil designed to help support relaxation in dogs and cats. May promote calmness during stressful situations such as travel or loud noises.",
    price: 34.99,
    image: "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?w=600&q=80"],
    category: "health",
    tags: ["hemp", "calming", "wellness"],
    rating: 4.4,
    reviews: 98,
    inStock: true,
  },
  {
    id: "prod-007",
    slug: "getpawsy-self-cleaning-cat-litter-box-automatic-cleaning-system",
    name: "GetPawsy Self-Cleaning Cat Litter Box – Automatic Cleaning System",
    description:
      "Automatic self-cleaning litter box with built-in deodorizer designed to help control odor. Works with clumping clay litter and features a quiet motor (under 50 dB).",
    price: 149.99,
    comparePrice: 189.99,
    image: "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?w=600&q=80"],
    category: "cats",
    tags: ["litter box", "automatic", "self-cleaning"],
    rating: 4.3,
    reviews: 267,
    inStock: true,
    featured: true,
  },
  {
    id: "prod-008",
    slug: "getpawsy-retractable-dog-leash-26ft-heavy-duty",
    name: "GetPawsy Retractable Dog Leash – 26ft Heavy Duty",
    description:
      "Retractable leash with ergonomic handle and one-button brake system. Extends up to 26 feet for comfortable walks and outdoor use.",
    price: 32.99,
    image: "https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=600&q=80",
    images: ["https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=600&q=80"],
    category: "accessories",
    tags: ["leash", "retractable", "walking"],
    rating: 4.6,
    reviews: 145,
    inStock: true,
  },
];

export const getFeaturedProducts = () => products.filter((p) => p.featured);
export const getProductsByCategory = (category: string) => products.filter((p) => p.category === category);
export const getProductById = (id: string) => products.find((p) => p.id === id);

export const getProductBySlug = (slug: string) => products.find((p) => p.slug === slug);

export const getProductBySlugOrId = (value: string) => getProductBySlug(value) ?? getProductById(value);

export { default } from "@/components/home/HomePage";
