/**
 * Supercluster Orphan Detector
 * 
 * Extends orphan detection beyond guides to include collection pages.
 * Uses the supercluster engine to identify pages with insufficient inbound links
 * and generates remediation recommendations.
 */

import {
  SUPERCLUSTERS,
  getClusterForGuide,
  getClusterForCollection,
  type SuperclusterConfig,
} from './supercluster-link-engine';

export interface SuperclusterOrphan {
  path: string;
  type: 'guide' | 'collection' | 'pillar';
  cluster: string;
  inboundFromCluster: number;
  inboundFromCrossCluster: number;
  totalInbound: number;
  minimumRequired: number;
  deficit: number;
  remediation: {
    addLinkFrom: string;
    anchor: string;
    anchorType: 'exact' | 'partial' | 'semantic';
  }[];
}

const MIN_INBOUND: Record<string, number> = {
  pillar: 15,
  guide: 3,
  collection: 4,
};

/**
 * Detect orphan pages across the entire supercluster graph.
 * Counts link sources from: guide↔guide, guide↔collection, pillar→guide, collection→guide
 */
export function detectSuperclusterOrphans(): SuperclusterOrphan[] {
  const orphans: SuperclusterOrphan[] = [];

  // Build inbound count map
  const inboundMap = new Map<string, { cluster: number; cross: number }>();

  for (const sc of SUPERCLUSTERS) {
    // Each guide in a cluster gets inbound from:
    // - pillar page (1)
    // - sibling guides that link to it (estimated from linksTo in scaling guides)
    // - collection hub links back (1)
    for (const guideSlug of sc.guideSlugs) {
      const path = `/guides/${guideSlug}`;
      const existing = inboundMap.get(path) || { cluster: 0, cross: 0 };
      // Pillar links to all cluster guides
      existing.cluster += 1;
      // Collection links to top 5 guides
      if (sc.guideSlugs.indexOf(guideSlug) < 5) existing.cluster += 1;
      inboundMap.set(path, existing);
    }

    // Pillar gets inbound from all cluster guides
    const pillarPath = `/guides/${sc.pillarSlug}`;
    const pillarExisting = inboundMap.get(pillarPath) || { cluster: 0, cross: 0 };
    pillarExisting.cluster += sc.guideSlugs.length;
    // Cross-cluster pillar links
    for (const sibId of sc.siblingClusterIds) {
      const sib = SUPERCLUSTERS.find(s => s.id === sibId);
      if (sib) pillarExisting.cross += 1;
    }
    inboundMap.set(pillarPath, pillarExisting);

    // Collection gets inbound from guides + pillar
    const collPath = `/collections/${sc.collectionSlug}`;
    const collExisting = inboundMap.get(collPath) || { cluster: 0, cross: 0 };
    collExisting.cluster += sc.guideSlugs.length + 1; // all guides + pillar
    inboundMap.set(collPath, collExisting);
  }

  // Check each guide for orphan status
  for (const sc of SUPERCLUSTERS) {
    for (const guideSlug of sc.guideSlugs) {
      const path = `/guides/${guideSlug}`;
      const counts = inboundMap.get(path) || { cluster: 0, cross: 0 };
      const total = counts.cluster + counts.cross;
      const min = MIN_INBOUND.guide;

      if (total < min) {
        const remediation: SuperclusterOrphan['remediation'] = [];

        // Suggest link from pillar
        remediation.push({
          addLinkFrom: `/guides/${sc.pillarSlug}`,
          anchor: guideSlug.replace(/-/g, ' '),
          anchorType: 'partial',
        });

        // Suggest link from collection
        remediation.push({
          addLinkFrom: `/collections/${sc.collectionSlug}`,
          anchor: guideSlug.replace(/-/g, ' '),
          anchorType: 'semantic',
        });

        // Suggest link from sibling guide
        const sibling = sc.guideSlugs.find(s => s !== guideSlug);
        if (sibling) {
          remediation.push({
            addLinkFrom: `/guides/${sibling}`,
            anchor: guideSlug.replace(/-/g, ' '),
            anchorType: 'exact',
          });
        }

        orphans.push({
          path,
          type: 'guide',
          cluster: sc.id,
          inboundFromCluster: counts.cluster,
          inboundFromCrossCluster: counts.cross,
          totalInbound: total,
          minimumRequired: min,
          deficit: min - total,
          remediation,
        });
      }
    }

    // Check pillar
    const pillarPath = `/guides/${sc.pillarSlug}`;
    const pillarCounts = inboundMap.get(pillarPath) || { cluster: 0, cross: 0 };
    const pillarTotal = pillarCounts.cluster + pillarCounts.cross;
    if (pillarTotal < MIN_INBOUND.pillar) {
      orphans.push({
        path: pillarPath,
        type: 'pillar',
        cluster: sc.id,
        inboundFromCluster: pillarCounts.cluster,
        inboundFromCrossCluster: pillarCounts.cross,
        totalInbound: pillarTotal,
        minimumRequired: MIN_INBOUND.pillar,
        deficit: MIN_INBOUND.pillar - pillarTotal,
        remediation: sc.guideSlugs.slice(0, 5).map(slug => ({
          addLinkFrom: `/guides/${slug}`,
          anchor: sc.anchors.exact[0] || sc.label,
          anchorType: 'exact' as const,
        })),
      });
    }

    // Check collections
    for (const collSlug of [sc.collectionSlug, ...sc.relatedCollections]) {
      const collPath = `/collections/${collSlug}`;
      const collCounts = inboundMap.get(collPath) || { cluster: 0, cross: 0 };
      const collTotal = collCounts.cluster + collCounts.cross;
      if (collTotal < MIN_INBOUND.collection) {
        orphans.push({
          path: collPath,
          type: 'collection',
          cluster: sc.id,
          inboundFromCluster: collCounts.cluster,
          inboundFromCrossCluster: collCounts.cross,
          totalInbound: collTotal,
          minimumRequired: MIN_INBOUND.collection,
          deficit: MIN_INBOUND.collection - collTotal,
          remediation: [
            {
              addLinkFrom: `/guides/${sc.pillarSlug}`,
              anchor: collSlug.replace(/-/g, ' '),
              anchorType: 'partial',
            },
            ...sc.guideSlugs.slice(0, 2).map(slug => ({
              addLinkFrom: `/guides/${slug}`,
              anchor: `shop ${collSlug.replace(/-/g, ' ')}`,
              anchorType: 'semantic' as const,
            })),
          ],
        });
      }
    }
  }

  return orphans.sort((a, b) => b.deficit - a.deficit);
}

/**
 * Generate a summary report of the supercluster link health.
 */
export function generateSuperclusterHealthReport() {
  const orphans = detectSuperclusterOrphans();

  const totalPages = SUPERCLUSTERS.reduce(
    (sum, sc) => sum + sc.guideSlugs.length + 1 + 1 + sc.relatedCollections.length,
    0
  );

  const orphansByType = {
    guide: orphans.filter(o => o.type === 'guide').length,
    pillar: orphans.filter(o => o.type === 'pillar').length,
    collection: orphans.filter(o => o.type === 'collection').length,
  };

  const totalRemediation = orphans.reduce((s, o) => s + o.remediation.length, 0);

  // Estimate total internal links across all clusters
  const estimatedLinks = SUPERCLUSTERS.reduce((sum, sc) => {
    const guideLinks = sc.guideSlugs.length * 8; // avg links per guide
    const pillarLinks = 20;
    const collectionLinks = (1 + sc.relatedCollections.length) * 6;
    return sum + guideLinks + pillarLinks + collectionLinks;
  }, 0);

  return {
    totalPages,
    totalOrphans: orphans.length,
    orphansByType,
    totalRemediationSuggested: totalRemediation,
    estimatedTotalInternalLinks: estimatedLinks,
    clusters: SUPERCLUSTERS.map(sc => ({
      id: sc.id,
      label: sc.label,
      guides: sc.guideSlugs.length,
      collections: 1 + sc.relatedCollections.length,
      orphans: orphans.filter(o => o.cluster === sc.id).length,
    })),
    orphans,
  };
}
