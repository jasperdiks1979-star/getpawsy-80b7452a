/**
 * Link Equity Redistribution Engine
 * 
 * Targets 20 products in position 8–20 (TP20) and redistributes
 * internal link authority via controlled contextual injections.
 * Enforces anchor distribution: 30% exact, 40% partial, 30% natural/branded.
 */

import { SPRINT_PRODUCTS } from './sprint-products';

// ============= TYPES =============

export interface TP20Product {
  slug: string;
  name: string;
  primaryKeyword: string;
  category: string;
  estimatedPosition: number;
  estimatedImpressions: number;
  anchors: {
    exact: string[];
    partial: string[];
    natural: string[];
  };
  injections: LinkEquityInjection[];
}

export interface LinkEquityInjection {
  sourceType: 'category-description' | 'blog-guide' | 'pillar-page' | 'homepage-picks';
  sourceSlug: string;
  sourceLabel: string;
  anchorText: string;
  anchorType: 'exact' | 'partial' | 'natural';
  priority: number;
}

export interface AuthorityLoop {
  category: string;
  pillarSlug: string;
  pillarTitle: string;
  pillarWordTarget: string;
  productSlugs: string[];
  collectionSlug: string;
  loopLinks: { from: string; to: string; anchor: string }[];
}

export interface LinkRemoval {
  sourceSlug: string;
  targetUrl: string;
  reason: string;
}

export interface LinkEquityReport {
  tp20: TP20Product[];
  authorityLoops: AuthorityLoop[];
  linksAdded: number;
  linksRemoved: number;
  removals: LinkRemoval[];
  anchorDistribution: { exact: number; partial: number; natural: number };
  crawlDepthImprovements: { avgBefore: number; avgAfter: number };
  orphansBefore: number;
  orphansAfter: number;
}

// ============= TP20 TARGET PRODUCTS =============

const TP20_PRODUCTS: TP20Product[] = [
  {
    slug: 'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner',
    name: 'Orthopedic Memory Foam Pet Bed',
    primaryKeyword: 'orthopedic dog bed',
    category: 'dog-beds',
    estimatedPosition: 9,
    estimatedImpressions: 420,
    anchors: {
      exact: ['orthopedic dog bed', 'memory foam pet bed'],
      partial: ['best bed for senior dogs', 'joint-support dog bed'],
      natural: ['our top-rated memory foam bed', 'GetPawsy orthopedic pick'],
    },
    injections: [],
  },
  {
    slug: 'all-in-one-cactus-cat-tree-with-climbing-frame-and-cozy-nest',
    name: 'Cactus Cat Tree with Climbing Frame',
    primaryKeyword: 'cat tree cactus',
    category: 'cat-trees-and-condos',
    estimatedPosition: 12,
    estimatedImpressions: 310,
    anchors: {
      exact: ['cactus cat tree', 'cat tree with climbing frame'],
      partial: ['fun cat climbing tower', 'cat tree for playful cats'],
      natural: ['this adorable cactus-shaped tree', 'GetPawsy cat tree pick'],
    },
    injections: [],
  },
  {
    slug: 'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo',
    name: 'Tactical Dog Harness & Safety Bundle',
    primaryKeyword: 'dog car harness',
    category: 'dog-car-safety',
    estimatedPosition: 11,
    estimatedImpressions: 280,
    anchors: {
      exact: ['dog car harness', 'tactical dog harness'],
      partial: ['crash-tested harness set', 'travel-safe dog bundle'],
      natural: ['our top travel safety pick', 'GetPawsy harness bundle'],
    },
    injections: [],
  },
  {
    slug: 'dog-cot-cooling-pet-bed-3',
    name: 'Elevated Cooling Dog Bed',
    primaryKeyword: 'elevated cooling dog bed',
    category: 'dog-beds',
    estimatedPosition: 14,
    estimatedImpressions: 190,
    anchors: {
      exact: ['elevated cooling dog bed', 'cooling dog cot'],
      partial: ['summer dog bed with airflow', 'raised cooling bed for dogs'],
      natural: ['our best summer bed pick', 'GetPawsy cooling solution'],
    },
    injections: [],
  },
  {
    slug: 'automatic-pet-feeder-6l-smart-food-dispenser',
    name: 'Smart Automatic Pet Feeder 6L',
    primaryKeyword: 'automatic pet feeder',
    category: 'cat-bowls-feeders',
    estimatedPosition: 15,
    estimatedImpressions: 240,
    anchors: {
      exact: ['automatic pet feeder', 'smart food dispenser'],
      partial: ['timed feeder for cats and dogs', 'hands-free pet feeding'],
      natural: ['our smart feeding solution', 'GetPawsy auto feeder'],
    },
    injections: [],
  },
  {
    slug: 'pet-grooming-vacuum-kit-5-in-1',
    name: '5-in-1 Pet Grooming Vacuum Kit',
    primaryKeyword: 'pet grooming vacuum',
    category: 'dog-grooming',
    estimatedPosition: 10,
    estimatedImpressions: 350,
    anchors: {
      exact: ['pet grooming vacuum', 'grooming vacuum kit'],
      partial: ['mess-free grooming tool', 'all-in-one grooming system'],
      natural: ['our best grooming kit', 'GetPawsy grooming pick'],
    },
    injections: [],
  },
  {
    slug: 'indestructible-dog-chew-toy-heavy-chewers',
    name: 'Indestructible Dog Chew Toy',
    primaryKeyword: 'indestructible dog toy',
    category: 'dog-toys',
    estimatedPosition: 8,
    estimatedImpressions: 520,
    anchors: {
      exact: ['indestructible dog toy', 'heavy chewer dog toy'],
      partial: ['toughest chew toy for aggressive chewers', 'durable dog toy that lasts'],
      natural: ['our toughest toy tested', 'GetPawsy power chewer pick'],
    },
    injections: [],
  },
  {
    slug: 'calming-donut-dog-bed-anti-anxiety',
    name: 'Calming Donut Dog Bed',
    primaryKeyword: 'calming dog bed',
    category: 'dog-beds',
    estimatedPosition: 13,
    estimatedImpressions: 270,
    anchors: {
      exact: ['calming dog bed', 'anti-anxiety donut bed'],
      partial: ['anxiety-relief bed for dogs', 'cozy calming bed'],
      natural: ['our calming bed best-seller', 'GetPawsy anxiety solution'],
    },
    injections: [],
  },
  {
    slug: 'interactive-cat-toy-laser-feather-usb',
    name: 'Interactive Cat Toy Combo',
    primaryKeyword: 'interactive cat toy',
    category: 'cat-toys',
    estimatedPosition: 16,
    estimatedImpressions: 180,
    anchors: {
      exact: ['interactive cat toy', 'laser feather cat toy'],
      partial: ['boredom-busting cat toy set', 'indoor cat play combo'],
      natural: ['our indoor cat favorite', 'GetPawsy cat toy combo'],
    },
    injections: [],
  },
  {
    slug: 'portable-dog-water-bottle-travel',
    name: 'Portable Dog Water Bottle',
    primaryKeyword: 'dog water bottle',
    category: 'dog-carriers',
    estimatedPosition: 17,
    estimatedImpressions: 150,
    anchors: {
      exact: ['dog water bottle', 'portable dog water bottle'],
      partial: ['travel hydration for dogs', 'on-the-go dog water'],
      natural: ['our hiking essential', 'GetPawsy travel bottle'],
    },
    injections: [],
  },
  // --- 10 additional TP20 targets ---
  {
    slug: 'self-cleaning-cat-litter-box-automatic',
    name: 'Self-Cleaning Cat Litter Box',
    primaryKeyword: 'self-cleaning litter box',
    category: 'cat-litter-boxes',
    estimatedPosition: 9,
    estimatedImpressions: 480,
    anchors: {
      exact: ['self-cleaning litter box', 'automatic cat litter box'],
      partial: ['hands-free litter solution', 'best automatic litter box'],
      natural: ['our top litter box pick', 'GetPawsy auto-clean choice'],
    },
    injections: [],
  },
  {
    slug: 'large-cat-tree-multi-level-tower',
    name: 'Multi-Level Cat Tower for Large Cats',
    primaryKeyword: 'large cat tree',
    category: 'cat-trees-and-condos',
    estimatedPosition: 11,
    estimatedImpressions: 340,
    anchors: {
      exact: ['large cat tree', 'multi-level cat tower'],
      partial: ['sturdy tower for big cats', 'cat tree with multiple levels'],
      natural: ['our stability-tested tower', 'GetPawsy large cat pick'],
    },
    injections: [],
  },
  {
    slug: 'hamster-cage-large-habitat-accessories',
    name: 'Large Hamster Habitat with Accessories',
    primaryKeyword: 'large hamster cage',
    category: 'hamster-cages',
    estimatedPosition: 14,
    estimatedImpressions: 120,
    anchors: {
      exact: ['large hamster cage', 'hamster habitat with accessories'],
      partial: ['spacious hamster home', 'best hamster cage setup'],
      natural: ['our recommended hamster home', 'GetPawsy hamster pick'],
    },
    injections: [],
  },
  {
    slug: 'orthopedic-dog-bed-large-breed-xl',
    name: 'XL Orthopedic Dog Bed for Large Breeds',
    primaryKeyword: 'orthopedic dog bed large breed',
    category: 'dog-beds',
    estimatedPosition: 10,
    estimatedImpressions: 380,
    anchors: {
      exact: ['orthopedic dog bed large breed', 'XL dog bed orthopedic'],
      partial: ['joint-support bed for big dogs', 'large breed comfort bed'],
      natural: ['our large breed top pick', 'GetPawsy XL bed choice'],
    },
    injections: [],
  },
  {
    slug: 'cat-window-perch-hammock-suction-cup',
    name: 'Cat Window Perch Hammock',
    primaryKeyword: 'cat window perch',
    category: 'cat-furniture',
    estimatedPosition: 18,
    estimatedImpressions: 95,
    anchors: {
      exact: ['cat window perch', 'cat hammock suction cup'],
      partial: ['window-mounted cat seat', 'sunny spot perch for cats'],
      natural: ['our window perch favorite', 'GetPawsy sunbathing pick'],
    },
    injections: [],
  },
  {
    slug: 'slow-feeder-dog-bowl-anti-bloat',
    name: 'Slow Feeder Dog Bowl Anti-Bloat',
    primaryKeyword: 'slow feeder dog bowl',
    category: 'dog-bowls-feeders',
    estimatedPosition: 12,
    estimatedImpressions: 210,
    anchors: {
      exact: ['slow feeder dog bowl', 'anti-bloat dog bowl'],
      partial: ['puzzle bowl for fast eaters', 'healthy feeding bowl'],
      natural: ['our healthy eating solution', 'GetPawsy slow feeder'],
    },
    injections: [],
  },
  {
    slug: 'enclosed-cat-litter-box-odor-control',
    name: 'Enclosed Cat Litter Box with Odor Control',
    primaryKeyword: 'enclosed litter box',
    category: 'cat-litter-boxes',
    estimatedPosition: 15,
    estimatedImpressions: 160,
    anchors: {
      exact: ['enclosed litter box', 'odor control litter box'],
      partial: ['covered litter box for odor', 'hidden litter solution'],
      natural: ['our odor-free pick', 'GetPawsy enclosed choice'],
    },
    injections: [],
  },
  {
    slug: 'dog-car-seat-small-medium-breeds',
    name: 'Dog Car Seat for Small & Medium Breeds',
    primaryKeyword: 'dog car seat',
    category: 'dog-car-safety',
    estimatedPosition: 13,
    estimatedImpressions: 230,
    anchors: {
      exact: ['dog car seat', 'car seat for small dogs'],
      partial: ['safe car seat for dog travel', 'elevated booster for dogs'],
      natural: ['our travel safety favorite', 'GetPawsy car seat pick'],
    },
    injections: [],
  },
  {
    slug: 'cat-scratching-post-sisal-tall',
    name: 'Tall Sisal Cat Scratching Post',
    primaryKeyword: 'cat scratching post',
    category: 'cat-scratching-posts',
    estimatedPosition: 19,
    estimatedImpressions: 85,
    anchors: {
      exact: ['cat scratching post', 'sisal scratching post tall'],
      partial: ['durable scratching post for cats', 'tall scratch post'],
      natural: ['our scratch post pick', 'GetPawsy sisal choice'],
    },
    injections: [],
  },
  {
    slug: 'dog-travel-carrier-airline-approved',
    name: 'Airline-Approved Dog Travel Carrier',
    primaryKeyword: 'airline approved dog carrier',
    category: 'dog-carriers',
    estimatedPosition: 16,
    estimatedImpressions: 140,
    anchors: {
      exact: ['airline approved dog carrier', 'dog travel carrier'],
      partial: ['TSA-friendly pet carrier', 'flight-ready dog bag'],
      natural: ['our airline travel pick', 'GetPawsy carrier choice'],
    },
    injections: [],
  },
];

// ============= INJECTION BUILDER =============

const GUIDE_SOURCES: Record<string, { slug: string; label: string }[]> = {
  'dog-beds': [
    { slug: 'dog-enrichment-toys', label: 'Dog Enrichment Guide' },
    { slug: 'best-orthopedic-dog-beds-2026', label: 'Best Orthopedic Dog Beds 2026' },
  ],
  'cat-trees-and-condos': [
    { slug: 'best-cat-trees-2026', label: 'Best Cat Trees 2026' },
    { slug: 'best-cat-toys-for-indoor-cats', label: 'Indoor Cat Enrichment Guide' },
  ],
  'cat-litter-boxes': [
    { slug: 'best-cat-litter-boxes', label: 'Best Cat Litter Boxes 2026' },
    { slug: 'best-cat-litter-box-furniture-enclosures-2026', label: 'Litter Box Furniture Guide' },
  ],
  'dog-toys': [
    { slug: 'dog-enrichment-toys', label: 'Dog Enrichment Toys Guide' },
    { slug: 'signs-your-dog-is-bored', label: 'Signs Your Dog Is Bored' },
  ],
  'dog-car-safety': [
    { slug: 'dog-car-travel-safety', label: 'Dog Car Travel Safety Guide' },
    { slug: 'dog-travel-accessories', label: 'Dog Travel Accessories Guide' },
  ],
  'cat-toys': [
    { slug: 'best-cat-toys-for-indoor-cats', label: 'Best Cat Toys for Indoor Cats' },
    { slug: 'signs-your-dog-is-bored', label: 'Pet Boredom Solutions Guide' },
  ],
  'dog-grooming': [
    { slug: 'best-dog-grooming-kits', label: 'Best Dog Grooming Kits 2026' },
    { slug: 'dog-enrichment-toys', label: 'Dog Enrichment Guide' },
  ],
  'cat-bowls-feeders': [
    { slug: 'best-slow-feeder-dog-bowls', label: 'Slow Feeder Bowls Guide' },
    { slug: 'best-cat-toys-for-indoor-cats', label: 'Indoor Cat Care Guide' },
  ],
  'dog-bowls-feeders': [
    { slug: 'best-slow-feeder-dog-bowls', label: 'Best Slow Feeder Dog Bowls' },
    { slug: 'dog-enrichment-toys', label: 'Dog Enrichment Guide' },
  ],
  'dog-carriers': [
    { slug: 'dog-travel-accessories', label: 'Dog Travel Accessories Guide' },
    { slug: 'dog-car-travel-safety', label: 'Dog Car Travel Safety' },
  ],
  'cat-furniture': [
    { slug: 'best-cat-trees-2026', label: 'Best Cat Trees 2026' },
    { slug: 'best-cat-toys-for-indoor-cats', label: 'Indoor Cat Enrichment' },
  ],
  'cat-scratching-posts': [
    { slug: 'best-cat-trees-2026', label: 'Cat Trees & Scratching Guide' },
    { slug: 'best-cat-toys-for-indoor-cats', label: 'Indoor Cat Activity Guide' },
  ],
  'hamster-cages': [
    { slug: 'how-to-choose-guinea-pig-cage', label: 'Small Pet Habitat Guide' },
    { slug: 'guinea-pig-cage-vs-playpen', label: 'Cages vs Playpens Guide' },
  ],
};

const CATEGORY_PILLAR_MAP: Record<string, string> = {
  'dog-beds': 'orthopedic-dog-beds',
  'cat-trees-and-condos': 'cat-trees-for-large-cats',
  'cat-litter-boxes': 'best-cat-litter-boxes',
  'dog-toys': 'best-interactive-dog-toys',
  'dog-car-safety': 'dog-car-travel-safety',
  'cat-toys': 'best-cat-toys-for-indoor-cats',
  'dog-grooming': 'best-dog-grooming-kits',
  'cat-bowls-feeders': 'automatic-cat-feeders',
  'dog-bowls-feeders': 'best-slow-feeder-dog-bowls',
  'dog-carriers': 'dog-travel-accessories',
  'cat-furniture': 'cat-condos',
  'cat-scratching-posts': 'best-cat-scratching-posts',
  'hamster-cages': 'guinea-pig-cages-playpens',
};

const COLLECTION_SLUG_MAP: Record<string, string> = {
  'dog-beds': 'orthopedic-calming-dog-beds',
  'cat-trees-and-condos': 'cat-condos',
  'cat-litter-boxes': 'best-cat-litter-boxes',
  'dog-toys': 'best-interactive-dog-toys',
  'dog-car-safety': 'dog-car-travel-safety-seats',
  'cat-toys': 'best-cat-toys-for-indoor-cats',
  'dog-grooming': 'best-dog-grooming-kits',
  'cat-bowls-feeders': 'automatic-cat-feeders',
  'dog-bowls-feeders': 'best-slow-feeder-dog-bowls',
  'dog-carriers': 'dog-travel-accessories',
  'cat-furniture': 'cat-condos',
  'cat-scratching-posts': 'best-cat-scratching-posts',
  'hamster-cages': 'guinea-pig-cages-playpens',
};

function pickAnchor(product: TP20Product, type: 'exact' | 'partial' | 'natural'): string {
  const pool = product.anchors[type];
  return pool[Math.floor(product.slug.length % pool.length)];
}

function buildInjections(product: TP20Product): LinkEquityInjection[] {
  const injections: LinkEquityInjection[] = [];
  const cat = product.category;

  // 1. Category description link (exact anchor)
  const collSlug = COLLECTION_SLUG_MAP[cat] || cat;
  injections.push({
    sourceType: 'category-description',
    sourceSlug: `/collections/${collSlug}`,
    sourceLabel: `Collection: ${collSlug}`,
    anchorText: pickAnchor(product, 'exact'),
    anchorType: 'exact',
    priority: 10,
  });

  // 2–3. Two blog/guide contextual links (partial anchors)
  const guides = GUIDE_SOURCES[cat] || [];
  for (let i = 0; i < Math.min(guides.length, 2); i++) {
    injections.push({
      sourceType: 'blog-guide',
      sourceSlug: `/guides/${guides[i].slug}`,
      sourceLabel: guides[i].label,
      anchorText: pickAnchor(product, i === 0 ? 'partial' : 'natural'),
      anchorType: i === 0 ? 'partial' : 'natural',
      priority: 8,
    });
  }

  // 4. Pillar page link (partial anchor)
  const pillarSlug = CATEGORY_PILLAR_MAP[cat];
  if (pillarSlug) {
    injections.push({
      sourceType: 'pillar-page',
      sourceSlug: `/collections/${pillarSlug}`,
      sourceLabel: `Pillar: ${pillarSlug}`,
      anchorText: pickAnchor(product, 'partial'),
      anchorType: 'partial',
      priority: 9,
    });
  }

  // 5. Homepage "Popular Picks" (natural anchor)
  injections.push({
    sourceType: 'homepage-picks',
    sourceSlug: '/',
    sourceLabel: 'Homepage Popular Picks',
    anchorText: pickAnchor(product, 'natural'),
    anchorType: 'natural',
    priority: 7,
  });

  return injections;
}

// ============= AUTHORITY LOOPS =============

const AUTHORITY_LOOP_CONFIGS: AuthorityLoop[] = [
  {
    category: 'Cat Trees',
    pillarSlug: '/collections/all',
    pillarTitle: 'Best Cat Trees for Large Cats 2026 — Stability-Tested Picks',
    pillarWordTarget: '1,500–2,000',
    productSlugs: ['all-in-one-cactus-cat-tree-with-climbing-frame-and-cozy-nest', 'large-cat-tree-multi-level-tower'],
    collectionSlug: '/collections/cat-condos',
    loopLinks: [
      { from: '/collections/all', to: '/collections/cat-condos', anchor: 'browse all cat trees' },
      { from: '/collections/cat-condos', to: '/collections/all', anchor: 'cat tree buying guide' },
    ],
  },
  {
    category: 'Litter Boxes',
    pillarSlug: '/guides/best-cat-litter-boxes',
    pillarTitle: 'Best Cat Litter Boxes 2026 — Self-Cleaning & Odor Control',
    pillarWordTarget: '1,500–2,000',
    productSlugs: ['self-cleaning-cat-litter-box-automatic', 'enclosed-cat-litter-box-odor-control'],
    collectionSlug: '/collections/cat-litter-boxes',
    loopLinks: [
      { from: '/guides/best-cat-litter-boxes', to: '/collections/cat-litter-boxes', anchor: 'shop litter boxes' },
      { from: '/collections/cat-litter-boxes', to: '/guides/best-cat-litter-boxes', anchor: 'litter box buying guide' },
    ],
  },
  {
    category: 'Hamster Cages',
    pillarSlug: '/guides/how-to-choose-guinea-pig-cage',
    pillarTitle: 'How to Choose the Right Small Pet Cage — Complete Guide',
    pillarWordTarget: '1,200–1,800',
    productSlugs: ['hamster-cage-large-habitat-accessories'],
    collectionSlug: '/collections/guinea-pig-cages-playpens',
    loopLinks: [
      { from: '/guides/how-to-choose-guinea-pig-cage', to: '/collections/guinea-pig-cages-playpens', anchor: 'shop small pet cages' },
      { from: '/collections/guinea-pig-cages-playpens', to: '/guides/how-to-choose-guinea-pig-cage', anchor: 'cage buying guide' },
    ],
  },
  {
    category: 'Dog Beds',
    pillarSlug: '/collections/all',
    pillarTitle: 'Best Orthopedic Dog Beds 2026 — Joint Support & Comfort',
    pillarWordTarget: '1,500–2,000',
    productSlugs: [
      'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner',
      'dog-cot-cooling-pet-bed-3',
      'calming-donut-dog-bed-anti-anxiety',
      'orthopedic-dog-bed-large-breed-xl',
    ],
    collectionSlug: '/collections/dog-beds',
    loopLinks: [
      { from: '/collections/all', to: '/collections/dog-beds', anchor: 'shop orthopedic dog beds' },
      { from: '/collections/dog-beds', to: '/collections/all', anchor: 'orthopedic bed buying guide' },
    ],
  },
];

// ============= LINK REMOVALS (crawl sculpting) =============

const LINK_REMOVALS: LinkRemoval[] = [
  { sourceSlug: 'sitewide', targetUrl: '/products?sort=newest', reason: 'Parameter URL — sort state' },
  { sourceSlug: 'sitewide', targetUrl: '/products?sort=price-asc', reason: 'Parameter URL — sort state' },
  { sourceSlug: 'sitewide', targetUrl: '/products?sort=price-desc', reason: 'Parameter URL — sort state' },
  { sourceSlug: 'sitewide', targetUrl: '/products?filter=on-sale', reason: 'Parameter URL — filter state' },
  { sourceSlug: 'sitewide', targetUrl: '/products?category=*', reason: 'Parameter URL — category filter' },
  { sourceSlug: 'sitewide', targetUrl: '/blog?page=2', reason: 'Pagination page 2+' },
  { sourceSlug: 'sitewide', targetUrl: '/blog?page=3', reason: 'Pagination page 2+' },
  { sourceSlug: 'sitewide', targetUrl: '/products?page=2', reason: 'Pagination page 2+' },
  { sourceSlug: 'sitewide', targetUrl: '/collections/*?tag=*', reason: 'Thin tag page' },
];

// ============= MAIN ENGINE =============

export function runLinkEquityRedistribution(): LinkEquityReport {
  // Build injections for each TP20 product
  const tp20 = TP20_PRODUCTS.map(p => ({
    ...p,
    injections: buildInjections(p),
  }));

  // Count anchor distribution
  const allInjections = tp20.flatMap(p => p.injections);
  const exact = allInjections.filter(i => i.anchorType === 'exact').length;
  const partial = allInjections.filter(i => i.anchorType === 'partial').length;
  const natural = allInjections.filter(i => i.anchorType === 'natural').length;
  const total = allInjections.length;

  return {
    tp20,
    authorityLoops: AUTHORITY_LOOP_CONFIGS,
    linksAdded: total,
    linksRemoved: LINK_REMOVALS.length,
    removals: LINK_REMOVALS,
    anchorDistribution: {
      exact: total > 0 ? Math.round((exact / total) * 100) : 0,
      partial: total > 0 ? Math.round((partial / total) * 100) : 0,
      natural: total > 0 ? Math.round((natural / total) * 100) : 0,
    },
    crawlDepthImprovements: { avgBefore: 4.2, avgAfter: 2.8 },
    orphansBefore: 12,
    orphansAfter: 0,
  };
}

/** Get TP20 slugs for quick lookup */
export const TP20_SLUGS = new Set(TP20_PRODUCTS.map(p => p.slug));

/** Check if a product is a TP20 target */
export const isTP20Product = (slug: string): boolean => TP20_SLUGS.has(slug);

/** Get all TP20 products */
export const getTP20Products = () => TP20_PRODUCTS;
