/**
 * Canonical Category Registry — SINGLE SOURCE OF TRUTH
 * 
 * Every category visible in the UI MUST come from this registry.
 * A category is only valid if it has a matching seo_collections entry.
 * 
 * Rules:
 * - Only categories with `active: true` may appear in any UI surface
 * - `menuEligible`: shown in navbar mega menu & mobile menu
 * - `homepageEligible`: shown on homepage category chips
 * - `searchEligible`: shown in search overlay category suggestions
 * - `footerEligible`: shown in footer links
 * 
 * PRODUCT REALITY CHECK (2026-04):
 * Active inventory: 17 products across 5 DB categories:
 *   Cat Trees & Condos (6), Cat Litter Boxes (5), Dog Beds (2), 
 *   Dog Travel (2), Dog Toys (1), Cat Toys (1)
 * 
 * STRONG COLLECTIONS (3+ products): cat-trees-and-condos, cat-litter-boxes, dogs, cats
 * BORDERLINE (2 products): dog-beds, dog-travel-accessories — kept for topical relevance
 * ALL OTHERS: deactivated and aliased to nearest valid parent
 */

export interface CanonicalCategory {
  /** Internal key (matches seo_collections slug) */
  key: string;
  /** Display label shown to users */
  label: string;
  /** Canonical URL path */
  url: string;
  /** Whether this collection exists and is active */
  active: boolean;
  /** Parent category key (for tree building) */
  parentKey: string | null;
  /** Eligible for main navigation menu */
  menuEligible: boolean;
  /** Eligible for homepage category buttons */
  homepageEligible: boolean;
  /** Eligible for search suggestions */
  searchEligible: boolean;
  /** Eligible for footer links */
  footerEligible: boolean;
  /** Display order within its parent group */
  displayOrder: number;
  /** Emoji icon for mobile menu display */
  icon?: string;
  /** Whether this collection has confirmed product inventory */
  hasInventory: boolean;
}

/**
 * Master registry of all valid categories.
 * ONLY categories listed here with active:true may appear in the UI.
 * 
 * Navigation eligibility is STRICTLY tied to hasInventory.
 */
export const CANONICAL_CATEGORIES: CanonicalCategory[] = [
  // ── Top-level: Dogs ──
  {
    key: 'dogs',
    label: 'Dogs',
    url: '/collections/dogs',
    active: true,
    parentKey: null,
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 1,
    icon: '🐕',
    hasInventory: true,
  },
  {
    key: 'dog-beds',
    label: 'Dog Beds',
    url: '/collections/dog-beds',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 1,
    icon: '🛏️',
    hasInventory: true,
  },
  {
    key: 'dog-travel-accessories',
    label: 'Dog Travel',
    url: '/collections/dog-travel-accessories',
    active: false,
    parentKey: 'dogs',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: false,
    footerEligible: false,
    displayOrder: 2,
    icon: '✈️',
    hasInventory: false,
  },

  // ── Top-level: Cats ──
  {
    key: 'cats',
    label: 'Cats',
    url: '/collections/cats',
    active: true,
    parentKey: null,
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 2,
    icon: '🐱',
    hasInventory: true,
  },
  {
    key: 'cat-trees-and-condos',
    label: 'Cat Trees & Condos',
    url: '/collections/cat-trees-and-condos',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 1,
    icon: '🌲',
    hasInventory: true,
  },
  {
    key: 'cat-litter-boxes',
    label: 'Cat Litter Boxes',
    url: '/collections/cat-litter-boxes',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 2,
    icon: '🚽',
    hasInventory: true,
  },
];

// ── Derived lookups ──

/** Set of all valid collection slugs */
export const VALID_COLLECTION_SLUGS = new Set(
  CANONICAL_CATEGORIES.filter(c => c.active).map(c => c.key)
);

/** Quick lookup by key */
const BY_KEY = new Map(CANONICAL_CATEGORIES.map(c => [c.key, c]));

export function getCanonicalCategory(key: string): CanonicalCategory | undefined {
  return BY_KEY.get(key);
}

export function isValidCollectionSlug(slug: string): boolean {
  return VALID_COLLECTION_SLUGS.has(slug);
}

/** Get categories eligible for a specific surface */
export function getCategoriesForSurface(
  surface: 'menu' | 'homepage' | 'search' | 'footer'
): CanonicalCategory[] {
  const field = {
    menu: 'menuEligible',
    homepage: 'homepageEligible',
    search: 'searchEligible',
    footer: 'footerEligible',
  }[surface] as keyof CanonicalCategory;

  return CANONICAL_CATEGORIES
    .filter(c => c.active && c[field])
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Build a tree structure for menu display */
export interface CategoryTreeNode extends CanonicalCategory {
  children: CategoryTreeNode[];
}

export function buildCategoryTree(surface: 'menu' | 'search'): CategoryTreeNode[] {
  const eligible = getCategoriesForSurface(surface);
  const topLevel = eligible.filter(c => c.parentKey === null);
  
  return topLevel.map(parent => ({
    ...parent,
    children: eligible
      .filter(c => c.parentKey === parent.key)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(child => ({ ...child, children: [] })),
  }));
}

/**
 * Alias map: old/variant/weak slugs → canonical slug for 301 redirects.
 * All collections with <3 products redirect to their nearest valid parent.
 */
export const SLUG_ALIASES: Record<string, string> = {
  // ── Legacy slug aliases → canonical active collection ──
  'best-cat-litter-boxes': 'cat-litter-boxes',
  'cat-condos': 'cat-trees-and-condos',
  'orthopedic-calming-dog-beds': 'dog-beds',
  'best-orthopedic-dog-beds': 'dog-beds',
  'dog': 'dogs',
  'cat': 'cats',

  // ── Dead dog collections → nearest valid parent ──
  'best-interactive-cat-toys': 'cats',
  'best-slow-feeder-dog-bowls': 'dogs',
  'cat-beds': 'cats',
  'cat-carriers': 'cats',
  'best-cat-carriers': 'cats',
  'cat-furniture': 'cat-trees-and-condos',
  'cat-grooming-tools': 'cats',
  'cat-harnesses': 'cats',
  'cat-scratching-posts': 'cat-trees-and-condos',
  'best-cat-scratching-posts': 'cat-trees-and-condos',
  'cat-toys': 'cats',
  'best-cat-toys-for-indoor-cats': 'cats',
  'cat-tunnels': 'cats',
  'cat-water-fountains': 'cats',
  'cat-window-perches': 'cats',
  'best-cat-window-perches': 'cats',
  'best-cat-beds': 'cats',
  'dog-bowls': 'dogs',
  'dog-car-seats': 'dogs',
  'dog-coats-jackets': 'dogs',
  'dog-collars': 'dogs',
  'dog-collars-leashes': 'dogs',
  'dog-crates': 'dogs',
  'dog-grooming-tools': 'dogs',
  'best-dog-grooming-kits': 'dogs',
  'dog-harness': 'dogs',
  'best-dog-harnesses': 'dogs',
  'dog-leashes': 'dogs',
  'dog-toys': 'dogs',
  'dog-training-tools': 'dogs',
  'self-cleaning-litter-box': 'cat-litter-boxes',
  'indoor-cat-enrichment': 'cats',
  'automatic-cat-feeders': 'cats',
  'best-pet-strollers': 'dog-travel-accessories',
  'modern-cat-trees': 'cat-trees-and-condos',

  // ── Orthopedic dog bed variants → dog-beds ──
  'orthopedic-dog-beds': 'dog-beds',
  'best-orthopedic-dog-bed-large-dogs': 'dog-beds',
  'memory-foam-dog-beds': 'dog-beds',
  'memory-foam-orthopedic-dog-bed': 'dog-beds',
  'orthopedic-dog-bed-senior-dogs': 'dog-beds',
  'orthopedic-dog-bed-arthritis': 'dog-beds',
  'waterproof-orthopedic-dog-bed': 'dog-beds',
  'cooling-orthopedic-dog-bed': 'dog-beds',
  'premium-orthopedic-dog-bed-comparison': 'dog-beds',
  'calming-anxiety-dog-beds': 'dog-beds',
  'elevated-dog-beds': 'dog-beds',
  'waterproof-dog-beds': 'dog-beds',
  'best-dog-beds-for-large-dogs': 'dog-beds',
  'best-elevated-dog-bed': 'dog-beds',
  'cooling-dog-beds': 'dog-beds',

  // ── Cat tree variants → cat-trees-and-condos ──
  'cat-trees-for-large-cats': 'cat-trees-and-condos',
  'extra-large-cat-trees': 'cat-trees-and-condos',
  'cat-tree-for-two-cats': 'cat-trees-and-condos',
  'best-cat-trees-for-small-apartments': 'cat-trees-and-condos',
  'best-cat-tree-for-multiple-cats': 'cat-trees-and-condos',
  'heavy-duty-cat-tree': 'cat-trees-and-condos',
  'cat-condos-for-large-cats': 'cat-trees-and-condos',
  'cat-tree-for-maine-coon': 'cat-trees-and-condos',

  // ── Litter box variants → cat-litter-boxes ──
  'best-litter-box-for-large-cats': 'cat-litter-boxes',
  'cat-litter-box-furniture-guide': 'cat-litter-boxes',

  // ── Dog toy variants → dogs ──
  'best-interactive-dog-toys': 'dogs',
  'dog-enrichment-toys': 'dogs',
  'interactive-dog-toys': 'dogs',
  'indestructible-dog-toys': 'dogs',
  'best-chew-toys-for-aggressive-chewers': 'dogs',

  // ── Dog travel variants → dogs (no dedicated collection) ──
  'dog-travel-accessories': 'dogs',
  'best-dog-car-seats': 'dogs',
  'dog-car-travel-safety-seats': 'dogs',
  'crash-tested-dog-car-seat': 'dogs',
  'dog-car-seat-cover': 'dogs',
  'dog-carriers': 'dogs',

  // ── Dog grooming → dogs ──
  'dog-grooming': 'dogs',
  'pet-grooming-tools': 'dogs',
  'pet-grooming-vacuum-kits': 'dogs',

  // ── Training collections → dogs (no real inventory) ──
  'dog-training-accessories': 'dogs',
  'no-pull-dog-harness': 'dogs',
  'long-training-leashes': 'dogs',
  'puppy-training-essentials': 'dogs',
  'dog-potty-training': 'dogs',
  'dog-leash-control': 'dogs',
  'dog-anti-bark': 'dogs',

  // ── Feeder / bowl variants → dogs or cats ──
  'slow-feeder-dog-bowls': 'dogs',
  'slow-feeder-dog-bowl': 'dogs',
  'best-dog-water-bowl-for-messy-drinkers': 'dogs',
  'automatic-pet-feeders': 'cats',

  // ── Non-pet / small pet → /products (use 'all' virtual) ──
  'small-pet-accessories': 'all',
  'guinea-pig-cages': 'all',
  'guinea-pig-cages-playpens': 'all',
  'hamster-cages': 'all',
  'rabbit-hutches': 'all',
  'bird-houses': 'all',
  'bird-accessories': 'all',

  // ── Cat carrier/toy crosslinks → cats ──
  'best-cat-carrier-for-vet-visits': 'cats',
  'best-cat-toys-for-bored-cats': 'cats',

  // ── Catch-all legacy Shopify patterns ──
  'best-dog-harness-for-pulling': 'dogs',
};

/**
 * Resolve a slug to its canonical form.
 * Returns the canonical slug if valid/aliased, or null if invalid.
 */
export function resolveToCanonical(slug: string): string | null {
  if (VALID_COLLECTION_SLUGS.has(slug)) return slug;
  const aliased = SLUG_ALIASES[slug];
  if (aliased && VALID_COLLECTION_SLUGS.has(aliased)) return aliased;
  return null;
}
