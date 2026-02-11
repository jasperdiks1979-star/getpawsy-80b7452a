/**
 * AI Link Matrix Optimizer
 * 
 * Calculates strength scores, detects weak guides, generates auto-link
 * injection plans, and enforces cornerstone authority rules.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export interface GuideStrength {
  slug: string;
  cluster: string;
  role: string;
  inboundLinks: number;
  outboundLinks: number;
  strengthScore: number;
  isWeak: boolean;
  isOrphan: boolean;
}

export interface LinkSuggestion {
  fromSlug: string;
  anchorText: string;
  anchorType: 'partial' | 'exact' | 'semantic';
}

export interface WeakGuidePlan {
  weakSlug: string;
  strengthScore: number;
  role: string;
  cluster: string;
  recommendedLinks: LinkSuggestion[];
}

export interface CornerstoneAuthority {
  slug: string;
  cluster: string;
  inboundTotal: number;
  subguidePercent: number;
  crossClusterPercent: number;
  atRisk: boolean;
  risks: string[];
}

export interface LinkMatrixOptimizerResult {
  guides: GuideStrength[];
  weakGuides: WeakGuidePlan[];
  cornerstoneAuthority: CornerstoneAuthority[];
  summary: {
    totalGuides: number;
    weakCount: number;
    orphanCount: number;
    avgStrength: number;
    cornerstonesAtRisk: number;
  };
}

// ============= CONSTANTS =============

const ROLE_BONUS: Record<string, number> = {
  cornerstone: 8,
  hub: 5,
  subguide: 2,
};

const STRENGTH_THRESHOLD = 20;
const CORNERSTONE_MIN_INBOUND = 60;
const CORNERSTONE_SUBGUIDE_MIN_PERCENT = 30;
const CORNERSTONE_CROSS_CLUSTER_MIN_PERCENT = 10;

// ============= INBOUND/OUTBOUND HELPERS =============

function getInbound(slug: string): ScalingGuide[] {
  return SCALING_GUIDES.filter(g => g.slug !== slug && g.linksTo.includes(slug));
}

function getOutbound(guide: ScalingGuide): string[] {
  const slugSet = new Set(SCALING_GUIDES.map(g => g.slug));
  return guide.linksTo.filter(s => slugSet.has(s));
}

// ============= ANCHOR DIVERSITY =============

function calcAnchorDiversityScore(inboundSlugs: string[]): number {
  // More diverse sources = better; simple heuristic: unique clusters linking in
  const clusters = new Set(
    inboundSlugs.map(s => SCALING_GUIDES.find(g => g.slug === s)?.cluster).filter(Boolean)
  );
  return Math.min(clusters.size * 3, 10); // max 10
}

// ============= STRENGTH CALCULATION =============

function calcStrengthScore(guide: ScalingGuide): GuideStrength {
  const inbound = getInbound(guide.slug);
  const outbound = getOutbound(guide);
  const inboundCount = inbound.length;

  const roleBonus = ROLE_BONUS[guide.role] || 2;
  const anchorDiversity = calcAnchorDiversityScore(inbound.map(g => g.slug));
  const orphanPenalty = inboundCount < 1 ? -10 : 0;

  const strengthScore = Math.max(0,
    (inboundCount * 2) + roleBonus + anchorDiversity + orphanPenalty
  );

  return {
    slug: guide.slug,
    cluster: guide.cluster,
    role: guide.role,
    inboundLinks: inboundCount,
    outboundLinks: outbound.length,
    strengthScore: Math.round(strengthScore * 10) / 10,
    isWeak: strengthScore < STRENGTH_THRESHOLD,
    isOrphan: inboundCount === 0,
  };
}

// ============= LINK SUGGESTION GENERATION =============

function generateAnchorText(target: ScalingGuide, type: 'partial' | 'exact' | 'semantic'): string {
  const kw = target.primaryKW;
  const words = kw.split(' ');
  switch (type) {
    case 'exact': return kw;
    case 'partial': return words.length > 3 ? words.slice(0, 3).join(' ') : words.slice(0, 2).join(' ');
    case 'semantic':
      return target.secondaryKWs.length > 0
        ? target.secondaryKWs[Math.floor(Math.random() * target.secondaryKWs.length)]
        : `guide to ${words.slice(-2).join(' ')}`;
  }
}

function findRelatedGuides(guide: ScalingGuide, count: number): ScalingGuide[] {
  return SCALING_GUIDES
    .filter(g => g.slug !== guide.slug && g.cluster === guide.cluster)
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

function buildWeakGuidePlan(weak: GuideStrength): WeakGuidePlan {
  const guide = SCALING_GUIDES.find(g => g.slug === weak.slug)!;
  const links: LinkSuggestion[] = [];

  // 3 semantically related
  const related = findRelatedGuides(guide, 3);
  const anchorTypes: Array<'partial' | 'exact' | 'semantic'> = ['partial', 'exact', 'semantic'];

  for (let i = 0; i < related.length; i++) {
    links.push({
      fromSlug: related[i].slug,
      anchorText: generateAnchorText(guide, anchorTypes[i % 3]),
      anchorType: anchorTypes[i % 3],
    });
  }

  // 1 hub
  const hub = SCALING_GUIDES.find(g => g.cluster === guide.cluster && g.role === 'hub' && g.slug !== guide.slug);
  if (hub) {
    links.push({ fromSlug: hub.slug, anchorText: generateAnchorText(guide, 'partial'), anchorType: 'partial' });
  }

  // 1 cornerstone
  const cs = SCALING_GUIDES.find(g => g.cluster === guide.cluster && g.role === 'cornerstone' && g.slug !== guide.slug);
  if (cs) {
    links.push({ fromSlug: cs.slug, anchorText: generateAnchorText(guide, 'semantic'), anchorType: 'semantic' });
  }

  return {
    weakSlug: weak.slug,
    strengthScore: weak.strengthScore,
    role: weak.role,
    cluster: weak.cluster,
    recommendedLinks: links,
  };
}

// ============= CORNERSTONE AUTHORITY =============

function analyzeCornerstoneAuthority(guide: ScalingGuide): CornerstoneAuthority {
  const inbound = getInbound(guide.slug);
  const total = inbound.length;
  const risks: string[] = [];

  const subguideCount = inbound.filter(g => g.role === 'subguide').length;
  const subguidePercent = total > 0 ? Math.round((subguideCount / total) * 100) : 0;

  const crossClusterCount = inbound.filter(g => g.cluster !== guide.cluster).length;
  const crossClusterPercent = total > 0 ? Math.round((crossClusterCount / total) * 100) : 0;

  if (total < CORNERSTONE_MIN_INBOUND) risks.push(`Inbound ${total} < ${CORNERSTONE_MIN_INBOUND} minimum`);
  if (subguidePercent < CORNERSTONE_SUBGUIDE_MIN_PERCENT) risks.push(`Subguide links ${subguidePercent}% < ${CORNERSTONE_SUBGUIDE_MIN_PERCENT}% minimum`);
  if (crossClusterPercent < CORNERSTONE_CROSS_CLUSTER_MIN_PERCENT) risks.push(`Cross-cluster ${crossClusterPercent}% < ${CORNERSTONE_CROSS_CLUSTER_MIN_PERCENT}% minimum`);

  return {
    slug: guide.slug,
    cluster: guide.cluster,
    inboundTotal: total,
    subguidePercent,
    crossClusterPercent,
    atRisk: risks.length > 0,
    risks,
  };
}

// ============= MAIN OPTIMIZER =============

export function runLinkMatrixOptimizer(): LinkMatrixOptimizerResult {
  const guides = SCALING_GUIDES.map(calcStrengthScore);
  const weakGuides = guides.filter(g => g.isWeak).map(buildWeakGuidePlan);
  const cornerstones = SCALING_GUIDES.filter(g => g.role === 'cornerstone');
  const cornerstoneAuthority = cornerstones.map(analyzeCornerstoneAuthority);

  const orphanCount = guides.filter(g => g.isOrphan).length;
  const avgStrength = guides.length > 0
    ? Math.round((guides.reduce((s, g) => s + g.strengthScore, 0) / guides.length) * 10) / 10
    : 0;

  return {
    guides: guides.sort((a, b) => a.strengthScore - b.strengthScore),
    weakGuides,
    cornerstoneAuthority,
    summary: {
      totalGuides: guides.length,
      weakCount: weakGuides.length,
      orphanCount,
      avgStrength,
      cornerstonesAtRisk: cornerstoneAuthority.filter(c => c.atRisk).length,
    },
  };
}
