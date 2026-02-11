/**
 * Orphan Repair Engine
 * 
 * Detects orphan pages, auto-injects internal links based on hierarchy rules,
 * randomizes anchors, and respects safety constraints.
 * 
 * Safety: max 5 new links per page, no duplicates, cross-cluster ≤25%.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export type OrphanSeverity = 'orphanCritical' | 'orphanWeak' | 'healthy';

export interface OrphanReport {
  slug: string;
  cluster: string;
  role: string;
  inboundCount: number;
  missingLinksCount: number;
  severity: OrphanSeverity;
}

export type AnchorType = 'partial' | 'semantic' | 'exact' | 'branded';

export interface LinkInjection {
  sourceSlug: string;
  targetSlug: string;
  anchorType: AnchorType;
  anchorText: string;
  placement: 'related-guides' | 'content-section' | 'faq';
}

export interface RepairResult {
  orphansBefore: number;
  orphansAfter: number;
  totalInjections: number;
  injections: LinkInjection[];
  repairedGuides: string[];
  skippedGuides: string[];
  cornerstoneInbound: Record<string, number>;
  avgInboundAfter: number;
  clusterAuthority: Record<string, number>;
  weakestGuides: { slug: string; role: string; strength: number; inbound: number }[];
  log: string[];
}

// ============= CONSTANTS =============

const MIN_INBOUND: Record<string, number> = {
  cornerstone: 20,
  hub: 5,
  subguide: 3,
};

const MAX_NEW_LINKS_PER_PAGE = 5;
const MAX_CROSS_CLUSTER_PERCENT = 25;
const BRAND_NAME = 'Pawsy';

// ============= ANCHOR STRATEGY =============

const ANCHOR_DISTRIBUTION: { type: AnchorType; weight: number }[] = [
  { type: 'partial', weight: 40 },
  { type: 'semantic', weight: 30 },
  { type: 'exact', weight: 20 },
  { type: 'branded', weight: 10 },
];

function pickAnchorType(usedOnPage: AnchorType[]): AnchorType {
  // Weighted random, avoid duplicates on same page
  const available = ANCHOR_DISTRIBUTION.filter(a => !usedOnPage.includes(a.type));
  if (available.length === 0) return 'partial'; // fallback

  const totalWeight = available.reduce((s, a) => s + a.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const a of available) {
    rand -= a.weight;
    if (rand <= 0) return a.type;
  }
  return available[0].type;
}

function generateAnchor(target: ScalingGuide, type: AnchorType): string {
  const kw = target.primaryKW;
  const words = kw.split(' ');

  switch (type) {
    case 'exact':
      return kw;
    case 'partial':
      // Take 2-3 words from the keyword
      return words.length > 3 ? words.slice(0, 3).join(' ') : words.slice(0, 2).join(' ');
    case 'semantic': {
      // Use a secondary keyword or rephrase
      if (target.secondaryKWs.length > 0) {
        return target.secondaryKWs[Math.floor(Math.random() * target.secondaryKWs.length)];
      }
      return `guide to ${words.slice(-2).join(' ')}`;
    }
    case 'branded':
      return `${BRAND_NAME}'s ${words.slice(0, 2).join(' ')} guide`;
    default:
      return kw;
  }
}

// ============= PLACEMENT LOGIC =============

const PLACEMENT_OPTIONS: LinkInjection['placement'][] = ['related-guides', 'content-section', 'faq'];

function pickPlacement(usedOnPage: LinkInjection['placement'][]): LinkInjection['placement'] {
  // Prefer related-guides, then content, then faq
  for (const p of PLACEMENT_OPTIONS) {
    if (!usedOnPage.includes(p)) return p;
  }
  return 'content-section'; // fallback
}

// ============= ORPHAN DETECTION =============

export function detectOrphans(): OrphanReport[] {
  const slugSet = new Set(SCALING_GUIDES.map(g => g.slug));

  return SCALING_GUIDES.map(guide => {
    const inboundCount = SCALING_GUIDES.filter(
      g => g.slug !== guide.slug && g.linksTo.includes(guide.slug)
    ).length;
    
    const target = MIN_INBOUND[guide.role] || 3;
    const missing = Math.max(0, target - inboundCount);

    let severity: OrphanSeverity = 'healthy';
    if (inboundCount === 0) severity = 'orphanCritical';
    else if (inboundCount < target) severity = 'orphanWeak';

    return {
      slug: guide.slug,
      cluster: guide.cluster,
      role: guide.role,
      inboundCount,
      missingLinksCount: missing,
      severity,
    };
  }).filter(r => r.severity !== 'healthy');
}

// ============= LINK INJECTION ENGINE =============

function findGuidesByRole(cluster: string, role: string, exclude: string[] = []): ScalingGuide[] {
  return SCALING_GUIDES.filter(
    g => g.cluster === cluster && g.role === role && !exclude.includes(g.slug)
  );
}

function getInboundCount(slug: string, extraLinks: Map<string, string[]>): number {
  let count = SCALING_GUIDES.filter(g => g.slug !== slug && g.linksTo.includes(slug)).length;
  // Add injected links
  for (const [source, targets] of extraLinks) {
    if (source !== slug && targets.includes(slug)) count++;
  }
  return count;
}

function getOutboundSlugs(slug: string, extraLinks: Map<string, string[]>): string[] {
  const guide = SCALING_GUIDES.find(g => g.slug === slug);
  const existing = guide ? [...guide.linksTo] : [];
  const extra = extraLinks.get(slug) || [];
  return [...new Set([...existing, ...extra])];
}

function countNewLinksForSource(sourceSlug: string, injections: LinkInjection[]): number {
  return injections.filter(i => i.sourceSlug === sourceSlug).length;
}

function getCrossClusterPercent(slug: string, extraLinks: Map<string, string[]>): number {
  const guide = SCALING_GUIDES.find(g => g.slug === slug);
  if (!guide) return 0;

  const allInbound = SCALING_GUIDES
    .filter(g => g.slug !== slug && g.linksTo.includes(slug))
    .map(g => g.cluster);
  
  for (const [source, targets] of extraLinks) {
    if (source !== slug && targets.includes(slug)) {
      const srcGuide = SCALING_GUIDES.find(g => g.slug === source);
      if (srcGuide) allInbound.push(srcGuide.cluster);
    }
  }

  if (allInbound.length === 0) return 0;
  const crossCount = allInbound.filter(c => c !== guide.cluster).length;
  return Math.round((crossCount / allInbound.length) * 100);
}

function tryInjectLink(
  sourceSlug: string,
  targetSlug: string,
  injections: LinkInjection[],
  extraLinks: Map<string, string[]>,
  log: string[]
): boolean {
  const source = SCALING_GUIDES.find(g => g.slug === sourceSlug);
  const target = SCALING_GUIDES.find(g => g.slug === targetSlug);
  if (!source || !target) return false;

  // Safety: max 5 new links per source page
  if (countNewLinksForSource(sourceSlug, injections) >= MAX_NEW_LINKS_PER_PAGE) {
    log.push(`SKIP: ${sourceSlug} → ${targetSlug} (max 5 new links reached for source)`);
    return false;
  }

  // Safety: no duplicate links
  const existingOutbound = getOutboundSlugs(sourceSlug, extraLinks);
  if (existingOutbound.includes(targetSlug)) {
    log.push(`SKIP: ${sourceSlug} → ${targetSlug} (duplicate link)`);
    return false;
  }

  // Safety: cross-cluster check on target
  if (source.cluster !== target.cluster) {
    const projected = getCrossClusterPercent(targetSlug, extraLinks);
    if (projected >= MAX_CROSS_CLUSTER_PERCENT) {
      log.push(`SKIP: ${sourceSlug} → ${targetSlug} (cross-cluster would exceed ${MAX_CROSS_CLUSTER_PERCENT}%)`);
      return false;
    }
  }

  // Pick anchor
  const usedAnchors = injections.filter(i => i.sourceSlug === sourceSlug).map(i => i.anchorType);
  const anchorType = pickAnchorType(usedAnchors);
  const anchorText = generateAnchor(target, anchorType);

  // Pick placement
  const usedPlacements = injections.filter(i => i.sourceSlug === sourceSlug).map(i => i.placement);
  const placement = pickPlacement(usedPlacements);

  injections.push({ sourceSlug, targetSlug, anchorType, anchorText, placement });

  // Track in extraLinks
  if (!extraLinks.has(sourceSlug)) extraLinks.set(sourceSlug, []);
  extraLinks.get(sourceSlug)!.push(targetSlug);

  log.push(`INJECT: ${sourceSlug} → ${targetSlug} [${anchorType}] "${anchorText}" in ${placement}`);
  return true;
}

// ============= MAIN REPAIR =============

export function runOrphanRepair(): RepairResult {
  const orphansBefore = detectOrphans().length;
  const injections: LinkInjection[] = [];
  const extraLinks = new Map<string, string[]>();
  const log: string[] = [];
  const repairedGuides: string[] = [];
  const skippedGuides: string[] = [];

  log.push(`=== ORPHAN REPAIR ENGINE START ===`);
  log.push(`Orphans detected: ${orphansBefore}`);

  // Process each orphan
  const orphans = detectOrphans();

  for (const orphan of orphans) {
    const guide = SCALING_GUIDES.find(g => g.slug === orphan.slug)!;
    const needed = orphan.missingLinksCount;
    let injected = 0;

    log.push(`\n--- Repairing: ${orphan.slug} (${orphan.role}, need ${needed} links) ---`);

    if (guide.role === 'subguide') {
      // 1 from cluster hub
      const hubs = findGuidesByRole(guide.cluster, 'hub');
      for (const hub of hubs) {
        if (injected >= needed) break;
        if (tryInjectLink(hub.slug, guide.slug, injections, extraLinks, log)) injected++;
      }

      // 1 from cornerstone
      const cornerstones = findGuidesByRole(guide.cluster, 'cornerstone');
      for (const cs of cornerstones) {
        if (injected >= needed) break;
        if (tryInjectLink(cs.slug, guide.slug, injections, extraLinks, log)) injected++;
      }

      // 1 from related subguide in same cluster
      const siblings = findGuidesByRole(guide.cluster, 'subguide', [guide.slug]);
      for (const sib of siblings) {
        if (injected >= needed) break;
        if (tryInjectLink(sib.slug, guide.slug, injections, extraLinks, log)) injected++;
      }
    } else if (guide.role === 'hub') {
      // 2 from subguides
      const subguides = findGuidesByRole(guide.cluster, 'subguide');
      let subCount = 0;
      for (const sub of subguides) {
        if (subCount >= 2 || injected >= needed) break;
        if (tryInjectLink(sub.slug, guide.slug, injections, extraLinks, log)) {
          injected++;
          subCount++;
        }
      }

      // 1 from cornerstone
      const cornerstones = findGuidesByRole(guide.cluster, 'cornerstone');
      for (const cs of cornerstones) {
        if (injected >= needed) break;
        if (tryInjectLink(cs.slug, guide.slug, injections, extraLinks, log)) injected++;
      }
    } else if (guide.role === 'cornerstone') {
      // Need 20+ inbound — get links from all cluster subguides
      const allCluster = SCALING_GUIDES.filter(
        g => g.cluster === guide.cluster && g.slug !== guide.slug
      );
      for (const src of allCluster) {
        if (injected >= needed) break;
        if (tryInjectLink(src.slug, guide.slug, injections, extraLinks, log)) injected++;
      }
    }

    if (injected > 0) {
      repairedGuides.push(orphan.slug);
    } else {
      skippedGuides.push(orphan.slug);
    }
  }

  // Recalculate post-repair stats
  const afterOrphans = recalcOrphansAfter(extraLinks);
  const cornerstoneInbound = recalcCornerstoneInbound(extraLinks);
  const avgInboundAfter = recalcAvgInbound(extraLinks);
  const clusterAuthority = recalcClusterAuthority(extraLinks);
  const weakestGuides = recalcWeakest(extraLinks);

  log.push(`\n=== REPAIR COMPLETE ===`);
  log.push(`Orphans: ${orphansBefore} → ${afterOrphans}`);
  log.push(`Total injections: ${injections.length}`);
  log.push(`Repaired: ${repairedGuides.length}, Skipped: ${skippedGuides.length}`);

  return {
    orphansBefore,
    orphansAfter: afterOrphans,
    totalInjections: injections.length,
    injections,
    repairedGuides,
    skippedGuides,
    cornerstoneInbound,
    avgInboundAfter,
    clusterAuthority,
    weakestGuides,
    log,
  };
}

// ============= POST-REPAIR METRICS =============

function recalcOrphansAfter(extraLinks: Map<string, string[]>): number {
  let count = 0;
  for (const guide of SCALING_GUIDES) {
    const inbound = getInboundCount(guide.slug, extraLinks);
    const target = MIN_INBOUND[guide.role] || 3;
    if (inbound < target) count++;
  }
  return count;
}

function recalcCornerstoneInbound(extraLinks: Map<string, string[]>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const guide of SCALING_GUIDES.filter(g => g.role === 'cornerstone')) {
    result[guide.slug] = getInboundCount(guide.slug, extraLinks);
  }
  return result;
}

function recalcAvgInbound(extraLinks: Map<string, string[]>): number {
  const total = SCALING_GUIDES.reduce((s, g) => s + getInboundCount(g.slug, extraLinks), 0);
  return Math.round((total / SCALING_GUIDES.length) * 10) / 10;
}

function recalcClusterAuthority(extraLinks: Map<string, string[]>): Record<string, number> {
  const clusters = [...new Set(SCALING_GUIDES.map(g => g.cluster))];
  const result: Record<string, number> = {};

  for (const cluster of clusters) {
    const guides = SCALING_GUIDES.filter(g => g.cluster === cluster);
    const totalInbound = guides.reduce((s, g) => s + getInboundCount(g.slug, extraLinks), 0);
    const avgInbound = guides.length > 0 ? totalInbound / guides.length : 0;

    // Authority score: weighted by role distribution and link density
    const csCount = guides.filter(g => g.role === 'cornerstone').length;
    const hubCount = guides.filter(g => g.role === 'hub').length;
    const roleScore = (csCount * 20 + hubCount * 10) / Math.max(guides.length, 1);
    
    result[cluster] = Math.round(Math.min(100, avgInbound * 10 + roleScore));
  }

  return result;
}

function recalcWeakest(extraLinks: Map<string, string[]>): RepairResult['weakestGuides'] {
  return SCALING_GUIDES.map(g => {
    const inbound = getInboundCount(g.slug, extraLinks);
    const target = MIN_INBOUND[g.role] || 3;
    const ratio = Math.min(inbound / target, 1.5);
    const roleBonus = g.role === 'cornerstone' ? 20 : g.role === 'hub' ? 15 : 10;
    const strength = Math.max(0, Math.min(100, Math.round(ratio * 40 + roleBonus)));

    return { slug: g.slug, role: g.role, strength, inbound };
  })
    .sort((a, b) => a.strength - b.strength)
    .slice(0, 10);
}

// ============= ORPHAN REPORT GENERATOR =============

export function generateOrphanReport(): OrphanReport[] {
  return detectOrphans().sort((a, b) => {
    if (a.severity === 'orphanCritical' && b.severity !== 'orphanCritical') return -1;
    if (b.severity === 'orphanCritical' && a.severity !== 'orphanCritical') return 1;
    return b.missingLinksCount - a.missingLinksCount;
  });
}
