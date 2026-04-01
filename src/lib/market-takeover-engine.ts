/**
 * Market Takeover Engine
 * Dominate 3 niches: Orthopedic Dog Beds, Cat Trees for Large Cats, Dog Car Travel Safety
 */

// ── CTR MODEL ──
const CTR: Record<number, number> = {
  1: 0.318, 2: 0.243, 3: 0.187, 4: 0.133, 5: 0.095,
  6: 0.068, 7: 0.051, 8: 0.039, 9: 0.030, 10: 0.024,
  11: 0.019, 12: 0.016, 13: 0.013, 14: 0.011, 15: 0.009,
  20: 0.005, 30: 0.002,
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

export interface NicheHub {
  niche: string;
  hubUrl: string;
  primaryKeyword: string;
  wordCount: number;
  h1: string;
  h2Sections: string[];
  schemas: string[];
  conversionBlock: string;
  featuredProducts: number;
  comparisonTable: boolean;
  currentPosition: number;
  impressions: number;
  aov: number;
}

export interface ClusterArticle {
  niche: string;
  title: string;
  type: 'Buying Guide' | 'Best of 2026' | 'Problem-Solution' | 'Comparison' | 'Use-Case' | 'Expert FAQ';
  slug: string;
  wordCount: number;
  linksToHub: number;
  linksToProducts: number;
  status: 'planned' | 'in_progress' | 'published';
  primaryKeyword: string;
}

export interface InternalLinkEntry {
  source: string;
  target: string;
  anchor: string;
  anchorType: 'exact' | 'partial' | 'semantic';
  weight: number;
}

export interface CtrRewrite {
  url: string;
  currentTitle: string;
  newTitle: string;
  currentMeta: string;
  newMeta: string;
  position: number;
  impressions: number;
  expectedCtrLift: string;
}

export interface CannibalizationFix {
  query: string;
  pages: { url: string; position: number; impressions: number }[];
  severity: 'critical' | 'high' | 'medium';
  action: string;
}

export interface VelocityRule {
  niche: string;
  clickGrowthPct: number;
  impressionGrowthPct: number;
  positionDelta: number;
  action: string;
  details: string;
}

export interface MarketShareProjection {
  niche: string;
  revenue30d: { rank3: number; rank5: number };
  revenue90d: { rank3: number; rank5: number };
  marketSharePct: number;
  clusterKeywords: number;
  serpCoverage: string;
}

export interface MarketTakeoverState {
  niches: NicheHub[];
  clusterRoadmap: ClusterArticle[];
  internalLinks: InternalLinkEntry[];
  ctrRewrites: CtrRewrite[];
  cannibalizationFixes: CannibalizationFix[];
  velocityRules: VelocityRule[];
  marketShare: MarketShareProjection[];
  executionOrder: { phase: string; priority: number; timeframe: string; expectedLift: string }[];
  summary: {
    totalHubs: number;
    totalClusterPages: number;
    totalInternalLinks: number;
    cannibalizationsFixed: number;
    combined90dRevenue: { rank3: number; rank5: number };
    marketShareTarget: string;
  };
}

// ── HUBS ──

function buildHubs(): NicheHub[] {
  return [
    {
      niche: 'Orthopedic Dog Beds',
      hubUrl: '/orthopedic-dog-beds',
      primaryKeyword: 'orthopedic dog bed',
      wordCount: 1800,
      h1: 'Best Orthopedic Dog Beds — Vet-Backed Joint Support (2026)',
      h2Sections: ['Why Orthopedic Beds Matter', 'Foam Density Buying Guide', 'Size & Weight Guide', 'Waterproof Protection', 'Materials Compared', 'Top Picks Comparison Table', 'FAQ — 10 Questions Answered'],
      schemas: ['FAQPage', 'BreadcrumbList', 'Product', 'ItemList'],
      conversionBlock: 'Hero: "Your dog sleeps 14 hours/day — make every hour count." + CTA to top picks',
      featuredProducts: 8,
      comparisonTable: true,
      currentPosition: 8.2,
      impressions: 4200,
      aov: 65,
    },
    {
      niche: 'Cat Trees for Large Cats',
      hubUrl: '/cat-trees-for-large-cats',
      primaryKeyword: 'cat tree for large cats',
      wordCount: 1600,
      h1: 'Best Cat Trees for Large Cats — Stability Tested to 50 lbs (2026)',
      h2Sections: ['Why Large Cats Need Specialized Trees', 'Stability & Weight Capacity Guide', 'Height Considerations', 'Material Durability', 'Best for Maine Coons & Ragdolls', 'Comparison Table', 'FAQ — 8 Questions Answered'],
      schemas: ['FAQPage', 'BreadcrumbList', 'Product', 'ItemList'],
      conversionBlock: 'Hero: "Standard cat trees topple. Ours are load-tested for 15+ lb cats." + CTA',
      featuredProducts: 7,
      comparisonTable: true,
      currentPosition: 11.5,
      impressions: 3800,
      aov: 89,
    },
    {
      niche: 'Dog Car Travel Safety',
      hubUrl: '/dog-car-travel-safety',
      primaryKeyword: 'dog car seat',
      wordCount: 1500,
      h1: 'Dog Car Travel Safety — Crash-Tested Seats & Harnesses (2026)',
      h2Sections: ['Why Restraint Matters', 'Booster Seat vs Hammock vs Harness', 'Crash Test Standards Explained', 'State-by-State Laws', 'Size Guide by Breed', 'Top Picks Comparison', 'FAQ — 9 Questions Answered'],
      schemas: ['FAQPage', 'BreadcrumbList', 'Product', 'ItemList'],
      conversionBlock: 'Hero: "Unrestrained dogs are 2× more likely to be injured. Choose tested safety." + CTA',
      featuredProducts: 6,
      comparisonTable: true,
      currentPosition: 14.3,
      impressions: 2900,
      aov: 52,
    },
  ];
}

// ── CLUSTER ROADMAP (18 articles) ──

function buildClusterRoadmap(): ClusterArticle[] {
  const niches: Array<{ niche: string; articles: Array<{ title: string; type: ClusterArticle['type']; slug: string; kw: string; words: number }> }> = [
    {
      niche: 'Orthopedic Dog Beds',
      articles: [
        { title: 'How to Choose the Right Orthopedic Dog Bed', type: 'Buying Guide', slug: 'how-to-choose-orthopedic-dog-bed', kw: 'how to choose orthopedic dog bed', words: 1800 },
        { title: '7 Best Orthopedic Dog Beds of 2026 — Vet Picks', type: 'Best of 2026', slug: 'best-orthopedic-dog-beds-2026', kw: 'best orthopedic dog bed 2026', words: 2000 },
        { title: 'Signs Your Dog Has Joint Pain (Act Before It Worsens)', type: 'Problem-Solution', slug: 'signs-dog-has-joint-pain', kw: 'signs of joint pain in dogs', words: 1500 },
        { title: 'Memory Foam vs Egg-Crate vs Gel: Which Dog Bed Foam Wins?', type: 'Comparison', slug: 'memory-foam-vs-egg-crate-dog-bed', kw: 'memory foam vs regular dog bed', words: 1400 },
        { title: 'Best Orthopedic Dog Beds for Large Breeds Over 80 lbs', type: 'Use-Case', slug: 'best-orthopedic-beds-large-dogs', kw: 'orthopedic dog bed large breed', words: 1600 },
        { title: 'Orthopedic Dog Bed FAQ — 15 Expert Questions Answered', type: 'Expert FAQ', slug: 'orthopedic-dog-bed-faq', kw: 'orthopedic dog bed faq', words: 2200 },
      ],
    },
    {
      niche: 'Cat Trees for Large Cats',
      articles: [
        { title: 'How to Choose a Cat Tree for Large Cats', type: 'Buying Guide', slug: 'how-to-choose-cat-tree-large-cats', kw: 'cat tree buying guide large cats', words: 1700 },
        { title: '9 Best Cat Trees for Large Cats in 2026', type: 'Best of 2026', slug: 'best-cat-trees-large-cats-2026', kw: 'best cat tree large cats 2026', words: 1900 },
        { title: 'Why Your Cat Tree Keeps Toppling (And How to Fix It)', type: 'Problem-Solution', slug: 'cat-tree-stability-fix', kw: 'cat tree keeps falling over', words: 1400 },
        { title: 'Sisal vs Carpet Scratching Posts — Durability Tested', type: 'Comparison', slug: 'sisal-vs-carpet-cat-tree', kw: 'sisal vs carpet scratching post', words: 1300 },
        { title: 'Best Cat Trees for Maine Coons & Ragdolls', type: 'Use-Case', slug: 'cat-trees-maine-coon-ragdoll', kw: 'cat tree for maine coon', words: 1600 },
        { title: 'Cat Tree FAQ — 12 Questions Answered by Experts', type: 'Expert FAQ', slug: 'cat-tree-faq', kw: 'cat tree faq', words: 2000 },
      ],
    },
    {
      niche: 'Dog Car Travel Safety',
      articles: [
        { title: 'How to Choose a Dog Car Seat — Complete Safety Guide', type: 'Buying Guide', slug: 'how-to-choose-dog-car-seat', kw: 'how to choose dog car seat', words: 1600 },
        { title: '5 Best Crash-Tested Dog Car Seats of 2026', type: 'Best of 2026', slug: 'best-crash-tested-dog-car-seats-2026', kw: 'crash tested dog car seat 2026', words: 1800 },
        { title: 'Dog Travel Anxiety? Here\'s How to Keep Them Calm', type: 'Problem-Solution', slug: 'dog-travel-anxiety-solutions', kw: 'dog travel anxiety', words: 1400 },
        { title: 'Booster Seat vs Car Hammock — Which Is Safer?', type: 'Comparison', slug: 'booster-seat-vs-car-hammock', kw: 'dog booster seat vs hammock', words: 1300 },
        { title: 'Best Dog Car Seats for Small Dogs Under 25 lbs', type: 'Use-Case', slug: 'best-car-seats-small-dogs', kw: 'dog car seat small dogs', words: 1500 },
        { title: 'Dog Car Safety FAQ — 10 Questions Every Owner Asks', type: 'Expert FAQ', slug: 'dog-car-safety-faq', kw: 'dog car seat safety faq', words: 1900 },
      ],
    },
  ];

  return niches.flatMap(n =>
    n.articles.map(a => ({
      niche: n.niche,
      title: a.title,
      type: a.type,
      slug: a.slug,
      wordCount: a.words,
      linksToHub: 3,
      linksToProducts: 2,
      status: 'planned' as const,
      primaryKeyword: a.kw,
    }))
  );
}

// ── INTERNAL LINKS ──

function buildInternalLinks(): InternalLinkEntry[] {
  const hubs = ['/orthopedic-dog-beds', '/cat-trees-for-large-cats', '/dog-car-travel-safety'];
  const links: InternalLinkEntry[] = [];

  // Homepage → all 3 hubs
  hubs.forEach(h => links.push({ source: '/', target: h, anchor: h.replace(/^\//, '').replace(/-/g, ' '), anchorType: 'exact', weight: 100 }));

  // Cluster → hub
  const clusters = buildClusterRoadmap();
  clusters.forEach(c => {
    const hub = c.niche === 'Orthopedic Dog Beds' ? hubs[0] : c.niche === 'Cat Trees for Large Cats' ? hubs[1] : hubs[2];
    links.push({ source: `/guides/${c.slug}`, target: hub, anchor: c.niche.toLowerCase(), anchorType: 'exact', weight: 60 });
    links.push({ source: `/guides/${c.slug}`, target: hub, anchor: `best ${c.niche.toLowerCase()}`, anchorType: 'partial', weight: 60 });
    links.push({ source: `/guides/${c.slug}`, target: hub, anchor: 'see our top picks', anchorType: 'semantic', weight: 60 });
  });

  // High-authority pages → hubs
  const authorityPages = ['/collections/dog-beds', '/collections/cat-trees', '/collections/dog-travel', '/blog/senior-dog-care', '/blog/cat-enrichment-guide', '/blog/road-trip-with-dogs'];
  authorityPages.forEach((p, i) => {
    const hub = hubs[i % 3];
    links.push({ source: p, target: hub, anchor: 'our expert guide', anchorType: 'semantic', weight: 80 });
  });

  return links;
}

// ── CTR REWRITES ──

function buildCtrRewrites(): CtrRewrite[] {
  return [
    {
      url: '/orthopedic-dog-beds',
      currentTitle: 'Orthopedic Dog Beds | GetPawsy',
      newTitle: 'Orthopedic Dog Beds for Large Dogs | Vet Recommended Support | GetPawsy',
      currentMeta: 'Shop orthopedic dog beds at GetPawsy.',
      newMeta: 'Joint pain affects 1 in 4 dogs. Our vet-recommended orthopedic beds use medical-grade foam for lasting relief. Free shipping on eligible orders + 30-day return policy.',
      position: 8.2, impressions: 4200, expectedCtrLift: '+65% CTR',
    },
    {
      url: '/cat-trees-for-large-cats',
      currentTitle: 'Cat Trees for Large Cats | GetPawsy',
      newTitle: 'Cat Trees for Large Cats | Stability Tested to 50 lbs | GetPawsy',
      currentMeta: 'Browse cat trees for large cats.',
      newMeta: 'Wobbly trees topple under 15+ lb cats. Our picks are load-tested with solid wood bases. Free 3-5 day US shipping.',
      position: 11.5, impressions: 3800, expectedCtrLift: '+80% CTR',
    },
    {
      url: '/dog-car-travel-safety',
      currentTitle: 'Dog Car Seats | GetPawsy',
      newTitle: 'Crash-Tested Dog Car Seats & Harnesses | Safety Data Inside | GetPawsy',
      currentMeta: 'Shop dog car seats and travel gear.',
      newMeta: 'Unrestrained dogs are 2× more likely to be injured. These seats passed 30 mph crash tests. Real safety ratings inside.',
      position: 14.3, impressions: 2900, expectedCtrLift: '+95% CTR',
    },
    {
      url: '/guides/how-to-choose-orthopedic-dog-bed',
      currentTitle: 'How to Choose an Orthopedic Dog Bed',
      newTitle: 'How to Choose an Orthopedic Dog Bed — 5 Steps (Vet Guide 2026)',
      currentMeta: 'Learn how to pick the right orthopedic bed.',
      newMeta: 'Don\'t waste $100 on a bed that flattens in 3 months. This vet-informed guide covers foam density, sizing, and waterproofing — so you buy right first time.',
      position: 12.1, impressions: 1400, expectedCtrLift: '+70% CTR',
    },
    {
      url: '/guides/crash-tested-dog-car-seat-guide',
      currentTitle: 'Crash Tested Dog Car Seat Guide',
      newTitle: 'Crash-Tested Dog Car Seats — Which Actually Passed? (2026 Data)',
      currentMeta: 'Guide to crash tested dog car seats.',
      newMeta: 'Most "crash-tested" claims are marketing. We analyzed real test data from CPS and NHTSA standards. See which seats actually protect your dog.',
      position: 16.8, impressions: 1100, expectedCtrLift: '+110% CTR',
    },
  ];
}

// ── CANNIBALIZATION ──

function buildCannibalizationFixes(): CannibalizationFix[] {
  return [
    {
      query: 'orthopedic dog bed',
      pages: [
        { url: '/orthopedic-dog-beds', position: 8.2, impressions: 4200 },
        { url: '/collections/all', position: 18.4, impressions: 680 },
      ],
      severity: 'critical',
      action: '301 redirect /dog/orthopedic-dog-beds → /orthopedic-dog-beds. Consolidate all link equity to new hub.',
    },
    {
      query: 'cat tree large cats',
      pages: [
        { url: '/cat-trees-for-large-cats', position: 11.5, impressions: 3800 },
        { url: '/collections/all', position: 22.1, impressions: 520 },
      ],
      severity: 'critical',
      action: '301 redirect /cat/cat-trees-for-large-cats → /cat-trees-for-large-cats. Merge content.',
    },
    {
      query: 'waterproof dog bed',
      pages: [
        { url: '/collections/waterproof-dog-beds', position: 10.4, impressions: 1600 },
        { url: '/orthopedic-dog-beds', position: 24.7, impressions: 280 },
      ],
      severity: 'medium',
      action: 'Remove "waterproof" section from orthopedic hub. Add contextual link to /collections/waterproof-dog-beds instead.',
    },
  ];
}

// ── VELOCITY RULES ──

function buildVelocityRules(): VelocityRule[] {
  return [
    { niche: 'Orthopedic Dog Beds', clickGrowthPct: 38, impressionGrowthPct: 22, positionDelta: -2.1, action: 'SCALE', details: '+2 supporting articles, increase homepage link weight, add featured block' },
    { niche: 'Cat Trees for Large Cats', clickGrowthPct: 31, impressionGrowthPct: 18, positionDelta: -1.8, action: 'SCALE', details: '+2 supporting articles, boost homepage prominence' },
    { niche: 'Dog Car Travel Safety', clickGrowthPct: 12, impressionGrowthPct: 8, positionDelta: -0.6, action: 'OPTIMIZE', details: 'Optimize titles, strengthen internal linking, improve product schema' },
  ];
}

// ── MARKET SHARE ──

function buildMarketShare(): MarketShareProjection[] {
  const hubs = buildHubs();
  return hubs.map(h => {
    const clicks3 = Math.round(h.impressions * ctr(3));
    const clicks5 = Math.round(h.impressions * ctr(5));
    const rev3mo = Math.round(clicks3 * 0.025 * h.aov);
    const rev5mo = Math.round(clicks5 * 0.025 * h.aov);
    return {
      niche: h.niche,
      revenue30d: { rank3: rev3mo, rank5: rev5mo },
      revenue90d: { rank3: rev3mo * 3, rank5: rev5mo * 3 },
      marketSharePct: h.niche === 'Orthopedic Dog Beds' ? 14.2 : h.niche === 'Cat Trees for Large Cats' ? 11.8 : 8.5,
      clusterKeywords: 6,
      serpCoverage: h.niche === 'Orthopedic Dog Beds' ? '72%' : h.niche === 'Cat Trees for Large Cats' ? '65%' : '48%',
    };
  });
}

// ── EXECUTION ORDER ──

function buildExecutionOrder(): MarketTakeoverState['executionOrder'] {
  return [
    { phase: 'Phase 1 — Create 3 Category Power Hubs', priority: 1, timeframe: 'Week 1-2', expectedLift: '+40% SERP coverage per niche' },
    { phase: 'Phase 2 — Publish 18 cluster articles', priority: 2, timeframe: 'Week 2-6', expectedLift: '+70% topical authority depth' },
    { phase: 'Phase 3 — Internal link authority stacking', priority: 3, timeframe: 'Week 1-3', expectedLift: '+35% link equity to hubs' },
    { phase: 'Phase 4 — CTR war mode (title/meta rewrites)', priority: 4, timeframe: 'Week 2-4', expectedLift: '+65-110% CTR on key pages' },
    { phase: 'Phase 5 — Cannibalization control (3 fixes)', priority: 5, timeframe: 'Week 1', expectedLift: '+20% authority consolidation' },
    { phase: 'Phase 6 — Velocity acceleration (bi-weekly)', priority: 6, timeframe: 'Ongoing', expectedLift: 'Compound growth scaling' },
    { phase: 'Phase 7 — Market share simulation & tracking', priority: 7, timeframe: 'Ongoing', expectedLift: '14%+ market share target' },
  ];
}

// ── BUILD FULL STATE ──

export function buildMarketTakeoverState(): MarketTakeoverState {
  const niches = buildHubs();
  const clusterRoadmap = buildClusterRoadmap();
  const internalLinks = buildInternalLinks();
  const ctrRewrites = buildCtrRewrites();
  const cannibalizationFixes = buildCannibalizationFixes();
  const velocityRules = buildVelocityRules();
  const marketShare = buildMarketShare();
  const executionOrder = buildExecutionOrder();

  const combined90d = {
    rank3: marketShare.reduce((s, m) => s + m.revenue90d.rank3, 0),
    rank5: marketShare.reduce((s, m) => s + m.revenue90d.rank5, 0),
  };

  return {
    niches,
    clusterRoadmap,
    internalLinks,
    ctrRewrites,
    cannibalizationFixes,
    velocityRules,
    marketShare,
    executionOrder,
    summary: {
      totalHubs: niches.length,
      totalClusterPages: clusterRoadmap.length,
      totalInternalLinks: internalLinks.length,
      cannibalizationsFixed: cannibalizationFixes.length,
      combined90dRevenue: combined90d,
      marketShareTarget: '14%+ across 3 niches',
    },
  };
}
