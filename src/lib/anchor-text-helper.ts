/**
 * Deterministic anchor text selector for internal links.
 * Enforces anchor distribution rules:
 * - Exact match ≤ 30% for any target
 * - Partial ≥ 40%
 * - Semantic/Branded fill the rest
 *
 * Same text for all users (no cloaking, no randomness).
 */

export type AnchorType = 'exact' | 'partial' | 'semantic' | 'branded';

interface AnchorVariants {
  exact: string;
  partial: string[];
  semantic: string[];
  branded: string;
}

const ANCHOR_VARIANTS: Record<string, AnchorVariants> = {
  'best-cat-litter-box-2026': {
    exact: 'best cat litter box 2026',
    partial: ['Best Cat Litter Boxes (2026)', 'Top Litter Boxes for Cats'],
    semantic: ['Read Our Litter Box Guide', 'Expert Litter Box Picks'],
    branded: 'GetPawsy Litter Box Guide',
  },
  'best-dog-bed-2026': {
    exact: 'best dog bed 2026',
    partial: ['Best Dog Beds (2026)', 'Top Dog Beds for All Sizes'],
    semantic: ['Our Top Dog Bed Picks', 'See Recommended Beds'],
    branded: 'GetPawsy Dog Bed Guide',
  },
  'best-cat-litter-box-furniture-enclosures-2026': {
    exact: 'best litter box furniture 2026',
    partial: ['Best Litter Box Furniture (2026)', 'Top Litter Box Enclosures'],
    semantic: ['Litter Box Furniture Reviewed', 'See Enclosure Comparisons'],
    branded: 'GetPawsy Enclosure Guide',
  },
  'how-many-litter-boxes-per-cat': {
    exact: 'how many litter boxes per cat',
    partial: ['Litter Box Count Rule (N+1)', 'The N+1 Litter Box Rule'],
    semantic: ['Vet-Backed Litter Box Rule', 'Litter Box Placement Tips'],
    branded: 'GetPawsy Litter Box Rule Guide',
  },
  'best-orthopedic-dog-bed': {
    exact: 'best orthopedic dog bed',
    partial: ['Orthopedic Dog Bed Guide', 'Top Orthopedic Picks for Dogs'],
    semantic: ['Joint-Support Bed Guide', 'See Orthopedic Picks'],
    branded: 'GetPawsy Orthopedic Guide',
  },
  'best-cat-trees-small-apartments': {
    exact: 'best cat trees small apartments',
    partial: ['Cat Trees for Small Spaces', 'Compact Cat Tree Picks'],
    semantic: ['Space-Saving Cat Trees', 'Apartment-Friendly Cat Trees'],
    branded: 'GetPawsy Cat Tree Guide',
  },
  'best-litter-boxes-multi-cat': {
    exact: 'best litter boxes multi cat',
    partial: ['Multi-Cat Litter Solutions', 'Litter Boxes for Multiple Cats'],
    semantic: ['Multi-Cat Home Solutions', 'See Multi-Cat Picks'],
    branded: 'GetPawsy Multi-Cat Guide',
  },
  'best-extra-large-litter-boxes': {
    exact: 'best extra large litter boxes',
    partial: ['Extra Large Litter Boxes', 'Jumbo Litter Box Picks'],
    semantic: ['Boxes for Big Cats', 'See Jumbo Options'],
    branded: 'GetPawsy Large Litter Guide',
  },
  'best-self-cleaning-litter-box-2026': {
    exact: 'best self cleaning litter box 2026',
    partial: ['Self-Cleaning Litter Boxes (2026)', 'Automatic Litter Box Picks'],
    semantic: ['Hands-Free Litter Boxes', 'See Self-Cleaning Options'],
    branded: 'GetPawsy Self-Cleaning Guide',
  },
};

/**
 * Placement-to-anchor-type mapping ensures predictable distribution
 * across different page locations. Each placement consistently returns
 * a specific anchor type for all slugs.
 */
const PLACEMENT_TYPE_MAP: Record<string, AnchorType> = {
  'hero-insert': 'partial',
  'mid-page-cornerstone': 'semantic',
  'mid-page-hub': 'partial',
  'footer-guides': 'branded',
  'guide-body': 'partial',
  'guide-sidebar': 'semantic',
};

/**
 * Get deterministic anchor text for a given slug + placement.
 * Always returns the same text for the same inputs (no randomness, no cloaking).
 *
 * @param slug - The guide slug (without /guides/ prefix)
 * @param placement - Where the link appears (e.g., 'hero-insert', 'mid-page-hub')
 */
export function getAnchorText(slug: string, placement: string): string {
  const variants = ANCHOR_VARIANTS[slug];
  if (!variants) {
    // Fallback: convert slug to title case
    return slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const type = PLACEMENT_TYPE_MAP[placement] || 'partial';

  // Use slug length as a simple deterministic index for variant selection
  const variantIndex = slug.length % 2;

  switch (type) {
    case 'exact':
      return variants.exact;
    case 'partial':
      return variants.partial[variantIndex % variants.partial.length];
    case 'semantic':
      return variants.semantic[variantIndex % variants.semantic.length];
    case 'branded':
      return variants.branded;
  }
}

/**
 * Get the anchor type that would be used for a given placement.
 * Useful for audit/validation.
 */
export function getAnchorTypeForPlacement(placement: string): AnchorType {
  return PLACEMENT_TYPE_MAP[placement] || 'partial';
}

/**
 * Check whether a slug has defined anchor variants.
 */
export function hasAnchorVariants(slug: string): boolean {
  return slug in ANCHOR_VARIANTS;
}
