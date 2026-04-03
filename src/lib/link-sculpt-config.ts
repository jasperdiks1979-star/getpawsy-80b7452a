/**
 * Internal Link Sculpting Configuration
 * 
 * Central config for authority flow: priority cornerstones, anchor distribution,
 * blog→cornerstone keyword triggers, and product→collection mapping.
 */

// ── Priority Cornerstones (receive most link equity) ──
export const PRIORITY_CORNERSTONES = [
  {
    id: 'dog-potty-training',
    path: '/collections/all',
    label: 'Dog Potty Training Tools',
    anchors: {
      exact: ['dog potty training', 'potty training supplies'],
      partial: ['housebreaking tools', 'potty training pads and trays', 'house training solutions'],
      branded: ['GetPawsy potty training', 'shop potty training gear'],
    },
    tier: 1 as const,
  },
  {
    id: 'dog-leash-control',
    path: '/collections/all',
    label: 'Dog Leash & Control Tools',
    anchors: {
      exact: ['dog leash training', 'no-pull harness'],
      partial: ['leash control tools', 'walk training gear', 'anti-pull training leashes'],
      branded: ['GetPawsy leash tools', 'shop leash control'],
    },
    tier: 1 as const,
  },
  {
    id: 'dog-anti-bark',
    path: '/collections/all',
    label: 'Anti-Bark Solutions',
    anchors: {
      exact: ['anti bark devices', 'stop dog barking'],
      partial: ['humane bark control', 'bark deterrent tools', 'ultrasonic bark solutions'],
      branded: ['GetPawsy anti-bark', 'shop bark control'],
    },
    tier: 1 as const,
  },
  {
    id: 'puppy-training-essentials',
    path: '/collections/all',
    label: 'Puppy Training Essentials',
    anchors: {
      exact: ['puppy training essentials', 'puppy starter kit'],
      partial: ['puppy training tools', 'first puppy supplies', 'new puppy checklist'],
      branded: ['GetPawsy puppy essentials', 'shop puppy training'],
    },
    tier: 1 as const,
  },
  {
    id: 'dog-training-accessories',
    path: '/collections/dog-training-accessories',
    label: 'Training Accessories',
    anchors: {
      exact: ['dog training accessories', 'clicker training supplies'],
      partial: ['training treat pouches', 'agility equipment for dogs', 'training tool kit'],
      branded: ['GetPawsy training accessories', 'shop training gear'],
    },
    tier: 1 as const,
  },
  {
    id: 'bestsellers',
    path: '/bestsellers',
    label: 'Our Bestselling Pet Products',
    anchors: {
      exact: ['best pet products', 'bestselling pet products'],
      partial: ['our bestselling picks', 'top-rated pet products', 'most popular pet essentials'],
      branded: ['GetPawsy Bestsellers', 'shop our top picks'],
    },
    tier: 2 as const,
  },
  {
    id: 'best-cat-litter-boxes',
    path: '/collections/cat-litter-boxes',
    label: 'Best Cat Litter Boxes 2026',
    anchors: {
      exact: ['best cat litter boxes', 'best litter boxes 2026'],
      partial: ['top-rated litter boxes', 'expert-tested litter boxes', 'litter box buying guide'],
      branded: ['GetPawsy litter box picks', 'our litter box collection'],
    },
    tier: 2 as const,
  },
  {
    id: 'self-cleaning-litter-box-guide',
    path: '/guides/self-cleaning-litter-box-guide',
    label: 'Self-Cleaning Litter Box Guide 2026',
    anchors: {
      exact: ['self-cleaning litter box', 'automatic litter box guide'],
      partial: ['self-cleaning litter box guide', 'how automatic litter boxes work', 'best automatic litter solutions'],
      branded: ['GetPawsy litter box guide', 'our self-cleaning litter guide'],
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
    tier: 2 as const,
  },
] as const;

// ── Blog → Cornerstone Trigger Keywords ──
// When blog content matches these keywords, inject a contextual link to the cornerstone
export const BLOG_CORNERSTONE_TRIGGERS: Record<string, { cornerstoneId: string; minWords: number }[]> = {
  // Dog training triggers → Tier A collections
  'potty training': [{ cornerstoneId: 'dog-potty-training', minWords: 400 }],
  'house training': [{ cornerstoneId: 'dog-potty-training', minWords: 400 }],
  'housebreaking': [{ cornerstoneId: 'dog-potty-training', minWords: 400 }],
  'potty pad': [{ cornerstoneId: 'dog-potty-training', minWords: 400 }],
  'leash training': [{ cornerstoneId: 'dog-leash-control', minWords: 400 }],
  'no-pull': [{ cornerstoneId: 'dog-leash-control', minWords: 400 }],
  'pulling on leash': [{ cornerstoneId: 'dog-leash-control', minWords: 400 }],
  'walk training': [{ cornerstoneId: 'dog-leash-control', minWords: 400 }],
  'harness': [{ cornerstoneId: 'dog-leash-control', minWords: 400 }],
  'bark': [{ cornerstoneId: 'dog-anti-bark', minWords: 400 }],
  'barking': [{ cornerstoneId: 'dog-anti-bark', minWords: 400 }],
  'anti-bark': [{ cornerstoneId: 'dog-anti-bark', minWords: 400 }],
  'stop barking': [{ cornerstoneId: 'dog-anti-bark', minWords: 400 }],
  'puppy training': [{ cornerstoneId: 'puppy-training-essentials', minWords: 400 }],
  'new puppy': [{ cornerstoneId: 'puppy-training-essentials', minWords: 400 }],
  'puppy essentials': [{ cornerstoneId: 'puppy-training-essentials', minWords: 400 }],
  'clicker': [{ cornerstoneId: 'dog-training-accessories', minWords: 400 }],
  'treat pouch': [{ cornerstoneId: 'dog-training-accessories', minWords: 400 }],
  'agility': [{ cornerstoneId: 'dog-training-accessories', minWords: 400 }],
  'training tool': [{ cornerstoneId: 'dog-training-accessories', minWords: 400 }],

  // Cat litter keywords
  'cat litter': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'litter box': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'self-cleaning litter': [{ cornerstoneId: 'self-cleaning-litter-box-guide', minWords: 400 }],
  'self cleaning litter': [{ cornerstoneId: 'self-cleaning-litter-box-guide', minWords: 400 }],
  'automatic litter': [{ cornerstoneId: 'self-cleaning-litter-box-guide', minWords: 400 }],
  'litter odor': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'litter smell': [{ cornerstoneId: 'self-cleaning-litter-box-guide', minWords: 400 }],
  'multi-cat litter': [{ cornerstoneId: 'best-cat-litter-boxes', minWords: 600 }],
  'robot litter box': [{ cornerstoneId: 'self-cleaning-litter-box-guide', minWords: 400 }],
  'smart litter box': [{ cornerstoneId: 'self-cleaning-litter-box-guide', minWords: 400 }],

  // Dog toy keywords
  'dog toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'dog toys': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'interactive toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'enrichment toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],
  'puzzle toy': [{ cornerstoneId: 'best-interactive-dog-toys', minWords: 600 }],

  // Generic high-intent triggers → bestsellers
  'best pet': [{ cornerstoneId: 'bestsellers', minWords: 600 }],
  'top rated': [{ cornerstoneId: 'bestsellers', minWords: 600 }],
  'recommended products': [{ cornerstoneId: 'bestsellers', minWords: 600 }],
};

// ── Product Category → Cornerstone Collection Mapping ──
export const PRODUCT_CORNERSTONE_MAP: Record<string, string> = {
  // Dog training cluster → Tier A collections
  'dog-training': 'dog-leash-control',
  'dog-collars-leashes': 'dog-leash-control',
  'dog collars & leashes': 'dog-leash-control',
  'leash': 'dog-leash-control',
  'harness': 'dog-leash-control',
  'potty': 'dog-potty-training',
  'potty training': 'dog-potty-training',
  'housebreaking': 'dog-potty-training',
  'bark': 'dog-anti-bark',
  'anti-bark': 'dog-anti-bark',
  'puppy': 'puppy-training-essentials',
  'clicker': 'dog-training-accessories',
  'treat-bag': 'dog-training-accessories',
  'agility': 'dog-training-accessories',
  'training accessory': 'dog-training-accessories',

  // Cat litter cluster → litter box collection
  'cat-litter-boxes': 'best-cat-litter-boxes',
  'cat-litter': 'best-cat-litter-boxes',
  'cat litter': 'best-cat-litter-boxes',
  'litter': 'best-cat-litter-boxes',

  // Dog toy cluster → interactive dog toys collection
  'dog-toys': 'best-interactive-dog-toys',
  'dog toys': 'best-interactive-dog-toys',
  'dog-enrichment': 'best-interactive-dog-toys',

  // Secondary
  'dog-beds': 'bestsellers',
  'cat-trees-and-condos': 'bestsellers',
  'dog-grooming': 'bestsellers',
  'cat-furniture': 'bestsellers',
};

// ── Anchor Distribution Targets ──
export const ANCHOR_DISTRIBUTION = {
  exact: { target: 0.35, max: 0.35 },   // ≤35% exact match
  partial: { target: 0.45, min: 0.35 },  // ~45% partial match
  branded: { target: 0.20, min: 0.15 },  // ~20% branded/generic
} as const;

// ── Footer Priority Links ──
export const FOOTER_SHOP_LINKS = [
  { label: 'Potty Training', href: '/collections/all' },
  { label: 'Leash & Control', href: '/collections/all' },
  { label: 'Anti-Bark Solutions', href: '/collections/all' },
  { label: 'Puppy Essentials', href: '/collections/all' },
  { label: 'Training Accessories', href: '/collections/dog-training-accessories' },
  { label: 'Bestsellers', href: '/bestsellers' },
  { label: 'All Products', href: '/products' },
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
