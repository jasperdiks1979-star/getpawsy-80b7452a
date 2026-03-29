/**
 * Long-Tail SEO Keywords Library for GetPawsy
 * 
 * Top-10 buyer-intent keywords per niche to guide future content creation.
 * These keywords target US shoppers with high purchase intent.
 * 
 * Usage: Import these when creating SEO blogs, collections, or product content.
 */

export const LONGTAIL_KEYWORDS = {
  // NICHE 1: DOG TRAVEL
  dogTravel: {
    primary: 'dog travel accessories',
    keywords: [
      'dog hammock for back seat',
      'dog car safety accessories',
      'back seat dog cover for cars',
      'dog travel gear for road trips',
      'best dog car seat cover',
      'dog seat protector waterproof',
      'dog car barrier for SUVs',
      'dog travel accessories for long trips',
      'safe car accessories for dogs',
      'dog back seat safety solutions',
    ],
    relatedCollection: '/collections/dog-travel-accessories',
  },

  // NICHE 2: INDOOR CAT ENRICHMENT (PRIMARY FOCUS - Feb 2026)
  indoorCatEnrichment: {
    primary: 'cat enrichment toys',
    keywords: [
      'cat enrichment toys',
      'indoor cat toys',
      'cat trees condos',
      'cat condo',
      'cat tower',
      'boredom toys for cats',
      'cat puzzle feeders',
      'interactive cat toys',
      'cat tree house',
      'kitten toys',
      'cat mental stimulation',
      'flower cat tower',
      'pink cat tower',
    ],
    relatedCollection: '/collections/indoor-cat-enrichment',
  },

  // NICHE 3: MESS-FREE DOG FEEDING
  messFreeFeeding: {
    primary: 'no spill dog bowls',
    keywords: [
      'no spill dog bowls',
      'mess free dog feeder',
      'elevated dog bowls for large dogs',
      'dog bowls that don\'t tip over',
      'slow feeder bowl for messy eaters',
      'non spill water bowl for dogs',
      'best dog bowl for fast eaters',
      'raised dog bowls for joint support',
      'spill proof dog water bowl',
      'dog feeding solutions for messy dogs',
    ],
    relatedCollection: '/collections/no-spill-dog-feeding',
  },

  // NICHE 4: GUINEA PIG CAGES & PLAYPENS
  guineaPigCages: {
    primary: 'guinea pig cage',
    keywords: [
      'guinea pig cage',
      'guinea pig cages',
      'guinea pig playpen',
      'guinea pig enclosure',
      'guinea pig habitat',
      'c&c cage guinea pig',
      'guinea pig cage setup',
      'best guinea pig cage',
      'guinea pig hutch indoor',
      'guinea pig pen',
    ],
    relatedCollection: '/collections/guinea-pig-cages-playpens',
  },

  // NICHE 5: CAT CARRIERS & TRAVEL
  catCarriers: {
    primary: 'cat carrier',
    keywords: [
      'portable cat carrier',
      'soft-sided cat carrier',
      'cat kennel',
      'travel pet crate',
      'airline approved cat carrier',
      'expandable cat carrier',
      'cat travel crate',
      'cat carrier for vet',
      'two cat carrier',
      'cat carrier backpack',
    ],
    relatedCollection: '/products?category=cat-carriers',
  },

  // NICHE 6: DOG ENRICHMENT & GAMES
  dogEnrichment: {
    primary: 'dog enrichment toys',
    keywords: [
      'dog enrichment toys',
      'interactive dog games',
      'outdoor dog games',
      'dog puzzle toys',
      'mental stimulation for dogs',
      'dog brain games',
      'snuffle mat for dogs',
      'dog foraging toys',
      'boredom busters for dogs',
      'dog activity toys',
    ],
    relatedCollection: '/products?category=dog-toys',
  },
} as const;

/**
 * Get all keywords for a specific niche
 */
export function getNicheKeywords(niche: keyof typeof LONGTAIL_KEYWORDS): readonly string[] {
  return LONGTAIL_KEYWORDS[niche].keywords;
}

/**
 * Get primary keyword for a niche
 */
export function getPrimaryKeyword(niche: keyof typeof LONGTAIL_KEYWORDS): string {
  return LONGTAIL_KEYWORDS[niche].primary;
}

/**
 * Get related collection URL for a niche
 */
export function getRelatedCollection(niche: keyof typeof LONGTAIL_KEYWORDS): string {
  return LONGTAIL_KEYWORDS[niche].relatedCollection;
}

/**
 * Get all long-tail keywords across all niches (for sitemap/content planning)
 */
export function getAllLongTailKeywords(): string[] {
  return Object.values(LONGTAIL_KEYWORDS).flatMap(niche => niche.keywords);
}

/**
 * META TITLE TEMPLATES
 * 
 * Homepage: GetPawsy | Trusted Pet Products with US Shipping
 * 
 * Collection format: [Primary Keyword] for Everyday Use | GetPawsy
 * Example: Dog Travel Accessories for Everyday Use | GetPawsy
 * 
 * Blog format: [Blog Topic] | A Helpful Guide for Pet Parents
 * Example: Indoor Cat Enrichment | A Helpful Guide for Pet Parents
 * 
 * Product format: [Product Name] for Dogs & Cats | GetPawsy
 * Example: Elevated Dog Bowl Set for Dogs & Cats | GetPawsy
 */
export const META_TEMPLATES = {
  homepage: {
    title: 'GetPawsy | Trusted Pet Products with US Shipping',
    description: 'Shop thoughtfully selected pet products for dogs and cats. US shipping, free over $35, and 30-day easy returns.',
  },
  
  collection: {
    titleFormat: (primaryKeyword: string) => 
      `${primaryKeyword} for Everyday Use | GetPawsy`.slice(0, 60),
    descriptionFormat: (primaryKeyword: string) =>
      `Discover practical ${primaryKeyword.toLowerCase()} designed for comfort and daily life. US shipping and easy returns.`.slice(0, 155),
  },
  
  blog: {
    titleFormat: (topic: string) =>
      `${topic} | A Helpful Guide for Pet Parents`.slice(0, 60),
    descriptionFormat: (problem: string) =>
      `Learn how to ${problem.toLowerCase()} with practical tips and trusted product recommendations for everyday pet care.`.slice(0, 155),
  },
  
  product: {
    titleFormat: (productName: string) => {
      const shortName = productName.length > 40 ? productName.slice(0, 40) : productName;
      return `${shortName} for Dogs & Cats | GetPawsy`.slice(0, 60);
    },
    descriptionFormat: () =>
      'A practical everyday pet product designed for comfort and ease. US shipping and 30-day easy returns.',
  },
} as const;

/**
 * Generate collection meta title
 */
export function generateCollectionMetaTitle(primaryKeyword: string): string {
  return META_TEMPLATES.collection.titleFormat(primaryKeyword);
}

/**
 * Generate collection meta description
 */
export function generateCollectionMetaDescription(primaryKeyword: string): string {
  return META_TEMPLATES.collection.descriptionFormat(primaryKeyword);
}

/**
 * Generate blog meta title
 */
export function generateBlogMetaTitle(topic: string): string {
  return META_TEMPLATES.blog.titleFormat(topic);
}

/**
 * Generate blog meta description
 */
export function generateBlogMetaDescriptionFromProblem(problem: string): string {
  return META_TEMPLATES.blog.descriptionFormat(problem);
}

/**
 * Generate product meta title
 */
export function generateProductMetaTitle(productName: string): string {
  return META_TEMPLATES.product.titleFormat(productName);
}

/**
 * Generate product meta description (static template)
 */
export function generateProductMetaDescriptionTemplate(): string {
  return META_TEMPLATES.product.descriptionFormat();
}
