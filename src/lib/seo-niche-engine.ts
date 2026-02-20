/**
 * SEO Niche Detection & Growth Scoring Engine
 *
 * Auto-clusters GSC queries into semantic niches, scores each niche
 * for growth potential, and identifies the Active Expansion Niche.
 *
 * Growth Score formula:
 *   (Impression growth rate × 0.3)
 * + (Keywords ranking 4–15 × 0.25)
 * + (CTR gap potential × 0.2)
 * + (Conversion intent score × 0.15)
 * + (Competition weakness indicator × 0.1)
 */

// ============= NICHE SEED DEFINITIONS =============

export interface NicheSeed {
  id: string;
  label: string;
  /** Core terms for matching — case-insensitive substring match */
  keywords: string[];
  /** Pillar URL if exists */
  pillarUrl?: string;
  /** Product category slug for conversion data */
  categorySlug?: string;
}

/**
 * Seed niches are intentionally broad — queries that match none
 * of these get grouped into an "Uncategorized" cluster.
 * New niches can be auto-detected from high-volume uncategorized clusters.
 */
export const NICHE_SEEDS: NicheSeed[] = [
  {
    id: 'cat-condos',
    label: 'Cat Condos & Trees',
    keywords: ['cat condo', 'cat condos', 'cat tree', 'cat tower', 'kitty condo', 'cat trees', 'cat house tree'],
    pillarUrl: '/collections/cat-condos',
    categorySlug: 'cat-trees-condos',
  },
  {
    id: 'guinea-pig-cages',
    label: 'Guinea Pig Cages',
    keywords: ['guinea pig cage', 'guinea pig cages', 'guinea pig playpen', 'guinea pig pen'],
    categorySlug: 'guinea-pig-cages',
  },
  {
    id: 'dog-harness',
    label: 'Dog Harnesses',
    keywords: ['dog harness', 'dog harnesses', 'no pull harness', 'service dog harness', 'tactical harness'],
    categorySlug: 'dog-harnesses',
  },
  {
    id: 'dog-car-seat',
    label: 'Dog Car Seats',
    keywords: ['dog car seat', 'dog car seats', 'pet car seat', 'dog booster seat', 'dog seat cover'],
    categorySlug: 'dog-car-seats',
  },
  {
    id: 'pet-stairs',
    label: 'Pet Stairs & Ramps',
    keywords: ['pet stairs', 'dog stairs', 'pet ramp', 'dog ramp', 'pet steps', 'dog steps'],
    categorySlug: 'pet-stairs',
  },
  {
    id: 'cat-beds',
    label: 'Cat Beds',
    keywords: ['cat bed', 'cat beds', 'kitten bed', 'cat hammock', 'cat sleeping'],
    categorySlug: 'cat-beds',
  },
  {
    id: 'dog-toys',
    label: 'Dog Toys & Enrichment',
    keywords: ['dog toy', 'dog toys', 'dog enrichment', 'interactive dog', 'dog puzzle', 'dog ball'],
    categorySlug: 'dog-toys',
  },
  {
    id: 'cat-toys',
    label: 'Cat Toys',
    keywords: ['cat toy', 'cat toys', 'kitten toy', 'cat feather', 'cat laser'],
    categorySlug: 'cat-toys',
  },
  {
    id: 'slow-feeder',
    label: 'Slow Feeder Bowls',
    keywords: ['slow feeder', 'slow feed', 'puzzle bowl', 'anti-gulp'],
    categorySlug: 'slow-feeder-bowls',
  },
  {
    id: 'cat-litter',
    label: 'Cat Litter Boxes',
    keywords: ['cat litter', 'litter box', 'self cleaning litter', 'litter boxes'],
    categorySlug: 'cat-litter-boxes',
  },
];

// ============= TYPES =============

export interface GscQueryRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
  sync_date: string;
}

export interface NicheCluster {
  niche: NicheSeed;
  queries: GscQueryRow[];
  totalImpressions: number;
  totalClicks: number;
  avgPosition: number;
  avgCtr: number;
  queriesInStrikeZone: number; // pos 4-15
  queriesTop10: number;
  queriesTop5: number;
  highImpLowCtr: number;
  longtailCount: number;
  hasPillar: boolean;
  growthScore: number;
}

export interface NicheDetectionReport {
  clusters: NicheCluster[];
  activeNiche: NicheCluster | null;
  uncategorized: GscQueryRow[];
  emergingNiches: { keyword: string; impressions: number }[];
  timestamp: string;
}

// ============= CLUSTERING =============

function classifyQuery(query: string, seeds: NicheSeed[]): NicheSeed | null {
  const q = query.toLowerCase().trim();
  for (const seed of seeds) {
    if (seed.keywords.some(kw => q.includes(kw))) {
      return seed;
    }
  }
  return null;
}

// ============= GROWTH SCORE =============

function calculateGrowthScore(cluster: Omit<NicheCluster, 'growthScore'>): number {
  const totalQ = Math.max(cluster.queries.length, 1);

  // Impression growth rate proxy: total impressions normalized (0-100)
  const impressionScore = Math.min(100, (cluster.totalImpressions / 500) * 100);

  // Keywords in strike zone (pos 4-15) as % of total
  const strikeZoneScore = Math.min(100, (cluster.queriesInStrikeZone / totalQ) * 100 * 3);

  // CTR gap: how much room for improvement (higher gap = more potential)
  const idealCtr = 5; // 5% target CTR
  const ctrGap = Math.min(100, Math.max(0, idealCtr - cluster.avgCtr) * 20);

  // Conversion intent: commercial queries tend to have product pages
  const commercialQueries = cluster.queries.filter(q =>
    /buy|best|cheap|review|price|sale|top|vs|compare/i.test(q.query)
  ).length;
  const conversionIntent = Math.min(100, (commercialQueries / totalQ) * 100 * 2);

  // Competition weakness: high avg position = weaker competition for us to break through
  // Actually inverted — if we're at pos 50+, competition is strong. If 10-30, we're close.
  const compWeakness = cluster.avgPosition <= 30
    ? Math.min(100, (30 - cluster.avgPosition) * 5)
    : Math.max(0, 50 - (cluster.avgPosition - 30));

  return Math.round(
    impressionScore * 0.3 +
    strikeZoneScore * 0.25 +
    ctrGap * 0.2 +
    conversionIntent * 0.15 +
    compWeakness * 0.1
  );
}

// ============= MAIN ENGINE =============

export function detectNiches(gscData: GscQueryRow[]): NicheDetectionReport {
  const clusterMap = new Map<string, GscQueryRow[]>();
  const uncategorized: GscQueryRow[] = [];

  // Initialize clusters
  for (const seed of NICHE_SEEDS) {
    clusterMap.set(seed.id, []);
  }

  // Classify each query
  for (const row of gscData) {
    const seed = classifyQuery(row.query, NICHE_SEEDS);
    if (seed) {
      clusterMap.get(seed.id)!.push(row);
    } else {
      uncategorized.push(row);
    }
  }

  // Build cluster objects
  const clusters: NicheCluster[] = NICHE_SEEDS
    .map(seed => {
      const queries = clusterMap.get(seed.id) || [];
      if (queries.length === 0) return null;

      const totalImpressions = queries.reduce((s, r) => s + r.impressions, 0);
      const totalClicks = queries.reduce((s, r) => s + r.clicks, 0);
      const avgPosition = totalImpressions > 0
        ? queries.reduce((s, r) => s + r.position * r.impressions, 0) / totalImpressions
        : 0;
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      const partial: Omit<NicheCluster, 'growthScore'> = {
        niche: seed,
        queries,
        totalImpressions,
        totalClicks,
        avgCtr,
        avgPosition,
        queriesInStrikeZone: queries.filter(q => q.position >= 4 && q.position <= 15).length,
        queriesTop10: queries.filter(q => q.position <= 10).length,
        queriesTop5: queries.filter(q => q.position <= 5).length,
        highImpLowCtr: queries.filter(q => q.impressions >= 5 && q.ctr < 0.015).length,
        longtailCount: queries.filter(q => q.query.split(' ').length >= 4).length,
        hasPillar: !!seed.pillarUrl,
      };

      return { ...partial, growthScore: calculateGrowthScore(partial) } as NicheCluster;
    })
    .filter(Boolean) as NicheCluster[];

  // Sort by growth score descending
  clusters.sort((a, b) => b.growthScore - a.growthScore);

  // Detect emerging niches from uncategorized
  const uncatMap = new Map<string, number>();
  for (const row of uncategorized) {
    // Extract 2-word phrases as potential niche seeds
    const words = row.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      uncatMap.set(phrase, (uncatMap.get(phrase) || 0) + row.impressions);
    }
  }
  const emergingNiches = Array.from(uncatMap.entries())
    .filter(([, imp]) => imp >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, impressions]) => ({ keyword, impressions }));

  return {
    clusters,
    activeNiche: clusters[0] || null,
    uncategorized,
    emergingNiches,
    timestamp: new Date().toISOString(),
  };
}
