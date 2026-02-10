/**
 * MODULE D — 300 Guide Scaling Roadmap
 * 
 * Expansion matrix, revenue projections, phased rollout
 */

// ============= EXPANSION MATRIX =============

export interface ExpansionVariation {
  dimension: string;
  variations: string[];
  estimatedGuides: number;
}

export interface ClusterExpansion {
  cluster: string;
  currentGuides: number;
  expansionMatrix: ExpansionVariation[];
  totalExpansionGuides: number;
}

export const CLUSTER_EXPANSIONS: ClusterExpansion[] = [
  {
    cluster: 'Cat Litter',
    currentGuides: 15,
    totalExpansionGuides: 120,
    expansionMatrix: [
      { dimension: 'Breed Variations', variations: ['Persian', 'Siamese', 'Ragdoll', 'Bengal', 'British Shorthair', 'Sphynx', 'Norwegian Forest Cat'], estimatedGuides: 14 },
      { dimension: 'Size Variations', variations: ['Small/kitten', 'Standard', 'Large/XL', 'Jumbo', 'Corner-fit'], estimatedGuides: 10 },
      { dimension: 'Use-Case', variations: ['Multi-cat', 'Single cat', 'New cat owner', 'After surgery', 'Kitten training', 'Outdoor/indoor transition'], estimatedGuides: 12 },
      { dimension: 'Apartment/Space', variations: ['Studio', 'Small apartment', 'Bathroom', 'Under sink', 'Closet', 'Garage', 'Laundry room'], estimatedGuides: 14 },
      { dimension: 'Senior/Kitten', variations: ['Senior cats', 'Kittens under 6mo', 'Kittens 6-12mo', 'Arthritic cats', 'Disabled cats'], estimatedGuides: 10 },
      { dimension: 'Material/Type', variations: ['Bamboo', 'Recycled plastic', 'Stainless steel XL', 'Ceramic', 'Disposable', 'Travel litter box'], estimatedGuides: 12 },
      { dimension: 'Budget/Premium', variations: ['Under $20', 'Under $50', 'Under $100', 'Premium $100+', 'Luxury $200+'], estimatedGuides: 10 },
      { dimension: 'Problem-Solving', variations: ['Spraying', 'Litter box avoidance', 'Stress peeing', 'Multiple floors', 'Odor in summer'], estimatedGuides: 10 },
      { dimension: 'Vs Comparisons', variations: ['Brand A vs B (8 combos)', 'Open vs closed', 'Manual vs automatic', 'Pine vs clay', 'Crystal vs clumping'], estimatedGuides: 18 },
      { dimension: 'Seasonal/Trending', variations: ['Black Friday deals', 'Amazon Prime Day', 'New releases 2026', 'TikTok trending'], estimatedGuides: 10 },
    ],
  },
  {
    cluster: 'Cat Furniture',
    currentGuides: 10,
    totalExpansionGuides: 110,
    expansionMatrix: [
      { dimension: 'Breed Variations', variations: ['Maine Coon', 'Persian', 'Bengal', 'Ragdoll', 'Siamese', 'Large breeds', 'Small breeds'], estimatedGuides: 14 },
      { dimension: 'Size Variations', variations: ['Mini/tabletop', 'Small (under 3ft)', 'Medium (3-5ft)', 'Tall (5ft+)', 'Floor-to-ceiling', 'Wall-mounted'], estimatedGuides: 12 },
      { dimension: 'Space Type', variations: ['Studio apartment', 'Small room', 'Living room', 'Bedroom', 'Balcony', 'Window', 'Corner'], estimatedGuides: 14 },
      { dimension: 'Style/Aesthetic', variations: ['Modern/minimalist', 'Boho', 'Scandinavian', 'Mid-century', 'Rustic', 'Japanese', 'Colorful'], estimatedGuides: 14 },
      { dimension: 'Senior/Kitten', variations: ['Senior cats', 'Kittens', 'Overweight cats', 'Cats with mobility issues'], estimatedGuides: 8 },
      { dimension: 'Feature-Focused', variations: ['With hammock', 'With tunnel', 'With basket', 'With stairs', 'With ramp', 'Modular/expandable'], estimatedGuides: 12 },
      { dimension: 'Budget/Premium', variations: ['Under $50', 'Under $100', 'Under $200', 'Premium $200+', 'DIY alternatives'], estimatedGuides: 10 },
      { dimension: 'Multi-Cat', variations: ['2 cats', '3+ cats', 'Cat + dog household', 'New cat introduction'], estimatedGuides: 8 },
      { dimension: 'Vs Comparisons', variations: ['Brand comparisons (10 combos)', 'Material comparisons', 'Type comparisons'], estimatedGuides: 12 },
      { dimension: 'Seasonal', variations: ['Holiday gifts', 'Prime Day', 'New releases', 'Clearance picks'], estimatedGuides: 6 },
    ],
  },
  {
    cluster: 'Dog Beds',
    currentGuides: 0,
    totalExpansionGuides: 70,
    expansionMatrix: [
      { dimension: 'Breed Variations', variations: ['Golden Retriever', 'German Shepherd', 'Labrador', 'French Bulldog', 'Dachshund', 'Great Dane', 'Chihuahua'], estimatedGuides: 14 },
      { dimension: 'Size Variations', variations: ['Small (under 20lbs)', 'Medium (20-50lbs)', 'Large (50-80lbs)', 'XL (80lbs+)', 'Giant breeds'], estimatedGuides: 10 },
      { dimension: 'Health/Need', variations: ['Orthopedic', 'Hip dysplasia', 'Anxiety/calming', 'Post-surgery', 'Senior dogs', 'Puppies', 'Chew-proof'], estimatedGuides: 14 },
      { dimension: 'Location', variations: ['Crate bed', 'Car bed', 'Outdoor', 'Camping', 'Office', 'Sofa style', 'Elevated/cot'], estimatedGuides: 14 },
      { dimension: 'Budget/Premium', variations: ['Under $30', 'Under $50', 'Under $100', 'Premium $100+', 'Luxury'], estimatedGuides: 10 },
      { dimension: 'Vs Comparisons', variations: ['Memory foam vs bolster', 'Flat vs nest', 'Brand vs brand (5 combos)'], estimatedGuides: 8 },
    ],
  },
];

// ============= PHASED ROLLOUT =============

export interface PhaseTarget {
  phase: number;
  label: string;
  totalGuides: number;
  timeline: string;
  clusters: { name: string; guides: number }[];
  focus: string;
}

export const SCALING_PHASES: PhaseTarget[] = [
  {
    phase: 1, label: 'Foundation', totalGuides: 25, timeline: 'Month 1',
    clusters: [
      { name: 'Cat Litter', guides: 15 },
      { name: 'Cat Furniture', guides: 10 },
    ],
    focus: 'Cornerstone pages, info hubs, high-AOV guides',
  },
  {
    phase: 2, label: 'Expansion', totalGuides: 100, timeline: 'Month 2-3',
    clusters: [
      { name: 'Cat Litter', guides: 40 },
      { name: 'Cat Furniture', guides: 35 },
      { name: 'Dog Beds', guides: 25 },
    ],
    focus: 'Breed variations, size variations, top comparisons',
  },
  {
    phase: 3, label: 'Authority', totalGuides: 200, timeline: 'Month 4-6',
    clusters: [
      { name: 'Cat Litter', guides: 75 },
      { name: 'Cat Furniture', guides: 70 },
      { name: 'Dog Beds', guides: 55 },
    ],
    focus: 'Long-tail use-cases, problem-solving guides, budget tiers',
  },
  {
    phase: 4, label: 'Dominance', totalGuides: 300, timeline: 'Month 7-12',
    clusters: [
      { name: 'Cat Litter', guides: 110 },
      { name: 'Cat Furniture', guides: 105 },
      { name: 'Dog Beds', guides: 85 },
    ],
    focus: 'Seasonal content, trending topics, brand comparisons, full coverage',
  },
];

// ============= REVENUE PROJECTIONS =============

export interface RevenueProjection {
  month: number;
  label: string;
  totalGuides: number;
  estimatedImpressions: number;
  estimatedCTR: number;
  estimatedClicks: number;
  estimatedConversionRate: number;
  estimatedOrders: number;
  estimatedAOV: number;
  estimatedRevenue: number;
  scenario: 'conservative' | 'moderate' | 'optimistic';
}

function projectRevenue(
  month: number,
  guides: number,
  scenario: 'conservative' | 'moderate' | 'optimistic'
): RevenueProjection {
  // Impressions per guide per month (based on keyword difficulty and ramp-up)
  const impressionsPerGuide = {
    conservative: Math.min(month * 80, 600),
    moderate: Math.min(month * 150, 1200),
    optimistic: Math.min(month * 250, 2000),
  }[scenario];

  const totalImpressions = guides * impressionsPerGuide;

  // CTR improves as content matures
  const baseCTR = { conservative: 2.5, moderate: 4.0, optimistic: 6.0 }[scenario];
  const ctrMultiplier = Math.min(1 + (month - 1) * 0.05, 1.5);
  const estimatedCTR = baseCTR * ctrMultiplier;

  const estimatedClicks = Math.round(totalImpressions * (estimatedCTR / 100));

  // Conversion rate for commercial content
  const conversionRate = { conservative: 1.2, moderate: 2.0, optimistic: 3.0 }[scenario];
  const estimatedOrders = Math.round(estimatedClicks * (conversionRate / 100));

  const estimatedAOV = { conservative: 38, moderate: 42, optimistic: 48 }[scenario];

  return {
    month,
    label: `Month ${month}`,
    totalGuides: guides,
    estimatedImpressions: totalImpressions,
    estimatedCTR: Math.round(estimatedCTR * 10) / 10,
    estimatedClicks,
    estimatedConversionRate: conversionRate,
    estimatedOrders,
    estimatedAOV,
    estimatedRevenue: estimatedOrders * estimatedAOV,
    scenario,
  };
}

export function generate12MonthProjection(): {
  conservative: RevenueProjection[];
  moderate: RevenueProjection[];
  optimistic: RevenueProjection[];
} {
  const guidesByMonth = [
    25, 50, 100, 130, 160, 200, 220, 240, 260, 280, 290, 300,
  ];

  return {
    conservative: guidesByMonth.map((g, i) => projectRevenue(i + 1, g, 'conservative')),
    moderate: guidesByMonth.map((g, i) => projectRevenue(i + 1, g, 'moderate')),
    optimistic: guidesByMonth.map((g, i) => projectRevenue(i + 1, g, 'optimistic')),
  };
}

// ============= SUMMARY =============

export function getScalingRoadmapSummary() {
  const projections = generate12MonthProjection();
  const m3 = projections.moderate[2];
  const m6 = projections.moderate[5];
  const m12 = projections.moderate[11];

  return {
    totalPlannedGuides: 300,
    phases: SCALING_PHASES.length,
    clusters: CLUSTER_EXPANSIONS.map(c => ({
      name: c.cluster,
      current: c.currentGuides,
      planned: c.totalExpansionGuides,
    })),
    revenueProjections: {
      month3: { guides: m3.totalGuides, revenue: m3.estimatedRevenue, clicks: m3.estimatedClicks },
      month6: { guides: m6.totalGuides, revenue: m6.estimatedRevenue, clicks: m6.estimatedClicks },
      month12: { guides: m12.totalGuides, revenue: m12.estimatedRevenue, clicks: m12.estimatedClicks },
    },
  };
}
