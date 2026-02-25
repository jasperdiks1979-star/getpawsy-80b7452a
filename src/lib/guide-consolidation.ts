/**
 * Guide Consolidation Redirect Map
 * 
 * Maps weaker/duplicate-intent guide slugs to the strongest canonical guide
 * for that search intent. This prevents keyword cannibalization and
 * concentrates link equity on the primary guide.
 * 
 * Rules:
 * - Primary guide = highest word count, strongest keyword match, most internal links
 * - Redirect = 301-equivalent (Navigate replace) from weak → strong
 * - Redirected slugs are excluded from sitemap via noindex flag
 */

export const GUIDE_REDIRECTS: Record<string, string> = {
  // ── Cat Litter Box Consolidation ────────────────────────────
  // Apartment litter boxes → single primary
  'best-litter-box-studio-apartment': 'best-litter-boxes-apartments-2026',
  'litter-box-for-studio-apartment': 'best-litter-boxes-apartments-2026',
  'best-litter-box-small-apartments': 'best-litter-boxes-apartments-2026',

  // High-sided litter box → single primary
  'high-sided-litter-box-guide': 'best-high-sided-litter-box',

  // Multi-cat litter box → single primary
  'best-litter-box-for-multiple-cats': 'best-litter-boxes-multi-cat',

  // Budget litter box → single primary
  'top-rated-litter-box-under-100': 'best-litter-box-under-100',

  // Odor control → single primary
  'litter-box-odor-control-tips': 'best-odor-control-litter-box',
  'cat-litter-box-odor-solutions': 'best-odor-control-litter-box',
  'best-litter-box-odor-bathroom': 'best-odor-control-litter-box',

  // Self-cleaning → single primary
  'automatic-vs-manual-litter-box': 'best-self-cleaning-litter-box-2026',
  'self-cleaning-litter-box-worth-it': 'best-self-cleaning-litter-box-2026',

  // ── Dog Bed Consolidation ──────────────────────────────────
  // Anxiety/calming dog beds → single primary
  'dog-bed-for-anxiety': 'calming-dog-bed-anxiety',
  'dog-bed-for-anxiety-do-they-work': 'calming-dog-bed-anxiety',

  // Memory foam comparison → single primary
  'memory-foam-vs-egg-crate-foam-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'memory-foam-vs-standard-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'orthopedic-vs-memory-foam-dog-beds': 'memory-foam-vs-egg-crate-dog-beds',

  // Large breed orthopedic → single primary
  'best-orthopedic-dog-bed-for-large-dogs': 'best-orthopedic-dog-bed-large-dogs-2026',
  'dog-bed-for-large-breeds': 'best-dog-beds-large-breeds-2026',

  // General orthopedic → single primary
  'best-orthopedic-dog-bed': 'best-orthopedic-dog-bed-2026',
  'how-to-choose-orthopedic-dog-bed': 'best-orthopedic-dog-bed-2026',

  // Dog bed sizing → single primary
  'dog-bed-size-chart-guide': 'how-to-choose-the-right-dog-bed-size',

  // Outdoor dog games → single primary
  'outdoor-dog-games-enrichment': 'outdoor-dog-games-2026',

  // ── Cat Furniture Consolidation ────────────────────────────
  // Cat condo vs cat tree → single primary
  'cat-condo-vs-cat-tower': 'cat-condo-vs-cat-tree-difference',
  'modern-cat-condo-vs-traditional-cat-tree': 'cat-condo-vs-cat-tree-difference',
};

/** Set of slugs that should be redirected (for sitemap exclusion) */
export const REDIRECTED_GUIDE_SLUGS = new Set(Object.keys(GUIDE_REDIRECTS));

/** Check if a guide slug should redirect, returns target or null */
export function getGuideRedirectTarget(slug: string): string | null {
  return GUIDE_REDIRECTS[slug] ?? null;
}
