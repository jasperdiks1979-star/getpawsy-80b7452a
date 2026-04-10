/**
 * Unified Growth Engine — Sniper + Lockdown + Velocity
 * 
 * Combines revenue-first targeting, niche domination blueprints,
 * velocity-based scaling, and cannibalization guard into one engine.
 */

// ── CTR MODEL ──
const CTR: Record<number, number> = {
  1: 0.318, 2: 0.243, 3: 0.187, 4: 0.133, 5: 0.095,
  6: 0.068, 7: 0.051, 8: 0.039, 9: 0.030, 10: 0.024,
  11: 0.019, 12: 0.016, 13: 0.013, 14: 0.011, 15: 0.009,
  20: 0.005, 25: 0.003, 30: 0.002,
};

function ctr(pos: number): number {
  const p = Math.round(pos);
  if (CTR[p]) return CTR[p];
  const keys = Object.keys(CTR).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (p >= keys[i] && p <= keys[i + 1]) {
      const r = (p - keys[i]) / (keys[i + 1] - keys[i]);
      return CTR[keys[i]] * (1 - r) + CTR[keys[i + 1]] * r;
    }
  }
  return 0.001;
}

// ── TYPES ──

export interface SniperTarget {
  rank: number;
  url: string;
  primaryQuery: string;
  impressions: number;
  clicks: number;
  position: number;
  aov: number;
  sniperScore: number;
  optimizedTitle: string;
  optimizedMeta: string;
  faqQuestions: string[];
  internalLinkSources: string[];
  revenue30d: number;
  revenue90d: number;
}

export interface LockdownNiche {
  niche: string;
  hubUrl: string;
  dominanceScore: number;
  clusterArticles: { title: string; type: string; wordCount: number; linksToHub: number }[];
  internalLinkMap: { source: string; target: string; anchorType: string }[];
  schemas: string[];
  revenue90d: { conservative: number; growth: number; domination: number };
}

export interface VelocityPage {
  url: string;
  query: string;
  clickGrowthPct: number;
  impressionGrowthPct: number;
  positionDelta: number;
  velocityScore: number;
  action: 'double_links' | 'add_articles' | 'boost_homepage' | 'reduce_priority' | 'reallocate';
  revenuePerMonth: number;
}

export interface CannibalizationAlert {
  query: string;
  pages: { url: string; position: number; impressions: number }[];
  severity: 'critical' | 'high' | 'medium';
  resolution: string;
}

export interface UnifiedEngineState {
  sniperTargets: SniperTarget[];
  lockdownNiche: LockdownNiche;
  velocityLeaders: VelocityPage[];
  cannibalizationAlerts: CannibalizationAlert[];
  forecast: { month: number; revenue: { conservative: number; growth: number; domination: number }; cumulativeRevenue: { conservative: number; growth: number; domination: number } }[];
  executionOrder: { phase: string; priority: number; expectedLift: string; timeframe: string }[];
  summary: { totalSniperRevenue90d: number; lockdownRevenue90d: number; velocityBoost: string; cannibalizationFixed: number; marketShareTarget: string };
}

// ── COMMERCIAL MODIFIERS ──
const COMMERCIAL = ['best', 'buy', 'top rated', 'for large dogs', 'orthopedic', 'cheap', 'waterproof', 'heavy duty', 'crash tested', 'for senior', 'for small dogs', 'indestructible', 'cooling', 'calming'];

function commercialWeight(query: string): number {
  const q = query.toLowerCase();
  const matches = COMMERCIAL.filter(m => q.includes(m)).length;
  return 1.0 + matches * 0.25;
}

function project(impressions: number, currentPos: number, targetPos: number, aov: number) {
  const clicks = Math.round(impressions * ctr(targetPos));
  const conversions = clicks * 0.025;
  const rev = Math.round(conversions * aov);
  return { clicks, rev };
}

// ── SNIPER TARGETS ──

const SNIPER_SEED: Array<{
  url: string; query: string; impressions: number; clicks: number;
  position: number; aov: number; title: string; meta: string;
  faqs: string[]; linkSources: string[];
}> = [
  {
    url: '/collections/all', query: 'best orthopedic dog bed 2026',
    impressions: 4200, clicks: 126, position: 8.2, aov: 65,
    title: '7 Best Orthopedic Dog Beds — Vet-Backed Picks (2026)',
    meta: 'Joint pain keeps your dog up at night. These orthopedic beds use medical-grade foam to relieve pressure. Free shipping on eligible orders + 30-day return policy.',
    faqs: ['What makes a dog bed truly orthopedic?', 'How thick should orthopedic foam be?', 'Are orthopedic beds worth it for young dogs?'],
    linkSources: ['/guides/how-to-choose-orthopedic-dog-bed', '/guides/signs-your-dog-has-joint-pain', '/collections/dog-beds', '/blog/senior-dog-care', '/'],
  },
  {
    url: '/collections/all', query: 'cat tree for large cats',
    impressions: 3800, clicks: 68, position: 11.5, aov: 89,
    title: '9 Best Cat Trees for Large Cats — Stability Tested (2026)',
    meta: 'Wobbly cat trees topple under 15+ lb cats. Our picks are load-tested to 50 lbs with solid wood posts. Ships free in 3-5 days.',
    faqs: ['How tall should a cat tree be for a Maine Coon?', 'What weight capacity do large cat trees need?', 'How to stabilize a cat tree?'],
    linkSources: ['/guides/how-tall-should-cat-tree-be', '/guides/cat-tree-stability-guide', '/collections/cat-trees', '/blog/maine-coon-essentials', '/'],
  },
  {
    url: '/collections/all', query: 'crash tested dog car seat',
    impressions: 2900, clicks: 41, position: 14.3, aov: 52,
    title: '5 Crash-Tested Dog Car Seats — Safety Ratings Inside (2026)',
    meta: 'Unrestrained dogs are 2x more likely to be injured in accidents. These seats passed 30mph crash tests. Real safety data inside.',
    faqs: ['Are dog car seats legally required?', 'What crash test standards should a dog seat pass?', 'Booster seat vs hammock — which is safer?'],
    linkSources: ['/guides/crash-tested-dog-car-seat-guide', '/guides/dog-travel-safety-laws-by-state', '/collections/dog-travel', '/blog/road-trip-with-dogs', '/'],
  },
  {
    url: '/collections/elevated-dog-beds', query: 'elevated dog bed outdoor',
    impressions: 1800, clicks: 27, position: 12.8, aov: 48,
    title: 'Best Elevated Dog Beds for Outdoor Use (2026)',
    meta: 'Keep your dog cool and off hot ground with raised cot-style beds. Chew-resistant mesh, rust-proof frames. Free shipping over $35.',
    faqs: ['Are elevated beds good for dogs with arthritis?', 'What size raised bed for a Labrador?', 'Can elevated dog beds be used outside?'],
    linkSources: ['/collections/dog-beds', '/blog/summer-pet-care', '/guides/best-dog-beds-large-breeds-2026', '/collections/all', '/'],
  },
  {
    url: '/collections/calming-dog-beds', query: 'calming dog bed anxiety',
    impressions: 3100, clicks: 47, position: 13.1, aov: 42,
    title: '6 Best Calming Dog Beds for Anxious Dogs (2026)',
    meta: 'Anxiety affects 70% of dogs. These donut-style beds mimic den security with raised rims and ultra-soft faux fur. 30-day return policy.',
    faqs: ['Do calming beds actually work for anxious dogs?', 'What shape bed is best for anxious dogs?', 'Should I get a calming bed or a weighted blanket?'],
    linkSources: ['/blog/dog-anxiety-tips', '/collections/dog-beds', '/collections/all', '/guides/signs-your-dog-has-joint-pain', '/'],
  },
  {
    url: '/collections/waterproof-dog-beds', query: 'waterproof dog bed large',
    impressions: 1600, clicks: 26, position: 10.4, aov: 55,
    title: 'Waterproof Dog Beds — Leak-Proof Protection (2026)',
    meta: 'Accidents happen. These beds have sealed liners that block 100% of moisture. Machine-washable covers. Sizes up to XXL.',
    faqs: ['What makes a dog bed truly waterproof?', 'Are waterproof beds comfortable?', 'How to clean a waterproof dog bed?'],
    linkSources: ['/collections/all', '/collections/dog-beds', '/blog/puppy-house-training', '/guides/memory-foam-vs-regular-dog-bed', '/'],
  },
  {
    url: '/collections/cat-scratching-posts', query: 'best cat scratching post tall',
    impressions: 2100, clicks: 34, position: 15.2, aov: 35,
    title: 'Best Tall Cat Scratching Posts — Full Stretch Design (2026)',
    meta: 'Short posts frustrate cats. Our tall sisal posts let cats fully stretch and scratch — saving your furniture. Estimated delivery: 5–10 business days.',
    faqs: ['How tall should a cat scratching post be?', 'Sisal vs carpet: which lasts longer?', 'Do cats prefer vertical or horizontal scratching?'],
    linkSources: ['/collections/all', '/guides/sisal-vs-carpet-scratching-posts', '/collections/cat-toys', '/blog/cat-enrichment-guide', '/'],
  },
  {
    url: '/collections/dog-travel-accessories', query: 'dog travel essentials road trip',
    impressions: 950, clicks: 10, position: 19.7, aov: 38,
    title: 'Dog Travel Essentials — Road Trip Checklist (2026)',
    meta: 'Don\'t forget the basics. This travel kit covers safety, comfort, and hydration for your dog on the road. Curated by pet travel experts.',
    faqs: ['What do I need for a road trip with my dog?', 'How often should dogs stop on road trips?', 'Best portable water bowl for travel?'],
    linkSources: ['/collections/all', '/guides/dog-travel-safety-laws-by-state', '/blog/road-trip-with-dogs', '/collections/dog-bowls', '/'],
  },
  {
    url: '/collections/automatic-pet-feeders', query: 'automatic pet feeder cat',
    impressions: 1350, clicks: 19, position: 16.9, aov: 62,
    title: 'Best Automatic Pet Feeders for Cats — Portion Control (2026)',
    meta: 'Overfeeding causes 60% of cat health issues. These timed feeders dispense exact portions. WiFi-enabled with app control.',
    faqs: ['Are automatic feeders good for cats?', 'Can automatic feeders handle wet food?', 'How to prevent cats from breaking into feeders?'],
    linkSources: ['/collections/cat-bowls', '/blog/cat-nutrition-guide', '/collections/all', '/', '/blog/smart-pet-tech'],
  },
  {
    url: '/collections/indestructible-dog-toys', query: 'indestructible dog toys aggressive chewers',
    impressions: 2800, clicks: 42, position: 11.6, aov: 25,
    title: 'Truly Indestructible Dog Toys for Heavy Chewers (2026)',
    meta: 'Tired of toys lasting 10 minutes? These are built from solid rubber and reinforced nylon. 30-day return policy on all products.',
    faqs: ['What material is truly indestructible for dog toys?', 'Are hard toys safe for dog teeth?', 'Best toy for a pit bull or German shepherd?'],
    linkSources: ['/collections/dog-toys', '/blog/dog-enrichment-ideas', '/blog/aggressive-chewer-guide', '/', '/collections/dog-beds'],
  },
  {
    url: '/collections/pet-grooming-vacuum', query: 'pet grooming vacuum kit',
    impressions: 1100, clicks: 15, position: 17.3, aov: 72,
    title: 'Best Pet Grooming Vacuums — No-Mess Home Grooming (2026)',
    meta: 'Professional grooming at home without the fur mess. These all-in-one kits vacuum as they trim. Quiet motors for nervous pets.',
    faqs: ['Do grooming vacuums scare pets?', 'Can grooming vacuums handle long fur?', 'How loud are pet grooming vacuums?'],
    linkSources: ['/collections/pet-grooming', '/blog/home-grooming-tips', '/', '/blog/pet-care-essentials', '/collections/cat-grooming'],
  },
  {
    url: '/collections/dog-crates', query: 'heavy duty dog crate xxl',
    impressions: 2400, clicks: 31, position: 14.8, aov: 95,
    title: 'Heavy Duty XXL Dog Crates — Escape-Proof (2026)',
    meta: 'Built for powerful breeds. 20-gauge steel, reinforced latches, and a chew-proof tray. Fits Great Danes and Mastiffs. Free delivery.',
    faqs: ['What size crate for a Great Dane?', 'Are heavy duty crates airline approved?', 'How to crate train an adult dog?'],
    linkSources: ['/collections/dog-beds', '/blog/crate-training-guide', '/collections/all', '/', '/blog/large-breed-care'],
  },
  {
    url: '/collections/cat-condos', query: 'best cat condo multi level',
    impressions: 1700, clicks: 22, position: 13.4, aov: 115,
    title: 'Best Multi-Level Cat Condos for Indoor Cats (2026)',
    meta: 'Indoor cats need vertical territory. These multi-level condos offer hiding spots, sisal posts, and hammocks. Fits 2-3 cats.',
    faqs: ['How many levels should a cat condo have?', 'Can multiple cats share one condo?', 'What material is most durable for cat condos?'],
    linkSources: ['/collections/all', '/guides/cat-tree-stability-guide', '/collections/cat-toys', '/', '/blog/indoor-cat-enrichment'],
  },
  {
    url: '/collections/dog-cooling-mats', query: 'dog cooling mat summer',
    impressions: 1950, clicks: 25, position: 15.6, aov: 32,
    title: 'Best Dog Cooling Mats — No Electricity Needed (2026)',
    meta: 'Heatstroke kills. These pressure-activated gel mats cool for 3+ hours with no power or water. Safe for all breeds.',
    faqs: ['How do pressure-activated cooling mats work?', 'Are cooling mats safe for puppies?', 'How long do cooling mats stay cold?'],
    linkSources: ['/collections/dog-beds', '/blog/summer-pet-safety', '/collections/all', '/', '/collections/elevated-dog-beds'],
  },
  {
    url: '/collections/slow-feeder-bowls', query: 'slow feeder bowl for dogs',
    impressions: 1450, clicks: 18, position: 16.1, aov: 22,
    title: 'Best Slow Feeder Dog Bowls — Prevent Bloat (2026)',
    meta: 'Fast eating causes bloat — a life-threatening condition. These maze bowls slow eating by 10x. Dishwasher safe. BPA-free.',
    faqs: ['Do slow feeder bowls actually prevent bloat?', 'What pattern works best for slow feeders?', 'Are slow feeders frustrating for dogs?'],
    linkSources: ['/collections/dog-bowls', '/blog/dog-nutrition-basics', '/', '/blog/bloat-prevention', '/collections/dog-beds'],
  },
];

function buildSniperTargets(): SniperTarget[] {
  return SNIPER_SEED.map((s, i) => {
    const cw = commercialWeight(s.query);
    const competitiveDensity = s.position < 10 ? 8 : s.position < 15 ? 5 : 3;
    const upliftPotential = ctr(3) - ctr(s.position);
    const sniperScore = Math.min(100, Math.round(
      (s.impressions * cw * (s.aov / 40) * (upliftPotential * 100)) / competitiveDensity / 10
    ));
    const r3 = project(s.impressions, s.position, 3, s.aov);
    return {
      rank: i + 1,
      url: s.url,
      primaryQuery: s.query,
      impressions: s.impressions,
      clicks: s.clicks,
      position: s.position,
      aov: s.aov,
      sniperScore,
      optimizedTitle: s.title,
      optimizedMeta: s.meta,
      faqQuestions: s.faqs,
      internalLinkSources: s.linkSources,
      revenue30d: r3.rev,
      revenue90d: r3.rev * 3,
    };
  }).sort((a, b) => b.sniperScore - a.sniperScore).map((t, i) => ({ ...t, rank: i + 1 }));
}

// ── LOCKDOWN NICHE ──

function buildLockdownNiche(): LockdownNiche {
  return {
    niche: 'Orthopedic Dog Beds',
    hubUrl: '/collections/all',
    dominanceScore: 78,
    clusterArticles: [
      { title: 'How to Choose the Right Orthopedic Dog Bed', type: 'Buying Guide', wordCount: 1800, linksToHub: 3 },
      { title: 'Memory Foam vs Egg-Crate Foam Dog Beds', type: 'Comparison', wordCount: 1400, linksToHub: 3 },
      { title: 'Signs Your Dog Has Joint Pain (Premium Quality)', type: 'Problem-Solution', wordCount: 1600, linksToHub: 2 },
      { title: 'Best Dog Beds for Large Breeds Over 80 lbs', type: 'Use-Case Guide', wordCount: 1500, linksToHub: 3 },
      { title: 'Orthopedic Dog Bed FAQ — 15 Questions Answered', type: 'FAQ Mega Guide', wordCount: 2200, linksToHub: 4 },
      { title: 'Orthopedic vs Regular Dog Beds: Worth the Price?', type: 'Comparison', wordCount: 1300, linksToHub: 2 },
      { title: 'Best Dog Beds for Arthritis and Hip Dysplasia', type: 'Problem-Solution', wordCount: 1700, linksToHub: 3 },
    ],
    internalLinkMap: [
      { source: '/', target: '/collections/all', anchorType: 'exact' },
      { source: '/collections/dog-beds', target: '/collections/all', anchorType: 'partial' },
      { source: '/guides/how-to-choose-orthopedic-dog-bed', target: '/collections/all', anchorType: 'exact' },
      { source: '/guides/signs-your-dog-has-joint-pain', target: '/collections/all', anchorType: 'natural' },
      { source: '/guides/memory-foam-vs-regular-dog-bed', target: '/collections/all', anchorType: 'partial' },
      { source: '/blog/senior-dog-care', target: '/collections/all', anchorType: 'natural' },
      { source: '/blog/large-breed-essentials', target: '/collections/all', anchorType: 'partial' },
      { source: '/collections/all', target: '/products/memory-foam-bed-xl', anchorType: 'product' },
      { source: '/collections/all', target: '/products/cooling-orthopedic-bed', anchorType: 'product' },
      { source: '/collections/all', target: '/products/waterproof-orthopedic-bed', anchorType: 'product' },
    ],
    schemas: ['FAQPage', 'Product', 'BreadcrumbList', 'Article', 'ItemList'],
    revenue90d: { conservative: 2850, growth: 5400, domination: 9200 },
  };
}

// ── VELOCITY PAGES ──

function buildVelocityLeaders(): VelocityPage[] {
  const pages: VelocityPage[] = [
    { url: '/collections/all', query: 'orthopedic dog bed', clickGrowthPct: 38, impressionGrowthPct: 22, positionDelta: -2.1, velocityScore: 92, action: 'double_links', revenuePerMonth: 485 },
    { url: '/collections/all', query: 'cat tree large cats', clickGrowthPct: 31, impressionGrowthPct: 18, positionDelta: -1.8, velocityScore: 84, action: 'double_links', revenuePerMonth: 620 },
    { url: '/collections/calming-dog-beds', query: 'calming dog bed', clickGrowthPct: 27, impressionGrowthPct: 35, positionDelta: -1.4, velocityScore: 76, action: 'add_articles', revenuePerMonth: 195 },
    { url: '/collections/indestructible-dog-toys', query: 'indestructible dog toy', clickGrowthPct: 19, impressionGrowthPct: 14, positionDelta: -0.9, velocityScore: 58, action: 'add_articles', revenuePerMonth: 105 },
    { url: '/collections/all', query: 'dog car seat', clickGrowthPct: 15, impressionGrowthPct: 10, positionDelta: -0.6, velocityScore: 44, action: 'boost_homepage', revenuePerMonth: 165 },
    { url: '/collections/dog-cooling-mats', query: 'dog cooling mat', clickGrowthPct: 4, impressionGrowthPct: 2, positionDelta: 0.3, velocityScore: 12, action: 'reduce_priority', revenuePerMonth: 48 },
    { url: '/collections/slow-feeder-bowls', query: 'slow feeder dog bowl', clickGrowthPct: 2, impressionGrowthPct: -3, positionDelta: 1.1, velocityScore: 5, action: 'reallocate', revenuePerMonth: 22 },
  ];
  return pages.sort((a, b) => b.velocityScore - a.velocityScore);
}

// ── CANNIBALIZATION ──

function buildCannibalizationAlerts(): CannibalizationAlert[] {
  return [
    {
      query: 'waterproof dog bed',
      pages: [
        { url: '/collections/waterproof-dog-beds', position: 10.4, impressions: 1600 },
        { url: '/collections/all', position: 22.1, impressions: 320 },
      ],
      severity: 'high',
      resolution: 'Canonical → /collections/waterproof-dog-beds. Remove "waterproof" section from orthopedic page or add contextual link instead.',
    },
    {
      query: 'large cat tree',
      pages: [
        { url: '/collections/all', position: 11.5, impressions: 3800 },
        { url: '/collections/cat-condos', position: 28.3, impressions: 410 },
      ],
      severity: 'medium',
      resolution: 'Add canonical to cat-trees page. Rewrite cat-condos intro to differentiate intent (indoor play vs large breed stability).',
    },
  ];
}

// ── FORECAST ──

function buildForecast(): UnifiedEngineState['forecast'] {
  return [1, 2, 3].map(m => {
    const ramp = m === 1 ? 0.4 : m === 2 ? 0.75 : 1.0;
    return {
      month: m,
      revenue: {
        conservative: Math.round(2800 * ramp),
        growth: Math.round(5600 * ramp),
        domination: Math.round(9800 * ramp),
      },
      cumulativeRevenue: {
        conservative: Math.round(2800 * (m === 1 ? 0.4 : m === 2 ? 1.15 : 2.15)),
        growth: Math.round(5600 * (m === 1 ? 0.4 : m === 2 ? 1.15 : 2.15)),
        domination: Math.round(9800 * (m === 1 ? 0.4 : m === 2 ? 1.15 : 2.15)),
      },
    };
  });
}

// ── EXECUTION ORDER ──

function buildExecutionOrder(): UnifiedEngineState['executionOrder'] {
  return [
    { phase: 'Revenue Sniper — Surgical optimization of top 15 URLs', priority: 1, expectedLift: '+35-50% CTR on target pages', timeframe: 'Week 1-2' },
    { phase: 'Niche Lockdown — Orthopedic Dog Beds hub + 7 cluster articles', priority: 2, expectedLift: '+70% SERP coverage for niche', timeframe: 'Week 2-4' },
    { phase: 'Cannibalization Fix — Merge/canonical for 2 conflicts', priority: 3, expectedLift: '+15% authority consolidation', timeframe: 'Week 1' },
    { phase: 'Velocity Scaling — Double links on top 3 velocity pages', priority: 4, expectedLift: '+25% click growth sustained', timeframe: 'Week 3-6' },
    { phase: 'Secondary Lockdowns — Cat Trees + Dog Car Seats hubs', priority: 5, expectedLift: '+45% niche coverage', timeframe: 'Week 5-8' },
    { phase: 'Self-Learning Loop — 14-day recalculation + reallocation', priority: 6, expectedLift: 'Continuous compound growth', timeframe: 'Ongoing (bi-weekly)' },
  ];
}

// ── BUILD FULL STATE ──

export function buildUnifiedEngineState(): UnifiedEngineState {
  const sniperTargets = buildSniperTargets();
  const lockdownNiche = buildLockdownNiche();
  const velocityLeaders = buildVelocityLeaders();
  const cannibalizationAlerts = buildCannibalizationAlerts();
  const forecast = buildForecast();
  const executionOrder = buildExecutionOrder();

  const totalSniperRev = sniperTargets.reduce((s, t) => s + t.revenue90d, 0);

  return {
    sniperTargets,
    lockdownNiche,
    velocityLeaders,
    cannibalizationAlerts,
    forecast,
    executionOrder,
    summary: {
      totalSniperRevenue90d: totalSniperRev,
      lockdownRevenue90d: lockdownNiche.revenue90d.domination,
      velocityBoost: '+31% avg click growth on top 3',
      cannibalizationFixed: cannibalizationAlerts.length,
      marketShareTarget: '70%+ SERP for Orthopedic Dog Beds',
    },
  };
}
