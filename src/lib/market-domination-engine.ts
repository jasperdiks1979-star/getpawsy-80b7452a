/**
 * TOTAL MARKET DOMINATION — Micro-Niche & Fortress Expansion
 * 
 * Extends the existing attack engine with hyper-niche micro-domination
 * and a 40-page structured attack roadmap.
 */

// ─── 10 MICRO-NICHES TO DOMINATE ────────────────────────
export interface MicroNiche {
  id: string;
  name: string;
  parentCategory: string;
  primaryKeyword: string;
  monthlyVolume: number;
  difficulty: 'low' | 'medium';
  marginTier: 'high' | 'very-high';
  landingPage: string;
  contentPlan: {
    problemGuides: string[];
    comparisonPage: string;
    troubleshooting: string;
    faqHub: string;
  };
  productLinks: number;
  priorityScore: number; // (SV × Margin × Intent) ÷ Competition
}

export const MICRO_NICHES: MicroNiche[] = [
  {
    id: 'senior-dog-joint-beds',
    name: 'Beds for Senior Dogs with Joint Pain',
    parentCategory: 'orthopedic-dog-beds',
    primaryKeyword: 'dog bed for arthritis',
    monthlyVolume: 1900,
    difficulty: 'low',
    marginTier: 'very-high',
    landingPage: '/collections/senior-dog-arthritis-beds',
    contentPlan: {
      problemGuides: [
        'How to Tell If Your Dog Has Joint Pain',
        'Best Sleeping Positions for Dogs with Arthritis',
        'Memory Foam vs Orthopedic Foam: What Vets Recommend',
      ],
      comparisonPage: 'Bolster Bed vs Flat Orthopedic Bed for Senior Dogs',
      troubleshooting: 'Why Your Senior Dog Won\'t Use Their New Bed (And How to Fix It)',
      faqHub: 'Senior Dog Bed FAQ: Firmness, Size & Material Guide',
    },
    productLinks: 5,
    priorityScore: 92,
  },
  {
    id: 'small-apartment-cat-trees',
    name: 'Cat Trees for Small Apartments',
    parentCategory: 'cat-trees-condos',
    primaryKeyword: 'cat tree small apartment',
    monthlyVolume: 1600,
    difficulty: 'low',
    marginTier: 'high',
    landingPage: '/collections/small-apartment-cat-trees',
    contentPlan: {
      problemGuides: [
        'Best Vertical Cat Furniture for Tiny Spaces',
        'Wall-Mounted vs Floor Cat Trees: Space Comparison',
        'How to Keep a Cat Entertained in a Studio Apartment',
      ],
      comparisonPage: 'Compact Cat Tree vs Cat Shelves: Which Saves More Space?',
      troubleshooting: 'Cat Tree Too Big? How to Measure Before You Buy',
      faqHub: 'Small Space Cat Furniture FAQ',
    },
    productLinks: 4,
    priorityScore: 88,
  },
  {
    id: 'large-breed-cooling-beds',
    name: 'Cooling Beds for Large Breeds',
    parentCategory: 'orthopedic-dog-beds',
    primaryKeyword: 'cooling dog bed large breed',
    monthlyVolume: 1300,
    difficulty: 'low',
    marginTier: 'very-high',
    landingPage: '/collections/large-breed-cooling-beds',
    contentPlan: {
      problemGuides: [
        'Signs Your Large Dog Is Overheating at Night',
        'Gel Pad vs Elevated Cot: Cooling Comparison',
        'Best Summer Beds for Labs, Goldens & German Shepherds',
      ],
      comparisonPage: 'Elevated Bed vs Cooling Mat vs Gel Bed: Head-to-Head',
      troubleshooting: 'Cooling Bed Not Working? Common Setup Mistakes',
      faqHub: 'Large Dog Cooling Bed FAQ: Weight Limits, Materials & Care',
    },
    productLinks: 4,
    priorityScore: 86,
  },
  {
    id: 'anxious-dog-calming',
    name: 'Calming Products for Anxious Dogs',
    parentCategory: 'calming-beds',
    primaryKeyword: 'calming bed for anxious dog',
    monthlyVolume: 1600,
    difficulty: 'low',
    marginTier: 'very-high',
    landingPage: '/collections/calming-anxiety-dog-beds',
    contentPlan: {
      problemGuides: [
        'How Donut Beds Reduce Dog Anxiety (The Science)',
        'Calming Bed vs Thunder Shirt: Which Works Better?',
        'Best Nighttime Routine for Dogs with Separation Anxiety',
      ],
      comparisonPage: 'Raised-Edge Calming Bed vs Weighted Blanket for Dogs',
      troubleshooting: 'My Dog Destroys Calming Beds: Anxiety-Proof Options',
      faqHub: 'Anxious Dog Sleep Solutions FAQ',
    },
    productLinks: 4,
    priorityScore: 85,
  },
  {
    id: 'multi-cat-trees',
    name: 'Cat Trees for Multi-Cat Households',
    parentCategory: 'cat-trees-condos',
    primaryKeyword: 'cat tree for multiple cats',
    monthlyVolume: 1100,
    difficulty: 'low',
    marginTier: 'high',
    landingPage: '/collections/multi-cat-trees',
    contentPlan: {
      problemGuides: [
        'How Many Perches Per Cat? The Multi-Cat Rule',
        'Best Cat Trees for 3+ Cats (Weight-Tested)',
        'Reducing Cat Territory Fights with Vertical Space',
      ],
      comparisonPage: 'Single Tower vs Double Tower Cat Tree for 2 Cats',
      troubleshooting: 'Dominant Cat Hogging the Tree? Layout Solutions',
      faqHub: 'Multi-Cat Household Furniture FAQ',
    },
    productLinks: 4,
    priorityScore: 82,
  },
  {
    id: 'bored-indoor-cat-enrichment',
    name: 'Enrichment for Bored Indoor Cats',
    parentCategory: 'interactive-cat-toys',
    primaryKeyword: 'indoor cat enrichment ideas',
    monthlyVolume: 1400,
    difficulty: 'low',
    marginTier: 'high',
    landingPage: '/collections/indoor-cat-enrichment',
    contentPlan: {
      problemGuides: [
        'Signs Your Indoor Cat Is Bored (And What to Do)',
        'DIY vs Store-Bought Cat Enrichment: Cost & Effectiveness',
        'Best Puzzle Feeders for Mental Stimulation',
      ],
      comparisonPage: 'Laser Toy vs Feather Wand vs Puzzle Feeder: Engagement Test',
      troubleshooting: 'Cat Ignoring New Toys? How to Reset Their Interest',
      faqHub: 'Indoor Cat Entertainment FAQ',
    },
    productLinks: 5,
    priorityScore: 80,
  },
  {
    id: 'puppy-car-safety',
    name: 'Car Safety for Puppies',
    parentCategory: 'dog-car-safety',
    primaryKeyword: 'puppy car seat safety',
    monthlyVolume: 880,
    difficulty: 'low',
    marginTier: 'very-high',
    landingPage: '/collections/puppy-car-seats',
    contentPlan: {
      problemGuides: [
        'When Can a Puppy Ride in the Car Safely?',
        'Puppy Car Seat vs Crate: First Trip Guide',
        'How to Stop a Puppy from Crying in the Car',
      ],
      comparisonPage: 'Booster Seat vs Console Seat for Small Puppies',
      troubleshooting: 'Puppy Chewing the Seatbelt? Travel Training Tips',
      faqHub: 'Puppy Car Travel Safety FAQ',
    },
    productLinks: 3,
    priorityScore: 78,
  },
  {
    id: 'heavy-chewer-toys',
    name: 'Toys for Extreme Power Chewers',
    parentCategory: 'indestructible-dog-toys',
    primaryKeyword: 'toys for aggressive chewers',
    monthlyVolume: 2400,
    difficulty: 'medium',
    marginTier: 'high',
    landingPage: '/collections/power-chewer-toys',
    contentPlan: {
      problemGuides: [
        'Why Dogs Destroy Toys (And What Actually Lasts)',
        'Safest Materials for Power Chewer Toys',
        'Best Toys for Pit Bulls, Rottweilers & Mastiffs',
      ],
      comparisonPage: 'Rubber vs Nylon vs Kevlar Dog Toys: Durability Rankings',
      troubleshooting: 'Dog Destroying "Indestructible" Toys? Next-Level Options',
      faqHub: 'Power Chewer Toy Safety & Durability FAQ',
    },
    productLinks: 5,
    priorityScore: 76,
  },
  {
    id: 'washable-waterproof-beds',
    name: 'Washable & Waterproof Dog Beds',
    parentCategory: 'orthopedic-dog-beds',
    primaryKeyword: 'waterproof washable dog bed',
    monthlyVolume: 1600,
    difficulty: 'low',
    marginTier: 'high',
    landingPage: '/collections/washable-waterproof-dog-beds',
    contentPlan: {
      problemGuides: [
        'How to Clean a Dog Bed That Smells (Step-by-Step)',
        'Best Waterproof Liners vs Fully Waterproof Beds',
        'Dog Bed Hygiene Guide: How Often to Wash',
      ],
      comparisonPage: 'Removable Cover vs Fully Waterproof Bed: Convenience Test',
      troubleshooting: 'Waterproof Bed Leaking? Quality Check Guide',
      faqHub: 'Washable Dog Bed Care & Maintenance FAQ',
    },
    productLinks: 4,
    priorityScore: 74,
  },
  {
    id: 'quiet-grooming-tools',
    name: 'Low-Noise Pet Grooming for Anxious Pets',
    parentCategory: 'pet-grooming-vacuum',
    primaryKeyword: 'quiet pet grooming vacuum',
    monthlyVolume: 720,
    difficulty: 'low',
    marginTier: 'high',
    landingPage: '/collections/quiet-grooming-tools',
    contentPlan: {
      problemGuides: [
        'How to Groom a Dog That\'s Scared of Noise',
        'Decibel Ratings: Which Grooming Vacuums Are Truly Quiet?',
        'Desensitization Training for Grooming-Phobic Pets',
      ],
      comparisonPage: 'Low-Noise Vacuum vs Manual Grooming: Time & Stress Comparison',
      troubleshooting: 'Pet Still Terrified? Gradual Introduction Protocol',
      faqHub: 'Quiet Grooming FAQ: Noise Levels, Training & Product Picks',
    },
    productLinks: 3,
    priorityScore: 70,
  },
];

// ─── TOP 5 FORTRESS CATEGORIES ──────────────────────────
export const FORTRESS_CATEGORIES = [
  'Orthopedic & Calming Dog Beds',
  'Cat Trees & Condos',
  'Dog Car Safety & Travel',
  'Interactive Cat Enrichment',
  'Pet Grooming Vacuum Kits',
] as const;

// ─── 40-PAGE ATTACK ROADMAP (extends 30-page from attack engine) ──
export const ADDITIONAL_ATTACK_PAGES = [
  // Seasonal guides (4)
  { type: 'seasonal', title: 'Summer Dog Cooling Guide: Beds, Mats & Hydration', keyword: 'summer dog cooling', wordCount: 1500, collection: '/collections/elevated-cooling-dog-beds' },
  { type: 'seasonal', title: 'Winter Pet Comfort: Heated Beds & Cozy Dens', keyword: 'winter dog bed', wordCount: 1400, collection: '/collections/dog-beds' },
  { type: 'seasonal', title: 'Holiday Gift Guide: Best Pet Gifts Under $50', keyword: 'pet gift guide', wordCount: 1600, collection: '/collections/bestsellers' },
  { type: 'seasonal', title: 'Spring Shedding Season: Grooming Kit Essentials', keyword: 'spring dog shedding grooming', wordCount: 1300, collection: '/collections/pet-grooming-vacuum-kits' },

  // Budget vs Premium segmentation (3)
  { type: 'budget', title: 'Best Dog Beds Under $50 (That Actually Last)', keyword: 'dog bed under 50', wordCount: 1400, collection: '/collections/dog-beds' },
  { type: 'budget', title: 'Best Cat Trees Under $100 (Stability-Tested)', keyword: 'cat tree under 100', wordCount: 1300, collection: '/collections/cat-condos' },
  { type: 'premium', title: 'Premium Dog Beds Worth the Investment', keyword: 'premium orthopedic dog bed', wordCount: 1400, collection: '/collections/dog-beds' },

  // Cross-category authority (3)
  { type: 'authority', title: 'First-Time Dog Owner Essentials Checklist (2025)', keyword: 'new dog owner checklist', wordCount: 2000, collection: '/collections/dog-essentials' },
  { type: 'authority', title: 'Complete Indoor Cat Setup Guide', keyword: 'indoor cat essentials', wordCount: 1800, collection: '/collections/cat-condos' },
  { type: 'authority', title: 'Pet-Proofing Your Home: Room-by-Room Guide', keyword: 'pet proof house', wordCount: 1600, collection: '/collections/pet-safety' },
] as const;

// ─── 90-DAY DOMINATION PROJECTION ───────────────────────
export const DOMINATION_PROJECTION = {
  month1: {
    phase: 'Foundation & Quick Wins',
    pagesPublished: 15,
    microNichesLaunched: 4,
    fortressCategoriesStarted: 5,
    estimatedNewRankings: 12,
    trafficGain: 2200,
  },
  month2: {
    phase: 'Expansion & Interception',
    pagesPublished: 15,
    microNichesLaunched: 4,
    fortressCategoriesCompleted: 3,
    estimatedNewRankings: 28,
    trafficGain: 5800,
  },
  month3: {
    phase: 'Domination & Defense',
    pagesPublished: 10,
    microNichesLaunched: 2,
    fortressCategoriesCompleted: 5,
    estimatedNewRankings: 45,
    trafficGain: 9500,
  },
  total: {
    totalPages: 40,
    totalMicroNiches: 10,
    totalNewRankings: 85,
    totalTrafficGain: 17500,
    projectedRevenue: 28000,
    categoryDominanceAchieved: ['orthopedic-dog-beds', 'cat-trees-condos', 'dog-car-safety'],
  },
};

// ─── WEEKLY EXECUTION FRAMEWORK ─────────────────────────
export const WEEKLY_WAR_FRAMEWORK = {
  monday: ['Competitor SERP re-scan', 'Identify new ranking shifts', 'Update priority scores'],
  tuesday: ['Publish 2 cluster support pages', 'Inject internal links to fortress pages'],
  wednesday: ['Publish 1 comparison page', 'Expand thin micro-niche pages'],
  thursday: ['Publish 1 best-for guide', 'Schema validation sweep'],
  friday: ['Publish 1 pillar expansion', 'Cross-link new content to products'],
  saturday: ['Cannibalization audit', 'Orphan page detection', 'Sitemap cleanup'],
  sunday: ['Performance review', 'RPS recalculation', 'Next week priority queue'],
};
