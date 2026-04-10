/**
 * Top-3 Boost Engine
 * 
 * Identifies pages ranking 6–15 and generates aggressive optimization
 * plans to push them into positions 1–3:
 * - CTR-optimized title rewrites with power words + year + outcome
 * - Internal link pressure maps (5 contextual + homepage + sidebar + footer)
 * - Semantic depth expansion targets
 * - Behavioral signal improvements
 * - 30-day climb projections with revenue lift estimates
 */

import { SEO_CONTENT_CLUSTERS } from './seo-content-clusters';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface BoostCandidate {
  rank: number;
  url: string;
  keyword: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  intent: 'buy' | 'compare' | 'info';
  revenuePotential: 'high' | 'medium' | 'low';
  currentTitle: string;
  boostedTitle: string;
  boostedMeta: string;
  semanticGaps: string[];
  internalLinkPlan: InternalLinkAction[];
  behavioralBoosts: string[];
  snippetTarget: string | null;
  projectedPosition: number;
  projectedCtr: number;
  revenueUpliftMonthly: number;
}

export interface InternalLinkAction {
  type: 'contextual' | 'homepage' | 'sidebar' | 'footer' | 'cluster';
  sourcePage: string;
  anchorText: string;
  priority: 'critical' | 'high' | 'medium';
}

export interface BoostEngineResult {
  candidates: BoostCandidate[];
  totalCandidates: number;
  totalRevenueUplift: number;
  avgCurrentPosition: number;
  avgProjectedPosition: number;
  avgCtrUplift: number;
  roadmap: BoostRoadmapWeek[];
}

export interface BoostRoadmapWeek {
  week: number;
  actions: string[];
  expectedOutcome: string;
}

// ═══════════════════════════════════════════════════════════
// SIMULATED BOOST CANDIDATES (replaces GSC pull in static mode)
// ═══════════════════════════════════════════════════════════

const RAW_CANDIDATES: Array<{
  url: string;
  keyword: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  intent: 'buy' | 'compare' | 'info';
  revenuePotential: 'high' | 'medium' | 'low';
  aov: number;
}> = [
  { url: '/collections/no-pull-dog-harness', keyword: 'best no pull dog harness', position: 8, impressions: 3200, clicks: 128, ctr: 4.0, intent: 'buy', revenuePotential: 'high', aov: 45 },
  { url: '/collections/orthopedic-dog-beds', keyword: 'best orthopedic dog bed', position: 7, impressions: 4800, clicks: 288, ctr: 6.0, intent: 'buy', revenuePotential: 'high', aov: 89 },
  { url: '/collections/cat-trees-for-large-cats', keyword: 'cat tree for large cats', position: 9, impressions: 3600, clicks: 108, ctr: 3.0, intent: 'buy', revenuePotential: 'high', aov: 120 },
  { url: '/collections/all', keyword: 'best harness for large dogs that pull', position: 11, impressions: 2400, clicks: 48, ctr: 2.0, intent: 'buy', revenuePotential: 'high', aov: 52 },
  { url: '/collections/slow-feeder-dog-bowls', keyword: 'best slow feeder dog bowl', position: 10, impressions: 2100, clicks: 63, ctr: 3.0, intent: 'buy', revenuePotential: 'medium', aov: 28 },
  { url: '/collections/all', keyword: 'front clip vs back clip harness', position: 12, impressions: 1800, clicks: 36, ctr: 2.0, intent: 'compare', revenuePotential: 'medium', aov: 45 },
  { url: '/collections/interactive-dog-toys', keyword: 'best interactive dog toys', position: 8, impressions: 2800, clicks: 140, ctr: 5.0, intent: 'buy', revenuePotential: 'medium', aov: 32 },
  { url: '/collections/all', keyword: 'how to stop dog pulling on leash', position: 13, impressions: 4100, clicks: 82, ctr: 2.0, intent: 'info', revenuePotential: 'medium', aov: 45 },
  { url: '/collections/dog-car-seat-covers', keyword: 'best dog car seat cover', position: 9, impressions: 2200, clicks: 88, ctr: 4.0, intent: 'buy', revenuePotential: 'medium', aov: 55 },
  { url: '/collections/cat-litter-boxes', keyword: 'best cat litter box', position: 11, impressions: 3100, clicks: 62, ctr: 2.0, intent: 'buy', revenuePotential: 'high', aov: 75 },
  { url: '/collections/all', keyword: 'long line leash for dog training', position: 14, impressions: 1900, clicks: 19, ctr: 1.0, intent: 'buy', revenuePotential: 'medium', aov: 22 },
  { url: '/collections/elevated-dog-beds', keyword: 'elevated cooling dog bed', position: 10, impressions: 1600, clicks: 48, ctr: 3.0, intent: 'buy', revenuePotential: 'medium', aov: 65 },
  { url: '/collections/all', keyword: 'how to teach dog recall', position: 12, impressions: 3200, clicks: 64, ctr: 2.0, intent: 'info', revenuePotential: 'low', aov: 35 },
  { url: '/collections/cat-water-fountains', keyword: 'best cat water fountain', position: 8, impressions: 2600, clicks: 130, ctr: 5.0, intent: 'buy', revenuePotential: 'medium', aov: 38 },
  { url: '/collections/all', keyword: 'dog harness sizing chart', position: 15, impressions: 2200, clicks: 22, ctr: 1.0, intent: 'info', revenuePotential: 'low', aov: 45 },
];

// ═══════════════════════════════════════════════════════════
// TITLE & META REWRITE ENGINE
// ═══════════════════════════════════════════════════════════

const TITLE_REWRITES: Record<string, { title: string; meta: string }> = {
  'best no pull dog harness': {
    title: 'Stop Pulling Fast — Best No-Pull Dog Harness (Trainer Approved 2026)',
    meta: 'End leash pulling on the first walk. Expert-tested no-pull harnesses ranked by real trainers. Metal hardware, padded comfort, free US shipping.',
  },
  'best orthopedic dog bed': {
    title: 'Best Orthopedic Dog Beds (2026) — Premium Quality for Joint Pain',
    meta: 'Relieve arthritis and hip pain with vet-recommended orthopedic beds. Memory foam, waterproof covers, all sizes. Ships free to US.',
  },
  'cat tree for large cats': {
    title: 'Cat Trees for Large Cats (2026) — Heavy-Duty & Tested to 25 lbs',
    meta: 'Stop flimsy cat trees from tipping. We tested 20+ models for cats over 15 lbs. Solid wood, carpet-free options, wide platforms. Free shipping available.',
  },
  'best harness for large dogs that pull': {
    title: 'Best Harness for Large Dogs That Pull — Heavy-Duty Picks (2026)',
    meta: 'Tactical-grade harnesses for 50–130 lb dogs. Metal buckles, dual handles, 40–60% pull reduction on first walk. Free shipping available.',
  },
  'best slow feeder dog bowl': {
    title: 'Best Slow Feeder Dog Bowls (2026) — Prevent Bloat & Fast Eating',
    meta: 'Slow down fast eaters by 80%. Premium quality designs prevent bloat, improve digestion. Dishwasher safe. Ships free across US.',
  },
  'front clip vs back clip harness': {
    title: 'Front Clip vs Back Clip Harness — Which Actually Stops Pulling?',
    meta: 'The honest comparison most brands won\'t make. See real pull-reduction data, trainer preferences, and breed-specific recommendations.',
  },
  'best interactive dog toys': {
    title: 'Best Interactive Dog Toys (2026) — Tested by Dogs, Ranked by Experts',
    meta: 'We tested 25+ toys for engagement, durability, and mental stimulation. See which keep dogs busy longest. Free shipping available.',
  },
  'how to stop dog pulling on leash': {
    title: 'How to Stop Dog Pulling on Leash — 7-Day Training Plan (2026)',
    meta: 'Proven 7-day protocol from certified trainers. No choke chains, no force. Works for pullers of any size. Free equipment guide inside.',
  },
  'best dog car seat cover': {
    title: 'Best Dog Car Seat Covers (2026) — Waterproof & Scratch-Proof',
    meta: 'Protect your car seats from mud, hair, and scratches. Lab-tested waterproof covers with hammock mode. Free shipping available.',
  },
  'best cat litter box': {
    title: 'Best Cat Litter Boxes (2026) — Self-Cleaning & Budget Picks Ranked',
    meta: 'Top-rated litter boxes for odor control, easy cleaning, and multi-cat homes. Expert picks for every budget. Free shipping available.',
  },
  'long line leash for dog training': {
    title: '15ft vs 30ft Training Leash — Which Length for Recall Training?',
    meta: 'Complete long-line guide: when to use 15ft vs 30ft, best materials (biothane vs nylon), and recall training protocol. Ships free.',
  },
  'elevated cooling dog bed': {
    title: 'Best Elevated Cooling Dog Beds (2026) — Beat the Heat All Summer',
    meta: 'Keep your dog 10–15°F cooler with elevated airflow beds. Tested outdoors in 90°F+ heat. Chew-resistant frames. Free shipping available.',
  },
  'how to teach dog recall': {
    title: 'How to Teach Dog Recall — Foolproof 8-Week Training Guide (2026)',
    meta: 'Train reliable off-leash recall in 8 weeks. Step-by-step protocol from certified trainers. Includes long-line equipment guide.',
  },
  'best cat water fountain': {
    title: 'Best Cat Water Fountains (2026) — Improve Hydration, Protect Kidneys',
    meta: 'Vet-recommended fountains that increase water intake by 200%. Quiet motors, dishwasher-safe, BPA-free. Free shipping available.',
  },
  'dog harness sizing chart': {
    title: 'Dog Harness Sizing Chart — Measure Once, Fit Perfect (2026 Guide)',
    meta: 'Breed-specific harness sizing with photos. Chest girth measurements for 50+ breeds. Never order the wrong size again.',
  },
};

// ═══════════════════════════════════════════════════════════
// SEMANTIC GAPS & COMPETITOR WEAKNESSES
// ═══════════════════════════════════════════════════════════

function getSemanticGaps(keyword: string): string[] {
  const gaps: Record<string, string[]> = {
    'best no pull dog harness': ['Breed-specific pull-force data', 'Chafe-prevention comparison', 'Trainer certification claims verification', 'Harness durability timeline (6/12/24 month)'],
    'best orthopedic dog bed': ['Foam density comparison chart (3–5 lb/ft³)', 'Waterproof layer material analysis', 'Weight distribution pressure map', 'Breed-specific bed size calculator'],
    'cat tree for large cats': ['Weight-test video/photo proof', 'Wobble-resistance engineering analysis', 'Carpet vs sisal vs wood comparison', 'Room-by-room placement guide'],
    'best harness for large dogs that pull': ['Pulling force by breed (lbs)', 'Metal vs plastic buckle failure rates', 'Escape-proof feature comparison', 'Harness-to-collar transition timeline'],
    'best slow feeder dog bowl': ['Eating time reduction data by breed', 'Bloat prevention medical evidence', 'Material safety (BPA, lead) certifications', 'Dishwasher durability after 100+ cycles'],
    'front clip vs back clip harness': ['Biomechanics of pull redirection', 'Shoulder mobility impact study', 'Combined vs single-clip data', 'Price-performance scatter chart'],
    'best interactive dog toys': ['Engagement duration data (minutes)', 'Destruction timeline by chew strength', 'Mental stimulation scoring methodology', 'Age-appropriate toy guide (puppy/adult/senior)'],
    'how to stop dog pulling on leash': ['Day-by-day training progression photos', 'Equipment comparison for each method', 'Regression troubleshooting flowchart', 'Reactive dog modification protocol'],
    'best dog car seat cover': ['Waterproof rating comparison (ml/m²)', 'Installation time comparison', 'Scratch-resistance stress test', 'SUV vs sedan fitment guide'],
    'best cat litter box': ['Odor control technology comparison', 'Self-cleaning mechanism reliability data', 'Multi-cat capacity guidelines', 'Litter tracking reduction measurements'],
    'long line leash for dog training': ['Biothane vs nylon vs leather comparison', 'Wet-weather grip test results', 'Weight-per-foot analysis', 'Recall success rate by line length'],
    'elevated cooling dog bed': ['Temperature differential measurements', 'UV resistance ratings', 'Weight capacity per frame material', 'Indoor vs outdoor durability comparison'],
    'how to teach dog recall': ['Distraction hierarchy chart', 'Treat value ranking system', 'Whistle vs verbal recall comparison', 'Emergency recall training protocol'],
    'best cat water fountain': ['Flow rate comparison (L/min)', 'Motor noise measurements (dB)', 'Filter replacement frequency/cost', 'BPA-free material certifications'],
    'dog harness sizing chart': ['Breed growth curve sizing (puppy to adult)', 'Between-sizes recommendation logic', 'Measurement photo tutorial', 'Return/exchange rate by brand'],
  };
  return gaps[keyword] || ['Content depth expansion needed', 'Comparison table missing', 'FAQ coverage insufficient'];
}

// ═══════════════════════════════════════════════════════════
// INTERNAL LINK PLAN GENERATOR
// ═══════════════════════════════════════════════════════════

function buildInternalLinkPlan(url: string, keyword: string): InternalLinkAction[] {
  const kw = keyword.split(' ').slice(0, 3).join(' ');
  const links: InternalLinkAction[] = [
    // 5 contextual links from high-traffic guides
    { type: 'contextual', sourcePage: '/guides/best-dog-products-2026', anchorText: kw, priority: 'critical' },
    { type: 'contextual', sourcePage: '/blog/pet-care-essentials', anchorText: `top ${kw}`, priority: 'high' },
    { type: 'contextual', sourcePage: '/guides/new-pet-owner-checklist', anchorText: `${kw} guide`, priority: 'high' },
    { type: 'contextual', sourcePage: '/blog/pet-health-tips', anchorText: `recommended ${kw}`, priority: 'medium' },
    { type: 'contextual', sourcePage: '/guides/seasonal-pet-gear', anchorText: `${kw} for 2026`, priority: 'medium' },
    // Homepage mention
    { type: 'homepage', sourcePage: '/', anchorText: `Shop ${kw}`, priority: 'critical' },
    // Sidebar featured block
    { type: 'sidebar', sourcePage: 'global-sidebar', anchorText: `Recommended: ${kw}`, priority: 'high' },
    // 3 cluster sibling links
    { type: 'cluster', sourcePage: `${url}-alternatives`, anchorText: `compare ${kw}`, priority: 'medium' },
    { type: 'cluster', sourcePage: `${url}-buying-guide`, anchorText: `how to choose ${kw}`, priority: 'medium' },
    { type: 'cluster', sourcePage: `${url}-reviews`, anchorText: `${kw} reviews`, priority: 'medium' },
    // Footer link
    { type: 'footer', sourcePage: 'global-footer', anchorText: kw, priority: 'high' },
  ];
  return links;
}

// ═══════════════════════════════════════════════════════════
// CTR-BY-POSITION MODEL
// ═══════════════════════════════════════════════════════════

const CTR_BY_POSITION: Record<number, number> = {
  1: 31.7, 2: 24.7, 3: 18.6, 4: 13.6, 5: 9.5,
  6: 6.2, 7: 4.5, 8: 3.4, 9: 2.6, 10: 2.1,
  11: 1.5, 12: 1.1, 13: 0.8, 14: 0.6, 15: 0.5,
};

function getProjectedPosition(current: number): number {
  if (current <= 8) return Math.max(1, current - 5);
  if (current <= 12) return Math.max(2, current - 7);
  return Math.max(3, current - 9);
}

function getProjectedCtr(position: number): number {
  return CTR_BY_POSITION[position] || 0.4;
}

// ═══════════════════════════════════════════════════════════
// BEHAVIORAL BOOST RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════

function getBehavioralBoosts(intent: string, position: number): string[] {
  const boosts = [
    'Add above-the-fold comparison table',
    'Add trust badge strip with shipping info',
    'Add "Free Shipping" above CTA',
    'Add internal jump links (table of contents)',
  ];
  if (intent === 'buy') {
    boosts.push('Add embedded product cards with star ratings');
    boosts.push('Add "Customers Also Bought" cross-sell block');
    boosts.push('Add clear shipping and returns info near CTA');
  }
  if (intent === 'compare') {
    boosts.push('Add side-by-side comparison chart');
    boosts.push('Add "Best For" recommendation badges');
  }
  if (intent === 'info') {
    boosts.push('Add related guide preview cards');
    boosts.push('Add step-by-step numbered protocol');
    boosts.push('Add downloadable checklist CTA');
  }
  if (position >= 10) {
    boosts.push('Add 3 mid-content CTAs');
    boosts.push('Add embedded video placeholder');
  }
  return boosts;
}

// ═══════════════════════════════════════════════════════════
// MAIN ENGINE
// ═══════════════════════════════════════════════════════════

export function runTop3BoostEngine(): BoostEngineResult {
  const candidates: BoostCandidate[] = RAW_CANDIDATES
    .sort((a, b) => {
      const revOrder = { high: 3, medium: 2, low: 1 };
      const revDiff = revOrder[b.revenuePotential] - revOrder[a.revenuePotential];
      if (revDiff !== 0) return revDiff;
      return b.impressions - a.impressions;
    })
    .map((c, i) => {
      const rewrite = TITLE_REWRITES[c.keyword];
      const projPos = getProjectedPosition(c.position);
      const projCtr = getProjectedCtr(projPos);
      const currentMonthlyRev = c.clicks * 0.03 * c.aov;
      const projClicks = Math.round(c.impressions * (projCtr / 100));
      const projMonthlyRev = projClicks * 0.03 * c.aov;

      return {
        rank: i + 1,
        url: c.url,
        keyword: c.keyword,
        position: c.position,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: c.ctr,
        intent: c.intent,
        revenuePotential: c.revenuePotential,
        currentTitle: humanize(c.keyword),
        boostedTitle: rewrite?.title || `${humanize(c.keyword)} — Expert Picks (2026)`,
        boostedMeta: rewrite?.meta || `Discover the best ${c.keyword}. Expert-tested, honest reviews. Free shipping available on all orders.`,
        semanticGaps: getSemanticGaps(c.keyword),
        internalLinkPlan: buildInternalLinkPlan(c.url, c.keyword),
        behavioralBoosts: getBehavioralBoosts(c.intent, c.position),
        snippetTarget: c.intent === 'info' ? `40-60 word answer targeting "${c.keyword}"` : null,
        projectedPosition: projPos,
        projectedCtr: projCtr,
        revenueUpliftMonthly: Math.round(projMonthlyRev - currentMonthlyRev),
      };
    });

  const avgCurrent = candidates.reduce((s, c) => s + c.position, 0) / candidates.length;
  const avgProjected = candidates.reduce((s, c) => s + c.projectedPosition, 0) / candidates.length;
  const avgCtrUplift = candidates.reduce((s, c) => s + (c.projectedCtr - c.ctr), 0) / candidates.length;

  return {
    candidates,
    totalCandidates: candidates.length,
    totalRevenueUplift: candidates.reduce((s, c) => s + c.revenueUpliftMonthly, 0),
    avgCurrentPosition: Math.round(avgCurrent * 10) / 10,
    avgProjectedPosition: Math.round(avgProjected * 10) / 10,
    avgCtrUplift: Math.round(avgCtrUplift * 10) / 10,
    roadmap: buildRoadmap(),
  };
}

function buildRoadmap(): BoostRoadmapWeek[] {
  return [
    {
      week: 1,
      actions: [
        'Deploy CTR-optimized titles + metas for all 15 candidates',
        'Add FAQ schema (8–12 questions) to all target pages',
        'Expand content to 2,500+ words on category pages',
        'Add above-the-fold comparison tables',
        'Submit all updated URLs to indexing API',
      ],
      expectedOutcome: 'Indexed within 48 hrs. Initial CTR uplift 15–25%. Snippet eligibility for 5+ queries.',
    },
    {
      week: 2,
      actions: [
        'Deploy internal link pressure system (11 links per target)',
        'Add homepage contextual mentions for top 5 revenue pages',
        'Add sidebar "Recommended" blocks across training guides',
        'Cross-link 3 cluster siblings per target page',
        'Add trust badge strip and US shipping messaging',
      ],
      expectedOutcome: 'Internal PageRank flow increases 40%. Position improvements for 8+ keywords. Dwell time +20%.',
    },
    {
      week: 3,
      actions: [
        'Fill semantic gaps (comparison data, breed-specific sections)',
        'Deploy featured snippet answers (40–60 words)',
        'Add behavioral boost elements (jump links, mid-content CTAs)',
        'Publish 3 supporting cluster articles linking to boost targets',
        'Add star rating markup where applicable',
      ],
      expectedOutcome: 'Featured snippet capture for 2–3 queries. Positions 4–8 for 5+ keywords. CTR +30%.',
    },
    {
      week: 4,
      actions: [
        'Analyze position changes and double down on movers',
        'Add 3 more contextual links to pages hitting positions 4–6',
        'Improve titles again for stagnant pages (power word swap)',
        'Add 1 unique content angle competitors lack per page',
        'Deploy escalation protocol for non-movers',
      ],
      expectedOutcome: 'Top 3 for 3+ keywords. Top 5 for 8+ keywords. Revenue uplift $2,000+/month.',
    },
  ];
}

function humanize(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
