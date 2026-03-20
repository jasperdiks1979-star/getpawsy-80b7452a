/**
 * ─────────────────────────────────────────────
 *  HOMEPAGE BESTSELLER CONFIG
 *  Single source of truth for the homepage
 *  "Top Picks" section.
 * ─────────────────────────────────────────────
 *
 *  To update:
 *    • Swap mode → change `mode` below
 *    • Reorder → move entries in `manualProducts`
 *    • Replace one product → change its slug + displayName
 *    • Switch to auto → set mode: 'auto' (requires scored data)
 */

// ── Mode ────────────────────────────────────
export type BestsellerMode = 'manual' | 'auto';

export const BESTSELLER_CONFIG = {
  /** Active mode — 'manual' = curated list, 'auto' = data-driven winners */
  mode: 'manual' as BestsellerMode,

  /** Max products to display in the grid */
  maxProducts: 4,

  /** Section copy */
  sectionTitle: 'Top Picks for Pet Parents',
  sectionSubtitle: 'Proven tools that solve real problems — fast.',
  seeAllHref: '/products',
  seeAllLabel: 'View All Products',
} as const;

// ── Manual curated products (strict order) ──
export interface CuratedProduct {
  slug: string;
  displayName: string;
  /** Short benefit line shown under the title */
  benefit: string;
  /** Flag products that need a better hero image */
  imageUpgradeRecommended?: boolean;
}

export const MANUAL_PRODUCTS: CuratedProduct[] = [
  {
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat',
    displayName: 'Stop Litter Box Smell Instantly — Smart Self-Cleaning',
    benefit: 'Fully automatic. No scooping, no odor. App-controlled.',
  },
  {
    slug: 'dog-cot-cooling-pet-bed-3',
    displayName: 'End Joint Pain — Orthopedic Cooling Dog Bed',
    benefit: 'Elevated airflow design. Instant relief for achy joints.',
  },
  {
    slug: '44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-cats-beige',
    displayName: 'No More Furniture Scratching — Sturdy Cat Tree',
    benefit: 'Multi-level tower with anti-tip base. Built to last.',
  },
  {
    slug: 'transparent-and-visible-pet-feeding-and-drinking-dispenser-automatically-refilling-food-and-water-ca',
    displayName: 'Never Miss a Meal — Auto Pet Feeder & Water Station',
    benefit: 'Self-refilling food & water. Perfect for busy owners.',
  },
];

// ── Hard exclusion keywords ─────────────────
// Products whose name/slug contains ANY of these tokens
// are blocked from the homepage bestseller section,
// even in auto mode.
export const EXCLUDED_KEYWORDS = [
  'bark-collar',
  'bark collar',
  'shock-collar',
  'shock collar',
  'anti-bark',
  'anti bark',
  'leash-set',
  'leash set',
  'grooming-brush',
  'grooming brush',
  'lint-roller',
  'lint roller',
] as const;

/** Price floor — products below this are excluded in auto mode */
export const MIN_PRICE = 15;

// ── Auto-mode scoring weights ───────────────
// Used when mode = 'auto' and scored data exists.
export const AUTO_SCORE_WEIGHTS = {
  conversionRate: 0.30,
  addToCartRate: 0.25,
  revenue: 0.20,
  imageQuality: 0.10,
  priceRange: 0.10,
  categoryStrength: 0.05,
} as const;
