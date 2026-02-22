/**
 * Revenue Priority Score (RPS) Engine — GetPawsy
 * 
 * Shifts SEO strategy from traffic-based to revenue-based prioritization.
 * RPS = (Search Volume × Commercial Intent × Margin × Conversion Likelihood) ÷ Competition
 */

export interface RPSCollection {
  slug: string;
  name: string;
  searchVolume: number;
  commercialIntent: number;   // 0-1 scale
  marginScore: number;        // 0-1 scale (relative margin tier)
  conversionLikelihood: number; // 0-1 scale
  competitionLevel: number;   // 1-10 (10 = hardest)
  rps: number;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';
}

function calculateRPS(
  searchVolume: number,
  commercialIntent: number,
  marginScore: number,
  conversionLikelihood: number,
  competitionLevel: number,
): number {
  const raw = (searchVolume * commercialIntent * marginScore * conversionLikelihood) / Math.max(competitionLevel, 1);
  return Math.round(raw * 100) / 100;
}

function assignTier(rps: number): RPSCollection['tier'] {
  if (rps >= 50) return 'platinum';
  if (rps >= 25) return 'gold';
  if (rps >= 10) return 'silver';
  return 'bronze';
}

function buildEntry(
  slug: string, name: string,
  sv: number, ci: number, ms: number, cl: number, comp: number,
): RPSCollection {
  const rps = calculateRPS(sv, ci, ms, cl, comp);
  return { slug, name, searchVolume: sv, commercialIntent: ci, marginScore: ms, conversionLikelihood: cl, competitionLevel: comp, rps, tier: assignTier(rps) };
}

/** All collections ranked by Revenue Priority Score */
export const RPS_RANKED_COLLECTIONS: RPSCollection[] = [
  // Platinum tier — highest revenue potential
  buildEntry('orthopedic-calming-dog-beds', 'Orthopedic & Calming Dog Beds', 6600, 0.95, 0.85, 0.7, 7),
  buildEntry('best-dog-car-seats', 'Dog Car Seats', 3600, 0.9, 0.9, 0.65, 5),
  buildEntry('automatic-cat-feeders', 'Automatic Cat Feeders', 4400, 0.9, 0.8, 0.6, 6),
  buildEntry('cat-condos', 'Cat Condos & Trees', 12100, 0.85, 0.75, 0.55, 8),
  buildEntry('best-dog-grooming-kits', 'Dog Grooming Kits', 2900, 0.9, 0.85, 0.7, 4),
  buildEntry('indestructible-dog-toys', 'Indestructible Dog Toys', 5400, 0.85, 0.8, 0.65, 6),

  // Gold tier
  buildEntry('best-interactive-dog-toys', 'Interactive Dog Toys', 3600, 0.8, 0.7, 0.6, 5),
  buildEntry('best-slow-feeder-dog-bowls', 'Slow Feeder Dog Bowls', 2400, 0.85, 0.75, 0.65, 4),
  buildEntry('best-cat-litter-boxes', 'Cat Litter Boxes', 8100, 0.85, 0.7, 0.5, 7),
  buildEntry('best-dog-harnesses', 'Dog Harnesses', 4400, 0.85, 0.7, 0.55, 6),
  buildEntry('best-cat-carriers', 'Cat Carriers', 2900, 0.85, 0.75, 0.6, 5),
  buildEntry('best-cat-beds', 'Cat Beds', 3600, 0.8, 0.7, 0.55, 5),
  buildEntry('waterproof-dog-beds', 'Waterproof Dog Beds', 1900, 0.9, 0.8, 0.7, 3),
  buildEntry('cooling-dog-beds', 'Cooling Dog Beds', 1600, 0.85, 0.8, 0.65, 3),

  // Silver tier
  buildEntry('dog-beds-for-anxiety', 'Dog Beds for Anxiety', 1400, 0.85, 0.8, 0.6, 4),
  buildEntry('best-dog-beds-for-large-dogs', 'Dog Beds for Large Dogs', 2400, 0.85, 0.75, 0.55, 5),
  buildEntry('best-cat-toys-for-indoor-cats', 'Cat Toys for Indoor Cats', 2900, 0.75, 0.65, 0.5, 5),
  buildEntry('best-dog-toys-for-puppies', 'Dog Toys for Puppies', 1900, 0.8, 0.65, 0.55, 4),
  buildEntry('dog-travel-accessories', 'Dog Travel Accessories', 1200, 0.8, 0.75, 0.6, 3),
  buildEntry('memory-foam-dog-beds', 'Memory Foam Dog Beds', 1600, 0.85, 0.8, 0.6, 5),
  buildEntry('best-orthopedic-dog-beds', 'Orthopedic Dog Beds', 2900, 0.9, 0.8, 0.6, 6),
  buildEntry('dog-bed-for-senior-dogs', 'Dog Beds for Senior Dogs', 880, 0.85, 0.85, 0.65, 3),

  // Bronze tier
  buildEntry('multi-cat-condos', 'Multi-Cat Condos', 720, 0.75, 0.7, 0.5, 3),
  buildEntry('wall-mounted-cat-furniture', 'Wall-Mounted Cat Furniture', 590, 0.7, 0.7, 0.45, 3),
  buildEntry('dog-enrichment-toys', 'Dog Enrichment Toys', 880, 0.7, 0.6, 0.45, 3),
  buildEntry('best-cat-trees-for-small-apartments', 'Cat Trees for Small Apartments', 890, 0.75, 0.65, 0.5, 4),
].sort((a, b) => b.rps - a.rps);

// ============= UTILITY FUNCTIONS =============

export function getTopRPSCollections(n = 10): RPSCollection[] {
  return RPS_RANKED_COLLECTIONS.slice(0, n);
}

export function getCollectionsByTier(tier: RPSCollection['tier']): RPSCollection[] {
  return RPS_RANKED_COLLECTIONS.filter(c => c.tier === tier);
}

export function getPlatinumSlugs(): string[] {
  return getCollectionsByTier('platinum').map(c => c.slug);
}

export function isHighRPS(slug: string): boolean {
  const entry = RPS_RANKED_COLLECTIONS.find(c => c.slug === slug);
  return entry ? (entry.tier === 'platinum' || entry.tier === 'gold') : false;
}

// ============= REVENUE FUNNEL ARCHITECTURE =============

export const REVENUE_FUNNEL = {
  stages: [
    { name: 'Homepage', linkTargets: 'Top 12 high-RPS pillars/collections' },
    { name: 'High-RPS Pillar', linkTargets: 'Sub-collections + 3–5 blogs + 5–10 products' },
    { name: 'Collection', linkTargets: 'Products + parent pillar + 2 sibling collections + 3 blogs' },
    { name: 'Product', linkTargets: 'Related products + buying guide + collection + accessories' },
    { name: 'Blog/Guide', linkTargets: 'Primary collection + 2 products + pillar page' },
  ],
  rules: [
    'Homepage links only to platinum/gold tier collections',
    'Pillar pages link downward to sub-collections and products',
    'Every product must have ≥3 internal links pointing to it',
    'SEO energy flows toward money pages (platinum > gold > silver)',
    'Bronze tier pages receive minimal internal link investment',
    'No orphan pages — every page linked from ≥2 sources',
    'Maximum click depth from homepage: 3',
  ],
} as const;

// ============= 60-DAY REVENUE PROJECTION =============

export const REVENUE_PROJECTION_60DAY = {
  baseline: {
    monthlyOrganicSessions: 2500,
    avgConversionRate: 0.018,
    avgOrderValue: 48,
    monthlyRevenue: 2160,
  },
  day30: {
    projectedSessions: 5500,
    projectedConversionRate: 0.022,
    projectedAOV: 52,
    projectedRevenue: 6292,
    drivers: [
      'Platinum collection content depth doubled',
      'Internal links redirected to high-RPS pages',
      'FAQ schema on all top-20 collections',
      'Meta title/description CTR optimization',
      '10 comparison pages capturing mid-tail traffic',
    ],
  },
  day60: {
    projectedSessions: 11000,
    projectedConversionRate: 0.025,
    projectedAOV: 55,
    projectedRevenue: 15125,
    drivers: [
      'Full pillar architecture live for platinum tier',
      '20 high-intent blog posts driving informational traffic',
      'Buyer guides converting research traffic',
      'Cross-sell blocks on all top-30 products',
      'Structured data rich results increasing CTR',
    ],
  },
};
