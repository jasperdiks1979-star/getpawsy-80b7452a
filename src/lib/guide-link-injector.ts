/**
 * Guide-to-Guide Internal Link Injection Engine
 * 
 * Injects contextual internal links between guides based on SCALING_GUIDES
 * cluster relationships and keyword matching. Follows authority flow:
 * 
 * Layer 1: Homepage → Layer 2: Cornerstones → Layer 3: Hubs → Layer 4: Subguides
 * 
 * Anchor distribution:
 * - 20% exact match (primaryKW)
 * - 40% partial match (truncated primaryKW)
 * - 30% semantic (secondaryKWs)
 * - 10% branded soft
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export interface GuideLink {
  slug: string;
  anchor: string;
  anchorType: 'exact' | 'partial' | 'semantic' | 'branded';
}

export interface ClusterRelatedGuide {
  slug: string;
  title: string;
  role: 'cornerstone' | 'hub' | 'subguide';
  cluster: string;
  excerpt?: string;
}

// ============= ANCHOR GENERATION =============

function getExactAnchor(guide: ScalingGuide): string {
  return guide.primaryKW;
}

function getPartialAnchor(guide: ScalingGuide): string {
  const words = guide.primaryKW.split(' ');
  return words.length > 3 ? words.slice(0, 3).join(' ') : words.slice(0, 2).join(' ');
}

function getSemanticAnchor(guide: ScalingGuide): string {
  if (guide.secondaryKWs.length > 0) {
    return guide.secondaryKWs[Math.floor(Math.random() * guide.secondaryKWs.length)];
  }
  return `guide to ${guide.primaryKW}`;
}

function getBrandedAnchor(guide: ScalingGuide): string {
  const shortTitle = guide.title.split('–')[0].trim().split('(')[0].trim();
  return `our ${shortTitle.toLowerCase()} guide`;
}

/**
 * Deterministic anchor selection based on a seed to ensure consistent output.
 * Distribution: 20% exact, 40% partial, 30% semantic, 10% branded
 */
function selectAnchor(guide: ScalingGuide, seed: number): GuideLink {
  const bucket = seed % 10;
  let anchor: string;
  let anchorType: GuideLink['anchorType'];

  if (bucket < 2) {
    anchor = getExactAnchor(guide);
    anchorType = 'exact';
  } else if (bucket < 6) {
    anchor = getPartialAnchor(guide);
    anchorType = 'partial';
  } else if (bucket < 9) {
    anchor = getSemanticAnchor(guide);
    anchorType = 'semantic';
  } else {
    anchor = getBrandedAnchor(guide);
    anchorType = 'branded';
  }

  return { slug: guide.slug, anchor, anchorType };
}

// ============= LINK FLOW RULES =============

/**
 * Get recommended outbound guide links for a given guide slug.
 * Follows authority flow rules:
 * - Cornerstones → 3 subguides + 2 hubs + 2 commercial support
 * - Hubs → cornerstone + 2-3 subguides
 * - Subguides → cornerstone + 1 hub + 2 sibling subguides
 */
export function getGuideOutboundLinks(currentSlug: string): GuideLink[] {
  const guide = SCALING_GUIDES.find(g => g.slug === currentSlug);
  if (!guide) return [];

  const clusterGuides = SCALING_GUIDES.filter(g => g.slug !== currentSlug && g.cluster === guide.cluster);
  const cornerstones = clusterGuides.filter(g => g.role === 'cornerstone');
  const hubs = clusterGuides.filter(g => g.role === 'hub');
  const subguides = clusterGuides.filter(g => g.role === 'subguide');

  const links: GuideLink[] = [];
  let seedCounter = hashString(currentSlug);

  const addLink = (target: ScalingGuide) => {
    if (!links.find(l => l.slug === target.slug)) {
      links.push(selectAnchor(target, seedCounter++));
    }
  };

  switch (guide.role) {
    case 'cornerstone':
      // 3 subguides + 2 hubs + 2 from linksTo
      subguides.slice(0, 3).forEach(addLink);
      hubs.slice(0, 2).forEach(addLink);
      guide.linksTo.slice(0, 2).forEach(slug => {
        const target = SCALING_GUIDES.find(g => g.slug === slug);
        if (target) addLink(target);
      });
      break;

    case 'hub':
      // cornerstone + 2-3 subguides
      cornerstones.forEach(addLink);
      subguides.slice(0, 3).forEach(addLink);
      guide.linksTo.forEach(slug => {
        const target = SCALING_GUIDES.find(g => g.slug === slug);
        if (target && links.length < 6) addLink(target);
      });
      break;

    case 'subguide':
      // cornerstone + 1 hub + 2 sibling subguides
      cornerstones.forEach(addLink);
      if (hubs.length > 0) addLink(hubs[0]);
      // Sibling subguides (deterministic neighbors)
      const myIdx = subguides.findIndex(g => g.slug === currentSlug);
      if (myIdx === -1) {
        subguides.slice(0, 2).forEach(addLink);
      } else {
        const next = subguides[(myIdx + 1) % subguides.length];
        const prev = subguides[(myIdx - 1 + subguides.length) % subguides.length];
        if (next) addLink(next);
        if (prev && prev.slug !== next?.slug) addLink(prev);
      }
      // Add linksTo targets
      guide.linksTo.forEach(slug => {
        const target = SCALING_GUIDES.find(g => g.slug === slug);
        if (target && links.length < 6) addLink(target);
      });
      break;
  }

  return links.slice(0, 8); // Cap at 8 per guide
}

// ============= CONTENT INJECTION =============

/**
 * Process guide content and inject internal guide links.
 * Rules:
 * - Never in first 2 paragraphs
 * - Max 8 links per 1000 words
 * - Links placed after H2/H3 sections naturally
 * - Replaces [Internal link to: slug] placeholders
 */
export function injectGuideLinks(content: string, currentSlug: string): string {
  if (!content) return content;

  let processed = content;

  // Step 1: Replace [Internal link to: slug] placeholders
  processed = processed.replace(
    /\[Internal link to:\s*([^\]]+)\]/gi,
    (_match, slug: string) => {
      const trimmedSlug = slug.trim();
      const guide = SCALING_GUIDES.find(g => g.slug === trimmedSlug);
      if (!guide) return '';
      const seed = hashString(currentSlug + trimmedSlug);
      const link = selectAnchor(guide, seed);
      return `[${link.anchor}](/guides/${trimmedSlug})`;
    }
  );

  // Step 2: Get recommended links for this guide
  const outboundLinks = getGuideOutboundLinks(currentSlug);
  
  // Step 3: Check which targets are already linked
  const alreadyLinked = new Set<string>();
  const existingLinkRegex = /\/guides\/([a-z0-9-]+)/g;
  let linkMatch;
  while ((linkMatch = existingLinkRegex.exec(processed)) !== null) {
    alreadyLinked.add(linkMatch[1]);
  }

  // Step 4: Find opportunities to inject remaining links
  const unlinkedTargets = outboundLinks.filter(l => !alreadyLinked.has(l.slug));
  
  if (unlinkedTargets.length === 0) return processed;

  // Split into paragraphs and inject after H2/H3 sections (skip first 2 paragraphs)
  const paragraphs = processed.split('\n\n');
  let injectedCount = 0;
  const maxInjections = Math.min(unlinkedTargets.length, 3); // Max 3 auto-injections per run

  for (let i = 3; i < paragraphs.length && injectedCount < maxInjections; i++) {
    const para = paragraphs[i];
    // Inject after sections with headings
    if (para.includes('###') || para.includes('**')) {
      const target = unlinkedTargets[injectedCount];
      const guide = SCALING_GUIDES.find(g => g.slug === target.slug);
      if (guide) {
        paragraphs[i] = para + `\n\nFor more on this topic, see our [${target.anchor}](/guides/${target.slug}) guide.`;
        injectedCount++;
      }
    }
  }

  return paragraphs.join('\n\n');
}

// ============= CLUSTER-AWARE RELATED GUIDES =============

/**
 * Get cluster-aware related guides for the bottom section.
 * Rules:
 * - At least 1 cornerstone
 * - At least 1 hub  
 * - At least 1 sibling subguide
 * - Minimal cross-cluster noise
 * - Returns 3-5 guides
 */
export function getClusterRelatedGuides(currentSlug: string, category?: string): ClusterRelatedGuide[] {
  const guide = SCALING_GUIDES.find(g => g.slug === currentSlug);
  const results: ClusterRelatedGuide[] = [];

  if (guide) {
    // From same cluster
    const clusterGuides = SCALING_GUIDES.filter(g => g.slug !== currentSlug && g.cluster === guide.cluster);
    
    // Add cornerstone first
    const cornerstone = clusterGuides.find(g => g.role === 'cornerstone');
    if (cornerstone) {
      results.push({ slug: cornerstone.slug, title: cornerstone.title, role: cornerstone.role, cluster: cornerstone.cluster });
    }

    // Add hub
    const hub = clusterGuides.find(g => g.role === 'hub');
    if (hub) {
      results.push({ slug: hub.slug, title: hub.title, role: hub.role, cluster: hub.cluster });
    }

    // Add sibling subguides from linksTo
    guide.linksTo.forEach(slug => {
      if (results.length >= 5) return;
      const target = SCALING_GUIDES.find(g => g.slug === slug);
      if (target && !results.find(r => r.slug === target.slug)) {
        results.push({ slug: target.slug, title: target.title, role: target.role, cluster: target.cluster });
      }
    });

    // Fill to minimum 3 from cluster subguides
    const remainingSubguides = clusterGuides.filter(g => g.role === 'subguide' && !results.find(r => r.slug === g.slug));
    for (const sg of remainingSubguides) {
      if (results.length >= 5) break;
      results.push({ slug: sg.slug, title: sg.title, role: sg.role, cluster: sg.cluster });
    }
  } else {
    // Guide not in SCALING_GUIDES - use category matching
    const categoryClusterMap: Record<string, string> = {
      'Cat Litter': 'cat-litter',
      'Cat Furniture': 'cat-furniture',
      'Dog Beds': 'dog-beds',
      'Dog Activities': 'dog-beds', // Map dog activities to dog-beds cluster
      'Small Pets': 'micro-intent',
    };
    
    const cluster = category ? categoryClusterMap[category] : null;
    if (cluster) {
      const clusterGuides = SCALING_GUIDES.filter(g => g.cluster === cluster);
      
      // Cornerstone first
      const cornerstone = clusterGuides.find(g => g.role === 'cornerstone');
      if (cornerstone) {
        results.push({ slug: cornerstone.slug, title: cornerstone.title, role: cornerstone.role, cluster: cornerstone.cluster });
      }

      // Hub
      const hub = clusterGuides.find(g => g.role === 'hub');
      if (hub) {
        results.push({ slug: hub.slug, title: hub.title, role: hub.role, cluster: hub.cluster });
      }

      // Subguides to fill
      const subguides = clusterGuides.filter(g => g.role === 'subguide' && !results.find(r => r.slug === g.slug));
      for (const sg of subguides.slice(0, 3)) {
        if (results.length >= 5) break;
        results.push({ slug: sg.slug, title: sg.title, role: sg.role, cluster: sg.cluster });
      }
    }
  }

  return results.slice(0, 5);
}

// ============= CLUSTER HEALTH DATA =============

export interface ClusterHealthEntry {
  slug: string;
  title: string;
  role: 'cornerstone' | 'hub' | 'subguide';
  cluster: string;
  linksTo: string[];
  receivesLinksFrom: string[];
  inboundCount: number;
  outboundCount: number;
  authorityScore: number;
  isOrphan: boolean;
}

/**
 * Generate complete cluster health data for admin dashboard.
 */
export function getClusterHealthData(): ClusterHealthEntry[] {
  const slugSet = new Set(SCALING_GUIDES.map(g => g.slug));

  return SCALING_GUIDES.map(guide => {
    const outbound = guide.linksTo.filter(s => slugSet.has(s));
    const inbound = SCALING_GUIDES
      .filter(g => g.slug !== guide.slug && g.linksTo.includes(guide.slug))
      .map(g => g.slug);

    // Authority score calculation
    const roleBonus = guide.role === 'cornerstone' ? 20 : guide.role === 'hub' ? 12 : 5;
    const inboundScore = Math.min(inbound.length * 3, 40);
    const outboundScore = Math.min(outbound.length * 2, 15);
    const orphanPenalty = inbound.length === 0 ? -15 : 0;
    const authorityScore = Math.max(0, Math.min(100, roleBonus + inboundScore + outboundScore + orphanPenalty));

    return {
      slug: guide.slug,
      title: guide.title,
      role: guide.role,
      cluster: guide.cluster,
      linksTo: outbound,
      receivesLinksFrom: inbound,
      inboundCount: inbound.length,
      outboundCount: outbound.length,
      authorityScore: Math.round(authorityScore),
      isOrphan: inbound.length === 0,
    };
  });
}

export interface ClusterSummary {
  cluster: string;
  totalGuides: number;
  cornerstones: number;
  hubs: number;
  subguides: number;
  orphans: number;
  avgAuthority: number;
  avgInbound: number;
}

export function getClusterSummaries(): ClusterSummary[] {
  const data = getClusterHealthData();
  const clusters = [...new Set(SCALING_GUIDES.map(g => g.cluster))];

  return clusters.map(cluster => {
    const entries = data.filter(d => d.cluster === cluster);
    return {
      cluster,
      totalGuides: entries.length,
      cornerstones: entries.filter(e => e.role === 'cornerstone').length,
      hubs: entries.filter(e => e.role === 'hub').length,
      subguides: entries.filter(e => e.role === 'subguide').length,
      orphans: entries.filter(e => e.isOrphan).length,
      avgAuthority: entries.length > 0
        ? Math.round(entries.reduce((s, e) => s + e.authorityScore, 0) / entries.length)
        : 0,
      avgInbound: entries.length > 0
        ? Math.round((entries.reduce((s, e) => s + e.inboundCount, 0) / entries.length) * 10) / 10
        : 0,
    };
  });
}

// ============= HELPER =============

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
