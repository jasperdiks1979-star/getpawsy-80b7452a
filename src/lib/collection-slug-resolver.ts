/**
 * Collection Slug Resolver
 * 
 * Provides canonical slug mapping and virtual collection definitions
 * to ensure /collections/cat and /collections/dog NEVER show "Not Found".
 * 
 * Resolution order:
 * 1. Exact match in seo_collections
 * 2. Canonical alias mapping (e.g., "cats" → "cat")
 * 3. Virtual collection fallback (generates a runtime collection)
 */

export interface VirtualCollection {
  slug: string;
  name: string;
  primary_keyword: string;
  secondary_keywords: string[];
  seo_intro: string;
  meta_title: string;
  meta_description: string;
  faq: { question: string; answer: string }[];
  related_blog_slug: string | null;
  related_collection_slugs: string[];
  product_category_filter: string | null;
  product_keyword_filter: string;
}

/**
 * Canonical slug aliases — maps variant slugs to the preferred canonical slug.
 * If the canonical slug exists in seo_collections, use it.
 * If not, fall through to virtual collections.
 */
const SLUG_ALIASES: Record<string, string> = {
  // Cat variants
  'cats': 'cat',
  'feline': 'cat',
  'cat-essentials': 'cat',
  'cat-products': 'cat',
  'all-cat': 'cat',
  'shop-cat': 'cat',
  // Dog variants
  'dogs': 'dog',
  'canine': 'dog',
  'dog-essentials': 'dog',
  'dog-products': 'dog',
  'all-dog': 'dog',
  'shop-dog': 'dog',
  // Multi-pet variants
  'multi': 'multi-pet',
  'multipet': 'multi-pet',
  'all-pets': 'multi-pet',
  'pet': 'multi-pet',
  // Dog training variants / legacy redirects
  'leash-control': 'dog-leash-control',
  'potty-training': 'dog-potty-training',
  'dog-leash': 'dog-leash-control',
  'dog-potty': 'dog-potty-training',
};

/**
 * Virtual collections — rendered at runtime when no seo_collection row exists.
 * These pull products by keyword filter from the products table.
 */
const VIRTUAL_COLLECTIONS: Record<string, VirtualCollection> = {
  cat: {
    slug: 'cat',
    name: 'Cat Essentials — Top-Rated Cat Products',
    primary_keyword: 'cat products',
    secondary_keywords: ['cat supplies', 'cat essentials', 'best cat products', 'cat accessories'],
    seo_intro: 'Discover our curated collection of top-rated cat products — from interactive toys and cozy beds to modern furniture and litter solutions. Everything your feline friend needs for a happy, enriched indoor life.',
    meta_title: 'Cat Essentials — Best Cat Products 2026 | GetPawsy',
    meta_description: 'Shop the best cat products: interactive toys, modern cat trees, litter furniture & more. Curated for happy indoor cats. Free shipping on orders $49+.',
    faq: [
      { question: 'What are the best products for indoor cats?', answer: 'Indoor cats benefit most from interactive toys, vertical climbing furniture (cat trees, wall shelves), puzzle feeders, and window perches. These items combat boredom and promote natural behaviors like climbing, hunting, and scratching.' },
      { question: 'How do I keep my cat entertained while at work?', answer: 'Puzzle feeders, automated laser toys, and window bird feeders provide stimulation. Rotating toys every few days keeps things fresh. A cat tree near a window gives entertainment through bird-watching.' },
      { question: 'What cat furniture works in small apartments?', answer: 'Wall-mounted shelves, compact cat trees under 60 inches, and multi-functional litter box furniture save floor space while giving cats vertical territory they crave.' },
      { question: 'Are interactive cat toys safe to leave unsupervised?', answer: 'Electronic toys with auto-shutoff and no small detachable parts are generally safe. Avoid string-based toys when unsupervised, as cats can ingest string which causes serious intestinal issues.' },
    ],
    related_blog_slug: null,
    related_collection_slugs: ['cat-trees-and-condos', 'best-cat-toys-for-indoor-cats', 'best-cat-litter-boxes'],
    product_category_filter: null,
    product_keyword_filter: 'cat',
  },
  dog: {
    slug: 'dog',
    name: 'Dog Essentials — Top-Rated Dog Products',
    primary_keyword: 'dog products',
    secondary_keywords: ['dog supplies', 'dog essentials', 'best dog products', 'dog accessories'],
    seo_intro: 'Browse our curated collection of top-rated dog products — from orthopedic beds and no-pull harnesses to interactive toys and travel gear. Everything your pup needs for comfort, training, and adventure.',
    meta_title: 'Dog Essentials — Best Dog Products 2026 | GetPawsy',
    meta_description: 'Shop the best dog products: orthopedic beds, training gear, interactive toys & travel essentials. Curated for happy, healthy dogs. Free shipping on $49+.',
    faq: [
      { question: 'What are the must-have products for a new dog?', answer: 'Every new dog needs a comfortable bed, food and water bowls, a properly-fitted collar or harness with leash, chew toys, and grooming basics. For puppies, add potty training pads and a crate for safe training.' },
      { question: 'How do I choose the right dog bed?', answer: 'Consider your dog\'s size, age, and sleeping style. Large breeds and seniors benefit from orthopedic memory foam beds. Dogs who curl up prefer bolstered beds. Chewers need chew-resistant covers. Measure your dog lying down to get the right size.' },
      { question: 'What training tools work best for dogs that pull?', answer: 'Front-clip no-pull harnesses are the most humane and effective option. They redirect your dog\'s momentum toward you when they pull. Pair with positive reinforcement training for lasting results. Avoid choke chains and prong collars.' },
      { question: 'Are dog car seats necessary for travel?', answer: 'Yes — an unrestrained dog in a car is a safety hazard for both the pet and passengers. Dog car seats, booster seats, or crash-tested harnesses keep your dog secure during sudden stops. Many states require pet restraints by law.' },
    ],
    related_blog_slug: null,
    related_collection_slugs: ['orthopedic-calming-dog-beds', 'best-interactive-dog-toys', 'dog-collars-leashes'],
    product_category_filter: null,
    product_keyword_filter: 'dog',
  },
  'multi-pet': {
    slug: 'multi-pet',
    name: 'Multi-Pet Essentials — Products for Cats & Dogs',
    primary_keyword: 'multi-pet products',
    secondary_keywords: ['cat and dog products', 'pet supplies', 'multi-pet household', 'products for cats and dogs'],
    seo_intro: 'Products designed for households with both cats and dogs. From shared water fountains and automatic feeders to universal grooming tools — find items that work for your whole furry family.',
    meta_title: 'Multi-Pet Products — For Cats & Dogs | GetPawsy',
    meta_description: 'Shop products made for multi-pet households. Water fountains, feeders, beds & more for cats and dogs. Curated for happy pet families.',
    faq: [
      { question: 'Can cats and dogs share a water fountain?', answer: 'Yes! Most pet water fountains are designed for both cats and dogs. Look for models with multiple drinking levels and sufficient capacity for all your pets.' },
      { question: 'What products work for both cats and dogs?', answer: 'Water fountains, automatic feeders, pet cameras, grooming gloves, and travel carriers often come in universal designs that work for both species.' },
    ],
    related_blog_slug: null,
    related_collection_slugs: ['cat', 'dog'],
    product_category_filter: null,
    product_keyword_filter: 'pet',
  },
};

export interface SlugResolution {
  /** The resolved slug to query in seo_collections */
  resolvedSlug: string;
  /** The original slug from the URL */
  originalSlug: string;
  /** Whether an alias mapping was used */
  aliasUsed: boolean;
  /** The alias key that matched (if any) */
  aliasKey?: string;
  /** Whether a virtual collection is available as fallback */
  hasVirtualFallback: boolean;
}

/**
 * Resolve a collection slug — returns the canonical slug + metadata.
 */
export function resolveCollectionSlug(slug: string): SlugResolution {
  const normalized = slug.toLowerCase().trim();
  
  // Check alias mapping
  const aliasTarget = SLUG_ALIASES[normalized];
  if (aliasTarget && aliasTarget !== normalized) {
    return {
      resolvedSlug: aliasTarget,
      originalSlug: normalized,
      aliasUsed: true,
      aliasKey: normalized,
      hasVirtualFallback: aliasTarget in VIRTUAL_COLLECTIONS,
    };
  }

  return {
    resolvedSlug: normalized,
    originalSlug: normalized,
    aliasUsed: false,
    hasVirtualFallback: normalized in VIRTUAL_COLLECTIONS,
  };
}

/**
 * Get a virtual collection definition for a given slug.
 * Returns null if no virtual collection is defined.
 */
export function getVirtualCollection(slug: string): VirtualCollection | null {
  return VIRTUAL_COLLECTIONS[slug] ?? null;
}

/**
 * Check if a slug has a virtual collection defined.
 */
export function isVirtualCollectionSlug(slug: string): boolean {
  return slug in VIRTUAL_COLLECTIONS;
}
