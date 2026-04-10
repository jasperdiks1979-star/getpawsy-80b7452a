/**
 * Dog Training & Behavior — Competitor Intelligence Data
 * 
 * Researched competitor profiles for 5 high-intent keyword clusters.
 * Feeds the displacement engine and gap matrix dashboard.
 */

import type { CompetitorProfile } from '@/lib/competitor-displacement-engine';

// ═══════════════════════════════════════════════════════════
// KEYWORD CLUSTER 1: "best no pull dog harness"
// ═══════════════════════════════════════════════════════════

export const NO_PULL_HARNESS_COMPETITORS: CompetitorProfile[] = [
  {
    domain: 'petsafe.net',
    estimatedPosition: 1,
    wordCount: 2800,
    hasProductSchema: true,
    hasFaqSchema: true,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 55,
    contentDepthScore: 8,
    uxScore: 7,
    weaknesses: ['No comparison table', 'Limited breed-specific advice', 'No training timeline'],
  },
  {
    domain: 'chewy.com',
    estimatedPosition: 2,
    wordCount: 1600,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 70,
    contentDepthScore: 5,
    uxScore: 8,
    weaknesses: ['No FAQ schema', 'Thin editorial content', 'Generic category page', 'No behavioral science'],
  },
  {
    domain: 'amazon.com',
    estimatedPosition: 3,
    wordCount: 400,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 200,
    contentDepthScore: 2,
    uxScore: 6,
    weaknesses: ['Zero educational content', 'No expert authority', 'Generic listing', 'No training guidance'],
  },
  {
    domain: 'rfrenchbulldog.com',
    estimatedPosition: 5,
    wordCount: 3200,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: false,
    hasReviewSchema: false,
    internalLinks: 18,
    contentDepthScore: 7,
    uxScore: 5,
    weaknesses: ['No product schema', 'Poor mobile UX', 'Missing breadcrumbs', 'No purchase path'],
  },
  {
    domain: 'k9ofmine.com',
    estimatedPosition: 4,
    wordCount: 4500,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 35,
    contentDepthScore: 9,
    uxScore: 7,
    weaknesses: ['Affiliate-only — no own products', 'No product schema', 'No bundle/upsell logic', 'Slow LCP'],
  },
];

// ═══════════════════════════════════════════════════════════
// KEYWORD CLUSTER 2: "dog training leash long line"
// ═══════════════════════════════════════════════════════════

export const LONG_LINE_COMPETITORS: CompetitorProfile[] = [
  {
    domain: 'amazon.com',
    estimatedPosition: 1,
    wordCount: 350,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 180,
    contentDepthScore: 1,
    uxScore: 6,
    weaknesses: ['Zero educational content', 'No recall training guidance', 'No length comparison'],
  },
  {
    domain: 'chewy.com',
    estimatedPosition: 2,
    wordCount: 800,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 60,
    contentDepthScore: 3,
    uxScore: 7,
    weaknesses: ['No training methodology', 'No material comparison', 'Thin category copy'],
  },
  {
    domain: 'sportdogbrand.com',
    estimatedPosition: 4,
    wordCount: 2100,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 25,
    contentDepthScore: 6,
    uxScore: 7,
    weaknesses: ['No FAQ schema', 'Limited length guide', 'No recall protocol'],
  },
  {
    domain: 'mendota-products.com',
    estimatedPosition: 5,
    wordCount: 1400,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: false,
    hasReviewSchema: true,
    internalLinks: 15,
    contentDepthScore: 5,
    uxScore: 5,
    weaknesses: ['No breadcrumbs', 'No FAQ', 'Outdated design', 'Poor mobile experience'],
  },
  {
    domain: 'k9ofmine.com',
    estimatedPosition: 3,
    wordCount: 3800,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 30,
    contentDepthScore: 8,
    uxScore: 7,
    weaknesses: ['Affiliate only', 'No purchase path', 'No product schema', 'No bundle logic'],
  },
];

// ═══════════════════════════════════════════════════════════
// KEYWORD CLUSTER 3: "stop dog pulling harness"
// ═══════════════════════════════════════════════════════════

export const STOP_PULLING_COMPETITORS: CompetitorProfile[] = [
  {
    domain: 'petsafe.net',
    estimatedPosition: 1,
    wordCount: 2400,
    hasProductSchema: true,
    hasFaqSchema: true,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 50,
    contentDepthScore: 7,
    uxScore: 7,
    weaknesses: ['Single brand focus', 'No third-party comparisons', 'No step-by-step training protocol'],
  },
  {
    domain: 'akc.org',
    estimatedPosition: 2,
    wordCount: 3000,
    hasProductSchema: false,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 40,
    contentDepthScore: 8,
    uxScore: 6,
    weaknesses: ['No product recommendations', 'No purchase path', 'No FAQ schema', 'No product schema'],
  },
  {
    domain: 'petmd.com',
    estimatedPosition: 3,
    wordCount: 2200,
    hasProductSchema: false,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 35,
    contentDepthScore: 7,
    uxScore: 7,
    weaknesses: ['No product schema', 'No FAQ schema', 'No comparison tables', 'No conversion elements'],
  },
  {
    domain: 'chewy.com',
    estimatedPosition: 4,
    wordCount: 1200,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 55,
    contentDepthScore: 4,
    uxScore: 8,
    weaknesses: ['Thin editorial', 'No training methodology', 'No behavioral science'],
  },
  {
    domain: 'whole-dog-journal.com',
    estimatedPosition: 6,
    wordCount: 3500,
    hasProductSchema: false,
    hasFaqSchema: false,
    hasBreadcrumbSchema: false,
    hasReviewSchema: false,
    internalLinks: 20,
    contentDepthScore: 9,
    uxScore: 4,
    weaknesses: ['No structured data at all', 'Paywalled content', 'Poor mobile UX', 'No product integration'],
  },
];

// ═══════════════════════════════════════════════════════════
// KEYWORD CLUSTER 4: "dog recall training leash"
// ═══════════════════════════════════════════════════════════

export const RECALL_LEASH_COMPETITORS: CompetitorProfile[] = [
  {
    domain: 'amazon.com',
    estimatedPosition: 1,
    wordCount: 300,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 160,
    contentDepthScore: 1,
    uxScore: 6,
    weaknesses: ['Zero training content', 'No recall methodology', 'No breed recommendations'],
  },
  {
    domain: 'akc.org',
    estimatedPosition: 3,
    wordCount: 2800,
    hasProductSchema: false,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 30,
    contentDepthScore: 8,
    uxScore: 6,
    weaknesses: ['No product schema', 'No FAQ schema', 'No product links', 'No conversion path'],
  },
  {
    domain: 'rover.com',
    estimatedPosition: 4,
    wordCount: 1800,
    hasProductSchema: false,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 25,
    contentDepthScore: 6,
    uxScore: 8,
    weaknesses: ['No product recommendations', 'No FAQ', 'Service-focused not product-focused'],
  },
  {
    domain: 'chewy.com',
    estimatedPosition: 2,
    wordCount: 900,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 50,
    contentDepthScore: 3,
    uxScore: 7,
    weaknesses: ['No recall training guide', 'Thin category content', 'No comparison table'],
  },
  {
    domain: 'spiritdogtraining.com',
    estimatedPosition: 5,
    wordCount: 4200,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 20,
    contentDepthScore: 9,
    uxScore: 6,
    weaknesses: ['Training-only — no products', 'No product schema', 'No purchase path', 'Limited internal links'],
  },
];

// ═══════════════════════════════════════════════════════════
// KEYWORD CLUSTER 5: "best harness for large dogs that pull"
// ═══════════════════════════════════════════════════════════

export const LARGE_DOG_HARNESS_COMPETITORS: CompetitorProfile[] = [
  {
    domain: 'k9ofmine.com',
    estimatedPosition: 1,
    wordCount: 5200,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: true,
    hasReviewSchema: false,
    internalLinks: 40,
    contentDepthScore: 9,
    uxScore: 7,
    weaknesses: ['Affiliate-only', 'No own products', 'No product schema', 'No bundle/upsell'],
  },
  {
    domain: 'chewy.com',
    estimatedPosition: 2,
    wordCount: 1100,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 65,
    contentDepthScore: 4,
    uxScore: 8,
    weaknesses: ['No FAQ', 'No breed-specific sizing', 'Thin editorial', 'No training tips'],
  },
  {
    domain: 'amazon.com',
    estimatedPosition: 3,
    wordCount: 500,
    hasProductSchema: true,
    hasFaqSchema: false,
    hasBreadcrumbSchema: true,
    hasReviewSchema: true,
    internalLinks: 190,
    contentDepthScore: 2,
    uxScore: 6,
    weaknesses: ['Zero educational content', 'No expert authority', 'Generic listing'],
  },
  {
    domain: 'topdogstips.com',
    estimatedPosition: 4,
    wordCount: 3800,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: false,
    hasReviewSchema: false,
    internalLinks: 22,
    contentDepthScore: 7,
    uxScore: 5,
    weaknesses: ['No product schema', 'Poor mobile UX', 'Missing breadcrumbs', 'Slow site speed'],
  },
  {
    domain: 'rfrenchbulldog.com',
    estimatedPosition: 6,
    wordCount: 2900,
    hasProductSchema: false,
    hasFaqSchema: true,
    hasBreadcrumbSchema: false,
    hasReviewSchema: false,
    internalLinks: 15,
    contentDepthScore: 6,
    uxScore: 5,
    weaknesses: ['Breed-specific only', 'No product schema', 'No breadcrumbs', 'Limited audience'],
  },
];

// ═══════════════════════════════════════════════════════════
// GETPAWSY — OUR CURRENT STATE (for gap analysis)
// ═══════════════════════════════════════════════════════════

export const GETPAWSY_TRAINING_METRICS = {
  noPullHarness: {
    wordCount: 3200,
    internalLinks: 55,
    schemas: ['Product', 'FAQ', 'Breadcrumb', 'Review', 'Collection', 'Organization'],
  },
  longLine: {
    wordCount: 2800,
    internalLinks: 45,
    schemas: ['Product', 'FAQ', 'Breadcrumb', 'Review', 'Collection', 'Organization'],
  },
  stopPulling: {
    wordCount: 3500,
    internalLinks: 50,
    schemas: ['Product', 'FAQ', 'Breadcrumb', 'Review', 'Collection', 'Organization'],
  },
  recallLeash: {
    wordCount: 2600,
    internalLinks: 40,
    schemas: ['Product', 'FAQ', 'Breadcrumb', 'Review', 'Collection', 'Organization'],
  },
  largeDogHarness: {
    wordCount: 3000,
    internalLinks: 48,
    schemas: ['Product', 'FAQ', 'Breadcrumb', 'Review', 'Collection', 'Organization'],
  },
};

// ═══════════════════════════════════════════════════════════
// CTR WARFARE — META UPGRADES
// ═══════════════════════════════════════════════════════════

export interface CTRUpgrade {
  keyword: string;
  competitorTitle: string;
  competitorDesc: string;
  getpawsyTitle: string;
  getpawsyDesc: string;
  expectedCTRLift: string;
}

export const CTR_WARFARE_UPGRADES: CTRUpgrade[] = [
  {
    keyword: 'best no pull dog harness',
    competitorTitle: 'Best No Pull Harness for Dogs',
    competitorDesc: 'Shop our selection of no pull harnesses for dogs of all sizes.',
    getpawsyTitle: 'Stop Dog Pulling Fast — Best No-Pull Harness (Trainer Approved 2026)',
    getpawsyDesc: 'Front-clip harnesses that reduce pulling by 40–60% in 1 walk. Tested by certified trainers. Sizes for 5–150 lb dogs. Free shipping on eligible orders over $35.',
    expectedCTRLift: '+35–45%',
  },
  {
    keyword: 'dog training leash long line',
    competitorTitle: 'Dog Training Leashes & Long Lines',
    competitorDesc: 'Find training leashes for your dog at great prices.',
    getpawsyTitle: 'Long Training Leash for Dogs — 15ft & 30ft Recall Lines (2026 Guide)',
    getpawsyDesc: 'Biothane & nylon long lines for recall training. Lightweight, waterproof, tangle-free. Step-by-step recall protocol included. US shipping.',
    expectedCTRLift: '+30–40%',
  },
  {
    keyword: 'stop dog pulling harness',
    competitorTitle: 'How to Stop Your Dog From Pulling',
    competitorDesc: 'Learn how to train your dog to stop pulling on the leash.',
    getpawsyTitle: 'Stop Dog Pulling Without Choking — 5 Trainer-Approved Methods (2026)',
    getpawsyDesc: 'Force-free methods that reduce pulling 40–60%. No prong collars. No choke chains. Step-by-step guide + recommended harnesses. Trainer approved.',
    expectedCTRLift: '+40–50%',
  },
  {
    keyword: 'dog recall training leash',
    competitorTitle: 'Recall Training for Dogs',
    competitorDesc: 'Train your dog to come when called with our recall guide.',
    getpawsyTitle: 'Master Dog Recall in 21 Days — Long Line Training Guide (2026)',
    getpawsyDesc: 'Complete recall training protocol with long line leash. Works for stubborn dogs. 15ft vs 30ft comparison. Includes mistake prevention checklist.',
    expectedCTRLift: '+35–45%',
  },
  {
    keyword: 'best harness for large dogs that pull',
    competitorTitle: 'Best Harness for Large Dogs',
    competitorDesc: 'Our picks for the best large dog harnesses.',
    getpawsyTitle: 'Best No-Pull Harness for Large Dogs (50+ lbs) — Heavy-Duty Tested 2026',
    getpawsyDesc: 'Tactical-grade harnesses for Labs, GSDs & giant breeds. Metal buckles, 1000D nylon, dual handles. Front-clip steering stops pulling day 1. US warehouse.',
    expectedCTRLift: '+30–40%',
  },
];

// ═══════════════════════════════════════════════════════════
// REVENUE & TRAFFIC SIMULATION
// ═══════════════════════════════════════════════════════════

export interface TrafficScenario {
  label: string;
  monthlyVisitors: number;
  conversionRate: number;
  aov: number;
  monthlyRevenue: number;
  threeMonthRevenue: number;
  sixMonthRevenue: number;
}

export const REVENUE_SCENARIOS: TrafficScenario[] = [
  {
    label: 'Launch (Month 1–2)',
    monthlyVisitors: 1200,
    conversionRate: 0.03,
    aov: 65,
    monthlyRevenue: 1200 * 0.03 * 65,
    threeMonthRevenue: 1200 * 0.03 * 65 * 3,
    sixMonthRevenue: 1200 * 0.03 * 65 * 6,
  },
  {
    label: 'Growth (Month 3–4)',
    monthlyVisitors: 5000,
    conversionRate: 0.035,
    aov: 68,
    monthlyRevenue: 5000 * 0.035 * 68,
    threeMonthRevenue: 5000 * 0.035 * 68 * 3,
    sixMonthRevenue: 5000 * 0.035 * 68 * 6,
  },
  {
    label: 'Scale (Month 5–6)',
    monthlyVisitors: 10000,
    conversionRate: 0.04,
    aov: 72,
    monthlyRevenue: 10000 * 0.04 * 72,
    threeMonthRevenue: 10000 * 0.04 * 72 * 3,
    sixMonthRevenue: 10000 * 0.04 * 72 * 6,
  },
  {
    label: 'Domination (Month 7+)',
    monthlyVisitors: 20000,
    conversionRate: 0.045,
    aov: 78,
    monthlyRevenue: 20000 * 0.045 * 78,
    threeMonthRevenue: 20000 * 0.045 * 78 * 3,
    sixMonthRevenue: 20000 * 0.045 * 78 * 6,
  },
];

// ═══════════════════════════════════════════════════════════
// 90-DAY ATTACK ROADMAP
// ═══════════════════════════════════════════════════════════

export interface AttackPhase {
  phase: string;
  days: string;
  actions: string[];
  expectedOutcome: string;
}

export const ATTACK_ROADMAP: AttackPhase[] = [
  {
    phase: 'Foundation Strike',
    days: 'Days 1–14',
    actions: [
      'Deploy all 5 keyword cluster pages with 3000+ words each',
      'Implement full schema stack (Product, FAQ, Breadcrumb, Review)',
      'Build 55+ internal links per cluster hub',
      'Launch comparison tables on every collection page',
      'Submit all URLs to Google Indexing API',
    ],
    expectedOutcome: 'Indexed within 48 hours. Position 15–30 for all 5 target keywords.',
  },
  {
    phase: 'Content Depth Assault',
    days: 'Days 15–30',
    actions: [
      'Publish 2 cluster articles per week (8 total)',
      'Add breed-specific harness guides (Lab, GSD, Pitbull, Bulldog)',
      'Build behavior science explainer sections',
      'Create step-by-step training timeline graphics',
      'Add "Customers Also Train With" cross-sell blocks',
    ],
    expectedOutcome: 'Position 8–15 for primary keywords. CTR uplift 25%+.',
  },
  {
    phase: 'Authority Escalation',
    days: 'Days 31–60',
    actions: [
      'Launch Dog Training Resource Center hub page',
      'Add expert-style content with veterinary citations',
      'Build comparison pages for every sub-niche',
      'Implement "Last Updated" signals on all guides',
      'Increase internal link density to 60+ per hub',
    ],
    expectedOutcome: 'Position 5–10 for 3/5 keywords. Featured snippet capture for 2+ queries.',
  },
  {
    phase: 'SERP Domination',
    days: 'Days 61–90',
    actions: [
      'Exploit competitor weakness pages (thin content, no FAQ)',
      'Add weekly blog reinforcement (2 articles/week)',
      'Launch bundle upsell on all product pages',
      'Implement AOV optimization ($65–85 target)',
      'Auto-expand clusters based on GSC impression data',
    ],
    expectedOutcome: 'Top 3 for 3+ keywords. $5,000+/month revenue from organic training niche.',
  },
];
