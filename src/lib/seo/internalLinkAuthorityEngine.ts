/**
 * Internal Link Authority Engine
 * 
 * Centralizes and orchestrates all internal linking across guides, collections, and products.
 * Consolidates logic from guide-link-injector, seo-topic-map, and seo-content-clusters
 * into a single reporting and link-generation engine.
 */

import { SCALING_GUIDES, type ScalingGuide } from '@/lib/guide-scaling-150';
import { TOPIC_CLUSTERS, type TopicCluster } from '@/lib/seo-topic-map';
import { SEO_CONTENT_CLUSTERS } from '@/lib/seo-content-clusters';
import { getClusterHealthData, getClusterSummaries, type ClusterHealthEntry, type ClusterSummary } from '@/lib/guide-link-injector';
import { supabase } from '@/integrations/supabase/client';

// ============= TYPES =============

export interface LinkEdge {
  from: string;
  fromType: 'guide' | 'collection' | 'product';
  to: string;
  toType: 'guide' | 'collection' | 'product';
  anchor: string;
  anchorType: 'exact' | 'partial' | 'semantic' | 'branded' | 'natural';
}

export interface OrphanPage {
  path: string;
  type: 'guide' | 'collection' | 'product';
  title: string;
  inboundCount: number;
  suggestedLinks: LinkEdge[];
}

export interface AuthorityReport {
  totalInternalLinks: number;
  guidesLinked: number;
  collectionsLinked: number;
  productsLinked: number;
  orphanPages: OrphanPage[];
  orphansResolved: number;
  avgCrawlDepth: number;
  clusterSummaries: ClusterSummary[];
  guideHealth: ClusterHealthEntry[];
  linkEdges: LinkEdge[];
}

// ============= TOKENIZATION =============

function tokenize(str: string): string[] {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(w => w.length > 2);
}

function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const overlap = a.filter(t => setB.has(t)).length;
  return overlap / Math.max(a.length, b.length);
}

// ============= GUIDE → GUIDE LINKS =============

function buildGuideToGuideEdges(): LinkEdge[] {
  const edges: LinkEdge[] = [];

  for (const guide of SCALING_GUIDES) {
    // Direct linksTo
    for (const targetSlug of guide.linksTo) {
      const target = SCALING_GUIDES.find(g => g.slug === targetSlug);
      if (target) {
        edges.push({
          from: `/guides/${guide.slug}`,
          fromType: 'guide',
          to: `/guides/${target.slug}`,
          toType: 'guide',
          anchor: target.primaryKW,
          anchorType: 'exact',
        });
      }
    }

    // Cluster siblings (cornerstone/hub links)
    const clusterPeers = SCALING_GUIDES.filter(
      g => g.slug !== guide.slug && g.cluster === guide.cluster && !guide.linksTo.includes(g.slug)
    );
    const cornerstone = clusterPeers.find(g => g.role === 'cornerstone');
    if (cornerstone) {
      edges.push({
        from: `/guides/${guide.slug}`,
        fromType: 'guide',
        to: `/guides/${cornerstone.slug}`,
        toType: 'guide',
        anchor: cornerstone.title.split('–')[0].trim(),
        anchorType: 'natural',
      });
    }
  }

  return edges;
}

// ============= GUIDE → COLLECTION LINKS =============

function buildGuideToCollectionEdges(): LinkEdge[] {
  const edges: LinkEdge[] = [];

  for (const cluster of TOPIC_CLUSTERS) {
    for (const guideSlug of cluster.guidesSlugs) {
      edges.push({
        from: `/guides/${guideSlug}`,
        fromType: 'guide',
        to: `/collections/${cluster.collectionSlug}`,
        toType: 'collection',
        anchor: `shop ${cluster.label.toLowerCase()}`,
        anchorType: 'natural',
      });

      // Also link to sibling cluster collections
      for (const siblingId of cluster.siblingClusterIds.slice(0, 2)) {
        const sibling = TOPIC_CLUSTERS.find(c => c.id === siblingId);
        if (sibling) {
          edges.push({
            from: `/guides/${guideSlug}`,
            fromType: 'guide',
            to: `/collections/${sibling.collectionSlug}`,
            toType: 'collection',
            anchor: `browse ${sibling.label.toLowerCase()}`,
            anchorType: 'natural',
          });
        }
      }
    }
  }

  return edges;
}

// ============= COLLECTION → GUIDE LINKS =============

function buildCollectionToGuideEdges(): LinkEdge[] {
  const edges: LinkEdge[] = [];

  for (const cluster of TOPIC_CLUSTERS) {
    for (const guideSlug of cluster.guidesSlugs.slice(0, 5)) {
      const guide = SCALING_GUIDES.find(g => g.slug === guideSlug);
      edges.push({
        from: `/collections/${cluster.collectionSlug}`,
        fromType: 'collection',
        to: `/guides/${guideSlug}`,
        toType: 'guide',
        anchor: guide?.primaryKW || guideSlug.replace(/-/g, ' '),
        anchorType: 'semantic',
      });
    }
  }

  return edges;
}

// ============= PRODUCT → GUIDE LINKS =============

function buildProductToGuideEdges(): LinkEdge[] {
  const edges: LinkEdge[] = [];

  // Map product categories to guide clusters
  for (const cluster of TOPIC_CLUSTERS) {
    for (const category of cluster.productCategories) {
      // Each product in this category should link to 1–2 guides
      const topGuides = cluster.guidesSlugs.slice(0, 2);
      for (const guideSlug of topGuides) {
        const guide = SCALING_GUIDES.find(g => g.slug === guideSlug);
        edges.push({
          from: `[products:${category}]`,
          fromType: 'product',
          to: `/guides/${guideSlug}`,
          toType: 'guide',
          anchor: guide?.primaryKW || guideSlug.replace(/-/g, ' '),
          anchorType: 'semantic',
        });
      }
    }
  }

  return edges;
}

// ============= ORPHAN DETECTION =============

function detectOrphanGuides(allEdges: LinkEdge[]): OrphanPage[] {
  const inboundMap = new Map<string, number>();

  // Count inbound links for each guide
  for (const guide of SCALING_GUIDES) {
    const path = `/guides/${guide.slug}`;
    inboundMap.set(path, 0);
  }

  for (const edge of allEdges) {
    const current = inboundMap.get(edge.to) ?? 0;
    inboundMap.set(edge.to, current + 1);
  }

  const orphans: OrphanPage[] = [];
  for (const guide of SCALING_GUIDES) {
    const path = `/guides/${guide.slug}`;
    const inbound = inboundMap.get(path) ?? 0;
    if (inbound < 2) {
      // Suggest links from cluster cornerstone and hub
      const suggested: LinkEdge[] = [];
      const clusterPeers = SCALING_GUIDES.filter(g => g.slug !== guide.slug && g.cluster === guide.cluster);
      const cornerstone = clusterPeers.find(g => g.role === 'cornerstone');
      const hub = clusterPeers.find(g => g.role === 'hub');

      if (cornerstone) {
        suggested.push({
          from: `/guides/${cornerstone.slug}`,
          fromType: 'guide',
          to: path,
          toType: 'guide',
          anchor: guide.primaryKW,
          anchorType: 'exact',
        });
      }
      if (hub) {
        suggested.push({
          from: `/guides/${hub.slug}`,
          fromType: 'guide',
          to: path,
          toType: 'guide',
          anchor: guide.title.split('–')[0].trim(),
          anchorType: 'natural',
        });
      }

      orphans.push({
        path,
        type: 'guide',
        title: guide.title,
        inboundCount: inbound,
        suggestedLinks: suggested,
      });
    }
  }

  return orphans;
}

// ============= CRAWL DEPTH ESTIMATION =============

function estimateAvgCrawlDepth(edges: LinkEdge[]): number {
  // BFS from homepage to estimate average depth
  const graph = new Map<string, Set<string>>();
  
  // Homepage links to collections and top guides
  const homepagePaths = new Set<string>();
  for (const cluster of TOPIC_CLUSTERS) {
    homepagePaths.add(`/collections/${cluster.collectionSlug}`);
    if (cluster.guidesSlugs[0]) {
      homepagePaths.add(`/guides/${cluster.guidesSlugs[0]}`);
    }
  }

  graph.set('/', homepagePaths);

  for (const edge of edges) {
    if (!graph.has(edge.from)) graph.set(edge.from, new Set());
    graph.get(edge.from)!.add(edge.to);
  }

  // BFS
  const visited = new Map<string, number>();
  const queue: [string, number][] = [['/', 0]];
  visited.set('/', 0);

  while (queue.length > 0) {
    const [node, depth] = queue.shift()!;
    const neighbors = graph.get(node);
    if (!neighbors) continue;
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.set(next, depth + 1);
        queue.push([next, depth + 1]);
      }
    }
  }

  const depths = Array.from(visited.values()).filter(d => d > 0);
  if (depths.length === 0) return 0;
  return Math.round((depths.reduce((a, b) => a + b, 0) / depths.length) * 10) / 10;
}

// ============= MAIN ENGINE =============

export function generateAuthorityReport(): AuthorityReport {
  const guideToGuide = buildGuideToGuideEdges();
  const guideToCollection = buildGuideToCollectionEdges();
  const collectionToGuide = buildCollectionToGuideEdges();
  const productToGuide = buildProductToGuideEdges();

  const allEdges = [...guideToGuide, ...guideToCollection, ...collectionToGuide, ...productToGuide];

  const orphans = detectOrphanGuides(allEdges);
  const guideHealth = getClusterHealthData();
  const clusterSummaries = getClusterSummaries();
  const avgCrawlDepth = estimateAvgCrawlDepth(allEdges);

  // Count unique linked entities
  const linkedGuides = new Set<string>();
  const linkedCollections = new Set<string>();
  const linkedProducts = new Set<string>();

  for (const edge of allEdges) {
    if (edge.fromType === 'guide') linkedGuides.add(edge.from);
    if (edge.toType === 'guide') linkedGuides.add(edge.to);
    if (edge.fromType === 'collection') linkedCollections.add(edge.from);
    if (edge.toType === 'collection') linkedCollections.add(edge.to);
    if (edge.fromType === 'product') linkedProducts.add(edge.from);
    if (edge.toType === 'product') linkedProducts.add(edge.to);
  }

  // Orphans that have suggested fixes
  const orphansResolved = orphans.filter(o => o.suggestedLinks.length > 0).length;

  return {
    totalInternalLinks: allEdges.length,
    guidesLinked: linkedGuides.size,
    collectionsLinked: linkedCollections.size,
    productsLinked: linkedProducts.size,
    orphanPages: orphans,
    orphansResolved,
    avgCrawlDepth,
    clusterSummaries,
    guideHealth,
    linkEdges: allEdges,
  };
}

// ============= GUIDE RECOMMENDATIONS FOR PRODUCTS =============

export function getGuidesForProduct(productName: string, productCategory: string | null): { slug: string; title: string }[] {
  const tokens = tokenize(`${productName} ${productCategory || ''}`);
  
  return SCALING_GUIDES
    .map(g => ({
      slug: g.slug,
      title: g.title,
      score: tokenSimilarity(tokens, tokenize(`${g.title} ${g.primaryKW} ${g.secondaryKWs.join(' ')}`)),
    }))
    .filter(g => g.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ slug, title }) => ({ slug, title }));
}

// ============= COLLECTION RECOMMENDATIONS =============

export function getGuidesForCollection(collectionSlug: string): { slug: string; title: string; anchor: string }[] {
  const cluster = TOPIC_CLUSTERS.find(c => c.collectionSlug === collectionSlug);
  if (cluster) {
    return cluster.guidesSlugs.slice(0, 5).map(slug => {
      const guide = SCALING_GUIDES.find(g => g.slug === slug);
      return {
        slug,
        title: guide?.title || slug.replace(/-/g, ' '),
        anchor: guide?.primaryKW || slug.replace(/-/g, ' '),
      };
    });
  }

  // Fallback: token similarity
  const tokens = tokenize(collectionSlug);
  return SCALING_GUIDES
    .map(g => ({
      slug: g.slug,
      title: g.title,
      anchor: g.primaryKW,
      score: tokenSimilarity(tokens, tokenize(`${g.slug} ${g.primaryKW}`)),
    }))
    .filter(g => g.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ slug, title, anchor }) => ({ slug, title, anchor }));
}

// ============= ANCHOR TEXT VARIATION =============

const ANCHOR_TEMPLATES = [
  (kw: string) => kw,
  (kw: string) => `best ${kw}`,
  (kw: string) => `${kw} guide`,
  (kw: string) => `how to choose ${kw}`,
  (kw: string) => `our ${kw} guide`,
  (kw: string) => `complete ${kw} guide`,
  (kw: string) => `learn about ${kw}`,
  (kw: string) => `${kw} buying guide`,
];

export function getVariedAnchor(keyword: string, index: number): string {
  const templateFn = ANCHOR_TEMPLATES[index % ANCHOR_TEMPLATES.length];
  return templateFn(keyword);
}
