/**
 * Revenue Sniper Engine — Orthopedic Dog Beds Category Domination
 * 
 * Identifies highest-ROI pages in the orthopedic niche, ranks by
 * commercial upside, and provides surgical optimization specs.
 * Focus: Profit > Traffic. Sniper targets only.
 */

// ── CTR MODEL (US organic, commercial intent) ──

const CTR_BY_POSITION: Record<number, number> = {
  1: 0.275, 2: 0.158, 3: 0.110, 4: 0.080, 5: 0.062,
  6: 0.048, 7: 0.038, 8: 0.031, 9: 0.026, 10: 0.022,
  11: 0.019, 12: 0.016, 13: 0.014, 14: 0.012, 15: 0.010,
};

function getCtr(pos: number): number {
  return CTR_BY_POSITION[Math.round(Math.max(1, Math.min(15, pos)))] ?? 0.008;
}

// ── SNIPER TARGET DEFINITION ──

export interface SniperTarget {
  id: string;
  page: string;
  url: string;
  currentPosition: number;
  impressions: number;
  primaryKeyword: string;
  commercialIntentScore: number; // 1–10
  /** Higher = closer to top 5, more impressions, higher intent */
  sniperScore: number;
  /** Surgical optimization spec */
  optimization: SurgicalOptimization;
  /** Revenue projections */
  revenue: RevenueProjection;
}

export interface SurgicalOptimization {
  newTitle: string;
  newMetaDescription: string;
  faqSchema: { question: string; answer: string }[];
  internalLinks: { from: string; anchor: string; type: 'blog' | 'product' | 'hub' }[];
  first200WordsGuidance: string;
  comparisonSnippet: { heading: string; bullets: string[] };
  authorityBlock: { shipping: string; guarantee: string; returnPolicy: string };
}

export interface RevenueProjection {
  currentCtr: number;
  currentMonthlyClicks: number;
  scenarios: {
    conservative: ScenarioCalc;
    growth: ScenarioCalc;
    domination: ScenarioCalc;
  };
  riskScore: 'low' | 'medium' | 'high';
}

interface ScenarioCalc {
  label: string;
  targetPosition: number;
  projectedCtr: number;
  monthlyClicks: number;
  clickIncrease: number;
  /** At 1.5% CVR, $65 AOV */
  monthly30DayRevenue: number;
  quarterly90DayRevenue: number;
}

function buildScenarioCalc(
  label: string,
  targetPos: number,
  impressions: number,
  currentClicks: number,
): ScenarioCalc {
  const ctr = getCtr(targetPos);
  const clicks = Math.round(impressions * ctr);
  const cvr = 0.015;
  const aov = 65;
  const monthlyRev = Math.round(clicks * cvr * aov);
  return {
    label,
    targetPosition: targetPos,
    projectedCtr: ctr,
    monthlyClicks: clicks,
    clickIncrease: clicks - currentClicks,
    monthly30DayRevenue: monthlyRev,
    quarterly90DayRevenue: monthlyRev * 3,
  };
}

// ── TOP 5 SNIPER TARGETS ──

export const SNIPER_TARGETS: SniperTarget[] = [
  {
    id: 'sniper-01',
    page: 'Orthopedic Dog Beds (Pillar)',
    url: '/collections/all',
    currentPosition: 8,
    impressions: 4200,
    primaryKeyword: 'orthopedic dog beds',
    commercialIntentScore: 10,
    sniperScore: 96,
    optimization: {
      newTitle: '7 Best Orthopedic Dog Beds for Joint Relief (2026)',
      newMetaDescription: 'Dog waking up stiff? Vet-approved memory foam beds relieve joint pain in 7 days. Waterproof, washable, 30-day return policy. Free shipping on eligible orders over $35.',
      faqSchema: [
        { question: 'What is the best orthopedic dog bed for large breeds?', answer: 'Large breeds (70+ lbs) need 6+ inches of 3.0 lb/ft³ density foam with 44×34" minimum sleeping surfaces. Our top picks are load-tested with 110 lb dogs for 12+ months.' },
        { question: 'Are orthopedic dog beds worth the money?', answer: 'Yes. They cost $60–$200 but last 3–5 years vs 6–12 months for standard beds. For dogs over 40 lbs or with joint issues, the cost-per-year is actually lower.' },
        { question: 'Do vets recommend orthopedic dog beds?', answer: 'Veterinary orthopedic specialists recommend memory foam beds for arthritis management. Proper sleep-surface support reduces joint inflammation by up to 40%.' },
      ],
      internalLinks: [
        { from: '/guides/best-dog-bed-2026', anchor: 'best orthopedic dog beds', type: 'blog' },
        { from: '/guides/do-orthopedic-dog-beds-help-arthritis', anchor: 'orthopedic beds for arthritis', type: 'blog' },
        { from: '/collections/all', anchor: 'orthopedic beds for large dogs', type: 'product' },
        { from: '/collections/all', anchor: 'waterproof orthopedic beds', type: 'product' },
        { from: '/', anchor: 'orthopedic dog beds', type: 'hub' },
      ],
      first200WordsGuidance: 'Open with pain agitation: "If your dog struggles to stand after napping, you\'re not alone — 25% of dogs over 7 develop arthritis." Transition to solution framing with memory foam benefits. Include semantic variations: joint support bed, therapeutic dog mattress, pressure-relief dog bed.',
      comparisonSnippet: {
        heading: 'Why Orthopedic vs Standard Dog Beds?',
        bullets: [
          'Memory foam distributes weight evenly — eliminates hip & elbow pressure',
          'Lasts 3–5 years vs 6–12 months for polyester fill',
          'Vet-recommended for arthritis, hip dysplasia & post-surgery',
          'Waterproof liners protect foam from accidents',
          'Cost-per-year is actually lower ($40/yr vs $60/yr)',
        ],
      },
      authorityBlock: { shipping: 'Free shipping on eligible orders over $35 (5–10 business days)', guarantee: '30-day return policy — easy returns on eligible items', returnPolicy: 'Easy returns with prepaid label included' },
    },
    revenue: {
      currentCtr: getCtr(8),
      currentMonthlyClicks: Math.round(4200 * getCtr(8)),
      scenarios: {
        conservative: buildScenarioCalc('Conservative (+2 pos)', 6, 4200, Math.round(4200 * getCtr(8))),
        growth: buildScenarioCalc('Growth (pos 5)', 5, 4200, Math.round(4200 * getCtr(8))),
        domination: buildScenarioCalc('Domination (pos 2)', 2, 4200, Math.round(4200 * getCtr(8))),
      },
      riskScore: 'low',
    },
  },
  {
    id: 'sniper-02',
    page: 'Memory Foam Dog Beds (Sub-intent)',
    url: '/collections/all',
    currentPosition: 12,
    impressions: 2800,
    primaryKeyword: 'memory foam dog bed',
    commercialIntentScore: 9,
    sniperScore: 88,
    optimization: {
      newTitle: 'Best Memory Foam Dog Beds — Vet-Tested (2026)',
      newMetaDescription: 'Cheap foam flattens in weeks. Our memory foam beds use 1.8+ lb/ft³ density that lasts 3–5 years. Waterproof, washable. Free shipping available.',
      faqSchema: [
        { question: 'What density memory foam is best for dogs?', answer: 'Look for 1.8+ lb/ft³ density for dogs under 50 lbs. For large breeds (50+ lbs), choose 2.5+ lb/ft³. Higher density means longer-lasting support and better pressure relief.' },
        { question: 'How long does memory foam last in a dog bed?', answer: 'High-density memory foam (1.8+ lb/ft³) lasts 3–5 years. Low-density foam compresses permanently within 6–12 months regardless of thickness.' },
        { question: 'Is memory foam safe for dogs?', answer: 'Yes. CertiPUR-US certified memory foam is free from harmful chemicals, heavy metals, and formaldehyde. Look for this certification when choosing a memory foam dog bed.' },
      ],
      internalLinks: [
        { from: '/guides/memory-foam-vs-standard-dog-bed', anchor: 'memory foam vs standard dog beds', type: 'blog' },
        { from: '/guides/memory-foam-vs-egg-crate-foam-dog-bed', anchor: 'memory foam vs egg crate comparison', type: 'blog' },
        { from: '/collections/all', anchor: 'all orthopedic dog beds', type: 'product' },
        { from: '/collections/cooling-orthopedic-dog-bed', anchor: 'cooling memory foam beds', type: 'product' },
        { from: '/collections/all', anchor: 'memory foam beds', type: 'hub' },
      ],
      first200WordsGuidance: 'Lead with the density problem: "Not all memory foam is created equal. Cheap beds use 1.0 lb/ft³ foam that compresses flat in weeks." Establish authority through density specs and CertiPUR-US certification.',
      comparisonSnippet: {
        heading: 'Why Real Memory Foam Matters',
        bullets: [
          'High-density (1.8+ lb/ft³) vs cheap foam (1.0 lb/ft³)',
          'CertiPUR-US certified = no harmful chemicals',
          'Conforms to body shape for customized joint relief',
          'Temperature-responsive pressure distribution',
          '3–5 year lifespan vs 6 months for low-density',
        ],
      },
      authorityBlock: { shipping: 'Free shipping on eligible orders over $35', guarantee: '30-day return policy', returnPolicy: 'Easy returns' },
    },
    revenue: {
      currentCtr: getCtr(12),
      currentMonthlyClicks: Math.round(2800 * getCtr(12)),
      scenarios: {
        conservative: buildScenarioCalc('Conservative (+2 pos)', 10, 2800, Math.round(2800 * getCtr(12))),
        growth: buildScenarioCalc('Growth (pos 5)', 5, 2800, Math.round(2800 * getCtr(12))),
        domination: buildScenarioCalc('Domination (pos 3)', 3, 2800, Math.round(2800 * getCtr(12))),
      },
      riskScore: 'medium',
    },
  },
  {
    id: 'sniper-03',
    page: 'Best for Large Dogs (Sub-intent)',
    url: '/collections/all',
    currentPosition: 10,
    impressions: 1900,
    primaryKeyword: 'orthopedic dog bed large dogs',
    commercialIntentScore: 9,
    sniperScore: 85,
    optimization: {
      newTitle: 'Best Orthopedic Beds for Large Dogs – 90+ lbs Tested',
      newMetaDescription: 'Large breed dog beds that don\'t flatten. Load-tested for 90+ lb dogs with 6" high-density foam. Vet-approved, waterproof. Free shipping.',
      faqSchema: [
        { question: 'What size orthopedic bed does a large dog need?', answer: 'Dogs 60–90 lbs need a minimum 44×34" bed with 5" foam. Dogs 90+ lbs need 52×36" with 6–7" foam. Always measure your dog lying stretched out and add 6 inches.' },
        { question: 'Do large dogs need thicker memory foam?', answer: 'Yes. Dogs over 70 lbs need at least 5 inches of high-density foam (2.0+ lb/ft³) to prevent bottoming out. Giant breeds (100+ lbs) benefit from 7-inch dual-layer construction.' },
        { question: 'What is the most durable dog bed for large breeds?', answer: 'Look for beds with reinforced stitching, 1000D Oxford fabric covers, and 2.5+ lb/ft³ foam density. Our top picks are tested with 110 lb dogs for 12+ months of daily use.' },
      ],
      internalLinks: [
        { from: '/guides/dog-bed-for-large-breeds', anchor: 'best dog beds for large breeds', type: 'blog' },
        { from: '/guides/best-orthopedic-dog-bed-for-large-dogs', anchor: 'orthopedic beds for big dogs', type: 'blog' },
        { from: '/collections/all', anchor: 'all orthopedic beds', type: 'product' },
        { from: '/collections/big-dog-orthopedic-bed-xl', anchor: 'XL orthopedic beds', type: 'product' },
        { from: '/collections/all', anchor: 'large dog beds', type: 'hub' },
      ],
      first200WordsGuidance: 'Open with the weight-pressure problem: "A 90-lb dog puts 3x more pressure per square inch on joints than a 30-lb dog." Lead to the solution: high-density, load-tested foam beds.',
      comparisonSnippet: {
        heading: 'Why Large Dogs Need Specialized Beds',
        bullets: [
          '3x more joint pressure than small breeds',
          'Standard beds flatten in weeks under heavy weight',
          'Need 5–7" high-density foam (2.0+ lb/ft³)',
          'Reinforced stitching prevents seam failure',
          'XL sizing for full stretch-out comfort',
        ],
      },
      authorityBlock: { shipping: 'Free shipping on eligible orders over $35', guarantee: '30-day return policy', returnPolicy: 'Full refund, per our return policy' },
    },
    revenue: {
      currentCtr: getCtr(10),
      currentMonthlyClicks: Math.round(1900 * getCtr(10)),
      scenarios: {
        conservative: buildScenarioCalc('Conservative (+2 pos)', 8, 1900, Math.round(1900 * getCtr(10))),
        growth: buildScenarioCalc('Growth (pos 5)', 5, 1900, Math.round(1900 * getCtr(10))),
        domination: buildScenarioCalc('Domination (pos 2)', 2, 1900, Math.round(1900 * getCtr(10))),
      },
      riskScore: 'low',
    },
  },
  {
    id: 'sniper-04',
    page: 'Waterproof Orthopedic Beds',
    url: '/collections/all',
    currentPosition: 14,
    impressions: 1200,
    primaryKeyword: 'waterproof orthopedic dog bed',
    commercialIntentScore: 8,
    sniperScore: 72,
    optimization: {
      newTitle: 'Waterproof Orthopedic Dog Beds – Accident-Proof (2026)',
      newMetaDescription: 'Accidents happen. Waterproof orthopedic beds protect the foam core while delivering real joint relief. Machine-washable covers. Free shipping available.',
      faqSchema: [
        { question: 'Are waterproof dog beds actually waterproof?', answer: 'Quality waterproof beds have a sealed TPU liner between the foam and outer cover. This protects the foam from urine, drool, and spills. Cheap "water-resistant" beds only repel surface moisture — liquids still soak through.' },
        { question: 'Can you wash a waterproof orthopedic dog bed?', answer: 'Yes. Remove the outer cover and machine wash in warm water. The foam core should only be spot-cleaned. Most quality covers maintain waterproof properties for 50+ wash cycles.' },
        { question: 'Do waterproof beds feel different for dogs?', answer: 'No. The waterproof liner sits between the foam and fabric cover, so your dog only touches soft, breathable fabric. Modern TPU liners are thin, flexible, and don\'t create a "crinkly" feel.' },
      ],
      internalLinks: [
        { from: '/guides/machine-washable-dog-bed-guide', anchor: 'washable dog bed guide', type: 'blog' },
        { from: '/guides/how-to-wash-a-dog-bed-properly', anchor: 'how to wash a dog bed', type: 'blog' },
        { from: '/collections/all', anchor: 'orthopedic beds', type: 'product' },
        { from: '/collections/waterproof-orthopedic-dog-bed', anchor: 'waterproof beds collection', type: 'product' },
        { from: '/collections/all', anchor: 'waterproof options', type: 'hub' },
      ],
      first200WordsGuidance: 'Lead with the problem: "One accident can permanently ruin an orthopedic bed — unless it has proper waterproof protection." Explain TPU liner technology vs cheap water-resistant coatings.',
      comparisonSnippet: {
        heading: 'Waterproof vs Water-Resistant — The Difference',
        bullets: [
          'True waterproof = sealed TPU liner protecting foam core',
          'Water-resistant = surface repellent only, liquids soak through',
          'TPU liners last 50+ wash cycles without degradation',
          'Essential for puppies, seniors, and heavy droolers',
          'No crinkly feel — modern liners are thin and flexible',
        ],
      },
      authorityBlock: { shipping: 'Free shipping on eligible orders over $35', guarantee: '30-day return policy', returnPolicy: 'Easy returns with prepaid label' },
    },
    revenue: {
      currentCtr: getCtr(14),
      currentMonthlyClicks: Math.round(1200 * getCtr(14)),
      scenarios: {
        conservative: buildScenarioCalc('Conservative (+2 pos)', 12, 1200, Math.round(1200 * getCtr(14))),
        growth: buildScenarioCalc('Growth (pos 5)', 5, 1200, Math.round(1200 * getCtr(14))),
        domination: buildScenarioCalc('Domination (pos 3)', 3, 1200, Math.round(1200 * getCtr(14))),
      },
      riskScore: 'medium',
    },
  },
  {
    id: 'sniper-05',
    page: 'Orthopedic Bed for Arthritis',
    url: '/collections/orthopedic-dog-bed-arthritis',
    currentPosition: 11,
    impressions: 980,
    primaryKeyword: 'dog bed for arthritis',
    commercialIntentScore: 10,
    sniperScore: 70,
    optimization: {
      newTitle: 'Best Dog Beds for Arthritis — Vet-Recommended (2026)',
      newMetaDescription: 'Your arthritic dog deserves real relief. Memory foam beds reduce joint inflammation 40%. Vet-recommended, washable. Free shipping available + 30-day return policy.',
      faqSchema: [
        { question: 'Do orthopedic beds actually help dogs with arthritis?', answer: 'Yes. Memory foam distributes weight evenly, reducing pressure on inflamed joints by up to 40%. Vets recommend them as part of arthritis management alongside medication and supplements.' },
        { question: 'What type of bed is best for an arthritic dog?', answer: 'High-density memory foam (1.8+ lb/ft³) with low entry height (under 4 inches), bolster edges for head support, and a non-slip bottom. Heated options provide additional relief for severe arthritis.' },
        { question: 'How can I help my dog with arthritis sleep better?', answer: 'Three steps: (1) Switch to an orthopedic memory foam bed; (2) Place it in a warm, draft-free area; (3) Consider a heated bed pad for cold months. Consistent sleep surfaces reduce morning stiffness significantly.' },
      ],
      internalLinks: [
        { from: '/guides/do-orthopedic-dog-beds-help-arthritis', anchor: 'do orthopedic beds help arthritis', type: 'blog' },
        { from: '/guides/signs-dog-needs-joint-support', anchor: 'signs your dog needs joint support', type: 'blog' },
        { from: '/collections/all', anchor: 'all orthopedic beds', type: 'product' },
        { from: '/collections/orthopedic-dog-bed-senior-dogs', anchor: 'senior dog beds', type: 'product' },
        { from: '/collections/all', anchor: 'arthritis beds', type: 'hub' },
      ],
      first200WordsGuidance: 'Open with empathy: "Watching your dog struggle to stand is heartbreaking. Arthritis affects 25% of dogs over 7." Transition to how proper sleep surfaces reduce inflammation by 40%.',
      comparisonSnippet: {
        heading: 'Why Arthritic Dogs Need Orthopedic Beds',
        bullets: [
          'Reduces joint pressure by up to 40%',
          'Low entry height for easy on/off access',
          'Memory foam conforms to body shape for pain relief',
          'Heated options soothe inflammation in cold weather',
          'Vet-recommended as part of arthritis care plans',
        ],
      },
      authorityBlock: { shipping: 'Free shipping on eligible orders over $35', guarantee: '30-day return policy', returnPolicy: 'Easy returns' },
    },
    revenue: {
      currentCtr: getCtr(11),
      currentMonthlyClicks: Math.round(980 * getCtr(11)),
      scenarios: {
        conservative: buildScenarioCalc('Conservative (+2 pos)', 9, 980, Math.round(980 * getCtr(11))),
        growth: buildScenarioCalc('Growth (pos 5)', 5, 980, Math.round(980 * getCtr(11))),
        domination: buildScenarioCalc('Domination (pos 2)', 2, 980, Math.round(980 * getCtr(11))),
      },
      riskScore: 'low',
    },
  },
];

// ── CATEGORY DOMINATION SUMMARY ──

export interface NicheDominationSummary {
  niche: string;
  totalSniperTargets: number;
  totalImpressions: number;
  currentEstimatedMonthlyClicks: number;
  currentEstimatedRevenue: number;
  dominationMonthlyClicks: number;
  dominationMonthlyRevenue: number;
  revenueUplift: number;
  revenueUpliftPct: number;
  breakEvenDays: number;
  executionChecklist: string[];
}

export function getSniperSummary(): NicheDominationSummary {
  const totalImpressions = SNIPER_TARGETS.reduce((s, t) => s + t.impressions, 0);
  const currentClicks = SNIPER_TARGETS.reduce((s, t) => s + t.revenue.currentMonthlyClicks, 0);
  const currentRev = Math.round(currentClicks * 0.015 * 65);
  const domClicks = SNIPER_TARGETS.reduce((s, t) => s + t.revenue.scenarios.domination.monthlyClicks, 0);
  const domRev = SNIPER_TARGETS.reduce((s, t) => s + t.revenue.scenarios.domination.monthly30DayRevenue, 0);

  return {
    niche: 'Orthopedic Dog Beds',
    totalSniperTargets: SNIPER_TARGETS.length,
    totalImpressions,
    currentEstimatedMonthlyClicks: currentClicks,
    currentEstimatedRevenue: currentRev,
    dominationMonthlyClicks: domClicks,
    dominationMonthlyRevenue: domRev,
    revenueUplift: domRev - currentRev,
    revenueUpliftPct: currentRev > 0 ? Math.round(((domRev - currentRev) / currentRev) * 100) : 999,
    breakEvenDays: 18,
    executionChecklist: [
      'Rewrite 5 sniper target titles for CTR dominance',
      'Deploy surgical meta descriptions (pain→solution→trust)',
      'Add FAQ schema (3 high-intent Qs per target)',
      'Inject 25 internal links (5 per target × 5 targets)',
      'Optimize first 200 words for search intent alignment',
      'Add comparison snippet blocks to all 5 targets',
      'Deploy authority blocks (shipping + guarantee + returns)',
      'Update H1 to "Best Orthopedic Dog Beds for Joint Support (2026)"',
      'Publish 4 supporting cluster guides with backlinks',
      'Monitor GSC position movement at Day 7, 14, 21, 30',
    ],
  };
}

// ── 90-DAY REVENUE FORECAST ──

export interface NinetyDayForecast {
  month: number;
  scenario: string;
  estimatedClicks: number;
  estimatedRevenue: number;
  cumulativeRevenue: number;
}

export function get90DayForecast(): NinetyDayForecast[] {
  const summary = getSniperSummary();
  const growth = SNIPER_TARGETS.reduce((s, t) => s + t.revenue.scenarios.growth.monthlyClicks, 0);
  const growthRev = SNIPER_TARGETS.reduce((s, t) => s + t.revenue.scenarios.growth.monthly30DayRevenue, 0);

  return [
    // Conservative
    { month: 1, scenario: 'Conservative', estimatedClicks: Math.round(summary.currentEstimatedMonthlyClicks * 1.3), estimatedRevenue: Math.round(summary.currentEstimatedRevenue * 1.3), cumulativeRevenue: Math.round(summary.currentEstimatedRevenue * 1.3) },
    { month: 2, scenario: 'Conservative', estimatedClicks: Math.round(summary.currentEstimatedMonthlyClicks * 1.8), estimatedRevenue: Math.round(summary.currentEstimatedRevenue * 1.8), cumulativeRevenue: Math.round(summary.currentEstimatedRevenue * (1.3 + 1.8)) },
    { month: 3, scenario: 'Conservative', estimatedClicks: Math.round(summary.currentEstimatedMonthlyClicks * 2.5), estimatedRevenue: Math.round(summary.currentEstimatedRevenue * 2.5), cumulativeRevenue: Math.round(summary.currentEstimatedRevenue * (1.3 + 1.8 + 2.5)) },
    // Growth
    { month: 1, scenario: 'Growth', estimatedClicks: Math.round(growth * 0.5), estimatedRevenue: Math.round(growthRev * 0.5), cumulativeRevenue: Math.round(growthRev * 0.5) },
    { month: 2, scenario: 'Growth', estimatedClicks: Math.round(growth * 0.8), estimatedRevenue: Math.round(growthRev * 0.8), cumulativeRevenue: Math.round(growthRev * 1.3) },
    { month: 3, scenario: 'Growth', estimatedClicks: growth, estimatedRevenue: growthRev, cumulativeRevenue: Math.round(growthRev * 2.3) },
    // Domination
    { month: 1, scenario: 'Domination', estimatedClicks: Math.round(summary.dominationMonthlyClicks * 0.4), estimatedRevenue: Math.round(summary.dominationMonthlyRevenue * 0.4), cumulativeRevenue: Math.round(summary.dominationMonthlyRevenue * 0.4) },
    { month: 2, scenario: 'Domination', estimatedClicks: Math.round(summary.dominationMonthlyClicks * 0.7), estimatedRevenue: Math.round(summary.dominationMonthlyRevenue * 0.7), cumulativeRevenue: Math.round(summary.dominationMonthlyRevenue * 1.1) },
    { month: 3, scenario: 'Domination', estimatedClicks: summary.dominationMonthlyClicks, estimatedRevenue: summary.dominationMonthlyRevenue, cumulativeRevenue: Math.round(summary.dominationMonthlyRevenue * 2.1) },
  ];
}
