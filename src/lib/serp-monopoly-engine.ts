/**
 * SERP Monopoly Engine
 * 
 * Cluster-wide SERP feature control system.
 * Assigns roles, detects cannibalization, and manages
 * snippet/PAA ownership across the entire /guides/* cluster.
 * 
 * Decision-support only — no automatic content modification.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export type SerpRole =
  | 'SNIPPET_TARGET'    // Position Zero focus
  | 'PAA_EXPANSION'     // Question capture
  | 'AUTHORITY_SUPPORT' // Link power distribution
  | 'LONGTAIL_NET';     // Micro-intent traffic capture

export interface SerpRoleAssignment {
  slug: string;
  title: string;
  serpRole: SerpRole;
  cluster: string;
  pageRole: 'cornerstone' | 'hub' | 'subguide';
  primaryKW: string;
  snippetType?: 'paragraph' | 'list' | 'table' | 'none';
  paaQuestionCount: number;
  inboundLinkTarget: number;
  priority: number;
}

export interface CannibalizationIssue {
  keyword: string;
  slugs: string[];
  severity: 'high' | 'medium' | 'low';
  resolution: string;
}

export interface ClusterSerpHealth {
  cluster: string;
  snippetTargets: number;
  paaExpansionPages: number;
  authoritySupports: number;
  longtailNets: number;
  totalGuides: number;
  cannibalizationRisks: CannibalizationIssue[];
}

// ============= SNIPPET TARGET ASSIGNMENTS =============

/**
 * Primary snippet targets — max 1 per keyword theme.
 * These pages receive full snippet optimization:
 * direct answer block, numbered list, FAQ schema, ItemList schema.
 */
const SNIPPET_TARGETS: Set<string> = new Set([
  'outdoor-dog-games-2026',
  'best-dog-bed-2026',
  'best-cat-litter-box-2026',
  'best-orthopedic-dog-bed',
]);

/**
 * PAA expansion pages — supporting guides that
 * capture "People Also Ask" boxes with micro-FAQ blocks.
 */
const PAA_EXPANSION_SLUGS: Set<string> = new Set([
  'how-many-litter-boxes-per-cat',
  'best-self-cleaning-litter-box-2026',
  'best-litter-boxes-multi-cat',
  'best-extra-large-litter-boxes',
  'calming-dog-bed-anxiety',
  'memory-foam-vs-standard-dog-bed',
  'dog-bed-for-large-breeds',
  'best-cat-trees-small-apartments',
  'best-cat-litter-box-furniture-enclosures-2026',
  'litter-box-placement-guide',
  'how-to-tire-out-a-dog-fast',
  'backyard-enrichment-for-dogs',
  'summer-dog-activities',
  'best-orthopedic-dog-bed-2026',
]);

/**
 * Authority support — cornerstones and hubs that distribute
 * link power to snippet targets and PAA pages.
 */
const AUTHORITY_SUPPORT_SLUGS: Set<string> = new Set([
  'best-cat-litter-box-furniture-enclosures-2026',
  'best-self-cleaning-litter-box-2026',
  'best-cat-trees-small-apartments',
  'best-orthopedic-dog-bed-2026',
]);

// ============= ROLE ASSIGNMENT ENGINE =============

export function assignSerpRole(guide: ScalingGuide): SerpRole {
  if (SNIPPET_TARGETS.has(guide.slug)) return 'SNIPPET_TARGET';
  if (PAA_EXPANSION_SLUGS.has(guide.slug)) return 'PAA_EXPANSION';
  if (guide.role === 'cornerstone' || guide.role === 'hub') return 'AUTHORITY_SUPPORT';
  return 'LONGTAIL_NET';
}

export function getSnippetType(slug: string): 'paragraph' | 'list' | 'table' | 'none' {
  // Each snippet target uses a different structural format to avoid duplicate patterns
  const snippetMap: Record<string, 'paragraph' | 'list' | 'table'> = {
    'outdoor-dog-games-2026': 'list',         // 15-item numbered list
    'best-dog-bed-2026': 'paragraph',          // Direct answer paragraph
    'best-cat-litter-box-2026': 'table',       // Comparison table snippet
    'best-orthopedic-dog-bed': 'paragraph',    // Direct answer + specs
  };
  return snippetMap[slug] || 'none';
}

// ============= FULL CLUSTER MAP =============

export function buildClusterMap(): SerpRoleAssignment[] {
  return SCALING_GUIDES.map(guide => {
    const serpRole = assignSerpRole(guide);
    const snippetType = getSnippetType(guide.slug);

    let paaQuestionCount = 0;
    if (serpRole === 'SNIPPET_TARGET') paaQuestionCount = 6;
    else if (serpRole === 'PAA_EXPANSION') paaQuestionCount = 4;
    else if (serpRole === 'AUTHORITY_SUPPORT') paaQuestionCount = 2;
    // LONGTAIL_NET gets 0 additional PAA questions

    return {
      slug: guide.slug,
      title: guide.title,
      serpRole,
      cluster: guide.cluster,
      pageRole: guide.role,
      primaryKW: guide.primaryKW,
      snippetType: serpRole === 'SNIPPET_TARGET' ? snippetType : 'none',
      paaQuestionCount,
      inboundLinkTarget: guide.internalLinksTarget,
      priority: guide.priority,
    };
  });
}

// ============= CANNIBALIZATION GUARD =============

export function detectCannibalization(): CannibalizationIssue[] {
  const kwMap: Record<string, string[]> = {};

  for (const guide of SCALING_GUIDES) {
    // Check primary keyword overlap
    const normalized = guide.primaryKW.toLowerCase().trim();
    if (!kwMap[normalized]) kwMap[normalized] = [];
    kwMap[normalized].push(guide.slug);
  }

  const issues: CannibalizationIssue[] = [];

  for (const [keyword, slugs] of Object.entries(kwMap)) {
    if (slugs.length > 1) {
      // Determine severity based on page roles
      const roles = slugs.map(s => SCALING_GUIDES.find(g => g.slug === s)?.role);
      const hasCornerstoneConflict = roles.filter(r => r === 'cornerstone').length > 1;
      const severity = hasCornerstoneConflict ? 'high' : slugs.length > 2 ? 'high' : 'medium';

      issues.push({
        keyword,
        slugs,
        severity,
        resolution: `Demote ${slugs.length - 1} page(s) to support role. Keep highest-priority page as primary.`,
      });
    }
  }

  return issues;
}

// ============= CLUSTER SERP HEALTH =============

export function getClusterSerpHealth(): ClusterSerpHealth[] {
  const clusterMap = buildClusterMap();
  const clusters = [...new Set(clusterMap.map(g => g.cluster))];
  const cannibalization = detectCannibalization();

  return clusters.map(cluster => {
    const guides = clusterMap.filter(g => g.cluster === cluster);
    const clusterCannibs = cannibalization.filter(c =>
      c.slugs.some(s => guides.find(g => g.slug === s))
    );

    return {
      cluster,
      snippetTargets: guides.filter(g => g.serpRole === 'SNIPPET_TARGET').length,
      paaExpansionPages: guides.filter(g => g.serpRole === 'PAA_EXPANSION').length,
      authoritySupports: guides.filter(g => g.serpRole === 'AUTHORITY_SUPPORT').length,
      longtailNets: guides.filter(g => g.serpRole === 'LONGTAIL_NET').length,
      totalGuides: guides.length,
      cannibalizationRisks: clusterCannibs,
    };
  });
}

// ============= SNIPPET TARGET DETAILS =============

export function getSnippetTargets(): SerpRoleAssignment[] {
  return buildClusterMap().filter(g => g.serpRole === 'SNIPPET_TARGET');
}

export function getPAAExpansionPages(): SerpRoleAssignment[] {
  return buildClusterMap().filter(g => g.serpRole === 'PAA_EXPANSION');
}

// ============= POSITION 18-25 HIJACK CANDIDATES =============

export interface HijackCandidate {
  slug: string;
  title: string;
  cluster: string;
  avgPosition: number;
  impressions: number;
  actions: string[];
}

/**
 * Detect pages ranking 18-25 for targeted optimization.
 * Max 2 boosted per 14 days.
 */
export function detectHijackCandidates(
  gscData: Record<string, { impressions: number; clicks: number; position: number }>,
  recentBoosts: { slug: string; boostedAt: string }[] = []
): HijackCandidate[] {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentlyBoosted = new Set(
    recentBoosts
      .filter(b => new Date(b.boostedAt) > fourteenDaysAgo)
      .map(b => b.slug)
  );

  const candidates: HijackCandidate[] = [];

  for (const guide of SCALING_GUIDES) {
    const gsc = gscData[guide.slug];
    if (!gsc) continue;

    if (gsc.position >= 18 && gsc.position <= 25 && !recentlyBoosted.has(guide.slug)) {
      candidates.push({
        slug: guide.slug,
        title: guide.title,
        cluster: guide.cluster,
        avgPosition: gsc.position,
        impressions: gsc.impressions,
        actions: [
          'Strengthen intro clarity',
          'Add comparison table',
          'Add snippet-ready H2',
          'Inject 3 high-authority internal links',
          'Add FAQ block (4 questions)',
        ],
      });
    }
  }

  // Sort by impressions descending, limit to 2
  return candidates
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2);
}

// ============= CTR TITLE FORMULA =============

export interface CTRTitle {
  slug: string;
  currentTitle: string;
  optimizedTitle: string;
  formula: string;
}

/**
 * Generate CTR-optimized titles for snippet targets.
 * Formula: [Primary KW] (2026) — [Benefit] + [Specific Hook]
 */
export function generateCTRTitles(): CTRTitle[] {
  const snippetTargets = getSnippetTargets();

  const titleMap: Record<string, { title: string; formula: string }> = {
    'outdoor-dog-games-2026': {
      title: 'Outdoor Dog Games (2026) – 15 Premium Quality Ideas',
      formula: '[KW] (Year) – [Number] [Authority] [Hook]',
    },
    'best-dog-bed-2026': {
      title: 'Best Dog Beds (2026) – 10 Tested Picks by Foam & Breed',
      formula: '[KW] (Year) – [Number] [Method] [Specificity]',
    },
    'best-cat-litter-box-2026': {
      title: 'Best Cat Litter Box (2026) – 12 Tested for Odor & Size',
      formula: '[KW] (Year) – [Number] [Method] [Benefit]',
    },
    'best-orthopedic-dog-bed': {
      title: 'Best Orthopedic Dog Bed (2026) – Premium Quality Joint Support',
      formula: '[KW] (Year) – [Authority] [Benefit]',
    },
  };

  return snippetTargets.map(target => ({
    slug: target.slug,
    currentTitle: target.title,
    optimizedTitle: titleMap[target.slug]?.title || target.title,
    formula: titleMap[target.slug]?.formula || 'default',
  }));
}

// ============= INTERNAL AUTHORITY MATRIX RULES =============

export const AUTHORITY_MATRIX_RULES = {
  cornerstoneToHubs: 3,       // Every cornerstone links to 3 hubs
  hubToCornerstones: 2,       // Every hub links to 2 cornerstones  
  microToHub: 1,              // Every micro guide links to 1 hub
  microToCornerstone: 1,      // Every micro guide links to 1 cornerstone
  maxContextualLinksPerPage: 8,
  maxExactAnchorRepetition: 2, // No exact anchor > 2x across cluster
  safetyRules: {
    maxStructuralEditsPerPagePer14Days: 2,
    noSlugChanges: true,
    noBulkRewrites: true,
    requireManualApproval: true,
  },
} as const;

// ============= MONITORING THRESHOLDS =============

export const MONITORING_THRESHOLDS = {
  snippetWon: { action: 'FREEZE_H2_30_DAYS' },
  positionStagnant: { action: 'IMPROVE_ANSWER_CONCISENESS' },
  highImpressionsLowCTR: { threshold: 1, action: 'REWRITE_TITLE_ONLY' },
  ctrTarget: 3, // 3% CTR target for snippet pages
  snippetFreezedays: 30,
} as const;
