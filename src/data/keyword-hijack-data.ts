/**
 * Keyword Hijack Strategy — Dog Training & Behavior Niche
 * 
 * 25 hijackable keywords with volume, intent, competitor analysis,
 * 60-day roadmap, and revenue projections.
 */

export interface HijackKeyword {
  rank: number;
  keyword: string;
  volume: number;
  intent: 'buy' | 'compare' | 'info';
  competitorUrl: string;
  competitorDomain: string;
  estimatedPosition: number;
  weakness: string;
  hijackPage: string;
  status: 'live' | 'planned' | 'building';
}

export interface HijackRoadmapPhase {
  phase: string;
  days: string;
  keywords: string[];
  actions: string[];
  expectedResult: string;
}

// ═══════════════════════════════════════════════════════════
// TOP 25 HIJACKABLE KEYWORDS — PRIORITIZED
// ═══════════════════════════════════════════════════════════

export const HIJACK_KEYWORDS: HijackKeyword[] = [
  // TIER 1 — Highest buy intent, position 6–15 (strike first)
  { rank: 1, keyword: 'best no pull harness for large dogs', volume: 3600, intent: 'buy', competitorUrl: 'k9ofmine.com/best-no-pull-harness', competitorDomain: 'k9ofmine.com', estimatedPosition: 8, weakness: 'Affiliate-only, no product schema, no purchase path', hijackPage: '/collections/all', status: 'live' },
  { rank: 2, keyword: 'front clip dog harness', volume: 2900, intent: 'buy', competitorUrl: 'chewy.com/front-clip-harness', competitorDomain: 'chewy.com', estimatedPosition: 7, weakness: 'Thin category page, no educational content', hijackPage: '/collections/all', status: 'live' },
  { rank: 3, keyword: 'anti pull harness for big dogs', volume: 1800, intent: 'buy', competitorUrl: 'amazon.com/dp/B08...', competitorDomain: 'amazon.com', estimatedPosition: 6, weakness: 'Zero educational content, generic listing', hijackPage: '/collections/all', status: 'live' },
  { rank: 4, keyword: 'stop dog pulling harness', volume: 2400, intent: 'buy', competitorUrl: 'petsafe.net/stop-pulling', competitorDomain: 'petsafe.net', estimatedPosition: 9, weakness: 'Single brand focus, no third-party comparison', hijackPage: '/collections/all', status: 'live' },
  { rank: 5, keyword: 'recall training leash for dogs', volume: 1400, intent: 'buy', competitorUrl: 'amazon.com/dp/B09...', competitorDomain: 'amazon.com', estimatedPosition: 10, weakness: 'No training methodology, just product listing', hijackPage: '/collections/all', status: 'live' },

  // TIER 2 — High commercial investigation
  { rank: 6, keyword: 'no pull harness vs gentle leader', volume: 1200, intent: 'compare', competitorUrl: 'k9ofmine.com/head-halter-vs-harness', competitorDomain: 'k9ofmine.com', estimatedPosition: 12, weakness: 'No product integration, affiliate-only', hijackPage: '/collections/all', status: 'live' },
  { rank: 7, keyword: 'long line leash for dog training', volume: 1900, intent: 'buy', competitorUrl: 'chewy.com/long-leashes', competitorDomain: 'chewy.com', estimatedPosition: 8, weakness: 'No material comparison, thin content', hijackPage: '/collections/all', status: 'live' },
  { rank: 8, keyword: 'dog harness sizing chart', volume: 2200, intent: 'info', competitorUrl: 'ruffwear.com/size-chart', competitorDomain: 'ruffwear.com', estimatedPosition: 11, weakness: 'Single brand, no breed-specific guidance', hijackPage: '/collections/all', status: 'live' },
  { rank: 9, keyword: 'how to stop a dog from pulling on leash', volume: 4100, intent: 'info', competitorUrl: 'akc.org/expert-advice/training/stop-pulling', competitorDomain: 'akc.org', estimatedPosition: 6, weakness: 'No product recommendations, no purchase path', hijackPage: '/collections/all', status: 'live' },
  { rank: 10, keyword: 'best training leash for puppies', volume: 1600, intent: 'buy', competitorUrl: 'chewy.com/puppy-leashes', competitorDomain: 'chewy.com', estimatedPosition: 14, weakness: 'No age-specific training advice', hijackPage: '/collections/all', status: 'live' },

  // TIER 3 — High-volume informational (featured snippet targets)
  { rank: 11, keyword: 'how to teach a dog recall', volume: 3200, intent: 'info', competitorUrl: 'akc.org/expert-advice/training/reliable-recall', competitorDomain: 'akc.org', estimatedPosition: 7, weakness: 'No product links, no structured steps', hijackPage: '/collections/all', status: 'live' },
  { rank: 12, keyword: 'harness or collar for walking', volume: 2800, intent: 'compare', competitorUrl: 'petmd.com/harness-vs-collar', competitorDomain: 'petmd.com', estimatedPosition: 9, weakness: 'No comparison table, no product schema', hijackPage: '/collections/all', status: 'live' },
  { rank: 13, keyword: 'no pull harness for small dogs', volume: 1500, intent: 'buy', competitorUrl: 'chewy.com/small-dog-harness', competitorDomain: 'chewy.com', estimatedPosition: 13, weakness: 'No breed-specific guide, thin content', hijackPage: '/collections/all', status: 'live' },
  { rank: 14, keyword: 'dog training clicker how to use', volume: 1100, intent: 'info', competitorUrl: 'akc.org/expert-advice/training/clicker-training', competitorDomain: 'akc.org', estimatedPosition: 11, weakness: 'No product integration', hijackPage: '/collections/all', status: 'planned' },
  { rank: 15, keyword: 'biothane long line for dogs', volume: 880, intent: 'buy', competitorUrl: 'etsy.com/biothane-leash', competitorDomain: 'etsy.com', estimatedPosition: 15, weakness: 'Individual sellers, no buying guide', hijackPage: '/collections/all', status: 'live' },

  // TIER 4 — Long-tail high-conversion
  { rank: 16, keyword: 'best harness for german shepherd that pulls', volume: 720, intent: 'buy', competitorUrl: 'k9ofmine.com/german-shepherd-harness', competitorDomain: 'k9ofmine.com', estimatedPosition: 10, weakness: 'Affiliate-only, no GSD-specific training', hijackPage: '/collections/all', status: 'live' },
  { rank: 17, keyword: 'no pull harness for pitbull', volume: 650, intent: 'buy', competitorUrl: 'amazon.com/dp/B07...', competitorDomain: 'amazon.com', estimatedPosition: 12, weakness: 'No breed-specific advice', hijackPage: '/collections/all', status: 'live' },
  { rank: 18, keyword: 'how to walk a reactive dog', volume: 1300, intent: 'info', competitorUrl: 'whole-dog-journal.com/reactive-dog-walking', competitorDomain: 'whole-dog-journal.com', estimatedPosition: 14, weakness: 'Paywalled, no product integration', hijackPage: '/collections/all', status: 'planned' },
  { rank: 19, keyword: 'training leash vs regular leash', volume: 900, intent: 'compare', competitorUrl: 'rover.com/blog/training-leash', competitorDomain: 'rover.com', estimatedPosition: 16, weakness: 'Service-focused, no product recs', hijackPage: '/collections/all', status: 'live' },
  { rank: 20, keyword: 'dog recall whistle training', volume: 580, intent: 'info', competitorUrl: 'spiritdogtraining.com/recall-whistle', competitorDomain: 'spiritdogtraining.com', estimatedPosition: 13, weakness: 'No products, training-only site', hijackPage: '/collections/all', status: 'live' },

  // TIER 5 — Expansion targets
  { rank: 21, keyword: 'dual clip harness for dogs', volume: 480, intent: 'buy', competitorUrl: 'chewy.com/dual-clip', competitorDomain: 'chewy.com', estimatedPosition: 18, weakness: 'No explanation of dual-clip advantage', hijackPage: '/collections/all', status: 'live' },
  { rank: 22, keyword: 'how to leash train an older dog', volume: 440, intent: 'info', competitorUrl: 'akc.org/expert-advice/training/older-dog-leash', competitorDomain: 'akc.org', estimatedPosition: 15, weakness: 'No product recommendations', hijackPage: '/collections/all', status: 'live' },
  { rank: 23, keyword: 'escape proof harness for dogs', volume: 520, intent: 'buy', competitorUrl: 'amazon.com/escape-proof-harness', competitorDomain: 'amazon.com', estimatedPosition: 11, weakness: 'No escape-proofing guide', hijackPage: '/collections/all', status: 'live' },
  { rank: 24, keyword: 'off leash training for beginners', volume: 760, intent: 'info', competitorUrl: 'rover.com/blog/off-leash-training', competitorDomain: 'rover.com', estimatedPosition: 17, weakness: 'Service site, no equipment guide', hijackPage: '/collections/all', status: 'live' },
  { rank: 25, keyword: 'puppy harness training tips', volume: 680, intent: 'info', competitorUrl: 'akc.org/expert-advice/training/puppy-harness', competitorDomain: 'akc.org', estimatedPosition: 14, weakness: 'No product integration, no age chart', hijackPage: '/collections/all', status: 'live' },
];

// ═══════════════════════════════════════════════════════════
// FEATURED SNIPPET TARGETS
// ═══════════════════════════════════════════════════════════

export interface SnippetTarget {
  query: string;
  snippetType: 'paragraph' | 'list' | 'table' | 'steps';
  targetPage: string;
  answerPreview: string;
}

export const FEATURED_SNIPPET_TARGETS: SnippetTarget[] = [
  {
    query: 'how to stop a dog from pulling on leash',
    snippetType: 'steps',
    targetPage: '/collections/all',
    answerPreview: '1. Switch to a front-clip harness. 2. Use the "Be a Tree" method — stop walking when the leash goes taut. 3. Reward loose-leash walking with treats. 4. Practice direction changes. 5. Stay consistent for 2–4 weeks.',
  },
  {
    query: 'front clip vs back clip harness',
    snippetType: 'table',
    targetPage: '/collections/all',
    answerPreview: 'Front clip harnesses reduce pulling by 40–60% by redirecting momentum. Back clip harnesses are more comfortable but don\'t correct pulling. Front clip is best for training; back clip is best for small or already-trained dogs.',
  },
  {
    query: 'how to teach a dog recall',
    snippetType: 'steps',
    targetPage: '/collections/all',
    answerPreview: '1. Start indoors with zero distractions. 2. Use a long line (15ft) in a fenced yard. 3. Call your dog\'s name + "come." 4. Reward immediately with high-value treats. 5. Never call for punishment. 6. Gradually add distractions over 8–12 weeks.',
  },
  {
    query: 'what size harness for my dog',
    snippetType: 'paragraph',
    targetPage: '/collections/all',
    answerPreview: 'Measure your dog\'s chest girth at the widest point behind the front legs. Add 2 inches for comfort. XS: 12–16", S: 16–20", M: 20–26", L: 26–32", XL: 32–40". Use the two-finger rule: you should be able to slide two fingers under any strap.',
  },
  {
    query: 'harness vs collar for dogs',
    snippetType: 'table',
    targetPage: '/collections/all',
    answerPreview: 'Harnesses distribute pressure across the chest, preventing neck injury. Collars are lighter but apply all force to the neck and trachea. Harnesses are recommended by vets for any dog that pulls, has breathing issues, or weighs over 15 lbs.',
  },
];

// ═══════════════════════════════════════════════════════════
// 60-DAY HIJACK ROADMAP
// ═══════════════════════════════════════════════════════════

export const HIJACK_ROADMAP: HijackRoadmapPhase[] = [
  {
    phase: 'Week 1–2: Deploy Core Hijack Pages',
    days: 'Days 1–14',
    keywords: [
      'best no pull harness for large dogs',
      'front clip dog harness',
      'anti pull harness for big dogs',
      'stop dog pulling harness',
      'recall training leash for dogs',
    ],
    actions: [
      'Deploy 5 primary hijack pages (2,500+ words each)',
      'Full schema stack: FAQ, Product, Breadcrumb, Article, HowTo',
      'Build 10+ internal links per page',
      'Submit all URLs to Google Indexing API',
      'Add comparison tables to every page',
    ],
    expectedResult: 'Indexed within 48 hours. Initial impressions within 7 days. Positions 20–40.',
  },
  {
    phase: 'Week 3–4: Semantic Expansion',
    days: 'Days 15–28',
    keywords: [
      'no pull harness vs gentle leader',
      'long line leash for dog training',
      'dog harness sizing chart',
      'how to stop a dog from pulling on leash',
      'best training leash for puppies',
    ],
    actions: [
      'Deploy 3 semantic support articles per primary page',
      'Cross-link all support articles to hub and collection pages',
      'Add "Customers Also Train With" blocks',
      'Publish 2 comparison articles',
      'Increase internal link density to 55+ per hub',
    ],
    expectedResult: 'Positions 12–25 for Tier 1 keywords. CTR uplift 20%+. First featured snippet captures.',
  },
  {
    phase: 'Week 5–6: CTR & Link Boost',
    days: 'Days 29–42',
    keywords: [
      'how to teach a dog recall',
      'harness or collar for walking',
      'no pull harness for small dogs',
      'biothane long line for dogs',
      'best harness for german shepherd that pulls',
    ],
    actions: [
      'Deploy CTR-optimized meta titles (power words + year + outcome)',
      'Add 5 contextual links from older blog posts to each hijack page',
      'Add homepage contextual mention for top 3 pages',
      'Add "Recommended for Training" sidebar block',
      'Footer cross-link block on all training pages',
    ],
    expectedResult: 'Positions 8–15 for Tier 1. Positions 15–20 for Tier 2. CTR +35%.',
  },
  {
    phase: 'Week 7–8: Domination Push',
    days: 'Days 43–60',
    keywords: [
      'no pull harness for pitbull',
      'escape proof harness for dogs',
      'off leash training for beginners',
      'puppy harness training tips',
      'dual clip harness for dogs',
    ],
    actions: [
      'Expand all Tier 1 pages to 3,500+ words',
      'Add breed-specific subsections (Lab, GSD, Pitbull, Bulldog, Golden)',
      'Launch bundle upsell on every hijack page',
      'Deploy AOV optimization ($65–85 target)',
      'Auto-expand clusters based on GSC impression data',
    ],
    expectedResult: 'Top 5 for 3+ keywords. Top 10 for 8+ keywords. $3,000+/month organic revenue.',
  },
];

// ═══════════════════════════════════════════════════════════
// REVENUE PROJECTION
// ═══════════════════════════════════════════════════════════

export const HIJACK_REVENUE_PROJECTION = {
  totalTargetVolume: HIJACK_KEYWORDS.reduce((s, k) => s + k.volume, 0),
  estimatedCaptureRate30Days: 0.08,
  estimatedCaptureRate60Days: 0.18,
  conversionRate: 0.03,
  aov: 68,
  get monthlyVisitors30() { return Math.round(this.totalTargetVolume * this.estimatedCaptureRate30Days); },
  get monthlyVisitors60() { return Math.round(this.totalTargetVolume * this.estimatedCaptureRate60Days); },
  get revenue30() { return Math.round(this.monthlyVisitors30 * this.conversionRate * this.aov); },
  get revenue60() { return Math.round(this.monthlyVisitors60 * this.conversionRate * this.aov); },
};
