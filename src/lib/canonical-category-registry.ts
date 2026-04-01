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
}

/**
 * Master registry of all valid categories.
 * ONLY categories listed here with active:true may appear in the UI.
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
  },
  {
    key: 'dog-toys',
    label: 'Dog Toys',
    url: '/collections/dog-toys',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 2,
    icon: '🎾',
  },
  {
    key: 'dog-harness',
    label: 'Dog Harnesses',
    url: '/collections/dog-harness',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: true,
    displayOrder: 3,
    icon: '🦮',
  },
  {
    key: 'dog-collars',
    label: 'Dog Collars',
    url: '/collections/dog-collars',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 4,
    icon: '📿',
  },
  {
    key: 'dog-leashes',
    label: 'Dog Leashes',
    url: '/collections/dog-leashes',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 5,
    icon: '🔗',
  },
  {
    key: 'dog-bowls',
    label: 'Dog Bowls',
    url: '/collections/dog-bowls',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 6,
    icon: '🥣',
  },
  {
    key: 'dog-crates',
    label: 'Dog Crates',
    url: '/collections/dog-crates',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 7,
    icon: '🏠',
  },
  {
    key: 'dog-grooming-tools',
    label: 'Dog Grooming',
    url: '/collections/dog-grooming-tools',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 8,
    icon: '✂️',
  },
  {
    key: 'dog-training-tools',
    label: 'Dog Training',
    url: '/collections/dog-training-tools',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 9,
    icon: '🏋️',
  },
  {
    key: 'dog-travel-accessories',
    label: 'Dog Travel',
    url: '/collections/dog-travel-accessories',
    active: true,
    parentKey: 'dogs',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 10,
    icon: '✈️',
  },
  {
    key: 'dog-car-seats',
    label: 'Dog Car Seats',
    url: '/collections/dog-car-seats',
    active: true,
    parentKey: 'dogs',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 11,
    icon: '🚗',
  },
  {
    key: 'dog-coats-jackets',
    label: 'Dog Coats & Jackets',
    url: '/collections/dog-coats-jackets',
    active: true,
    parentKey: 'dogs',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 12,
    icon: '🧥',
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
  },
  {
    key: 'cat-toys',
    label: 'Cat Toys',
    url: '/collections/cat-toys',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: true,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 3,
    icon: '🧶',
  },
  {
    key: 'cat-beds',
    label: 'Cat Beds',
    url: '/collections/cat-beds',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 4,
    icon: '🛌',
  },
  {
    key: 'cat-scratching-posts',
    label: 'Cat Scratching Posts',
    url: '/collections/cat-scratching-posts',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 5,
    icon: '🪵',
  },
  {
    key: 'cat-carriers',
    label: 'Cat Carriers',
    url: '/collections/cat-carriers',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 6,
    icon: '🧳',
  },
  {
    key: 'cat-furniture',
    label: 'Cat Furniture',
    url: '/collections/cat-furniture',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 7,
    icon: '🪑',
  },
  {
    key: 'cat-grooming-tools',
    label: 'Cat Grooming',
    url: '/collections/cat-grooming-tools',
    active: true,
    parentKey: 'cats',
    menuEligible: true,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 8,
    icon: '✂️',
  },
  {
    key: 'cat-harnesses',
    label: 'Cat Harnesses',
    url: '/collections/cat-harnesses',
    active: true,
    parentKey: 'cats',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 9,
    icon: '🐈',
  },
  {
    key: 'cat-tunnels',
    label: 'Cat Tunnels',
    url: '/collections/cat-tunnels',
    active: true,
    parentKey: 'cats',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 10,
    icon: '🕳️',
  },
  {
    key: 'cat-water-fountains',
    label: 'Cat Water Fountains',
    url: '/collections/cat-water-fountains',
    active: true,
    parentKey: 'cats',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 11,
    icon: '⛲',
  },
  {
    key: 'cat-window-perches',
    label: 'Cat Window Perches',
    url: '/collections/cat-window-perches',
    active: true,
    parentKey: 'cats',
    menuEligible: false,
    homepageEligible: false,
    searchEligible: true,
    footerEligible: false,
    displayOrder: 12,
    icon: '🪟',
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

/** Alias map: old/variant slugs → canonical slug for 301 redirects */
export const SLUG_ALIASES: Record<string, string> = {
  'best-cat-litter-boxes': 'cat-litter-boxes',
  'best-cat-toys-for-indoor-cats': 'cat-toys',
  'best-interactive-cat-toys': 'cat-toys',
  'best-cat-scratching-posts': 'cat-scratching-posts',
  'best-cat-carriers': 'cat-carriers',
  'best-cat-beds': 'cat-beds',
  'best-cat-window-perches': 'cat-window-perches',
  'cat-condos': 'cat-trees-and-condos',
  'best-dog-harnesses': 'dog-harness',
  'best-orthopedic-dog-beds': 'dog-beds',
  'orthopedic-calming-dog-beds': 'dog-beds',
  'best-dog-grooming-kits': 'dog-grooming-tools',
  'best-slow-feeder-dog-bowls': 'dog-bowls',
  'dog-collars-leashes': 'dog-collars',
  'self-cleaning-litter-box': 'cat-litter-boxes',
  'indoor-cat-enrichment': 'cat-toys',
  'automatic-cat-feeders': 'cats',
  'dog': 'dogs',
  'cat': 'cats',
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
