/**
 * Blog Consolidation & Pruning Engine
 * 
 * Reduces indexable blog URLs by 30–50% by:
 * 1. Redirecting duplicate-intent posts to the strongest URL
 * 2. Noindexing thin/low-value posts
 * 
 * Rules:
 * - Keep 1 page per search intent
 * - Merge overlapping posts → redirect weaker to stronger
 * - Thin posts (< 1000 words, no traffic) → noindex
 */

/**
 * Blog post redirects: weak slug → strong canonical slug.
 * These are enforced at the route level in BlogPost.tsx
 * and excluded from the sitemap.
 */
export const BLOG_REDIRECTS: Record<string, string> = {
  // ── Cat Tree intent consolidation ──────────────────────
  'best-cat-trees-2024': 'best-cat-trees-2026',
  'best-cat-trees-2025': 'best-cat-trees-2026',
  'top-cat-trees-for-indoor-cats': 'best-cat-trees-2026',
  'cat-tree-buying-guide': 'best-cat-trees-2026',
  'how-to-choose-a-cat-tree': 'best-cat-trees-2026',
  'cat-tree-review-roundup': 'best-cat-trees-2026',
  
  // ── Large cat tree consolidation ───────────────────────
  'cat-trees-for-big-cats': 'best-cat-trees-for-large-cats',
  'heavy-duty-cat-tree-review': 'best-cat-trees-for-large-cats',
  'strongest-cat-trees-tested': 'best-cat-trees-for-large-cats',
  'maine-coon-cat-tree-picks': 'best-cat-trees-for-large-cats',

  // ── Cat tree stability/safety ──────────────────────────
  'how-to-stabilize-cat-tree': 'cat-tree-stability-tips',
  'cat-tree-anti-tip-guide': 'cat-tree-stability-tips',
  'stop-cat-tree-wobbling': 'cat-tree-stability-tips',

  // ── Cat tree apartments ────────────────────────────────
  'small-apartment-cat-tree-ideas': 'best-cat-trees-for-small-spaces',
  'cat-tree-for-tiny-apartment': 'best-cat-trees-for-small-spaces',
  'space-saving-cat-furniture': 'best-cat-trees-for-small-spaces',
  
  // ── Litter box consolidation ───────────────────────────
  'best-litter-boxes-2024': 'best-cat-litter-boxes-2026',
  'best-litter-boxes-2025': 'best-cat-litter-boxes-2026',
  'top-rated-litter-boxes': 'best-cat-litter-boxes-2026',
  'litter-box-comparison': 'best-cat-litter-boxes-2026',
  
  // ── Self-cleaning litter ───────────────────────────────
  'automatic-litter-box-review': 'best-self-cleaning-litter-box',
  'self-cleaning-litter-box-comparison': 'best-self-cleaning-litter-box',
  'is-self-cleaning-litter-box-worth-it': 'best-self-cleaning-litter-box',
  'robot-litter-box-review': 'best-self-cleaning-litter-box',
  
  // ── Litter box odor ────────────────────────────────────
  'litter-box-smell-solutions': 'how-to-control-litter-box-odor',
  'best-litter-for-smell': 'how-to-control-litter-box-odor',
  'litter-box-odor-hacks': 'how-to-control-litter-box-odor',
  
  // ── Dog bed consolidation (secondary) ──────────────────
  'best-dog-beds-2024': 'best-dog-beds-2026',
  'best-dog-beds-2025': 'best-dog-beds-2026',
  'top-dog-beds-review': 'best-dog-beds-2026',
  'orthopedic-dog-bed-review-2024': 'best-orthopedic-dog-beds-2026',
  'memory-foam-dog-bed-picks': 'best-orthopedic-dog-beds-2026',
  
  // ── Generic/thin pet content → consolidated ────────────
  'pet-gift-ideas-2024': 'pet-gift-guide-2026',
  'holiday-pet-gifts': 'pet-gift-guide-2026',
  'pet-product-trends': 'pet-industry-trends-2026',
  'pet-care-tips-beginners': 'new-pet-owner-guide',
  'first-time-cat-owner-checklist': 'new-cat-owner-guide',
  'first-time-dog-owner-checklist': 'new-dog-owner-guide',
};

/**
 * Blog slugs to noindex (too thin, no traffic, overlapping).
 * These remain accessible but get noindex meta tag and
 * are excluded from the sitemap.
 */
export const NOINDEX_BLOG_SLUGS = new Set([
  // Generic thin content
  'why-cats-love-boxes',
  'fun-facts-about-cats',
  'fun-facts-about-dogs',
  'pet-memes-roundup',
  'cute-cat-videos-compilation',
  'national-pet-day-2024',
  'national-cat-day-2024',
  'world-animal-day-2024',
  // Seasonal/expired
  'black-friday-pet-deals-2024',
  'cyber-monday-pet-deals-2024',
  'prime-day-pet-deals-2024',
  'valentines-day-pet-gifts-2024',
  'summer-pet-safety-2024',
  // Duplicate intent covered by guides
  'cat-scratching-post-vs-cat-tree',
  'do-indoor-cats-need-cat-trees',
  'how-to-train-cat-use-tree',
  'what-to-look-for-in-litter-box',
  'litter-box-placement-tips',
  // Non-cat/non-core content
  'best-bird-toys',
  'hamster-cage-guide',
  'rabbit-hutch-review',
  'fish-tank-setup-guide',
  'best-chicken-coops',
]);

/** Set of all redirected blog slugs (for sitemap exclusion) */
export const REDIRECTED_BLOG_SLUGS = new Set(Object.keys(BLOG_REDIRECTS));

/** Check if a blog slug should redirect, returns target or null */
export function getBlogRedirectTarget(slug: string): string | null {
  return BLOG_REDIRECTS[slug] ?? null;
}

/** Check if a blog post should be noindexed */
export function isBlogNoindexed(slug: string): boolean {
  return NOINDEX_BLOG_SLUGS.has(slug);
}

/** Get pruning statistics */
export function getBlogPruningStats() {
  return {
    redirectedCount: Object.keys(BLOG_REDIRECTS).length,
    noindexedCount: NOINDEX_BLOG_SLUGS.size,
    totalPruned: Object.keys(BLOG_REDIRECTS).length + NOINDEX_BLOG_SLUGS.size,
    estimatedReductionPercent: Math.round(
      ((Object.keys(BLOG_REDIRECTS).length + NOINDEX_BLOG_SLUGS.size) / 323) * 100
    ),
  };
}
