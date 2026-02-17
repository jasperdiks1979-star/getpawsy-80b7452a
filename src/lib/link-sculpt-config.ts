/**
 * Internal Link Sculpting Configuration
 * 
 * Central config for authority flow: priority cornerstones, anchor distribution,
 * blog→cornerstone keyword triggers, and product→collection mapping.
 */

// ── Priority Cornerstones (receive most link equity) ──
export const PRIORITY_CORNERSTONES = [
  {
    id: 'bestsellers',
    path: '/bestsellers',
    label: 'Our Bestselling Pet Products',
    anchors: {
      exact: ['best pet products', 'bestselling pet products'],
      partial: ['our bestselling picks', 'top-rated pet products', 'most popular pet essentials'],
      branded: ['GetPawsy Bestsellers', 'shop our top picks'],
    },
    tier: 1 as const,
  },
  {
    id: 'best-cat-litter-boxes',
    path: '/collections/best-cat-litter-boxes',
    label: 'Best Cat Litter Boxes 2026',
    anchors: {
      exact: ['best cat litter boxes', 'best litter boxes 2026'],
      partial: ['top-rated litter boxes', 'expert-tested litter boxes', 'litter box buying guide'],
      branded: ['GetPawsy litter box picks', 'our litter box collection'],
    },
    tier: 1 as const,
  },
  {
    id: 'best-interactive-dog-toys',
    path: '/collections/best-interactive-dog-toys',
    label: 'Best Interactive Dog Toys',
    anchors: {
      exact: ['best interactive dog toys', 'best dog enrichment toys'],
      partial: ['popular dog toys', 'top dog enrichment picks', 'interactive toys for dogs'],
      branded: ['GetPawsy dog toy picks', 'shop dog enrichment toys'],
    },
    tier: 1 as const,
  },
] as const;

// ── Blog → Cornerstone Trigger Keywords ──
// When blog content matches these keywords, inject a contextual link to the cornerstone
export const BLOG_CORNERSTONE_TRIGGERS: Record<string, { cornerstoneId: string; minWords: number }[]> = {
  // Cat litter keywords
  'cat litter': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'litter box': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'self-cleaning litter': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'litter odor': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'multi-cat litter': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],

  // Dog toy keywords
  'dog toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'dog toys': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'interactive toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'enrichment toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'puzzle toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'dog boredom': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],

  // Generic high-intent triggers → bestsellers
  'best pet': [{ cornerstoneId: 'bestsellers', minWords: 600 }],
  'top rated': [{ cornerstoneId: 'bestsellers', minWords: 600 }],
  'recommended products': [{ cornerstoneId: 'bestsellers', minWords: 600 }],
  'comparison': [{ cornerstoneId: 'bestsellers', minWords: 900 }],
  'review': [{ cornerstoneId: 'bestsellers', minWords: 900 }],
};

// ── Product Category → Cornerstone Collection Mapping ──
export const PRODUCT_CORNERSTONE_MAP: Record<string, string> = {
  // Cat litter cluster → litter box collection
  'cat-litter-boxes': 'best-cat-litter-boxes',
  'cat-litter': 'best-cat-litter-boxes',
  'cat litter': 'best-cat-litter-boxes',
  'litter': 'best-cat-litter-boxes',

  // Dog toy cluster → interactive dog toys collection
  'dog-toys': 'best-interactive-dog-toys',
  'dog toys': 'best-interactive-dog-toys',
  'dog-enrichment': 'best-interactive-dog-toys',

  // Everything else high-performing → bestsellers
  'dog-beds': 'bestsellers',
  'cat-trees-and-condos': 'bestsellers',
  'dog-grooming': 'bestsellers',
  'cat-furniture': 'bestsellers',
};

// ── Anchor Distribution Targets ──
export const ANCHOR_DISTRIBUTION = {
  exact: { target: 0.25, max: 0.30 },   // ≤25% exact match
  partial: { target: 0.50, min: 0.40 },  // ~50% partial match
  branded: { target: 0.25, min: 0.15 },  // ~25% branded/generic
} as const;

// ── Footer Priority Links ──
export const FOOTER_SHOP_LINKS = [
  { label: 'Bestsellers', href: '/bestsellers' },
  { label: 'Best Cat Litter Boxes', href: '/collections/best-cat-litter-boxes' },
  { label: 'Best Dog Toys', href: '/collections/best-interactive-dog-toys' },
  { label: 'All Products', href: '/products' },
  { label: 'Dogs', href: '/products?category=dogs' },
  { label: 'Cats', href: '/products?category=cats' },
];

// ── 60-Day Authority Flow Plan (Documentation) ──
export const AUTHORITY_FLOW_PLAN = {
  phase1: {
    days: '1–14',
    actions: [
      'Update 50 highest-traffic blog posts with cornerstone sculpt links',
      'Add 1 new internal link to each priority cornerstone from existing content',
      'Add FAQ block on each cornerstone (3–5 structured questions)',
    ],
  },
  phase2: {
    days: '15–30',
    actions: [
      'Add 2 new supporting blog posts per cornerstone topic',
      'Each new article links to its cornerstone',
      'Cross-link articles within same topic cluster',
    ],
  },
  phase3: {
    days: '31–45',
    actions: [
      'Add comparison tables to cornerstone pages',
      'Add "Why trust GetPawsy" trust section',
      'Add 3–5 contextual internal links per cornerstone (to subcategories)',
    ],
  },
  phase4: {
    days: '46–60',
    actions: [
      'Identify top 20 converting products',
      'Add contextual links from those products back to cornerstone pages',
      'Reduce internal links to low-priority pages by 20%',
    ],
  },
} as const;

/**
 * Get a deterministic anchor text for a cornerstone based on placement.
 * Ensures safe distribution across exact/partial/branded.
 */
export function getCornerstoneAnchor(
  cornerstoneId: string,
  placement: 'footer' | 'blog-inject' | 'product-cta' | 'hero' | 'sidebar',
): string {
  const cornerstone = PRIORITY_CORNERSTONES.find(c => c.id === cornerstoneId);
  if (!cornerstone) return cornerstoneId;

  // Deterministic type selection based on placement
  const placementTypeMap: Record<string, 'exact' | 'partial' | 'branded'> = {
    'footer': 'branded',
    'blog-inject': 'partial',
    'product-cta': 'partial',
    'hero': 'partial',
    'sidebar': 'branded',
  };

  const type = placementTypeMap[placement] || 'partial';
  const variants = cornerstone.anchors[type];
  // Deterministic index from cornerstone id length
  const idx = cornerstoneId.length % variants.length;
  return variants[idx];
}

/**
 * Find the best cornerstone match for a product category.
 * Returns the cornerstone path + recommended anchor.
 */
export function getProductCornerstonePath(category: string): { path: string; anchor: string } | null {
  const cat = category.toLowerCase().trim();
  const cornerstoneId = PRODUCT_CORNERSTONE_MAP[cat];
  if (!cornerstoneId) {
    // Fallback: keyword match
    for (const [key, id] of Object.entries(PRODUCT_CORNERSTONE_MAP)) {
      if (cat.includes(key) || key.includes(cat)) {
        const cs = PRIORITY_CORNERSTONES.find(c => c.id === id);
        if (cs) return { path: cs.path, anchor: getCornerstoneAnchor(id, 'product-cta') };
      }
    }
    return null;
  }
  const cs = PRIORITY_CORNERSTONES.find(c => c.id === cornerstoneId);
  if (!cs) return null;
  return { path: cs.path, anchor: getCornerstoneAnchor(cornerstoneId, 'product-cta') };
}
