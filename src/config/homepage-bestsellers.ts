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
    slug: 'dog-cot-cooling-pet-bed-3',
    displayName: 'Orthopedic Dog Bed',
    benefit: 'Relieves joint pain & improves sleep',
  },
  {
    slug: 'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo',
    displayName: 'No-Pull Dog Harness',
    benefit: 'Stop pulling instantly',
  },
  {
    slug: 'dog-booster-car-seat-pet-car-seat-for-small-medium-dog-up-to-40-lbs-black',
    displayName: 'Dog Car Seat & Travel Kit',
    benefit: 'Safe & stress-free travel',
  },
  {
    slug: '2-in-1-dog-paw-cleaner-cup-soft-pet-dog-foot-cleaning-washer-brush-cup-portable-pet-foot-washer-paw-',
    displayName: 'Portable Dog Paw Cleaner',
    benefit: 'Clean paws in seconds — no mess',
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
