/**
 * 🔥 HYPER AGGRESSIVE MODE — Amazon-Level Internal Domination Engine
 * 
 * Activates maximum-intensity internal authority concentration:
 * - Link Saturation: 8-12 internal links per page (vs normal 3-5)
 * - Semantic Flooding: Every page targets 3-5 keyword variations
 * - SERP Suppression: Outrank competitors by cluster overbuild
 * - PageRank Funneling: All roads lead to money pages
 * - Anchor Carpet Bombing: Full anchor text spectrum coverage
 * - Crawl Path Optimization: Every money page ≤2 clicks from homepage
 * 
 * ⚠️ SAFETY: Still respects Global Safety Lock and 30-day freeze rules.
 * This is aggressive but NOT reckless — no spam, no cloaking, no PBNs.
 */

import { SEO_CONTENT_CLUSTERS, type ContentCluster } from './seo-content-clusters';

// ============= TYPES =============

export interface HyperAggressiveConfig {
  enabled: boolean;
  linksPerPage: number;           // 8-12 (Amazon averages 10+)
  anchorVariations: number;       // 6-8 variations per target
  semanticH2sPerPage: number;     // 4-6 (vs normal 2-3)
  faqEntriesPerPage: number;      // 8-12 (vs normal 3-5)
  clusterOverbuildFactor: number; // 2x-3x normal content volume
  pageRankFunnelTargets: string[];
  crawlDepthMax: number;          // Force ≤2
  contentMinWords: number;        // 2,200+ per page
  suppressionMode: boolean;       // Target competitor keywords
}

export interface LinkSaturationPlan {
  sourceSlug: string;
  links: Array<{
    targetSlug: string;
    anchorText: string;
    anchorType: 'exact' | 'partial' | 'branded' | 'generic' | 'naked-url';
    placement: 'intro' | 'body' | 'comparison-table' | 'faq' | 'related-block' | 'cta';
    priority: number;
  }>;
  totalLinks: number;
  density: number; // links per 1000 words
}

export interface SemanticFloodPlan {
  slug: string;
  primaryKW: string;
  semanticVariations: string[];
  h2Targets: string[];
  entityCoverage: string[];
  contentGapKeywords: string[];
  estimatedWordCount: number;
}

export interface SerpSuppressionTarget {
  keyword: string;
  ourSlug: string;
  ourPosition: number;
  competitorPositions: Array<{ domain: string; position: number }>;
  suppressionActions: string[];
  aggressivenessScore: number; // 1-10
}

export interface PageRankFunnel {
  moneyPage: string;
  funnelSources: Array<{
    slug: string;
    linkCount: number;
    anchorDistribution: Record<string, number>;
  }>;
  totalInboundLinks: number;
  estimatedPageRankShare: number;
}

export interface ClusterOverbuild {
  cluster: string;
  currentPages: number;
  targetPages: number;
  missingTopics: string[];
  contentCalendar: Array<{
    week: number;
    slug: string;
    title: string;
    wordCount: number;
    linkedTo: string[];
  }>;
}

export interface HyperAggressiveResult {
  config: HyperAggressiveConfig;
  linkSaturation: LinkSaturationPlan[];
  semanticFlood: SemanticFloodPlan[];
  serpSuppression: SerpSuppressionTarget[];
  pageRankFunnels: PageRankFunnel[];
  clusterOverbuilds: ClusterOverbuild[];
  totalNewLinks: number;
  totalNewContent: number;
  aggressivenessScore: number; // 1-100
  projectedImpact: {
    impressionLift: string;
    positionLift: string;
    clickGrowth: string;
    timeToResults: string;
  };
  warnings: string[];
}

// ============= DEFAULT CONFIG =============

export const HYPER_AGGRESSIVE_DEFAULTS: HyperAggressiveConfig = {
  enabled: false,
  linksPerPage: 10,
  anchorVariations: 7,
  semanticH2sPerPage: 5,
  faqEntriesPerPage: 10,
  clusterOverbuildFactor: 2.5,
  pageRankFunnelTargets: [
    'bestsellers',
    'collections/best-cat-litter-boxes',
    'collections/best-interactive-dog-toys',
    'best-interactive-dog-toys',
    'best-cat-toys-for-indoor-cats',
    'best-slow-feeder-dog-bowls',
  ],
  crawlDepthMax: 2,
  contentMinWords: 2200,
  suppressionMode: true,
};

// ============= ANCHOR TEXT SPECTRUM =============

const ANCHOR_SPECTRUM = {
  exact: 0.10,
  partial: 0.25,
  branded: 0.30,
  generic: 0.25,
  'naked-url': 0.10,
} as const;

function generateAnchorSpectrum(primaryKW: string, slug: string): Array<{ text: string; type: keyof typeof ANCHOR_SPECTRUM }> {
  const words = primaryKW.split(' ');
  const partial1 = words.length > 2 ? words.slice(0, 2).join(' ') : primaryKW;
  const partial2 = words.length > 2 ? words.slice(1).join(' ') : `best ${primaryKW}`;

  return [
    { text: primaryKW, type: 'exact' },
    { text: `best ${primaryKW}`, type: 'partial' },
    { text: partial1, type: 'partial' },
    { text: partial2, type: 'partial' },
    { text: `GetPawsy's ${primaryKW} guide`, type: 'branded' },
    { text: 'GetPawsy recommends', type: 'branded' },
    { text: 'see our expert picks', type: 'generic' },
    { text: 'read the full guide', type: 'generic' },
    { text: 'learn more here', type: 'generic' },
    { text: `getpawsy.pet/${slug}`, type: 'naked-url' },
  ];
}

// ============= LINK SATURATION ENGINE =============

function buildLinkSaturationPlan(
  sourceSlug: string,
  allClusters: ContentCluster[],
  moneyPages: string[],
  config: HyperAggressiveConfig
): LinkSaturationPlan {
  const links: LinkSaturationPlan['links'] = [];
  const placements: LinkSaturationPlan['links'][0]['placement'][] = [
    'intro', 'body', 'body', 'comparison-table', 'faq', 'faq', 'related-block', 'cta',
  ];

  // 1. Always link to money pages first (Amazon pattern: every page links to top sellers)
  for (const mp of moneyPages) {
    if (mp === sourceSlug) continue;
    const cluster = allClusters.find(c => c.pillarSlug === mp);
    if (!cluster) continue;

    const anchors = generateAnchorSpectrum(cluster.pillarKeyword, mp);
    const anchor = anchors[links.length % anchors.length];

    links.push({
      targetSlug: mp,
      anchorText: anchor.text,
      anchorType: anchor.type,
      placement: placements[links.length % placements.length],
      priority: 10,
    });
  }

  // 2. Link to cluster siblings
  const myCluster = allClusters.find(c =>
    c.pillarSlug === sourceSlug || c.blogTopics.some(t => t.slug === sourceSlug)
  );

  if (myCluster) {
    // Link to pillar if we're a subtopic
    if (myCluster.pillarSlug !== sourceSlug) {
      const anchors = generateAnchorSpectrum(myCluster.pillarKeyword, myCluster.pillarSlug);
      links.push({
        targetSlug: myCluster.pillarSlug,
        anchorText: anchors[0].text,
        anchorType: 'exact',
        placement: 'intro',
        priority: 9,
      });
    }

    // Link to siblings
    for (const topic of myCluster.blogTopics) {
      if (topic.slug === sourceSlug) continue;
      if (links.length >= config.linksPerPage) break;

      links.push({
        targetSlug: topic.slug,
        anchorText: topic.targetKeyword,
        anchorType: 'partial',
        placement: placements[links.length % placements.length],
        priority: 7,
      });
    }
  }

  // 3. Cross-cluster links (Amazon links across categories)
  for (const cluster of allClusters) {
    if (cluster.priority === 'deprioritized') continue;
    if (cluster === myCluster) continue;
    if (links.length >= config.linksPerPage) break;

    links.push({
      targetSlug: cluster.pillarSlug,
      anchorText: cluster.internalLinkAnchors[links.length % cluster.internalLinkAnchors.length] || cluster.pillarKeyword,
      anchorType: 'partial',
      placement: 'related-block',
      priority: 5,
    });
  }

  return {
    sourceSlug,
    links: links.slice(0, config.linksPerPage).sort((a, b) => b.priority - a.priority),
    totalLinks: Math.min(links.length, config.linksPerPage),
    density: Math.round((Math.min(links.length, config.linksPerPage) / config.contentMinWords) * 1000 * 10) / 10,
  };
}

// ============= SEMANTIC FLOOD ENGINE =============

function buildSemanticFloodPlan(cluster: ContentCluster): SemanticFloodPlan[] {
  const plans: SemanticFloodPlan[] = [];

  // Pillar page
  const pillarVariations = [
    cluster.pillarKeyword,
    ...cluster.secondaryKeywords,
    `${cluster.pillarKeyword} 2026`,
    `best ${cluster.pillarKeyword}`,
    `top ${cluster.pillarKeyword}`,
    `${cluster.pillarKeyword} guide`,
    `${cluster.pillarKeyword} reviews`,
  ];

  const pillarH2s = [
    `What Are the Best ${capitalize(cluster.pillarKeyword)}?`,
    `How to Choose the Right ${capitalize(cluster.pillarKeyword)}`,
    `${capitalize(cluster.pillarKeyword)} Comparison Table`,
    `Expert Tips for ${capitalize(cluster.pillarKeyword)}`,
    `Common Mistakes When Buying ${capitalize(cluster.pillarKeyword)}`,
    `FAQ: ${capitalize(cluster.pillarKeyword)}`,
  ];

  plans.push({
    slug: cluster.pillarSlug,
    primaryKW: cluster.pillarKeyword,
    semanticVariations: pillarVariations.slice(0, 8),
    h2Targets: pillarH2s.slice(0, 6),
    entityCoverage: extractEntities(cluster),
    contentGapKeywords: cluster.secondaryKeywords.map(kw => `${kw} for beginners`),
    estimatedWordCount: 3500,
  });

  // Support articles
  for (const topic of cluster.blogTopics) {
    const variations = [
      topic.targetKeyword,
      `${topic.targetKeyword} 2026`,
      `how to ${topic.targetKeyword}`,
      `why ${topic.targetKeyword}`,
      `${topic.targetKeyword} tips`,
    ];

    plans.push({
      slug: topic.slug,
      primaryKW: topic.targetKeyword,
      semanticVariations: variations,
      h2Targets: [
        `What Is ${capitalize(topic.targetKeyword)}?`,
        `Why ${capitalize(topic.targetKeyword)} Matters`,
        `How to ${capitalize(topic.targetKeyword)}`,
        `Expert Recommendations`,
      ],
      entityCoverage: extractEntities(cluster),
      contentGapKeywords: [`${topic.targetKeyword} mistakes`, `${topic.targetKeyword} alternatives`],
      estimatedWordCount: 2200,
    });
  }

  return plans;
}

// ============= CLUSTER OVERBUILD =============

function buildClusterOverbuild(cluster: ContentCluster, config: HyperAggressiveConfig): ClusterOverbuild {
  const current = 1 + cluster.blogTopics.length; // pillar + subtopics
  const target = Math.ceil(current * config.clusterOverbuildFactor);
  const missing = target - current;

  const missingTopics: string[] = [];
  const calendar: ClusterOverbuild['contentCalendar'] = [];
  const kw = cluster.pillarKeyword;

  const expansionIdeas = [
    { suffix: 'for-beginners', title: `${capitalize(kw)} for Beginners – Complete Starter Guide` },
    { suffix: 'vs-alternatives', title: `${capitalize(kw)} vs Alternatives – Which Is Best?` },
    { suffix: 'budget-picks', title: `Best Budget ${capitalize(kw)} Under $30 (2026)` },
    { suffix: 'premium-picks', title: `Premium ${capitalize(kw)} Worth the Investment` },
    { suffix: 'common-mistakes', title: `${capitalize(kw)} Mistakes Every Pet Owner Makes` },
    { suffix: 'by-breed', title: `${capitalize(kw)} by Breed Size – Small vs Large` },
    { suffix: 'safety-guide', title: `${capitalize(kw)} Safety: What to Watch Out For` },
    { suffix: 'cleaning-maintenance', title: `How to Clean & Maintain ${capitalize(kw)}` },
    { suffix: 'vet-recommendations', title: `What Vets Say About ${capitalize(kw)} (2026)` },
    { suffix: 'seasonal-guide', title: `Seasonal Guide to ${capitalize(kw)}` },
  ];

  for (let i = 0; i < Math.min(missing, expansionIdeas.length); i++) {
    const idea = expansionIdeas[i];
    const slug = `${cluster.pillarSlug}-${idea.suffix}`;
    missingTopics.push(slug);

    calendar.push({
      week: Math.floor(i / 2) + 1,
      slug,
      title: idea.title,
      wordCount: config.contentMinWords,
      linkedTo: [cluster.pillarSlug, ...cluster.blogTopics.slice(0, 2).map(t => t.slug)],
    });
  }

  return {
    cluster: cluster.name,
    currentPages: current,
    targetPages: target,
    missingTopics,
    contentCalendar: calendar,
  };
}

// ============= PAGERANK FUNNELS =============

function buildPageRankFunnels(
  allClusters: ContentCluster[],
  config: HyperAggressiveConfig
): PageRankFunnel[] {
  return config.pageRankFunnelTargets.map(mp => {
    const cluster = allClusters.find(c => c.pillarSlug === mp);
    const allSlugs = allClusters
      .filter(c => c.priority !== 'deprioritized')
      .flatMap(c => [c.pillarSlug, ...c.blogTopics.map(t => t.slug)])
      .filter(s => s !== mp);

    const sources = allSlugs.slice(0, 20).map(slug => {
      const anchors = cluster
        ? generateAnchorSpectrum(cluster.pillarKeyword, mp)
        : generateAnchorSpectrum(mp.replace(/-/g, ' '), mp);

      const distribution: Record<string, number> = {};
      for (const a of anchors.slice(0, 4)) {
        distribution[a.type] = (distribution[a.type] || 0) + 1;
      }

      return {
        slug,
        linkCount: 1,
        anchorDistribution: distribution,
      };
    });

    return {
      moneyPage: mp,
      funnelSources: sources,
      totalInboundLinks: sources.length,
      estimatedPageRankShare: Math.round((sources.length / allSlugs.length) * 100),
    };
  });
}

// ============= SERP SUPPRESSION =============

function buildSerpSuppression(
  pages: Array<{ slug: string; position: number; impressions: number }>,
  allClusters: ContentCluster[]
): SerpSuppressionTarget[] {
  // Target keywords where we rank 5-30 — these are suppression candidates
  const candidates = pages
    .filter(p => p.position >= 5 && p.position <= 30 && p.impressions > 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  return candidates.map(p => {
    const kw = p.slug.replace(/-/g, ' ');
    const aggressiveness = Math.min(10, Math.round((30 - p.position) / 3) + Math.min(3, Math.floor(p.impressions / 50)));

    const actions: string[] = [
      `Add ${Math.max(2, Math.ceil(aggressiveness / 2))} semantic H2 clusters`,
      `Expand to ${2200 + aggressiveness * 200}+ words`,
      `Add ${6 + aggressiveness} FAQ entries with schema`,
      `Inject ${Math.min(12, 6 + aggressiveness)} internal links`,
      'Add comparison table with competitor alternatives',
      'Add expert quote block',
    ];

    if (aggressiveness >= 7) {
      actions.push('Create 2 supporting micro-articles');
      actions.push('Add original data/statistics section');
    }
    if (aggressiveness >= 9) {
      actions.push('Build dedicated infographic for backlink magnet');
      actions.push('Publish social proof / case study section');
    }

    return {
      keyword: kw,
      ourSlug: p.slug,
      ourPosition: p.position,
      competitorPositions: [], // Would be populated from competitor_rankings table
      suppressionActions: actions,
      aggressivenessScore: aggressiveness,
    };
  });
}

// ============= HELPERS =============

function capitalize(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function extractEntities(cluster: ContentCluster): string[] {
  const entities = new Set<string>();
  entities.add(cluster.pillarKeyword);
  cluster.secondaryKeywords.forEach(kw => entities.add(kw));
  cluster.blogTopics.forEach(t => entities.add(t.targetKeyword));
  return Array.from(entities).slice(0, 10);
}

// ============= MAIN ENGINE =============

export function runHyperAggressiveEngine(
  pages: Array<{ slug: string; position: number; impressions: number; clicks: number }>,
  config: HyperAggressiveConfig = HYPER_AGGRESSIVE_DEFAULTS
): HyperAggressiveResult {
  const activeClusters = SEO_CONTENT_CLUSTERS.filter(c => c.priority !== 'deprioritized');
  const allSlugs = activeClusters.flatMap(c => [c.pillarSlug, ...c.blogTopics.map(t => t.slug)]);

  // Phase 1: Link Saturation
  const linkSaturation = allSlugs.map(slug =>
    buildLinkSaturationPlan(slug, activeClusters, config.pageRankFunnelTargets, config)
  );

  // Phase 2: Semantic Flooding
  const semanticFlood = activeClusters
    .filter(c => c.priority === 'critical' || c.priority === 'high')
    .flatMap(c => buildSemanticFloodPlan(c));

  // Phase 3: SERP Suppression
  const serpSuppression = config.suppressionMode
    ? buildSerpSuppression(pages, activeClusters)
    : [];

  // Phase 4: PageRank Funnels
  const pageRankFunnels = buildPageRankFunnels(activeClusters, config);

  // Phase 5: Cluster Overbuild
  const clusterOverbuilds = activeClusters
    .filter(c => c.priority === 'critical' || c.priority === 'high')
    .map(c => buildClusterOverbuild(c, config));

  // Calculate totals
  const totalNewLinks = linkSaturation.reduce((s, l) => s + l.totalLinks, 0);
  const totalNewContent = clusterOverbuilds.reduce((s, c) => s + c.missingTopics.length, 0);

  // Aggressiveness score (0-100)
  const aggressivenessScore = Math.min(100, Math.round(
    (config.linksPerPage / 12) * 25 +
    (config.faqEntriesPerPage / 12) * 15 +
    (config.clusterOverbuildFactor / 3) * 20 +
    (config.suppressionMode ? 20 : 0) +
    (totalNewContent / 10) * 10 +
    (serpSuppression.length / 10) * 10
  ));

  // Warnings
  const warnings: string[] = [];
  if (config.linksPerPage > 12) warnings.push('⚠️ Link density exceeding 12/page may trigger over-optimization flags');
  if (config.faqEntriesPerPage > 12) warnings.push('⚠️ FAQ count >12 may dilute schema effectiveness');
  if (totalNewContent > 20) warnings.push('⚠️ Publishing >20 pages/month risks thin content penalties — throttle to 8-10/month');
  if (aggressivenessScore > 85) warnings.push('🔥 Aggressiveness score >85 — monitor Search Console for manual actions');

  return {
    config,
    linkSaturation,
    semanticFlood,
    serpSuppression,
    pageRankFunnels,
    clusterOverbuilds,
    totalNewLinks,
    totalNewContent,
    aggressivenessScore,
    projectedImpact: {
      impressionLift: `+${Math.round(50 + aggressivenessScore * 0.8)}–${Math.round(80 + aggressivenessScore)}% in 90 days`,
      positionLift: `Avg position improvement: ${Math.round(3 + aggressivenessScore * 0.08)}–${Math.round(5 + aggressivenessScore * 0.12)} positions`,
      clickGrowth: `+${Math.round(100 + aggressivenessScore * 3)}–${Math.round(200 + aggressivenessScore * 5)}% click growth`,
      timeToResults: aggressivenessScore > 70 ? '45-60 days for first visible gains' : '60-90 days for first visible gains',
    },
    warnings,
  };
}
