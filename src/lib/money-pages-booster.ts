/**
 * GetPawsy 30 Money Pages Priority Link Booster
 * 
 * Defines the top 30 highest-commercial-value pages and provides utilities
 * for boosting internal link equity toward them from guides, collections,
 * pillar pages, and product pages.
 * 
 * Each money page receives 10–25 contextual internal links via:
 * - pillar pages, related guides, collection pages, product pages
 * - "Recommended Guides", "Top Picks", "Learn More" content blocks
 */

// ============= TYPES =============

export interface MoneyPage {
  /** URL path */
  path: string;
  /** Page type */
  type: 'guide' | 'collection';
  /** SEO target keyword */
  targetKeyword: string;
  /** Cluster this page belongs to */
  cluster: 'cat-trees' | 'cat-litter' | 'dog-beds' | 'dog-toys' | 'pet-travel' | 'cat-toys' | 'dog-travel';
  /** Species silo */
  species: 'cat' | 'dog' | 'multi';
  /** Boost multiplier (1.0 = baseline, higher = more links) */
  boost: number;
  /** Diverse anchor text variants */
  anchors: {
    exact: string;
    partial: string;
    semantic: string;
  };
  /** Minimum desired inbound internal links */
  minInbound: number;
}

export interface MoneyPageLinkSource {
  fromPath: string;
  fromType: 'pillar' | 'guide' | 'collection' | 'product';
  anchor: string;
  anchorType: 'exact' | 'partial' | 'semantic';
}

// ============= TOP 30 MONEY PAGES =============

export const MONEY_PAGES: MoneyPage[] = [
  // ── CAT TREES (7 pages) ──
  {
    path: '/guides/best-cat-trees-large-cats-2026',
    type: 'guide', cluster: 'cat-trees', species: 'cat', boost: 1.5, minInbound: 20,
    targetKeyword: 'best cat trees for large cats',
    anchors: { exact: 'best cat trees for large cats', partial: 'top-rated cat trees for big cats', semantic: 'sturdy climbing furniture for large felines' },
  },
  {
    path: '/guides/modern-cat-trees-home-design',
    type: 'guide', cluster: 'cat-trees', species: 'cat', boost: 1.4, minInbound: 15,
    targetKeyword: 'modern cat tree',
    anchors: { exact: 'modern cat trees', partial: 'stylish cat tree ideas', semantic: 'cat furniture that matches your décor' },
  },
  {
    path: '/guides/best-luxury-cat-tree',
    type: 'guide', cluster: 'cat-trees', species: 'cat', boost: 1.4, minInbound: 15,
    targetKeyword: 'luxury cat tree',
    anchors: { exact: 'luxury cat trees', partial: 'premium cat tree picks', semantic: 'high-end cat furniture worth the investment' },
  },
  {
    path: '/guides/best-cat-trees-small-apartments',
    type: 'guide', cluster: 'cat-trees', species: 'cat', boost: 1.3, minInbound: 12,
    targetKeyword: 'cat tree for small apartment',
    anchors: { exact: 'cat trees for small apartments', partial: 'space-saving cat towers', semantic: 'compact vertical play structures' },
  },
  {
    path: '/guides/best-cat-tree-for-kittens',
    type: 'guide', cluster: 'cat-trees', species: 'cat', boost: 1.2, minInbound: 10,
    targetKeyword: 'cat tree for kittens',
    anchors: { exact: 'cat trees for kittens', partial: 'kitten-safe climbing furniture', semantic: 'age-appropriate cat towers for young cats' },
  },
  {
    path: '/guides/best-cat-tree-maine-coon',
    type: 'guide', cluster: 'cat-trees', species: 'cat', boost: 1.3, minInbound: 12,
    targetKeyword: 'cat tree for Maine Coon',
    anchors: { exact: 'cat trees for Maine Coons', partial: 'heavy-duty cat trees for big breeds', semantic: 'extra-sturdy cat furniture for large breed cats' },
  },
  {
    path: '/collections/cat-trees-and-condos',
    type: 'collection', cluster: 'cat-trees', species: 'cat', boost: 1.5, minInbound: 20,
    targetKeyword: 'cat trees and condos',
    anchors: { exact: 'cat trees and condos', partial: 'shop cat trees', semantic: 'browse our cat furniture collection' },
  },

  // ── CAT LITTER BOXES (5 pages) ──
  {
    path: '/guides/best-cat-litter-box-2026',
    type: 'guide', cluster: 'cat-litter', species: 'cat', boost: 1.5, minInbound: 20,
    targetKeyword: 'best cat litter box',
    anchors: { exact: 'best cat litter boxes', partial: 'top litter box picks', semantic: 'expert-reviewed litter solutions' },
  },
  {
    path: '/guides/best-self-cleaning-litter-box-2026',
    type: 'guide', cluster: 'cat-litter', species: 'cat', boost: 1.4, minInbound: 15,
    targetKeyword: 'best self cleaning litter box',
    anchors: { exact: 'best self-cleaning litter boxes', partial: 'automatic litter box reviews', semantic: 'hands-free litter solutions' },
  },
  {
    path: '/guides/best-cat-litter-for-odor-control',
    type: 'guide', cluster: 'cat-litter', species: 'cat', boost: 1.3, minInbound: 12,
    targetKeyword: 'best cat litter for odor control',
    anchors: { exact: 'best litter for odor control', partial: 'odor-fighting litter picks', semantic: 'keep your home smelling fresh' },
  },
  {
    path: '/guides/best-litter-boxes-apartments-2026',
    type: 'guide', cluster: 'cat-litter', species: 'cat', boost: 1.2, minInbound: 10,
    targetKeyword: 'litter box for small apartment',
    anchors: { exact: 'litter boxes for apartments', partial: 'compact litter solutions', semantic: 'space-saving litter box options' },
  },
  {
    path: '/guides/best-litter-box-senior-cats',
    type: 'guide', cluster: 'cat-litter', species: 'cat', boost: 1.2, minInbound: 10,
    targetKeyword: 'litter box for senior cats',
    anchors: { exact: 'litter boxes for senior cats', partial: 'low-entry litter boxes', semantic: 'gentle litter solutions for aging cats' },
  },

  // ── DOG BEDS (6 pages) ──
  {
    path: '/guides/best-orthopedic-dog-bed-2026',
    type: 'guide', cluster: 'dog-beds', species: 'dog', boost: 1.5, minInbound: 20,
    targetKeyword: 'best orthopedic dog bed',
    anchors: { exact: 'best orthopedic dog beds', partial: 'joint-support dog bed picks', semantic: 'comfortable rest for dogs with joint issues' },
  },
  {
    path: '/guides/best-dog-beds-large-breeds-2026',
    type: 'guide', cluster: 'dog-beds', species: 'dog', boost: 1.4, minInbound: 15,
    targetKeyword: 'best dog beds for large dogs',
    anchors: { exact: 'best dog beds for large dogs', partial: 'XL dog bed recommendations', semantic: 'spacious sleeping solutions for big breeds' },
  },
  {
    path: '/guides/dog-bed-for-anxiety-do-they-work',
    type: 'guide', cluster: 'dog-beds', species: 'dog', boost: 1.4, minInbound: 15,
    targetKeyword: 'calming dog bed for anxiety',
    anchors: { exact: 'calming dog beds for anxiety', partial: 'anxiety-relief dog beds', semantic: 'help your anxious dog feel safe and secure' },
  },
  {
    path: '/guides/how-to-wash-a-dog-bed-properly',
    type: 'guide', cluster: 'dog-beds', species: 'dog', boost: 1.2, minInbound: 10,
    targetKeyword: 'waterproof dog bed',
    anchors: { exact: 'waterproof dog beds', partial: 'easy-clean dog bed options', semantic: 'durable beds that resist spills and accidents' },
  },
  {
    path: '/guides/orthopedic-dog-beds-for-senior-dogs',
    type: 'guide', cluster: 'dog-beds', species: 'dog', boost: 1.3, minInbound: 12,
    targetKeyword: 'dog bed for senior dogs',
    anchors: { exact: 'dog beds for senior dogs', partial: 'beds designed for aging pups', semantic: 'supportive rest for older dogs' },
  },
  {
    path: '/collections/orthopedic-calming-dog-beds',
    type: 'collection', cluster: 'dog-beds', species: 'dog', boost: 1.5, minInbound: 20,
    targetKeyword: 'orthopedic dog beds',
    anchors: { exact: 'orthopedic dog beds', partial: 'shop dog beds', semantic: 'browse our dog bed collection' },
  },

  // ── DOG TOYS (4 pages) ──
  {
    path: '/guides/best-toys-for-aggressive-chewers',
    type: 'guide', cluster: 'dog-toys', species: 'dog', boost: 1.5, minInbound: 20,
    targetKeyword: 'best dog toys for aggressive chewers',
    anchors: { exact: 'best toys for aggressive chewers', partial: 'indestructible dog toy picks', semantic: 'tough toys built for power chewers' },
  },
  {
    path: '/guides/best-dog-toys-mental-stimulation',
    type: 'guide', cluster: 'dog-toys', species: 'dog', boost: 1.3, minInbound: 12,
    targetKeyword: 'dog toys for mental stimulation',
    anchors: { exact: 'mental stimulation dog toys', partial: 'brain games for dogs', semantic: 'keep your dog mentally sharp with enrichment toys' },
  },
  {
    path: '/guides/best-toys-for-bored-dogs',
    type: 'guide', cluster: 'dog-toys', species: 'dog', boost: 1.3, minInbound: 12,
    targetKeyword: 'best dog toys for boredom',
    anchors: { exact: 'dog toys for boredom', partial: 'boredom-busting toy picks', semantic: 'keep your dog entertained all day' },
  },
  {
    path: '/collections/best-interactive-dog-toys',
    type: 'collection', cluster: 'dog-toys', species: 'dog', boost: 1.4, minInbound: 15,
    targetKeyword: 'interactive dog toys',
    anchors: { exact: 'interactive dog toys', partial: 'shop dog toys', semantic: 'explore our enrichment toy collection' },
  },

  // ── PET TRAVEL (5 pages) ──
  {
    path: '/guides/best-dog-car-seat',
    type: 'guide', cluster: 'pet-travel', species: 'dog', boost: 1.5, minInbound: 20,
    targetKeyword: 'best dog car seat',
    anchors: { exact: 'best dog car seats', partial: 'top-rated car seats for dogs', semantic: 'safe car travel solutions for your pup' },
  },
  {
    path: '/guides/best-pet-carrier-airline-approved',
    type: 'guide', cluster: 'pet-travel', species: 'multi', boost: 1.4, minInbound: 15,
    targetKeyword: 'airline approved pet carrier',
    anchors: { exact: 'airline approved pet carriers', partial: 'TSA-friendly pet carriers', semantic: 'fly safely with your pet' },
  },
  {
    path: '/guides/best-dog-stroller',
    type: 'guide', cluster: 'pet-travel', species: 'dog', boost: 1.3, minInbound: 12,
    targetKeyword: 'best pet stroller',
    anchors: { exact: 'best pet strollers', partial: 'top dog stroller picks', semantic: 'comfortable outdoor mobility for your pet' },
  },
  {
    path: '/collections/dog-travel-accessories',
    type: 'collection', cluster: 'pet-travel', species: 'dog', boost: 1.5, minInbound: 20,
    targetKeyword: 'dog travel accessories',
    anchors: { exact: 'dog travel accessories', partial: 'shop travel gear for dogs', semantic: 'everything you need for traveling with your dog' },
  },
  {
    path: '/collections/best-dog-car-seats',
    type: 'collection', cluster: 'pet-travel', species: 'dog', boost: 1.4, minInbound: 15,
    targetKeyword: 'dog car seats',
    anchors: { exact: 'dog car seats', partial: 'shop dog car seats', semantic: 'safe and secure car seats for dogs' },
  },

  // ── CAT TOYS (2 pages) ──
  {
    path: '/guides/best-interactive-cat-toys-that-work',
    type: 'guide', cluster: 'cat-toys', species: 'cat', boost: 1.3, minInbound: 12,
    targetKeyword: 'best interactive cat toys',
    anchors: { exact: 'best interactive cat toys', partial: 'cat toys that actually work', semantic: 'engaging toys to keep indoor cats active' },
  },
  {
    path: '/guides/best-automatic-cat-toy',
    type: 'guide', cluster: 'cat-toys', species: 'cat', boost: 1.2, minInbound: 10,
    targetKeyword: 'best automatic cat toy',
    anchors: { exact: 'automatic cat toys', partial: 'self-playing cat toy picks', semantic: 'hands-free entertainment for cats' },
  },

  // ── SEO TRAFFIC MACHINE PAGES ──
  {
    path: '/best-cat-litter-box-2026',
    type: 'guide', cluster: 'cat-litter', species: 'cat', boost: 1.5, minInbound: 20,
    targetKeyword: 'best cat litter box 2026',
    anchors: { exact: 'best cat litter box 2026', partial: 'top litter box picks this year', semantic: 'expert-reviewed litter box recommendations' },
  },
  {
    path: '/best-dog-car-seat-safety',
    type: 'guide', cluster: 'dog-travel', species: 'dog', boost: 1.5, minInbound: 20,
    targetKeyword: 'best dog car seat',
    anchors: { exact: 'best dog car seats', partial: 'crash-tested dog car seats', semantic: 'keep your dog safe during car travel' },
  },
  {
    path: '/best-interactive-cat-toys',
    type: 'guide', cluster: 'cat-toys', species: 'cat', boost: 1.4, minInbound: 15,
    targetKeyword: 'best interactive cat toys',
    anchors: { exact: 'best interactive cat toys', partial: 'top toys for bored cats', semantic: 'keep indoor cats active and entertained' },
  },
  {
    path: '/best-dog-anxiety-solutions',
    type: 'guide', cluster: 'dog-beds', species: 'dog', boost: 1.4, minInbound: 15,
    targetKeyword: 'best dog anxiety solutions',
    anchors: { exact: 'best dog anxiety solutions', partial: 'calming products for anxious dogs', semantic: 'help your stressed dog feel safe' },
  },
];

// ============= LOOKUP UTILITIES =============

const moneyPageMap = new Map(MONEY_PAGES.map(mp => [mp.path, mp]));
const moneyPagesByCluster = new Map<string, MoneyPage[]>();
for (const mp of MONEY_PAGES) {
  const existing = moneyPagesByCluster.get(mp.cluster) || [];
  existing.push(mp);
  moneyPagesByCluster.set(mp.cluster, existing);
}

/** Check if a path is a money page */
export function isMoneyPage(path: string): boolean {
  return moneyPageMap.has(path);
}

/** Get money page config */
export function getMoneyPage(path: string): MoneyPage | undefined {
  return moneyPageMap.get(path);
}

/** Get all money pages for a cluster */
export function getMoneyPagesForCluster(cluster: string): MoneyPage[] {
  return moneyPagesByCluster.get(cluster) || [];
}

/** Get money pages by species (for species-silo safe linking) */
export function getMoneyPagesBySpecies(species: 'cat' | 'dog' | 'multi'): MoneyPage[] {
  return MONEY_PAGES.filter(mp => mp.species === species || mp.species === 'multi');
}

// ============= LINK SOURCE GENERATOR =============

/**
 * Given a source page, return the money pages it should link to.
 * Respects species silo and returns diverse anchors.
 */
export function getMoneyPageLinksForSource(
  sourcePath: string,
  sourceType: 'pillar' | 'guide' | 'collection' | 'product',
  sourceCluster: string,
  sourceSpecies: 'cat' | 'dog' | 'multi',
): { page: MoneyPage; anchor: string; anchorType: 'exact' | 'partial' | 'semantic' }[] {
  // Filter by species silo
  const eligible = MONEY_PAGES.filter(mp => {
    // Don't link to self
    if (mp.path === sourcePath) return false;
    // Species silo
    if (sourceSpecies === 'cat') return mp.species === 'cat' || mp.species === 'multi';
    if (sourceSpecies === 'dog') return mp.species === 'dog' || mp.species === 'multi';
    return true; // multi can link to anything
  });

  // Sort by: same cluster first, then by boost
  const sorted = [...eligible].sort((a, b) => {
    const aInCluster = a.cluster === sourceCluster ? 1 : 0;
    const bInCluster = b.cluster === sourceCluster ? 1 : 0;
    if (aInCluster !== bInCluster) return bInCluster - aInCluster;
    return b.boost - a.boost;
  });

  // Determine how many to return based on source type
  const maxLinks = sourceType === 'pillar' ? 8 : sourceType === 'guide' ? 4 : sourceType === 'collection' ? 5 : 2;

  return sorted.slice(0, maxLinks).map((page, i) => {
    // Rotate anchor types for diversity
    const anchorType = i % 3 === 0 ? 'exact' : i % 3 === 1 ? 'partial' : 'semantic';
    return {
      page,
      anchor: page.anchors[anchorType],
      anchorType,
    };
  });
}

// ============= LINK DISTRIBUTION REPORT =============

/**
 * Generates a report of how many internal link sources each money page receives.
 */
export function generateMoneyPageReport(): {
  pages: {
    path: string;
    targetKeyword: string;
    cluster: string;
    boost: number;
    minInbound: number;
    estimatedInbound: number;
    sources: { from: string; type: string }[];
    deficit: number;
  }[];
  totalMoneyPages: number;
  totalEstimatedLinks: number;
  pagesAtTarget: number;
  pagesBelowTarget: number;
} {
  // Simulate link sources based on the supercluster engine structure
  const pageSources = new Map<string, { from: string; type: string }[]>();
  for (const mp of MONEY_PAGES) pageSources.set(mp.path, []);

  // Import cluster data to compute sources
  // Each money page gets links from:
  // 1. Its own pillar page (1 link)
  // 2. Sibling guides in the same cluster (2-4 links each)
  // 3. Collection pages in the same cluster (1-2 links)
  // 4. Cross-cluster pillar pages (1 link)
  // 5. MoneyPageBooster blocks on related pages (3-6 links)
  
  const clusterPillars: Record<string, string> = {
    'cat-trees': '/guides/cat-tree-buying-guide',
    'cat-litter': '/guides/cat-litter-box-guide',
    'dog-beds': '/guides/dog-bed-buying-guide',
    'dog-toys': '/guides/dog-toy-guide',
    'pet-travel': '/guides/pet-travel-guide',
    'cat-toys': '/guides/cat-toy-buying-guide',
  };

  for (const mp of MONEY_PAGES) {
    const sources = pageSources.get(mp.path)!;

    // Pillar link
    const pillarPath = clusterPillars[mp.cluster];
    if (pillarPath && pillarPath !== mp.path) {
      sources.push({ from: pillarPath, type: 'pillar' });
    }

    // Sibling guides (estimate 3-5 based on boost)
    const siblingCount = Math.round(3 + mp.boost);
    for (let i = 0; i < siblingCount; i++) {
      sources.push({ from: `cluster-guide-${mp.cluster}-${i}`, type: 'guide' });
    }

    // Collection link
    sources.push({ from: `collection-${mp.cluster}`, type: 'collection' });

    // Cross-cluster links (1-2)
    sources.push({ from: 'cross-cluster-pillar', type: 'pillar' });

    // MoneyPageBooster blocks (estimated 4-8 based on boost)
    const boosterCount = Math.round(4 * mp.boost);
    for (let i = 0; i < boosterCount; i++) {
      sources.push({ from: `booster-block-${i}`, type: 'booster' });
    }
  }

  const pages = MONEY_PAGES.map(mp => {
    const sources = pageSources.get(mp.path) || [];
    return {
      path: mp.path,
      targetKeyword: mp.targetKeyword,
      cluster: mp.cluster,
      boost: mp.boost,
      minInbound: mp.minInbound,
      estimatedInbound: sources.length,
      sources,
      deficit: Math.max(0, mp.minInbound - sources.length),
    };
  });

  return {
    pages,
    totalMoneyPages: MONEY_PAGES.length,
    totalEstimatedLinks: pages.reduce((s, p) => s + p.estimatedInbound, 0),
    pagesAtTarget: pages.filter(p => p.deficit === 0).length,
    pagesBelowTarget: pages.filter(p => p.deficit > 0).length,
  };
}
