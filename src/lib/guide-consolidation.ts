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

  // ── Dog Training Guide Consolidation (→ new pillar guides) ──
  'dog-leash-training': 'leash-training-dog-step-by-step',
  'puppy-leash-training': 'leash-training-dog-step-by-step',
  'leash-training-tips': 'leash-training-dog-step-by-step',
  'leash-training-guide': 'leash-training-dog-step-by-step',
  'how-to-leash-train-dog': 'leash-training-dog-step-by-step',
  'how-to-leash-train-puppy': 'leash-training-dog-step-by-step',
  'leash-training-art-guide': 'leash-training-dog-step-by-step',
  'dog-potty-training-tips': 'dog-potty-training-complete-guide',
  'potty-training-guide': 'dog-potty-training-complete-guide',
  'house-training-guide': 'dog-potty-training-complete-guide',
  'potty-training-puppy': 'dog-potty-training-complete-guide',
  'puppy-house-training': 'dog-potty-training-complete-guide',
  'puppy-potty-training': 'dog-potty-training-complete-guide',
  'ultimate-puppy-training-guide-potty-obedience': 'dog-potty-training-complete-guide',
  'puppy-training-tips': 'puppy-training-first-30-days',
  'puppy-training-guide': 'puppy-training-first-30-days',
  'puppy-training-basics-essential-commands': 'puppy-training-first-30-days',
  'dog-training-basics': 'best-dog-training-tools',
  'dog-training-guide': 'best-dog-training-tools',
  'basic-dog-training': 'best-dog-training-tools',
  'clicker-training-dogs-beginners-complete-guide': 'best-dog-training-tools',
  'no-pull-harness-guide': 'leash-training-dog-step-by-step',
  'harness-training-guide': 'leash-training-dog-step-by-step',
  'dog-harness-guide': 'leash-training-dog-step-by-step',
  'best-dog-harness-for-pulling': 'leash-training-dog-step-by-step',
  'how-to-stop-barking': 'how-to-stop-dog-barking',
  'stop-barking-guide': 'how-to-stop-dog-barking',
  'barking-solutions': 'how-to-stop-dog-barking',
  'crate-training-tips': 'puppy-training-first-30-days',
  'crate-training-guide': 'puppy-training-first-30-days',

  // ── Dog Collar / Gear Consolidation ──────────────────────
  'dog-collar-guide': 'leash-training-dog-step-by-step',
  'dog-collar-sizing-guide': 'leash-training-dog-step-by-step',
  'best-dog-collars': 'leash-training-dog-step-by-step',
  'collar-vs-harness': 'leash-training-dog-step-by-step',

  // ── Short slug → canonical year-tagged redirects ─────────────────
  'best-cat-litter-box': 'best-cat-litter-box-2026',
  'best-dog-bed': 'best-dog-bed-2026',
  'best-cat-tree': 'best-cat-trees-2026',
  'best-cat-trees': 'best-cat-trees-2026',
  'best-cat-trees-large-cats': 'best-cat-trees-large-cats-2026',
  'best-orthopedic-dog-bed-large-dogs': 'best-orthopedic-dog-bed-large-dogs-2026',
  'best-dog-beds-large-breeds': 'best-dog-beds-large-breeds-2026',
  'best-litter-boxes-apartments': 'best-litter-boxes-apartments-2026',
  'best-self-cleaning-litter-box': 'best-self-cleaning-litter-box-2026',
  'best-cat-litter-box-furniture': 'best-cat-litter-box-furniture-enclosures-2026',
  'best-cat-litter-box-furniture-enclosures': 'best-cat-litter-box-furniture-enclosures-2026',
  'best-no-pull-dog-harness': 'best-no-pull-dog-harness-2026',

  // ── SEO Guide System Redirects (requested slug → existing canonical) ──
  'best-cat-litter-box-for-odor-control': 'best-odor-control-litter-box',
  'best-low-tracking-cat-litter-box': 'best-low-tracking-litter-box',
  'best-cat-litter-box-small-apartment': 'best-litter-boxes-apartments-2026',
  'best-automatic-cat-litter-box': 'best-self-cleaning-litter-box-2026',
  'best-cat-litter-box-furniture': 'best-cat-litter-box-furniture-enclosures-2026',
  'best-cat-litter-box-multiple-cats': 'best-litter-boxes-multi-cat',
  'best-cat-tree-for-large-cats': 'best-cat-trees-large-cats-2026',
  'modern-cat-tree-furniture': 'modern-cat-trees-home-design',
  'best-memory-foam-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'best-dog-bed-for-senior-dogs': 'orthopedic-dog-beds-for-senior-dogs',
  'best-waterproof-dog-bed': 'waterproof-orthopedic-dog-beds-guide',
  'dog-bed-size-guide': 'how-to-choose-the-right-dog-bed-size',
  'best-dog-leash-for-training': 'best-dog-training-leash-for-pullers',
  'best-anti-pull-dog-leash': 'best-no-pull-dog-harness-2026',
  'dog-harness-vs-collar': 'front-clip-vs-back-clip-harness',
  'best-airline-approved-dog-carrier': 'best-dog-carriers-for-travel',
  'best-interactive-cat-toys': 'best-interactive-cat-toys-that-work',
  'best-pet-carrier-for-travel': 'best-cat-carrier',
};

/** Set of slugs that should be redirected (for sitemap exclusion) */
export const REDIRECTED_GUIDE_SLUGS = new Set(Object.keys(GUIDE_REDIRECTS));

/** Check if a guide slug should redirect, returns target or null */
export function getGuideRedirectTarget(slug: string): string | null {
  return GUIDE_REDIRECTS[slug] ?? null;
}
