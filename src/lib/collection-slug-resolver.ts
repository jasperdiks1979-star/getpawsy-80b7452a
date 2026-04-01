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
  // Cat variants → canonical 'cats'
  'cat': 'cats',
  'feline': 'cats',
  'cat-essentials': 'cats',
  'cat-products': 'cats',
  'all-cat': 'cats',
  'shop-cat': 'cats',
  'cat-supplies': 'cats',
  // Dog variants → canonical 'dogs'
  'dog': 'dogs',
  'canine': 'dogs',
  'dog-essentials': 'dogs',
  'dog-products': 'dogs',
  'all-dog': 'dogs',
  'shop-dog': 'dogs',
  'dog-supplies': 'dogs',
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
  'dog-training': 'dog-leash-control',
  'training': 'dog-leash-control',
  'anti-bark': 'dog-anti-bark',
  'bark-control': 'dog-anti-bark',
  'stop-barking': 'dog-anti-bark',
  'training-accessories': 'dog-training-accessories',
  'dog-accessories': 'dog-training-accessories',
  'puppy-essentials': 'puppy-training-essentials',
  'puppy-training': 'puppy-training-essentials',
  'puppy-starter-kit': 'puppy-training-essentials',
  'puppy-kit': 'puppy-training-essentials',
  // Shopify legacy handles
  'frontpage': 'dogs',
  'all-products': 'all',
  'new-arrivals': 'all',
};

/**
 * Virtual collections — rendered at runtime when no seo_collection row exists.
 * These pull products by keyword filter from the products table.
 */
const VIRTUAL_COLLECTIONS: Record<string, VirtualCollection> = {
  all: {
    slug: 'all',
    name: 'All Products — Shop the Full GetPawsy Catalog',
    primary_keyword: 'pet products',
    secondary_keywords: ['all pet products', 'cat and dog products', 'pet essentials', 'pet supplies'],
    seo_intro: 'Browse every product in the GetPawsy catalog — from cat trees and litter solutions to dog beds, strollers, and travel gear. All orders ship within the United States with tracking included.',
    meta_title: 'All Products — Full Pet Product Catalog | GetPawsy',
    meta_description: 'Shop all GetPawsy products: cat trees, litter boxes, dog beds, strollers & more. Free shipping on eligible orders $35+. 30-day returns.',
    faq: [
      { question: 'What products does GetPawsy sell?', answer: 'GetPawsy offers a curated selection of premium pet products including cat trees, self-cleaning litter boxes, orthopedic dog beds, pet strollers, and travel accessories — all shipped within the United States.' },
      { question: 'Do you offer free shipping?', answer: 'Yes! Orders over $35 qualify for free shipping. Orders under $35 ship for a flat rate of $5.99.' },
    ],
    related_blog_slug: null,
    related_collection_slugs: ['cat', 'dog'],
    product_category_filter: null,
    product_keyword_filter: '',
  },
  cat: {
    slug: 'cat',
    name: 'Cat Essentials — Top-Rated Cat Products',
    primary_keyword: 'cat products',
    secondary_keywords: ['cat supplies', 'cat essentials', 'best cat products', 'cat accessories'],
    seo_intro: 'Discover our curated collection of top-rated cat products — from interactive toys and cozy beds to modern furniture and litter solutions. Everything your feline friend needs for a happy, enriched indoor life.',
    meta_title: 'Cat Essentials — Best Cat Products 2026 | GetPawsy',
    meta_description: 'Shop the best cat products: interactive toys, modern cat trees, litter furniture & more. Curated for happy indoor cats. Free shipping on orders $35+.',
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
    meta_description: 'Shop the best dog products: orthopedic beds, training gear, interactive toys & travel essentials. Curated for happy, healthy dogs. Free shipping on $35+.',
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
  // ── Dog Training Money Funnel Virtual Fallbacks ──
  'dog-leash-control': {
    slug: 'dog-leash-control',
    name: 'Dog Leash & Control — No-Pull Training Tools',
    primary_keyword: 'dog leash training tools',
    secondary_keywords: ['no-pull harness', 'dog leash', 'training leash', 'slip lead', 'head collar', 'long line'],
    seo_intro: 'Find the best no-pull harnesses, training leashes, slip leads, and control tools for dogs that pull. Humane, positive-reinforcement gear trusted by professional trainers and US dog owners.',
    meta_title: 'Dog Leash & Control — No-Pull Training Tools 2026 | GetPawsy',
    meta_description: 'Shop no-pull harnesses, training leashes & control tools for dogs. Humane solutions for pullers. Free shipping $35+, 30-day returns.',
    faq: [
      { question: 'What is the best harness for a dog that pulls?', answer: 'A front-clip no-pull harness is the most effective and humane option. It redirects your dog\'s momentum toward you when they pull, making walks more manageable without causing discomfort.' },
      { question: 'Are slip leads good for training?', answer: 'Slip leads can be effective for trained dogs in specific situations (vet visits, emergency control), but for everyday leash training, a front-clip harness paired with positive reinforcement is more effective and safer.' },
      { question: 'How long should a training leash be?', answer: 'A standard 6-foot leash is ideal for daily walks and basic training. For recall practice and distance training, use a 15-30 foot long line in open, safe areas.' },
      { question: 'When should I start leash training my puppy?', answer: 'Start indoor leash familiarization as early as 8-10 weeks old. Begin short outdoor walks once your puppy is fully vaccinated (typically around 16 weeks). Keep early sessions to 5-10 minutes.' },
    ],
    related_blog_slug: 'leash-training-dog-step-by-step',
    related_collection_slugs: ['dog-potty-training', 'dog-anti-bark', 'puppy-training-essentials'],
    product_category_filter: null,
    product_keyword_filter: 'leash,lead,no-pull,harness,collar,walking,control,slip lead',
  },
  'dog-potty-training': {
    slug: 'dog-potty-training',
    name: 'Dog Potty Training — Pads, Mats & Solutions',
    primary_keyword: 'dog potty training',
    secondary_keywords: ['puppy potty pads', 'training pads', 'grass mat', 'housebreaking', 'potty training spray'],
    seo_intro: 'Everything you need for successful puppy and dog potty training. From absorbent training pads and grass mats to attractant sprays and potty bells — get your dog housetrained faster with proven tools.',
    meta_title: 'Dog Potty Training — Pads, Mats & Solutions 2026 | GetPawsy',
    meta_description: 'Shop potty training pads, grass mats, sprays & tools for puppies and dogs. Housebreaking essentials. Free Shipping on Orders $35+.',
    faq: [
      { question: 'How long does potty training a puppy take?', answer: 'Most puppies can be reliably housetrained within 4-6 months, though some may take up to a year. Consistency, positive reinforcement, and a regular schedule are key to faster results.' },
      { question: 'Are grass pads better than regular potty pads?', answer: 'Grass pads (real or artificial) can make the transition to outdoor potty habits easier because they teach dogs to associate grass with bathroom time. Regular pads are more absorbent for indoor-only use.' },
      { question: 'Do potty training sprays really work?', answer: 'Attractant sprays can help guide your puppy to the correct potty spot. They contain scents that encourage elimination in that area. They work best when combined with a consistent schedule and positive reinforcement.' },
      { question: 'How often should I take my puppy out to potty?', answer: 'A general rule: puppies can hold it for about 1 hour per month of age. A 3-month-old puppy needs to go out every 3 hours. Always take them out after eating, drinking, playing, and waking up.' },
    ],
    related_blog_slug: 'dog-potty-training-complete-guide',
    related_collection_slugs: ['dog-leash-control', 'puppy-training-essentials', 'dog-training-accessories'],
    product_category_filter: null,
    product_keyword_filter: 'potty,pee pad,training pad,housebreaking,diaper,grass mat,toilet,puppy pad',
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
