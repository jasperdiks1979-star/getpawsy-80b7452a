/**
 * SEO Growth Engine Library
 * 
 * Top 10 Assault, Content Gap Hunter, Revenue Intelligence,
 * Growth Scores, and Action Queue Generator.
 */

// ============= TOP 10 ASSAULT TYPES =============

export interface Top10AssaultPage {
  url: string;
  keyword: string;
  avgPosition: number;
  impressions: number;
  clicks: number;
  ctr: number;
  internalLinks: number;
  wordCount: number;
  hasSchema: boolean;
  isIndexed: boolean;
  momentumScore: number; // 0-100
  isPriority: boolean; // pos 8-18, imp>50, ctr<2%
  boostRecommendations: BoostRecommendation[];
}

export interface BoostRecommendation {
  type: 'title_optimization' | 'meta_rewrite' | 'faq_schema' | 'internal_link_injection' | 'homepage_rotation' | 'rich_snippet';
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface Top10Metrics {
  assaultScore: number; // 0-100
  totalTracked: number;
  priorityPages: number;
  avgPositionAll: number;
  avgCtrAll: number;
  pagesWithSchema: number;
  pagesWithoutSchema: number;
}

// ============= CONTENT GAP TYPES =============

export interface ContentGap {
  id: string;
  category: string;
  type: 'missing_subtopic' | 'weak_section' | 'faq_gap' | 'comparison_gap' | 'cluster_opportunity';
  title: string;
  description: string;
  searchVolume: number;
  impressions: number;
  currentCoverage: 'none' | 'weak' | 'partial';
  action: 'new_page' | 'expand' | 'merge';
  priority: 'high' | 'medium' | 'low';
  relatedKeywords: string[];
}

export interface ContentGapMetrics {
  expansionScore: number; // 0-100
  totalGaps: number;
  newPageCandidates: number;
  expandCandidates: number;
  mergeCandidates: number;
  missingSubtopics: number;
  faqGaps: number;
  comparisonGaps: number;
}

// ============= REVENUE INTELLIGENCE TYPES =============

export interface RevenuePageData {
  url: string;
  keyword: string;
  impressions: number;
  clicks: number;
  avgPosition: number;
  ctr: number;
  internalLinks: number;
  category: string;
  revenue: number;
  addToCartRate: number;
  conversionRate: number;
  flag: 'high_traffic_low_conv' | 'low_traffic_high_conv' | 'top_revenue_low_vis' | 'high_vis_zero_clicks' | 'balanced' | null;
}

export interface RevenueMetrics {
  leverageScore: number; // 0-100
  totalTracked: number;
  highTrafficLowConv: number;
  lowTrafficHighConv: number;
  topRevenueLowVis: number;
  highVisZeroClicks: number;
  totalEstRevenue: number;
  avgConvRate: number;
}

// ============= GROWTH SCORES =============

export interface GrowthScores {
  rankingMomentum: number;
  contentExpansion: number;
  revenueLeverage: number;
}

// ============= ACTION QUEUE =============

export interface ActionItem {
  id: string;
  type: 'ranking_push' | 'content_expansion' | 'internal_link_boost' | 'revenue_optimization';
  title: string;
  description: string;
  targetUrl: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
}

// ============= TOP 10 ASSAULT CALCULATION =============

export function calculateTop10Metrics(pages: Top10AssaultPage[]): Top10Metrics {
  if (pages.length === 0) {
    return { assaultScore: 0, totalTracked: 0, priorityPages: 0, avgPositionAll: 0, avgCtrAll: 0, pagesWithSchema: 0, pagesWithoutSchema: 0 };
  }
  const priority = pages.filter(p => p.isPriority);
  const avgPos = pages.reduce((s, p) => s + p.avgPosition, 0) / pages.length;
  const avgCtr = pages.reduce((s, p) => s + p.ctr, 0) / pages.length;
  const withSchema = pages.filter(p => p.hasSchema).length;

  let score = 50;
  score += Math.min(20, priority.length * 3);
  score += Math.min(15, avgCtr * 3);
  score -= Math.min(20, (pages.length - withSchema) * 2);
  if (avgPos < 12) score += 10;
  score = Math.min(100, Math.max(0, Math.round(score)));

  return {
    assaultScore: score, totalTracked: pages.length, priorityPages: priority.length,
    avgPositionAll: Math.round(avgPos * 10) / 10, avgCtrAll: Math.round(avgCtr * 100) / 100,
    pagesWithSchema: withSchema, pagesWithoutSchema: pages.length - withSchema,
  };
}

// ============= CONTENT GAP CALCULATION =============

export function calculateContentGapMetrics(gaps: ContentGap[]): ContentGapMetrics {
  const newPage = gaps.filter(g => g.action === 'new_page').length;
  const expand = gaps.filter(g => g.action === 'expand').length;
  const merge = gaps.filter(g => g.action === 'merge').length;
  const missing = gaps.filter(g => g.type === 'missing_subtopic').length;
  const faq = gaps.filter(g => g.type === 'faq_gap').length;
  const comparison = gaps.filter(g => g.type === 'comparison_gap').length;

  let score = 50;
  score -= Math.min(25, newPage * 3);
  score -= Math.min(15, missing * 2);
  score += Math.min(10, merge * 2); // merges are positive (consolidation)
  score = Math.min(100, Math.max(0, Math.round(score)));

  return {
    expansionScore: score, totalGaps: gaps.length, newPageCandidates: newPage,
    expandCandidates: expand, mergeCandidates: merge,
    missingSubtopics: missing, faqGaps: faq, comparisonGaps: comparison,
  };
}

// ============= REVENUE CALCULATION =============

export function calculateRevenueMetrics(pages: RevenuePageData[]): RevenueMetrics {
  if (pages.length === 0) {
    return { leverageScore: 0, totalTracked: 0, highTrafficLowConv: 0, lowTrafficHighConv: 0, topRevenueLowVis: 0, highVisZeroClicks: 0, totalEstRevenue: 0, avgConvRate: 0 };
  }
  const htlc = pages.filter(p => p.flag === 'high_traffic_low_conv').length;
  const lthc = pages.filter(p => p.flag === 'low_traffic_high_conv').length;
  const trlv = pages.filter(p => p.flag === 'top_revenue_low_vis').length;
  const hvzc = pages.filter(p => p.flag === 'high_vis_zero_clicks').length;
  const totalRev = pages.reduce((s, p) => s + p.revenue, 0);
  const avgConv = pages.reduce((s, p) => s + p.conversionRate, 0) / pages.length;

  let score = 60;
  score -= Math.min(15, htlc * 4);
  score -= Math.min(10, hvzc * 3);
  score += Math.min(10, lthc * 2); // hidden gems
  if (avgConv > 2) score += 10;
  score = Math.min(100, Math.max(0, Math.round(score)));

  return {
    leverageScore: score, totalTracked: pages.length,
    highTrafficLowConv: htlc, lowTrafficHighConv: lthc,
    topRevenueLowVis: trlv, highVisZeroClicks: hvzc,
    totalEstRevenue: totalRev, avgConvRate: Math.round(avgConv * 100) / 100,
  };
}

// ============= ACTION QUEUE GENERATOR =============

export function generateActionQueue(
  top10Pages: Top10AssaultPage[],
  gaps: ContentGap[],
  revenuePages: RevenuePageData[]
): ActionItem[] {
  const actions: ActionItem[] = [];

  // 3 ranking pushes
  const pushTargets = top10Pages.filter(p => p.isPriority).sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 3);
  pushTargets.forEach((p, i) => {
    actions.push({
      id: `rp-${i}`, type: 'ranking_push',
      title: `Push "${p.keyword}" into Top 10`,
      description: `Currently at pos ${p.avgPosition.toFixed(1)} with ${p.impressions} impressions. ${p.boostRecommendations[0]?.description || 'Optimize title and meta.'}`,
      targetUrl: p.url, priority: 'high',
      expectedImpact: `+${Math.round(p.avgPosition - 8)} positions`,
    });
  });

  // 2 content expansions
  const expandTargets = gaps.filter(g => g.priority === 'high').slice(0, 2);
  expandTargets.forEach((g, i) => {
    actions.push({
      id: `ce-${i}`, type: 'content_expansion',
      title: g.title, description: g.description,
      targetUrl: g.category, priority: 'medium',
      expectedImpact: `Capture ${g.impressions} monthly impressions`,
    });
  });

  // 2 internal link boosts
  const linkTargets = top10Pages.filter(p => p.internalLinks < 6).sort((a, b) => a.internalLinks - b.internalLinks).slice(0, 2);
  linkTargets.forEach((p, i) => {
    actions.push({
      id: `lb-${i}`, type: 'internal_link_boost',
      title: `Boost internal links for "${p.keyword}"`,
      description: `Only ${p.internalLinks} inbound links. Add 3-4 contextual links from related guides.`,
      targetUrl: p.url, priority: 'medium',
      expectedImpact: `+${Math.min(5, 8 - p.internalLinks)} authority links`,
    });
  });

  // 1 revenue optimization
  const revTarget = revenuePages.filter(p => p.flag === 'high_traffic_low_conv').sort((a, b) => b.clicks - a.clicks)[0];
  if (revTarget) {
    actions.push({
      id: 'ro-0', type: 'revenue_optimization',
      title: `Optimize conversion on ${revTarget.url}`,
      description: `${revTarget.clicks} clicks but only ${revTarget.conversionRate}% conversion. Improve CTA placement and product presentation.`,
      targetUrl: revTarget.url, priority: 'high',
      expectedImpact: `+$${Math.round(revTarget.revenue * 0.3)} monthly revenue`,
    });
  }

  return actions;
}

// ============= MOCK DATA GENERATORS =============

export function generateMockTop10Pages(): Top10AssaultPage[] {
  const pages: Top10AssaultPage[] = [
    { url: '/guides/best-cat-trees-2026', keyword: 'best cat trees 2026', avgPosition: 12.3, impressions: 487, clicks: 24, ctr: 4.9, internalLinks: 9, wordCount: 2840, hasSchema: true, isIndexed: true, momentumScore: 82, isPriority: true, boostRecommendations: [
      { type: 'faq_schema', description: 'Add 5 FAQ schema entries for featured snippet', impact: 'high' },
      { type: 'internal_link_injection', description: 'Add links from 3 product pages', impact: 'medium' },
      { type: 'rich_snippet', description: 'Add review aggregate schema', impact: 'medium' },
    ]},
    { url: '/cat-trees-condos', keyword: 'cat trees for sale', avgPosition: 9.8, impressions: 612, clicks: 42, ctr: 6.9, internalLinks: 12, wordCount: 1920, hasSchema: true, isIndexed: true, momentumScore: 91, isPriority: false, boostRecommendations: [
      { type: 'rich_snippet', description: 'Already optimized — maintain current structure', impact: 'low' },
    ]},
    { url: '/guides/best-dog-bed-2026', keyword: 'best dog bed 2026', avgPosition: 15.7, impressions: 318, clicks: 8, ctr: 2.5, internalLinks: 8, wordCount: 2560, hasSchema: false, isIndexed: true, momentumScore: 68, isPriority: true, boostRecommendations: [
      { type: 'title_optimization', description: 'Add "for Large Dogs" to capture long-tail', impact: 'high' },
      { type: 'faq_schema', description: 'Add FAQ schema for "how to choose" queries', impact: 'high' },
      { type: 'homepage_rotation', description: 'Feature in homepage guide rotation', impact: 'medium' },
    ]},
    { url: '/guides/best-cat-litter-box-2026', keyword: 'best cat litter box', avgPosition: 18.2, impressions: 201, clicks: 4, ctr: 2.0, internalLinks: 7, wordCount: 2180, hasSchema: false, isIndexed: true, momentumScore: 55, isPriority: true, boostRecommendations: [
      { type: 'meta_rewrite', description: 'Add "self-cleaning" to meta for CTR boost', impact: 'high' },
      { type: 'internal_link_injection', description: 'Add links from 4 supporting guides', impact: 'high' },
      { type: 'faq_schema', description: 'Add FAQ schema with litter box comparison', impact: 'medium' },
    ]},
    { url: '/products/luxury-cat-tree-xl', keyword: 'large cat tree', avgPosition: 14.6, impressions: 278, clicks: 11, ctr: 4.0, internalLinks: 4, wordCount: 980, hasSchema: true, isIndexed: true, momentumScore: 72, isPriority: true, boostRecommendations: [
      { type: 'internal_link_injection', description: 'Add 3 more contextual links from guides', impact: 'high' },
      { type: 'homepage_rotation', description: 'Add to bestseller rotation', impact: 'medium' },
    ]},
    { url: '/guides/best-orthopedic-dog-bed', keyword: 'orthopedic dog bed', avgPosition: 16.4, impressions: 189, clicks: 5, ctr: 2.6, internalLinks: 5, wordCount: 2340, hasSchema: false, isIndexed: true, momentumScore: 58, isPriority: true, boostRecommendations: [
      { type: 'title_optimization', description: 'Add "Vet-Recommended" trust signal to title', impact: 'high' },
      { type: 'faq_schema', description: 'Add FAQ about orthopedic benefits', impact: 'medium' },
      { type: 'internal_link_injection', description: 'Add links from main dog bed cornerstone', impact: 'high' },
    ]},
    { url: '/products/orthopedic-dog-bed-large', keyword: 'orthopedic dog bed large', avgPosition: 11.2, impressions: 156, clicks: 9, ctr: 5.8, internalLinks: 5, wordCount: 870, hasSchema: true, isIndexed: true, momentumScore: 76, isPriority: false, boostRecommendations: [
      { type: 'rich_snippet', description: 'Add product review schema', impact: 'medium' },
    ]},
    { url: '/guides/indoor-cat-enrichment', keyword: 'indoor cat enrichment ideas', avgPosition: 19.1, impressions: 98, clicks: 1, ctr: 1.0, internalLinks: 2, wordCount: 1680, hasSchema: false, isIndexed: true, momentumScore: 42, isPriority: true, boostRecommendations: [
      { type: 'meta_rewrite', description: 'Rewrite meta with action-oriented language', impact: 'medium' },
      { type: 'internal_link_injection', description: 'Needs 4+ more inbound links', impact: 'high' },
      { type: 'faq_schema', description: 'Add enrichment FAQ cluster', impact: 'medium' },
    ]},
    { url: '/products/modern-cat-condo', keyword: 'modern cat condo', avgPosition: 13.5, impressions: 167, clicks: 7, ctr: 4.2, internalLinks: 3, wordCount: 920, hasSchema: true, isIndexed: true, momentumScore: 70, isPriority: true, boostRecommendations: [
      { type: 'internal_link_injection', description: 'Add links from cat tree guide', impact: 'high' },
    ]},
    { url: '/guides/outdoor-dog-games-2026', keyword: 'outdoor dog games', avgPosition: 17.8, impressions: 112, clicks: 2, ctr: 1.8, internalLinks: 3, wordCount: 1540, hasSchema: false, isIndexed: true, momentumScore: 45, isPriority: true, boostRecommendations: [
      { type: 'title_optimization', description: 'Add "25+" and "Fun" to title for CTR', impact: 'medium' },
      { type: 'faq_schema', description: 'Add FAQ about outdoor safety', impact: 'medium' },
    ]},
  ];
  return pages;
}

export function generateMockContentGaps(): ContentGap[] {
  return [
    // Cat Trees cluster
    { id: 'g1', category: 'Cat Trees', type: 'missing_subtopic', title: 'Best Cat Trees for Small Apartments', description: 'High search volume query with no dedicated page. 890 monthly impressions detected in GSC.', searchVolume: 890, impressions: 890, currentCoverage: 'none', action: 'new_page', priority: 'high', relatedKeywords: ['compact cat tree', 'small space cat furniture', 'apartment cat tree'] },
    { id: 'g2', category: 'Cat Trees', type: 'faq_gap', title: 'How Much Should a Cat Tree Cost?', description: 'Frequent "People Also Ask" query without FAQ coverage.', searchVolume: 540, impressions: 320, currentCoverage: 'none', action: 'expand', priority: 'medium', relatedKeywords: ['cat tree price range', 'affordable cat tree', 'premium cat tree worth it'] },
    { id: 'g3', category: 'Cat Trees', type: 'comparison_gap', title: 'Cat Tree vs Cat Shelves Comparison', description: 'Missing comparison content for a high-intent query.', searchVolume: 420, impressions: 280, currentCoverage: 'none', action: 'new_page', priority: 'medium', relatedKeywords: ['cat shelves vs tree', 'wall mounted vs floor cat furniture'] },
    { id: 'g4', category: 'Cat Trees', type: 'cluster_opportunity', title: 'DIY Cat Tree Guide', description: 'Supporting cluster content to build topical authority.', searchVolume: 1200, impressions: 0, currentCoverage: 'none', action: 'new_page', priority: 'low', relatedKeywords: ['homemade cat tree', 'build cat tree'] },
    { id: 'g5', category: 'Cat Trees', type: 'weak_section', title: 'Senior Cat Tree Recommendations', description: 'Existing guide mentions seniors briefly but lacks depth.', searchVolume: 380, impressions: 180, currentCoverage: 'weak', action: 'expand', priority: 'high', relatedKeywords: ['cat tree for older cats', 'low platform cat tree'] },
    // Dog Beds cluster
    { id: 'g6', category: 'Dog Beds', type: 'missing_subtopic', title: 'Best Cooling Dog Beds for Summer', description: 'Seasonal query with no dedicated content. Peak in May-August.', searchVolume: 720, impressions: 450, currentCoverage: 'none', action: 'new_page', priority: 'high', relatedKeywords: ['cooling dog bed', 'summer dog bed', 'gel cooling pad dog'] },
    { id: 'g7', category: 'Dog Beds', type: 'faq_gap', title: 'How Often Should You Replace a Dog Bed?', description: 'Common question without dedicated FAQ coverage.', searchVolume: 310, impressions: 190, currentCoverage: 'none', action: 'expand', priority: 'medium', relatedKeywords: ['dog bed lifespan', 'when to buy new dog bed'] },
    { id: 'g8', category: 'Dog Beds', type: 'comparison_gap', title: 'Memory Foam vs Bolster Dog Bed', description: 'Direct comparison missing for high-intent shoppers.', searchVolume: 380, impressions: 220, currentCoverage: 'none', action: 'new_page', priority: 'medium', relatedKeywords: ['memory foam dog bed review', 'bolster bed for dogs'] },
    // Cat Litter cluster
    { id: 'g9', category: 'Cat Litter', type: 'missing_subtopic', title: 'Best Cat Litter for Odor Control', description: 'Top search query in cluster without dedicated page.', searchVolume: 1100, impressions: 620, currentCoverage: 'none', action: 'new_page', priority: 'high', relatedKeywords: ['odor free cat litter', 'best smell absorbing litter'] },
    { id: 'g10', category: 'Cat Litter', type: 'faq_gap', title: 'How Often to Change Cat Litter?', description: 'PAA query appearing frequently with no FAQ schema.', searchVolume: 850, impressions: 380, currentCoverage: 'weak', action: 'expand', priority: 'medium', relatedKeywords: ['cat litter change frequency', 'when to scoop litter box'] },
    { id: 'g11', category: 'Cat Litter', type: 'weak_section', title: 'Flushable Cat Litter Safety', description: 'Brief mention in main guide but lacks safety depth.', searchVolume: 280, impressions: 120, currentCoverage: 'partial', action: 'merge', priority: 'low', relatedKeywords: ['is flushable litter safe', 'biodegradable cat litter'] },
    // Dog Activities cluster
    { id: 'g12', category: 'Dog Activities', type: 'cluster_opportunity', title: 'Best Dog Toys for Mental Stimulation', description: 'Cluster opportunity to build topical authority around dog enrichment.', searchVolume: 960, impressions: 0, currentCoverage: 'none', action: 'new_page', priority: 'medium', relatedKeywords: ['puzzle toys for dogs', 'brain games for dogs'] },
  ];
}

export function generateMockRevenuePages(): RevenuePageData[] {
  return [
    { url: '/products/luxury-cat-tree-xl', keyword: 'large cat tree', impressions: 278, clicks: 11, avgPosition: 14.6, ctr: 4.0, internalLinks: 4, category: 'Cat Trees', revenue: 1240, addToCartRate: 8.2, conversionRate: 3.1, flag: null },
    { url: '/products/modern-cat-condo', keyword: 'modern cat condo', impressions: 167, clicks: 7, avgPosition: 13.5, ctr: 4.2, internalLinks: 3, category: 'Cat Trees', revenue: 890, addToCartRate: 6.8, conversionRate: 2.8, flag: null },
    { url: '/products/orthopedic-dog-bed-large', keyword: 'orthopedic dog bed large', impressions: 156, clicks: 9, avgPosition: 11.2, ctr: 5.8, internalLinks: 5, category: 'Dog Beds', revenue: 1680, addToCartRate: 9.1, conversionRate: 4.2, flag: null },
    { url: '/products/self-cleaning-litter-box', keyword: 'self cleaning litter box', impressions: 312, clicks: 14, avgPosition: 16.8, ctr: 4.5, internalLinks: 1, category: 'Cat Litter', revenue: 420, addToCartRate: 3.2, conversionRate: 1.1, flag: 'high_traffic_low_conv' },
    { url: '/products/sisal-scratching-post', keyword: 'sisal scratching post', impressions: 89, clicks: 3, avgPosition: 22.1, ctr: 3.4, internalLinks: 2, category: 'Cat Trees', revenue: 1120, addToCartRate: 12.5, conversionRate: 5.8, flag: 'low_traffic_high_conv' },
    { url: '/products/interactive-dog-toy', keyword: 'interactive dog toy', impressions: 45, clicks: 1, avgPosition: 28.4, ctr: 2.2, internalLinks: 0, category: 'Dog Activities', revenue: 980, addToCartRate: 11.2, conversionRate: 4.9, flag: 'top_revenue_low_vis' },
    { url: '/products/cat-window-perch', keyword: 'cat window perch', impressions: 234, clicks: 0, avgPosition: 19.5, ctr: 0, internalLinks: 1, category: 'Cat Trees', revenue: 0, addToCartRate: 0, conversionRate: 0, flag: 'high_vis_zero_clicks' },
    { url: '/products/elevated-dog-bowl', keyword: 'elevated dog bowl', impressions: 178, clicks: 6, avgPosition: 15.3, ctr: 3.4, internalLinks: 2, category: 'Dog Feeding', revenue: 340, addToCartRate: 5.1, conversionRate: 2.1, flag: null },
    { url: '/products/heated-cat-bed', keyword: 'heated cat bed', impressions: 142, clicks: 4, avgPosition: 17.9, ctr: 2.8, internalLinks: 1, category: 'Cat Comfort', revenue: 560, addToCartRate: 7.3, conversionRate: 3.4, flag: null },
    { url: '/products/dog-cooling-mat', keyword: 'dog cooling mat', impressions: 198, clicks: 5, avgPosition: 20.1, ctr: 2.5, internalLinks: 2, category: 'Dog Comfort', revenue: 280, addToCartRate: 4.2, conversionRate: 1.5, flag: 'high_traffic_low_conv' },
  ];
}
