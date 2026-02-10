/**
 * Internal Link Power Matrix (Cluster Flow Max)
 * 
 * Analyzes internal link structure, detects orphans, calculates link strength.
 * Cross-cluster linking capped at 20% to prevent topical dilution.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export interface LinkAnalysis {
  slug: string;
  title: string;
  cluster: string;
  role: string;
  inboundLinks: string[];
  outboundLinks: string[];
  inboundCount: number;
  outboundCount: number;
  targetInbound: number;
  linkDeficit: number; // negative = needs more links
  linkStrengthScore: number; // 0-100
  isOrphan: boolean;
  crossClusterPercent: number;
}

export interface AnchorUsage {
  anchor: string;
  count: number;
  sources: string[];
  overused: boolean; // >3 uses = overused
}

export interface LinkMatrixSummary {
  totalGuides: number;
  orphanCount: number;
  orphans: string[];
  avgLinkStrength: number;
  overusedAnchors: AnchorUsage[];
  clusterHealth: Record<string, {
    avgInbound: number;
    avgStrength: number;
    orphans: number;
    crossClusterPercent: number;
  }>;
}

// ============= LINK REQUIREMENTS =============

const LINK_REQUIREMENTS: Record<string, number> = {
  cornerstone: 8,
  hub: 5,
  subguide: 3,
};

const MAX_CROSS_CLUSTER_PERCENT = 20;

// ============= ANALYSIS =============

/**
 * Analyze the full internal link structure from the scaling guide data.
 */
export function analyzeInternalLinks(): LinkAnalysis[] {
  const slugSet = new Set(SCALING_GUIDES.map(g => g.slug));

  return SCALING_GUIDES.map(guide => {
    // Outbound: guide.linksTo
    const outboundLinks = guide.linksTo.filter(s => slugSet.has(s));

    // Inbound: which guides link TO this guide
    const inboundLinks = SCALING_GUIDES
      .filter(g => g.slug !== guide.slug && g.linksTo.includes(guide.slug))
      .map(g => g.slug);

    const targetInbound = LINK_REQUIREMENTS[guide.role] || 3;
    const linkDeficit = inboundLinks.length - targetInbound;

    // Cross-cluster links
    const inboundClusters = inboundLinks.map(s => SCALING_GUIDES.find(g => g.slug === s)?.cluster).filter(Boolean);
    const crossClusterInbound = inboundClusters.filter(c => c !== guide.cluster).length;
    const crossClusterPercent = inboundLinks.length > 0
      ? Math.round((crossClusterInbound / inboundLinks.length) * 100)
      : 0;

    // Link strength score (0-100)
    const inboundScore = Math.min(inboundLinks.length / targetInbound, 1.5) * 40;
    const outboundScore = Math.min(outboundLinks.length / 3, 1) * 20;
    const roleBonus = guide.role === 'cornerstone' ? 20 : guide.role === 'hub' ? 15 : 10;
    const deficitPenalty = linkDeficit < 0 ? Math.abs(linkDeficit) * 5 : 0;
    const crossClusterPenalty = crossClusterPercent > MAX_CROSS_CLUSTER_PERCENT
      ? (crossClusterPercent - MAX_CROSS_CLUSTER_PERCENT) * 0.5
      : 0;

    const linkStrengthScore = Math.max(0, Math.min(100,
      Math.round(inboundScore + outboundScore + roleBonus - deficitPenalty - crossClusterPenalty)
    ));

    return {
      slug: guide.slug,
      title: guide.title,
      cluster: guide.cluster,
      role: guide.role,
      inboundLinks,
      outboundLinks,
      inboundCount: inboundLinks.length,
      outboundCount: outboundLinks.length,
      targetInbound,
      linkDeficit,
      linkStrengthScore,
      isOrphan: inboundLinks.length === 0,
      crossClusterPercent,
    };
  });
}

// ============= ORPHAN DETECTION =============

export function detectOrphans(): LinkAnalysis[] {
  return analyzeInternalLinks().filter(a => a.isOrphan);
}

// ============= ANCHOR ANALYSIS =============

/**
 * Detect overused anchors (same anchor text used >3 times across guides).
 * Uses primaryKW as proxy for anchor text.
 */
export function analyzeAnchorUsage(): AnchorUsage[] {
  const anchorMap: Record<string, string[]> = {};

  SCALING_GUIDES.forEach(guide => {
    guide.linksTo.forEach(targetSlug => {
      const target = SCALING_GUIDES.find(g => g.slug === targetSlug);
      if (!target) return;
      const anchor = target.primaryKW.toLowerCase();
      if (!anchorMap[anchor]) anchorMap[anchor] = [];
      anchorMap[anchor].push(guide.slug);
    });
  });

  return Object.entries(anchorMap)
    .map(([anchor, sources]) => ({
      anchor,
      count: sources.length,
      sources,
      overused: sources.length > 3,
    }))
    .filter(a => a.count > 1)
    .sort((a, b) => b.count - a.count);
}

// ============= SUMMARY =============

export function getLinkMatrixSummary(): LinkMatrixSummary {
  const analyses = analyzeInternalLinks();
  const anchors = analyzeAnchorUsage();
  const orphans = analyses.filter(a => a.isOrphan);

  const clusters = [...new Set(SCALING_GUIDES.map(g => g.cluster))];
  const clusterHealth: LinkMatrixSummary['clusterHealth'] = {};

  for (const cluster of clusters) {
    const clusterAnalyses = analyses.filter(a => a.cluster === cluster);
    clusterHealth[cluster] = {
      avgInbound: clusterAnalyses.length > 0
        ? Math.round((clusterAnalyses.reduce((s, a) => s + a.inboundCount, 0) / clusterAnalyses.length) * 10) / 10
        : 0,
      avgStrength: clusterAnalyses.length > 0
        ? Math.round(clusterAnalyses.reduce((s, a) => s + a.linkStrengthScore, 0) / clusterAnalyses.length)
        : 0,
      orphans: clusterAnalyses.filter(a => a.isOrphan).length,
      crossClusterPercent: clusterAnalyses.length > 0
        ? Math.round(clusterAnalyses.reduce((s, a) => s + a.crossClusterPercent, 0) / clusterAnalyses.length)
        : 0,
    };
  }

  return {
    totalGuides: analyses.length,
    orphanCount: orphans.length,
    orphans: orphans.map(o => o.slug),
    avgLinkStrength: analyses.length > 0
      ? Math.round(analyses.reduce((s, a) => s + a.linkStrengthScore, 0) / analyses.length)
      : 0,
    overusedAnchors: anchors.filter(a => a.overused),
    clusterHealth,
  };
}
