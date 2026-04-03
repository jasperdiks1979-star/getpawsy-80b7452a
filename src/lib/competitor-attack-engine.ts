/**
 * AI COMPETITOR ATTACK MODE — GetPawsy
 * 
 * Systematic market share extraction through weakness exploitation,
 * keyword interception, and authority surround strategy.
 */

// ─── PHASE 1: TOP 5 ATTACK CATEGORIES ──────────────────
export const ATTACK_CATEGORIES = [
  {
    id: 'orthopedic-dog-beds',
    name: 'Orthopedic Dog Beds',
    competitorWeaknesses: [
      'Chewy: generic descriptions, no breed-specific sizing guides',
      'Amazon: no expert authority, listings are seller-driven noise',
      'PetSmart: thin collection pages (<200 words), no comparison content',
    ],
    attackStrategy: 'Out-depth every competitor with breed-specific guides, material comparisons, and vet-backed FAQ hubs',
    estimatedInterceptableTraffic: 14200,
    marginTier: 'platinum',
  },
  {
    id: 'cat-trees-condos',
    name: 'Cat Trees & Condos',
    competitorWeaknesses: [
      'Amazon: no editorial content, chaotic listing quality',
      'Chewy: generic "cat furniture" lumping, weak sub-segmentation',
      'Walmart: zero expertise signals, no buying guides',
    ],
    attackStrategy: 'Dominate sub-niches (small apartment, large breed, modern aesthetic) with deep pillar + cluster architecture',
    estimatedInterceptableTraffic: 9800,
    marginTier: 'gold',
  },
  {
    id: 'dog-car-safety',
    name: 'Dog Car Safety & Travel',
    competitorWeaknesses: [
      'No major pet retailer has dedicated car safety hubs',
      'Amazon: no crash-test content, no safety comparison tables',
      'Rover: informational only, no product funneling',
    ],
    attackStrategy: 'Own the "dog car safety" SERP with crash-test guides, harness vs seat comparisons, and breed-weight matrices',
    estimatedInterceptableTraffic: 8100,
    marginTier: 'platinum',
  },
  {
    id: 'interactive-cat-toys',
    name: 'Interactive Cat Toys',
    competitorWeaknesses: [
      'PetSmart: thin category, no "best for indoor cats" segmentation',
      'Chewy: generic toy lumping, no enrichment guides',
      'Petco: weak internal linking from blog to products',
    ],
    attackStrategy: 'Build "Cat Enrichment" authority cluster with age-specific, behavior-specific, and budget-specific guides',
    estimatedInterceptableTraffic: 6600,
    marginTier: 'gold',
  },
  {
    id: 'pet-grooming-vacuum',
    name: 'Pet Grooming Vacuum Kits',
    competitorWeaknesses: [
      'Amazon: listings only, no comparison content',
      'No competitor has a dedicated grooming vacuum hub',
      'YouTube dominates — text content gap is massive',
    ],
    attackStrategy: 'First-mover on text-based grooming vacuum authority: comparison tables, breed coat guides, noise-level rankings',
    estimatedInterceptableTraffic: 5400,
    marginTier: 'gold',
  },
] as const;

// ─── PHASE 3: TOP 20 KEYWORDS TO INTERCEPT ─────────────
export interface InterceptionTarget {
  keyword: string;
  monthlyVolume: number;
  competitorInTop10: string[];
  currentPosition: number | null; // null = not ranking
  difficulty: 'low' | 'medium' | 'high';
  interceptionPlan: string;
  supportPagesNeeded: number;
  targetCollection: string;
}

export const KEYWORD_INTERCEPTIONS: InterceptionTarget[] = [
  { keyword: 'best orthopedic dog bed', monthlyVolume: 4400, competitorInTop10: ['chewy.com', 'amazon.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: '2000-word expert guide + 3 comparison pages + FAQ hub', supportPagesNeeded: 4, targetCollection: '/collections/dog-beds' },
  { keyword: 'calming dog bed', monthlyVolume: 3600, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Anxiety-focused pillar + breed recommendations + vet FAQ', supportPagesNeeded: 3, targetCollection: '/collections/calming-anxiety-dog-beds' },
  { keyword: 'dog car seat', monthlyVolume: 6600, competitorInTop10: ['amazon.com', 'walmart.com'], currentPosition: null, difficulty: 'high', interceptionPlan: 'Safety-first pillar + crash test guide + weight matrix + 3 comparisons', supportPagesNeeded: 5, targetCollection: '/collections/best-dog-car-seats' },
  { keyword: 'cat tree for large cats', monthlyVolume: 3200, competitorInTop10: ['chewy.com', 'amazon.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Weight-rated guide + comparison table + breed pairing', supportPagesNeeded: 3, targetCollection: '/collections/cat-condos' },
  { keyword: 'automatic cat feeder', monthlyVolume: 5400, competitorInTop10: ['amazon.com', 'chewy.com', 'petsmart.com'], currentPosition: null, difficulty: 'high', interceptionPlan: 'Smart feeder comparison + app feature matrix + portion guide', supportPagesNeeded: 4, targetCollection: '/collections/automatic-pet-feeders' },
  { keyword: 'indestructible dog toy', monthlyVolume: 4400, competitorInTop10: ['amazon.com', 'barkshop.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Material durability guide + chewer type matrix + safety FAQ', supportPagesNeeded: 3, targetCollection: '/collections/indestructible-dog-toys' },
  { keyword: 'pet grooming vacuum', monthlyVolume: 2900, competitorInTop10: ['amazon.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'First-mover hub: noise comparison + coat type guide + suction power ranking', supportPagesNeeded: 3, targetCollection: '/collections/pet-grooming-vacuum-kits' },
  { keyword: 'elevated dog bed', monthlyVolume: 2400, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'Cooling + joint relief angle + indoor/outdoor comparison', supportPagesNeeded: 2, targetCollection: '/collections/elevated-cooling-dog-beds' },
  { keyword: 'small dog bed', monthlyVolume: 3600, competitorInTop10: ['amazon.com', 'petsmart.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Size guide + breed pairing + washability comparison', supportPagesNeeded: 3, targetCollection: '/collections/small-dog-beds' },
  { keyword: 'modern cat tree', monthlyVolume: 1900, competitorInTop10: ['amazon.com', 'wayfair.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'Aesthetic-focused guide + room integration tips + stability ratings', supportPagesNeeded: 2, targetCollection: '/collections/modern-cat-trees' },
  { keyword: 'dog harness no pull', monthlyVolume: 5400, competitorInTop10: ['amazon.com', 'chewy.com', 'petsmart.com'], currentPosition: null, difficulty: 'high', interceptionPlan: 'Training-focused guide + size chart + front-clip vs back-clip comparison', supportPagesNeeded: 4, targetCollection: '/collections/dog-harnesses' },
  { keyword: 'cat scratching post', monthlyVolume: 3600, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Material durability guide + height recommendations + sisal vs carpet', supportPagesNeeded: 3, targetCollection: '/collections/cat-scratching-posts' },
  { keyword: 'washable dog bed', monthlyVolume: 2400, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'Machine wash guide + waterproof liner comparison + odor resistance', supportPagesNeeded: 2, targetCollection: '/collections/washable-dog-beds' },
  { keyword: 'dog travel accessories', monthlyVolume: 1600, competitorInTop10: ['amazon.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'Road trip checklist + car safety bundle guide + airline compliance', supportPagesNeeded: 2, targetCollection: '/collections/dog-travel-accessories' },
  { keyword: 'cat enrichment toys', monthlyVolume: 1300, competitorInTop10: ['chewy.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'Behavioral enrichment pillar + indoor boredom solutions + age-specific', supportPagesNeeded: 3, targetCollection: '/collections/interactive-cat-toys' },
  { keyword: 'large dog bed orthopedic', monthlyVolume: 2200, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Weight-support guide + breed matrix + foam density comparison', supportPagesNeeded: 3, targetCollection: '/collections/large-breed-dog-beds' },
  { keyword: 'best cat tree 2025', monthlyVolume: 1900, competitorInTop10: ['wirecutter.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Annual roundup + stability testing + multi-cat household guide', supportPagesNeeded: 3, targetCollection: '/collections/cat-condos' },
  { keyword: 'dog anxiety bed', monthlyVolume: 1600, competitorInTop10: ['amazon.com'], currentPosition: null, difficulty: 'low', interceptionPlan: 'Separation anxiety guide + thunder phobia section + nest-style comparison', supportPagesNeeded: 2, targetCollection: '/collections/calming-anxiety-dog-beds' },
  { keyword: 'slow feeder dog bowl', monthlyVolume: 2900, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Bloat prevention guide + puzzle difficulty levels + breed sizing', supportPagesNeeded: 3, targetCollection: '/collections/slow-feeder-bowls' },
  { keyword: 'pet camera treat dispenser', monthlyVolume: 2400, competitorInTop10: ['amazon.com', 'chewy.com'], currentPosition: null, difficulty: 'medium', interceptionPlan: 'Smart home integration guide + app comparison + night vision ranking', supportPagesNeeded: 3, targetCollection: '/collections/smart-pet-tech' },
];

// ─── PHASE 2: 30-PAGE ATTACK CONTENT PLAN ───────────────
export interface AttackPage {
  type: 'pillar' | 'comparison' | 'best-for' | 'faq-hub' | 'problem-solution' | 'alternatives';
  title: string;
  primaryKeyword: string;
  wordCount: number;
  targetCollection: string;
  internalLinksRequired: number;
  faqCount: number;
}

export const ATTACK_CONTENT_PLAN: AttackPage[] = [
  // Pillars (5)
  { type: 'pillar', title: 'The Complete Guide to Orthopedic Dog Beds: What Vets Recommend', primaryKeyword: 'orthopedic dog bed guide', wordCount: 2200, targetCollection: '/collections/dog-beds', internalLinksRequired: 8, faqCount: 8 },
  { type: 'pillar', title: 'Dog Car Safety: The Ultimate Crash-Tested Seat & Harness Guide', primaryKeyword: 'dog car safety guide', wordCount: 2000, targetCollection: '/collections/best-dog-car-seats', internalLinksRequired: 8, faqCount: 7 },
  { type: 'pillar', title: 'Cat Trees Decoded: How to Choose the Perfect One for Your Cat', primaryKeyword: 'how to choose cat tree', wordCount: 2000, targetCollection: '/collections/cat-condos', internalLinksRequired: 8, faqCount: 8 },
  { type: 'pillar', title: 'Pet Grooming at Home: The Complete Vacuum Grooming Guide', primaryKeyword: 'pet grooming vacuum guide', wordCount: 1800, targetCollection: '/collections/pet-grooming-vacuum-kits', internalLinksRequired: 6, faqCount: 6 },
  { type: 'pillar', title: 'Interactive Cat Enrichment: Stop Boredom, Start Thriving', primaryKeyword: 'cat enrichment guide', wordCount: 1800, targetCollection: '/collections/interactive-cat-toys', internalLinksRequired: 6, faqCount: 6 },

  // Comparison pages (10)
  { type: 'comparison', title: 'Orthopedic vs Memory Foam Dog Beds: Which Is Better?', primaryKeyword: 'orthopedic vs memory foam dog bed', wordCount: 1500, targetCollection: '/collections/dog-beds', internalLinksRequired: 5, faqCount: 5 },
  { type: 'comparison', title: 'Dog Car Seat vs Harness: What\'s Safer?', primaryKeyword: 'dog car seat vs harness', wordCount: 1500, targetCollection: '/collections/best-dog-car-seats', internalLinksRequired: 5, faqCount: 5 },
  { type: 'comparison', title: 'Tall Cat Tree vs Wide Cat Condo: Space-Saving Guide', primaryKeyword: 'tall vs wide cat tree', wordCount: 1200, targetCollection: '/collections/cat-condos', internalLinksRequired: 4, faqCount: 4 },
  { type: 'comparison', title: 'Calming Dog Bed vs Regular Bed: Does It Actually Help?', primaryKeyword: 'calming dog bed vs regular', wordCount: 1400, targetCollection: '/collections/calming-anxiety-dog-beds', internalLinksRequired: 5, faqCount: 5 },
  { type: 'comparison', title: 'Elevated Dog Bed vs Foam Bed: Cooling & Joint Support', primaryKeyword: 'elevated vs foam dog bed', wordCount: 1200, targetCollection: '/collections/elevated-cooling-dog-beds', internalLinksRequired: 4, faqCount: 4 },
  { type: 'comparison', title: 'Sisal vs Carpet Cat Scratching Post: Durability Test', primaryKeyword: 'sisal vs carpet scratching post', wordCount: 1200, targetCollection: '/collections/cat-scratching-posts', internalLinksRequired: 4, faqCount: 4 },
  { type: 'comparison', title: 'Gravity Feeder vs Smart Feeder: Which Suits Your Pet?', primaryKeyword: 'gravity vs smart pet feeder', wordCount: 1300, targetCollection: '/collections/automatic-pet-feeders', internalLinksRequired: 4, faqCount: 4 },
  { type: 'comparison', title: 'Front-Clip vs Back-Clip Dog Harness: Training Guide', primaryKeyword: 'front clip vs back clip harness', wordCount: 1300, targetCollection: '/collections/dog-harnesses', internalLinksRequired: 4, faqCount: 4 },
  { type: 'comparison', title: 'Rubber vs Rope Dog Toys: What Lasts for Power Chewers?', primaryKeyword: 'rubber vs rope dog toy durability', wordCount: 1200, targetCollection: '/collections/indestructible-dog-toys', internalLinksRequired: 4, faqCount: 4 },
  { type: 'comparison', title: 'Budget vs Premium Pet Grooming Vacuums: Worth the Upgrade?', primaryKeyword: 'budget vs premium grooming vacuum', wordCount: 1300, targetCollection: '/collections/pet-grooming-vacuum-kits', internalLinksRequired: 4, faqCount: 4 },

  // Best-for pages (8)
  { type: 'best-for', title: 'Best Dog Beds for Senior Dogs with Arthritis (2025)', primaryKeyword: 'best dog bed for senior dogs', wordCount: 1600, targetCollection: '/collections/dog-beds', internalLinksRequired: 5, faqCount: 5 },
  { type: 'best-for', title: 'Best Cat Trees for Small Apartments', primaryKeyword: 'best cat tree small apartment', wordCount: 1400, targetCollection: '/collections/cat-condos', internalLinksRequired: 5, faqCount: 5 },
  { type: 'best-for', title: 'Best Dog Car Seats for Large Breeds', primaryKeyword: 'best dog car seat large breed', wordCount: 1400, targetCollection: '/collections/best-dog-car-seats', internalLinksRequired: 5, faqCount: 5 },
  { type: 'best-for', title: 'Best Automatic Feeders for Multi-Cat Households', primaryKeyword: 'best automatic feeder multiple cats', wordCount: 1400, targetCollection: '/collections/automatic-pet-feeders', internalLinksRequired: 5, faqCount: 4 },
  { type: 'best-for', title: 'Best Indestructible Toys for Pit Bulls & Power Chewers', primaryKeyword: 'best indestructible toy pit bull', wordCount: 1400, targetCollection: '/collections/indestructible-dog-toys', internalLinksRequired: 5, faqCount: 5 },
  { type: 'best-for', title: 'Best Calming Beds for Dogs with Separation Anxiety', primaryKeyword: 'best calming bed separation anxiety', wordCount: 1500, targetCollection: '/collections/calming-anxiety-dog-beds', internalLinksRequired: 5, faqCount: 5 },
  { type: 'best-for', title: 'Best Grooming Vacuums for Long-Haired Dogs', primaryKeyword: 'best grooming vacuum long hair dog', wordCount: 1300, targetCollection: '/collections/pet-grooming-vacuum-kits', internalLinksRequired: 4, faqCount: 4 },
  { type: 'best-for', title: 'Best Interactive Toys for Indoor Cats', primaryKeyword: 'best interactive toy indoor cat', wordCount: 1300, targetCollection: '/collections/interactive-cat-toys', internalLinksRequired: 4, faqCount: 4 },

  // FAQ hubs (3)
  { type: 'faq-hub', title: 'Dog Bed FAQ: Everything Pet Parents Ask', primaryKeyword: 'dog bed questions', wordCount: 1800, targetCollection: '/collections/dog-beds', internalLinksRequired: 6, faqCount: 15 },
  { type: 'faq-hub', title: 'Cat Tree FAQ: Sizing, Safety & Maintenance', primaryKeyword: 'cat tree faq', wordCount: 1600, targetCollection: '/collections/cat-condos', internalLinksRequired: 6, faqCount: 12 },
  { type: 'faq-hub', title: 'Dog Car Safety FAQ: Laws, Crash Tests & Best Practices', primaryKeyword: 'dog car seat safety faq', wordCount: 1600, targetCollection: '/collections/best-dog-car-seats', internalLinksRequired: 6, faqCount: 12 },

  // Alternatives pages (2)
  { type: 'alternatives', title: 'Best Chewy Alternatives for Premium Pet Supplies', primaryKeyword: 'chewy alternatives', wordCount: 1500, targetCollection: '/collections/dog-beds', internalLinksRequired: 6, faqCount: 5 },
  { type: 'alternatives', title: 'Amazon Pet Supplies Alternatives: Expert-Curated Options', primaryKeyword: 'amazon pet supplies alternative', wordCount: 1500, targetCollection: '/collections/cat-condos', internalLinksRequired: 6, faqCount: 5 },

  // Problem-solution pages (2)
  { type: 'problem-solution', title: 'My Dog Won\'t Sleep Through the Night: A Bed Solution Guide', primaryKeyword: 'dog won\'t sleep through night', wordCount: 1600, targetCollection: '/collections/calming-anxiety-dog-beds', internalLinksRequired: 5, faqCount: 6 },
  { type: 'problem-solution', title: 'How to Stop Your Cat from Scratching Furniture (Without Declawing)', primaryKeyword: 'stop cat scratching furniture', wordCount: 1600, targetCollection: '/collections/cat-scratching-posts', internalLinksRequired: 5, faqCount: 6 },
];

// ─── PHASE 4: INTERNAL LINK RESTRUCTURING ───────────────
export const LINK_RESTRUCTURING_PLAN = {
  rules: [
    'Every attack page must link to its target collection within the first 300 words',
    'Pillar pages link to all comparison + best-for pages in their cluster',
    'Comparison pages link to both product collections being compared',
    'Best-for pages link to 3 specific products + parent collection',
    'FAQ hubs link to every page in their topic cluster',
    'Alternatives pages link to 5+ product categories',
    'Blog sidebar "Related Guides" block auto-populated from cluster',
  ],
  linkWeightMultipliers: {
    'orthopedic-dog-beds': 3.0,
    'dog-car-safety': 3.0,
    'cat-trees-condos': 2.5,
    'pet-grooming-vacuum': 2.5,
    'interactive-cat-toys': 2.0,
  },
  minimumInternalLinks: {
    pillar: 8,
    comparison: 5,
    'best-for': 5,
    'faq-hub': 6,
    alternatives: 6,
    'problem-solution': 5,
  },
};

// ─── PHASE 5: CONVERSION SUPERIORITY CHECKLIST ──────────
export const CONVERSION_CHECKLIST = [
  { item: 'Benefit-first H1 headline', status: 'implemented', component: 'ProductDetail' },
  { item: 'Trust badges below CTA', status: 'implemented', component: 'TrustMicrocopy' },
  { item: 'Shipping clarity block', status: 'implemented', component: 'DeliveryReassurance' },
  { item: 'FAQ accordion on PDPs', status: 'implemented', component: 'HeroProductBoost' },
  { item: 'Mobile sticky Add to Cart', status: 'implemented', component: 'StickyMobileCart' },
  { item: 'Comparison table on collections', status: 'implemented', component: 'ComparisonTable' },
  { item: 'Social proof (low stock badge)', status: 'implemented', component: 'LowStockBadge' },
  { item: 'Exit-intent discount popup', status: 'implemented', component: 'ExitIntentPopup' },
  { item: 'Frequently bought together', status: 'implemented', component: 'FrequentlyBoughtTogether' },
  { item: 'Related products carousel', status: 'implemented', component: 'RelatedProductsCarousel' },
  { item: 'Trending Now sitewide strip', status: 'implemented', component: 'TrendingNowStrip' },
  { item: 'Email capture popup', status: 'implemented', component: 'WelcomePopup' },
  { item: 'Expert authority block', status: 'implemented', component: 'ExpertBlock' },
  { item: 'USP emotional microcopy', status: 'implemented', component: 'WhyPetParentsLoveThis' },
  { item: 'LCP < 2.5s enforcement', status: 'implemented', component: 'Layout hydration gating' },
];

// ─── PHASE 6: 90-DAY TAKEOVER PROJECTION ────────────────
export const TAKEOVER_PROJECTION_90DAY = {
  month1: {
    pagesPublished: 12,
    keywordsTargeted: 20,
    estimatedNewRankings: 8,
    trafficGain: 1800,
    projectedSales: 8,
  },
  month2: {
    pagesPublished: 10,
    keywordsTargeted: 15,
    estimatedNewRankings: 18,
    trafficGain: 4200,
    projectedSales: 16,
  },
  month3: {
    pagesPublished: 8,
    keywordsTargeted: 10,
    estimatedNewRankings: 30,
    trafficGain: 7500,
    projectedSales: 28,
  },
  total: {
    totalPagesPublished: 30,
    totalKeywordsIntercepted: 20,
    totalEstimatedRankings: 56,
    totalTrafficGain: 13500,
    totalProjectedSales: 52,
    dominanceCategories: ['orthopedic-dog-beds', 'dog-car-safety', 'cat-trees-condos'],
    competitorsWeakened: ['petsmart.com', 'petco.com', 'walmart.com'],
  },
};

// ─── ADAPTIVE WAR LOOP CONFIG ───────────────────────────
export const WAR_LOOP_CONFIG = {
  scanFrequency: 'weekly',
  actions: [
    'Re-scan competitor SERP positions for all 20 intercepted keywords',
    'Detect new competitor content in attack categories',
    'Detect competitor backlink growth via referring domain delta',
    'Detect new category pages from competitors',
    'Auto-generate counter content for any competitor advancement',
  ],
  priorityFormula: '(SearchVolume × Margin × InterceptionProbability) ÷ Competition',
  autoResponseThresholds: {
    competitorNewPage: 'Generate counter content within 48 hours',
    competitorRankGain: 'Expand our page + add 2 support articles',
    competitorBacklinkSpike: 'Trigger authority surround strategy',
  },
};
