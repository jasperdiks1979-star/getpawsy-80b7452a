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
  'best-litter-box-studio-apartment': 'best-litter-boxes-apartments-2026',
  'litter-box-for-studio-apartment': 'best-litter-boxes-apartments-2026',
  'best-litter-box-small-apartments': 'best-litter-boxes-apartments-2026',
  'high-sided-litter-box-guide': 'best-high-sided-litter-box',
  'best-litter-box-for-multiple-cats': 'best-litter-boxes-multi-cat',
  'top-rated-litter-box-under-100': 'best-litter-box-under-100',
  'litter-box-odor-control-tips': 'best-odor-control-litter-box',
  'cat-litter-box-odor-solutions': 'best-odor-control-litter-box',
  'best-litter-box-odor-bathroom': 'best-odor-control-litter-box',
  'automatic-vs-manual-litter-box': 'best-self-cleaning-litter-box-2026',
  'self-cleaning-litter-box-worth-it': 'best-self-cleaning-litter-box-2026',

  // ── Dog Bed Consolidation ──────────────────────────────────
  'dog-bed-for-anxiety': 'calming-dog-bed-anxiety',
  'dog-bed-for-anxiety-do-they-work': 'calming-dog-bed-anxiety',
  'memory-foam-vs-egg-crate-foam-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'memory-foam-vs-standard-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'orthopedic-vs-memory-foam-dog-beds': 'memory-foam-vs-egg-crate-dog-beds',
  'best-orthopedic-dog-bed-for-large-dogs': 'best-orthopedic-dog-bed-large-dogs-2026',
  'dog-bed-for-large-breeds': 'best-dog-beds-large-breeds-2026',
  'best-orthopedic-dog-bed': 'best-orthopedic-dog-bed-2026',
  'how-to-choose-orthopedic-dog-bed': 'best-orthopedic-dog-bed-2026',
  'dog-bed-size-chart-guide': 'how-to-choose-the-right-dog-bed-size',
  'outdoor-dog-games-enrichment': 'outdoor-dog-games-2026',

  // ── Cat Furniture Consolidation ────────────────────────────
  'cat-condo-vs-cat-tower': 'cat-condo-vs-cat-tree-2026',
  'modern-cat-condo-vs-traditional-cat-tree': 'cat-condo-vs-cat-tree-2026',
  'cat-condo-vs-cat-tree-difference': 'cat-condo-vs-cat-tree-2026',

  // ── Dog Training Guide Consolidation (404 prevention) ─────
  'dog-leash-training': 'leash-training-art-guide',
  'puppy-leash-training': 'leash-training-art-guide',
  'leash-training-tips': 'leash-training-art-guide',
  'leash-training-guide': 'leash-training-art-guide',
  'how-to-leash-train-dog': 'leash-training-art-guide',
  'how-to-leash-train-puppy': 'leash-training-art-guide',
  'dog-potty-training-tips': 'ultimate-puppy-training-guide-potty-obedience',
  'potty-training-guide': 'ultimate-puppy-training-guide-potty-obedience',
  'house-training-guide': 'ultimate-puppy-training-guide-potty-obedience',
  'potty-training-puppy': 'ultimate-puppy-training-guide-potty-obedience',
  'puppy-house-training': 'ultimate-puppy-training-guide-potty-obedience',
  'puppy-potty-training': 'ultimate-puppy-training-guide-potty-obedience',
  'puppy-training-tips': 'puppy-training-basics-essential-commands',
  'puppy-training-guide': 'puppy-training-basics-essential-commands',
  'dog-training-basics': 'clicker-training-dogs-beginners-complete-guide',
  'dog-training-guide': 'clicker-training-dogs-beginners-complete-guide',
  'basic-dog-training': 'clicker-training-dogs-beginners-complete-guide',
  'no-pull-harness-guide': 'best-dog-harness-for-pulling',
  'harness-training-guide': 'best-dog-harness-for-pulling',
  'dog-harness-guide': 'best-dog-harness-for-pulling',
  'crate-training-tips': 'dog-crate-training-complete-guide-2026',
  'crate-training-guide': 'dog-crate-training-complete-guide-2026',
};

/** Set of slugs that should be redirected (for sitemap exclusion) */
export const REDIRECTED_GUIDE_SLUGS = new Set(Object.keys(GUIDE_REDIRECTS));

/** Check if a guide slug should redirect, returns target or null */
export function getGuideRedirectTarget(slug: string): string | null {
  return GUIDE_REDIRECTS[slug] ?? null;
}
