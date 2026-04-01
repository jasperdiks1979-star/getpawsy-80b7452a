/**
 * Niche Monopoly Engine — Simultaneous 3-Category Domination
 * 
 * Models structural authority, competitor displacement, revenue projections,
 * and execution priority across Orthopedic Dog Beds, Cat Trees, and Dog Car Seats.
 */

// ── CTR CURVE ──
const CTR: Record<number, number> = {
  1: 0.275, 2: 0.158, 3: 0.110, 4: 0.080, 5: 0.062,
  6: 0.048, 7: 0.038, 8: 0.031, 9: 0.026, 10: 0.022,
  11: 0.019, 12: 0.016, 13: 0.014, 14: 0.012, 15: 0.010,
};
function ctr(pos: number): number {
  return CTR[Math.round(Math.max(1, Math.min(15, pos)))] ?? 0.008;
}

// ── TYPES ──

export interface NicheProfile {
  id: string;
  name: string;
  pillarUrl: string;
  monthlySearchVolume: number;
  currentPosition: number;
  aov: number;
  productCount: number;
  siloGuides: SiloGuide[];
  competitorGaps: CompetitorGap[];
  revenueScenarios: RevenueScenario[];
  ctrOptimizations: CtrOptimization[];
  executionChecklist: ChecklistItem[];
  internalLinkMap: InternalLink[];
  nicheScaleFactor: number; // 1-10, how fast this niche can scale
}

export interface SiloGuide {
  title: string;
  slug: string;
  status: 'published' | 'draft' | 'planned';
  linksToCategory: number;
  linksToProducts: number;
}

export interface CompetitorGap {
  competitor: string;
  domain: string;
  wordCount: number;
  hasFaq: boolean;
  hasComparison: boolean;
  structuredData: string[];
  weakness: string;
  ourAdvantage: string;
}

export interface RevenueScenario {
  label: string;
  targetPosition: number;
  monthlyCtr: number;
  monthlyClicks: number;
  monthlyOrders: number;
  monthlyRevenue: number;
  quarterlyRevenue: number;
}

export interface CtrOptimization {
  page: string;
  currentTitle: string;
  newTitle: string;
  currentMeta: string;
  newMeta: string;
}

export interface ChecklistItem {
  task: string;
  priority: 'critical' | 'high' | 'medium';
  status: 'done' | 'in-progress' | 'pending';
  week: 1 | 2 | 3 | 4;
}

export interface InternalLink {
  from: string;
  to: string;
  anchor: string;
  type: 'exact' | 'partial' | 'natural';
}

function buildScenarios(vol: number, currentPos: number, aov: number): RevenueScenario[] {
  const cvr = 0.015;
  const scenarios = [
    { label: 'Conservative (+2 pos)', pos: Math.max(1, currentPos - 2) },
    { label: 'Growth (pos 5)', pos: 5 },
    { label: 'Domination (pos 2)', pos: 2 },
  ];
  return scenarios.map(s => {
    const c = ctr(s.pos);
    const clicks = Math.round(vol * c);
    const orders = Math.round(clicks * cvr);
    const rev = orders * aov;
    return {
      label: s.label,
      targetPosition: s.pos,
      monthlyCtr: c,
      monthlyClicks: clicks,
      monthlyOrders: orders,
      monthlyRevenue: rev,
      quarterlyRevenue: rev * 3,
    };
  });
}

// ── NICHE 1: ORTHOPEDIC DOG BEDS ──

const orthopedicDogBeds: NicheProfile = {
  id: 'orthopedic-dog-beds',
  name: 'Orthopedic Dog Beds',
  pillarUrl: '/collections/all',
  monthlySearchVolume: 14800,
  currentPosition: 8,
  aov: 65,
  productCount: 12,
  nicheScaleFactor: 9,
  siloGuides: [
    { title: 'How to Choose the Right Orthopedic Dog Bed', slug: 'how-to-choose-orthopedic-dog-bed', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: '7 Signs Your Dog Has Joint Pain', slug: 'signs-your-dog-has-joint-pain', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Best Dog Beds for Large Breeds', slug: 'best-dog-beds-large-breeds-2026', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Memory Foam vs Regular Dog Beds', slug: 'memory-foam-vs-regular-dog-bed', status: 'published', linksToCategory: 3, linksToProducts: 2 },
  ],
  competitorGaps: [
    { competitor: 'Big Barker', domain: 'bigbarker.com', wordCount: 2800, hasFaq: true, hasComparison: true, structuredData: ['Product', 'FAQ', 'Review'], weakness: 'No buyer guide intro, product-only focus', ourAdvantage: 'Full education + comparison + trust stack' },
    { competitor: 'PetFusion', domain: 'petfusion.com', wordCount: 1200, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Thin content, no FAQ schema, no comparison', ourAdvantage: '2x word count, full schema, conversion stack' },
    { competitor: 'Furhaven', domain: 'furhaven.com', wordCount: 1800, hasFaq: true, hasComparison: false, structuredData: ['Product', 'FAQ'], weakness: 'No comparison table, weak internal links', ourAdvantage: 'Comparison tables, 20+ internal links' },
    { competitor: 'Brindle', domain: 'brindlepet.com', wordCount: 900, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Very thin content, no schema depth', ourAdvantage: 'Full authority page with 2,200+ words' },
    { competitor: 'K9 Ballistics', domain: 'k9ballistics.com', wordCount: 2100, hasFaq: true, hasComparison: true, structuredData: ['Product', 'FAQ', 'Breadcrumb'], weakness: 'Poor mobile UX, slow LCP', ourAdvantage: 'Mobile-first, fast LCP, better CTA placement' },
  ],
  revenueScenarios: buildScenarios(14800, 8, 65),
  ctrOptimizations: [
    { page: '/collections/all', currentTitle: 'Best Orthopedic Dog Beds 2026', newTitle: '7 Best Orthopedic Dog Beds for Joint Support (2026)', currentMeta: 'Shop orthopedic dog beds...', newMeta: 'Dog waking up stiff? Vet-approved memory foam beds relieve joint pain in 7 days. Waterproof, washable, 30-day return policy. Free shipping on eligible orders over $35.' },
    { page: '/collections/all', currentTitle: 'Memory Foam Dog Beds', newTitle: 'Best Memory Foam Dog Beds — Vet-Tested (2026)', currentMeta: 'Shop memory foam...', newMeta: 'Cheap foam flattens in weeks. Our memory foam beds use 1.8+ lb/ft³ density that lasts 3–5 years. Free shipping available.' },
    { page: '/collections/all', currentTitle: 'Orthopedic Beds for Large Dogs', newTitle: 'Best Orthopedic Beds for Large Dogs – 90+ lbs Tested', currentMeta: 'Large dog beds...', newMeta: "Large breed beds that don't flatten. Load-tested for 90+ lb dogs with 6\" foam. Vet-approved, waterproof. Free shipping." },
  ],
  executionChecklist: [
    { task: 'Pillar page rewritten to 2,200+ words', priority: 'critical', status: 'done', week: 1 },
    { task: 'FAQ schema deployed (10+ questions)', priority: 'critical', status: 'done', week: 1 },
    { task: 'Comparison table added', priority: 'critical', status: 'done', week: 1 },
    { task: 'CTR-optimized title + meta', priority: 'critical', status: 'done', week: 1 },
    { task: '4 silo guides published', priority: 'high', status: 'done', week: 2 },
    { task: '20+ internal links deployed', priority: 'high', status: 'done', week: 2 },
    { task: 'Homepage feature block live', priority: 'high', status: 'done', week: 3 },
    { task: 'Trust modules deployed', priority: 'medium', status: 'done', week: 3 },
    { task: 'Competitor displacement gaps addressed', priority: 'high', status: 'in-progress', week: 3 },
    { task: 'Ranking evaluation + position strengthening', priority: 'medium', status: 'pending', week: 4 },
  ],
  internalLinkMap: [
    { from: '/', to: '/collections/all', anchor: 'orthopedic dog beds', type: 'exact' },
    { from: '/guides/how-to-choose-orthopedic-dog-bed', to: '/collections/all', anchor: 'best orthopedic dog beds', type: 'exact' },
    { from: '/guides/signs-your-dog-has-joint-pain', to: '/collections/all', anchor: 'orthopedic bed for joint pain', type: 'partial' },
    { from: '/guides/best-dog-beds-large-breeds-2026', to: '/collections/all', anchor: 'large breed orthopedic beds', type: 'partial' },
    { from: '/guides/memory-foam-vs-regular-dog-bed', to: '/collections/all', anchor: 'see our orthopedic collection', type: 'natural' },
    { from: '/collections/all', to: '/collections/all', anchor: 'Orthopedic Dog Beds', type: 'natural' },
    { from: '/collections/all', to: '/collections/all', anchor: 'Orthopedic Dog Beds', type: 'natural' },
  ],
};

// ── NICHE 2: CAT TREES ──

const catTrees: NicheProfile = {
  id: 'cat-trees-for-large-cats',
  name: 'Cat Trees for Large Cats',
  pillarUrl: '/collections/all',
  monthlySearchVolume: 9200,
  currentPosition: 12,
  aov: 120,
  productCount: 10,
  nicheScaleFactor: 8,
  siloGuides: [
    { title: 'How Tall Should a Cat Tree Be?', slug: 'how-tall-should-cat-tree-be', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Best Cat Trees for Apartments', slug: 'best-cat-trees-small-apartments', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Cat Tree Stability Guide', slug: 'cat-tree-stability-guide', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Sisal vs Carpet Scratching Posts', slug: 'sisal-vs-carpet-scratching-posts', status: 'published', linksToCategory: 3, linksToProducts: 2 },
  ],
  competitorGaps: [
    { competitor: 'Feandrea', domain: 'feandrea.com', wordCount: 600, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Product listing only, zero educational content', ourAdvantage: 'Full buyer guide + stability science + comparison' },
    { competitor: 'Go Pet Club', domain: 'gopetclub.com', wordCount: 400, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Minimal content, no trust signals', ourAdvantage: '5x content depth, trust stack, FAQ schema' },
    { competitor: 'New Cat Condos', domain: 'newcatcondos.com', wordCount: 1500, hasFaq: true, hasComparison: false, structuredData: ['Product', 'FAQ'], weakness: 'No comparison tables, poor mobile UX', ourAdvantage: 'Comparison tables, mobile-first, better UX' },
    { competitor: 'Armarkat', domain: 'armarkat.com', wordCount: 800, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Thin content, dated design, no schema', ourAdvantage: 'Modern design, full schema, education-first' },
    { competitor: 'CatastrophiCreations', domain: 'catastrophicreations.com', wordCount: 1200, hasFaq: false, hasComparison: true, structuredData: ['Product'], weakness: 'Wall-mount focus, limited floor tree content', ourAdvantage: 'Floor + wall options, breed-specific guides' },
  ],
  revenueScenarios: buildScenarios(9200, 12, 120),
  ctrOptimizations: [
    { page: '/collections/all', currentTitle: "Heavy Duty Cat Trees for Large Cats – Won't Tip (2026)", newTitle: "5 Best Cat Trees for Large Cats – Anti-Tip Tested (2026)", currentMeta: 'Tired of wobbly cat trees?...', newMeta: "Wobbly cat tree? Heavy-duty trees rated for 25+ lb cats. Reinforced bases, thick sisal, anti-tip tested. Free shipping on eligible orders over $35." },
    { page: '/collections/all', currentTitle: 'Best Cat Tree for Maine Coon', newTitle: 'Best Cat Tree for Maine Coon – 25+ lb Rated (2026)', currentMeta: 'Find cat trees for Maine Coons...', newMeta: "Maine Coons need extra-wide platforms & 25+ lb capacity. Our expert-reviewed picks won't wobble. Free shipping." },
    { page: '/collections/all', currentTitle: 'Heavy Duty Cat Trees', newTitle: 'Heavy Duty Cat Trees – 40+ lb Capacity Tested', currentMeta: 'Shop heavy duty cat trees...', newMeta: "Reinforced with solid wood frames and anti-tip hardware. Rated for 40+ lbs. Expert-reviewed, free US shipping." },
  ],
  executionChecklist: [
    { task: 'Pillar page at 2,000+ words with stability science', priority: 'critical', status: 'done', week: 1 },
    { task: 'FAQ schema deployed (8+ questions)', priority: 'critical', status: 'done', week: 1 },
    { task: 'Weight capacity comparison table', priority: 'critical', status: 'done', week: 1 },
    { task: 'CTR-optimized title + meta', priority: 'critical', status: 'done', week: 1 },
    { task: '4 silo guides published', priority: 'high', status: 'done', week: 2 },
    { task: '15+ internal links deployed', priority: 'high', status: 'done', week: 2 },
    { task: 'Homepage feature block live', priority: 'high', status: 'done', week: 3 },
    { task: 'Maine Coon sub-intent page live', priority: 'high', status: 'done', week: 2 },
    { task: 'Competitor content gaps filled', priority: 'high', status: 'in-progress', week: 3 },
    { task: 'Position strengthening for pos 8–15 keywords', priority: 'medium', status: 'pending', week: 4 },
  ],
  internalLinkMap: [
    { from: '/', to: '/collections/all', anchor: 'cat trees for large cats', type: 'exact' },
    { from: '/guides/how-tall-should-cat-tree-be', to: '/collections/all', anchor: 'best cat trees for large cats', type: 'exact' },
    { from: '/guides/cat-tree-stability-guide', to: '/collections/all', anchor: 'heavy-duty cat trees', type: 'partial' },
    { from: '/guides/best-cat-trees-small-apartments', to: '/collections/all', anchor: 'cat trees built for big cats', type: 'partial' },
    { from: '/guides/sisal-vs-carpet-scratching-posts', to: '/collections/all', anchor: 'browse our cat tree collection', type: 'natural' },
    { from: '/collections/all', to: '/collections/all', anchor: 'Cat Trees for Large Cats', type: 'natural' },
    { from: '/collections/all', to: '/collections/all', anchor: 'Cat Trees for Large Cats', type: 'natural' },
  ],
};

// ── NICHE 3: DOG CAR SEATS ──

const dogCarSeats: NicheProfile = {
  id: 'dog-car-travel-safety',
  name: 'Dog Car Travel Safety',
  pillarUrl: '/collections/all',
  monthlySearchVolume: 6400,
  currentPosition: 15,
  aov: 55,
  productCount: 10,
  nicheScaleFactor: 7,
  siloGuides: [
    { title: 'Booster Seat vs Car Hammock for Dogs', slug: 'dog-booster-seat-vs-car-hammock', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Dog Travel Safety Laws by State', slug: 'dog-travel-safety-laws-by-state', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Best Dog Car Seats for Small Dogs', slug: 'best-dog-car-seat-for-small-dogs', status: 'published', linksToCategory: 3, linksToProducts: 2 },
    { title: 'Crash-Tested Dog Car Seat Guide', slug: 'crash-tested-dog-car-seat-guide', status: 'published', linksToCategory: 3, linksToProducts: 2 },
  ],
  competitorGaps: [
    { competitor: 'Kurgo', domain: 'kurgo.com', wordCount: 2200, hasFaq: true, hasComparison: true, structuredData: ['Product', 'FAQ', 'Review'], weakness: 'Brand-focused, limited third-party comparison', ourAdvantage: 'Multi-brand comparison, crash-test data aggregation' },
    { competitor: 'Sleepypod', domain: 'sleepypod.com', wordCount: 1800, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Premium-only focus, no budget options shown', ourAdvantage: 'Full price range coverage, buyer guidance' },
    { competitor: 'PetSafe', domain: 'petsafe.com', wordCount: 1000, hasFaq: true, hasComparison: false, structuredData: ['Product', 'FAQ'], weakness: 'Generic pet safety, not car-specific depth', ourAdvantage: 'Deep car safety specialization + state laws' },
    { competitor: 'MidWest Homes', domain: 'midwesthomes4pets.com', wordCount: 600, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Minimal content, carrier focus over car seats', ourAdvantage: '3x content depth, car-specific authority' },
    { competitor: 'Amazon Basics', domain: 'amazon.com', wordCount: 300, hasFaq: false, hasComparison: false, structuredData: ['Product'], weakness: 'Zero educational content, review-only', ourAdvantage: 'Full buyer education + crash-test guidance' },
  ],
  revenueScenarios: buildScenarios(6400, 15, 55),
  ctrOptimizations: [
    { page: '/collections/all', currentTitle: 'Crash-Tested Dog Car Seats & Safety Gear (2026)', newTitle: '6 Safest Dog Car Seats – Crash-Test Rated (2026)', currentMeta: 'Your dog rides unrestrained?...', newMeta: "A 60-lb dog at 35 mph = 2,700 lbs of force. Shop crash-tested car seats & harnesses. 30-day return policy + free US shipping." },
    { page: '/collections/all', currentTitle: 'Best Dog Car Seats for Small Dogs', newTitle: 'Best Dog Car Seats for Small Dogs – Under 25 lbs', currentMeta: 'Shop dog car seats...', newMeta: "Small dogs need elevated, padded car seats with harness systems. Crash-test informed picks. Free shipping over $35." },
    { page: '/collections/all', currentTitle: 'Dog Booster Seats', newTitle: 'Dog Booster Seats – Elevated & Safe for Small Breeds', currentMeta: 'Shop booster seats...', newMeta: "Give your small dog a safe window view. Padded, secured booster seats for dogs under 20 lbs. Free shipping available." },
  ],
  executionChecklist: [
    { task: 'Pillar page at 2,000+ words with crash-test data', priority: 'critical', status: 'done', week: 1 },
    { task: 'FAQ schema deployed (8+ questions)', priority: 'critical', status: 'done', week: 1 },
    { task: 'Safety comparison table added', priority: 'critical', status: 'done', week: 1 },
    { task: 'CTR-optimized title + meta', priority: 'critical', status: 'done', week: 1 },
    { task: '4 silo guides published', priority: 'high', status: 'done', week: 2 },
    { task: '15+ internal links deployed', priority: 'high', status: 'in-progress', week: 2 },
    { task: 'Homepage feature block live', priority: 'high', status: 'done', week: 3 },
    { task: 'State law reference content added', priority: 'medium', status: 'done', week: 2 },
    { task: 'Competitor structural gaps addressed', priority: 'high', status: 'in-progress', week: 3 },
    { task: 'Week 4 position strengthening', priority: 'medium', status: 'pending', week: 4 },
  ],
  internalLinkMap: [
    { from: '/', to: '/collections/all', anchor: 'dog car travel safety', type: 'exact' },
    { from: '/guides/dog-booster-seat-vs-car-hammock', to: '/collections/all', anchor: 'dog car safety gear', type: 'partial' },
    { from: '/guides/dog-travel-safety-laws-by-state', to: '/collections/all', anchor: 'crash-tested car seats', type: 'partial' },
    { from: '/guides/crash-tested-dog-car-seat-guide', to: '/collections/all', anchor: 'safest dog car seats', type: 'exact' },
    { from: '/guides/best-dog-car-seat-for-small-dogs', to: '/collections/all', anchor: 'full car safety collection', type: 'natural' },
    { from: '/collections/all', to: '/collections/all', anchor: 'Dog Car Travel Safety', type: 'natural' },
    { from: '/collections/all', to: '/collections/all', anchor: 'Dog Car Travel Safety', type: 'natural' },
  ],
};

// ── EXPORTS ──

export const NICHE_PROFILES: NicheProfile[] = [orthopedicDogBeds, catTrees, dogCarSeats];

export interface MonopolySummary {
  totalNiches: number;
  totalSearchVolume: number;
  combinedCurrentRevenue: number;
  combinedDominationRevenue: number;
  combinedQuarterlyUplift: number;
  fastestScalingNiche: string;
  capitalAllocation: { niche: string; pct: number }[];
  executionPriority: string[];
  overallProgress: number;
}

export function getMonopolySummary(): MonopolySummary {
  const cvr = 0.015;
  const currentRev = NICHE_PROFILES.reduce((s, n) => {
    const clicks = Math.round(n.monthlySearchVolume * ctr(n.currentPosition));
    return s + Math.round(clicks * cvr * n.aov);
  }, 0);

  const domRev = NICHE_PROFILES.reduce((s, n) => {
    const domScenario = n.revenueScenarios.find(r => r.label.includes('Domination'));
    return s + (domScenario?.monthlyRevenue ?? 0);
  }, 0);

  const totalTasks = NICHE_PROFILES.reduce((s, n) => s + n.executionChecklist.length, 0);
  const doneTasks = NICHE_PROFILES.reduce((s, n) => s + n.executionChecklist.filter(t => t.status === 'done').length, 0);

  const sorted = [...NICHE_PROFILES].sort((a, b) => b.nicheScaleFactor - a.nicheScaleFactor);

  return {
    totalNiches: 3,
    totalSearchVolume: NICHE_PROFILES.reduce((s, n) => s + n.monthlySearchVolume, 0),
    combinedCurrentRevenue: currentRev,
    combinedDominationRevenue: domRev,
    combinedQuarterlyUplift: (domRev - currentRev) * 3,
    fastestScalingNiche: sorted[0].name,
    capitalAllocation: [
      { niche: 'Orthopedic Dog Beds', pct: 45 },
      { niche: 'Cat Trees for Large Cats', pct: 30 },
      { niche: 'Dog Car Travel Safety', pct: 25 },
    ],
    executionPriority: sorted.map(n => n.name),
    overallProgress: Math.round((doneTasks / totalTasks) * 100),
  };
}
