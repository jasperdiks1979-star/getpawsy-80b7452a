/**
 * Blog Consolidation & Pruning Engine
 * 
 * Reduces indexable blog URLs by keeping only 1 page per search intent.
 * Rules:
 * - Keep 1 page per search intent
 * - Merge overlapping posts → redirect weaker to stronger
 * - Thin/generic/off-niche posts → noindex
 */

/**
 * Blog post redirects: weak slug → strong canonical slug.
 * These are enforced at the route level in BlogPost.tsx
 * and excluded from the sitemap.
 */
export const BLOG_REDIRECTS: Record<string, string> = {
  // ── Cat Toys / Enrichment → best-cat-toys-bored-indoor-cats-2026 ──
  'best-enrichment-toys-cats': 'best-cat-toys-bored-indoor-cats-2026',
  'best-pet-toys-guide-dogs-cats-entertainment': 'best-cat-toys-bored-indoor-cats-2026',
  'best-toys-for-bored-cats': 'best-cat-toys-bored-indoor-cats-2026',
  'cat-enrichment-toys': 'best-cat-toys-bored-indoor-cats-2026',
  'cat-enrichment-toys-mental-stimulation-guide': 'best-cat-toys-bored-indoor-cats-2026',
  'cat-puzzle-toys': 'best-cat-toys-bored-indoor-cats-2026',
  'cat-toys-playtime-interactive-guide-2026': 'best-cat-toys-bored-indoor-cats-2026',
  'interactive-cat-entertainment-sets-mental-stimulation-guide': 'best-cat-toys-bored-indoor-cats-2026',
  'interactive-cat-toys-guide': 'best-cat-toys-bored-indoor-cats-2026',
  'interactive-play-benefits': 'best-cat-toys-bored-indoor-cats-2026',

  // ── Indoor Cat Enrichment → indoor-cat-enrichment-complete-guide ──
  'indoor-cat-enrichment-how-to-keep-your-cat-happy-indoors': 'indoor-cat-enrichment-complete-guide',
  'indoor-cat-enrichment-mental-stimulation': 'indoor-cat-enrichment-complete-guide',
  'indoor-cat-entertainment': 'indoor-cat-enrichment-complete-guide',
  'indoor-cat-entertainment-rainy-days': 'indoor-cat-enrichment-complete-guide',
  'indoor-cat-environment-guide': 'indoor-cat-enrichment-complete-guide',
  'how-to-entertain-indoor-cats': 'indoor-cat-enrichment-complete-guide',

  // ── Cat Scratching → cat-scratching-behavior-solutions ──
  'cat-scratching-post-health-behavior-protection': 'cat-scratching-behavior-solutions',
  'cat-scratching-posts-trees-complete-guide-2026': 'cat-scratching-behavior-solutions',
  'cat-scratching-posts-trees-furniture-guide-2026': 'cat-scratching-behavior-solutions',
  'cat-scratching-solutions': 'cat-scratching-behavior-solutions',

  // ── Cat Trees → cat-trees-guide-choosing-perfect-climbing-tower ──
  'cat-climbing-furniture': 'cat-trees-guide-choosing-perfect-climbing-tower',
  'cat-tree-buying-guide-perfect-tower-feline': 'cat-trees-guide-choosing-perfect-climbing-tower',
  'cat-tree-house-buying-guide-what-to-look-for': 'cat-trees-guide-choosing-perfect-climbing-tower',
  'choosing-safe-cat-tree-indoor-cats': 'cat-trees-guide-choosing-perfect-climbing-tower',
  'flower-cat-tower-trendy-climbing-trees': 'cat-trees-guide-choosing-perfect-climbing-tower',
  'flower-cat-tree-instagram-worthy-furniture-2026': 'cat-trees-guide-choosing-perfect-climbing-tower',
  'cat-condo-vs-cat-tower-whats-the-difference': 'cat-trees-guide-choosing-perfect-climbing-tower',

  // ── Litter Box → cat-litter-box-guide ──
  'cat-litter-box-training-guide': 'cat-litter-box-guide',
  'premium-cat-litter-guide': 'cat-litter-box-guide',

  // ── Self-Cleaning Litter → self-cleaning-litter-box-guide ──
  'self-cleaning-litter-box-reviews-guide': 'self-cleaning-litter-box-guide',
  'self-cleaning-litter-boxes-automatic-cat-solutions-2026': 'self-cleaning-litter-box-guide',
  'ultimate-guide-automatic-cat-litter-boxes-smart-pet-owners': 'self-cleaning-litter-box-guide',

  // ── Litter Odor → how-to-reduce-litter-box-smell ──
  'covered-litter-boxes-odor-control-guide-2026': 'how-to-reduce-litter-box-smell',

  // ── Cat Grooming → cat-grooming-guide-coat-care-maintenance ──
  'cat-grooming-habits': 'cat-grooming-guide-coat-care-maintenance',
  'essential-cat-grooming-tips-healthy-beautiful': 'cat-grooming-guide-coat-care-maintenance',

  // ── Cat Communication → cat-body-language-guide ──
  'cat-communication-guide': 'cat-body-language-guide',
  'decoding-cat-meows-communication': 'cat-body-language-guide',

  // ── Cat Sleep → cat-sleep-habits ──
  'understanding-cat-sleeping-habits': 'cat-sleep-habits',

  // ── Cat Water → cat-water-fountain-benefits ──
  'cat-water-fountains': 'cat-water-fountain-benefits',
  'cat-stainless-steel-water-fountain-health-benefits': 'cat-water-fountain-benefits',

  // ── Cat Nutrition → complete-cat-nutrition-guide ──
  'cat-food-nutrition-guide-best-diet-2026': 'complete-cat-nutrition-guide',
  'cat-nutrition-guide-best-food-feline': 'complete-cat-nutrition-guide',

  // ── Senior Cat → caring-for-senior-cat-health-comfort ──
  'senior-cat-care-aging-feline-health': 'caring-for-senior-cat-health-comfort',
  'senior-cat-comfort': 'caring-for-senior-cat-health-comfort',

  // ── Catios/Outdoor → catio-outdoor-spaces ──
  'catios-indoor-cat-safe-outdoor-access-guide': 'catio-outdoor-spaces',
  'creating-safe-outdoor-space-cat': 'catio-outdoor-spaces',

  // ── Cat Carrier → cat-carriers-travel-transportation-guide-2026 ──
  'how-to-choose-a-cat-carrier-for-travel': 'cat-carriers-travel-transportation-guide-2026',
  'ultimate-guide-pet-carrier-backpacks-travel-cat-dog': 'cat-carriers-travel-transportation-guide-2026',

  // ── Legacy year-based redirects (from v1) ──
  'best-cat-trees-2024': 'best-cat-trees-2026',
  'best-cat-trees-2025': 'best-cat-trees-2026',
  'top-cat-trees-for-indoor-cats': 'best-cat-trees-2026',
  'cat-tree-buying-guide': 'best-cat-trees-2026',
  'how-to-choose-a-cat-tree': 'best-cat-trees-2026',
  'cat-tree-review-roundup': 'best-cat-trees-2026',
  'cat-trees-for-big-cats': 'best-cat-trees-for-large-cats',
  'heavy-duty-cat-tree-review': 'best-cat-trees-for-large-cats',
  'strongest-cat-trees-tested': 'best-cat-trees-for-large-cats',
  'maine-coon-cat-tree-picks': 'best-cat-trees-for-large-cats',
  'how-to-stabilize-cat-tree': 'cat-tree-stability-tips',
  'cat-tree-anti-tip-guide': 'cat-tree-stability-tips',
  'stop-cat-tree-wobbling': 'cat-tree-stability-tips',
  'small-apartment-cat-tree-ideas': 'best-cat-trees-for-small-spaces',
  'cat-tree-for-tiny-apartment': 'best-cat-trees-for-small-spaces',
  'space-saving-cat-furniture': 'best-cat-trees-for-small-spaces',
  'best-litter-boxes-2024': 'best-cat-litter-boxes-2026',
  'best-litter-boxes-2025': 'best-cat-litter-boxes-2026',
  'top-rated-litter-boxes': 'best-cat-litter-boxes-2026',
  'litter-box-comparison': 'best-cat-litter-boxes-2026',
  'automatic-litter-box-review': 'best-self-cleaning-litter-box',
  'self-cleaning-litter-box-comparison': 'best-self-cleaning-litter-box',
  'is-self-cleaning-litter-box-worth-it': 'best-self-cleaning-litter-box',
  'robot-litter-box-review': 'best-self-cleaning-litter-box',
  'litter-box-smell-solutions': 'how-to-control-litter-box-odor',
  'best-litter-for-smell': 'how-to-control-litter-box-odor',
  'litter-box-odor-hacks': 'how-to-control-litter-box-odor',
  'best-dog-beds-2024': 'best-dog-bed-2026',
  'best-dog-beds-2025': 'best-dog-bed-2026',
  'top-dog-beds-review': 'best-dog-bed-2026',
  'best-dog-beds-2026': 'best-dog-bed-2026',
  'dog-beds-comfort-sleep-guide-2026': 'best-dog-bed-2026',
  'orthopedic-dog-bed-review-2024': 'best-orthopedic-dog-beds-2026',
  'memory-foam-dog-bed-picks': 'best-orthopedic-dog-beds-2026',
  'pet-gift-ideas-2024': 'pet-gift-guide-2026',
  'holiday-pet-gifts': 'pet-gift-guide-2026',
  'pet-product-trends': 'pet-industry-trends-2026',
  'pet-care-tips-beginners': 'new-pet-owner-guide',
  'first-time-cat-owner-checklist': 'new-cat-owner-guide',
  'first-time-dog-owner-checklist': 'new-dog-owner-guide',
};

/**
 * Blog slugs to noindex (too thin, no traffic, off-niche, overlapping).
 * These remain accessible but get noindex meta tag and
 * are excluded from the sitemap.
 */
export const NOINDEX_BLOG_SLUGS = new Set([
  // ── Generic thin content ──
  'why-cats-love-boxes',
  'fun-facts-about-cats',
  'fun-facts-about-dogs',
  'pet-memes-roundup',
  'cute-cat-videos-compilation',
  'national-pet-day-2024',
  'national-cat-day-2024',
  'world-animal-day-2024',

  // ── Seasonal/expired ──
  'black-friday-pet-deals-2024',
  'cyber-monday-pet-deals-2024',
  'prime-day-pet-deals-2024',
  'valentines-day-pet-gifts-2024',
  'summer-pet-safety-2024',

  // ── Non-core species (off-niche) ──
  'best-bird-toys',
  'hamster-cage-guide',
  'rabbit-hutch-review',
  'fish-tank-setup-guide',
  'best-chicken-coops',
  'cat-scratching-post-vs-cat-tree',
  'do-indoor-cats-need-cat-trees',
  'how-to-train-cat-use-tree',
  'what-to-look-for-in-litter-box',
  'litter-box-placement-tips',

  // ── Off-niche / non-product-supporting ──
  'cat-friendly-garden-guide',
  'cat-grass-benefits',
  'cat-proof-christmas-tree-guide',
  'cat-purring-science-guide',
  'cat-exercise-wheels-indoor-cat-fitness-revolution',
  'diy-cat-tree-real-tree-ideas',
  'pet-safe-plants-cat-trees',
  'litter-box-furniture-transforming-cat-ownership',
  'freeze-dried-cat-treats',
  'leaving-cats-home-alone-how-long-safe',
  'pregnant-cat-care',
  'feline-hyperthyroidism-guide',
  'feline-kidney-disease-guide',
  'heated-pet-beds-winter-comfort-guide-cats-dogs-2026',

  // ── Too generic (multi-pet, not product-supporting) ──
  'pet-body-language-understanding-dogs-cats-communication',
  'pet-grooming-guide-dogs-cats-home',
  'pet-nutrition-guide-feeding-dogs-cats',
  'pet-supplements-vitamins-nutritional-health-guide-2026',
  'senior-pet-care-aging-dogs-cats-guide',
  'dogs-cats-living-together',
  'multi-species-household-harmony',
  'importance-dental-care-dogs-cats',
  'microchipping-pets',
  'safe-houseplants-homes-curious-cats',

  // ── Cat tree thin duplicates ──
  'cat-tree-placement-guide-best-location',
  'giant-cat-tree-towers-ultimate-vertical-playground-feline',
  'kitty-condo-vs-cat-tree-comparison-guide',
  'cat-self-grooming-brushes',
  'cat-steam-brush-grooming-revolution-guide',
  'cat-scratching-post-guide-large-cats',
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
      ((Object.keys(BLOG_REDIRECTS).length + NOINDEX_BLOG_SLUGS.size) / 328) * 100
    ),
  };
}
