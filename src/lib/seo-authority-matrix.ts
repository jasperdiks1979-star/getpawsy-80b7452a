/**
 * SEO Internal Authority Matrix
 * 
 * Defines the internal linking hierarchy and validates
 * that every page meets minimum internal link requirements.
 * 
 * Authority flow: Homepage → Pillars → Collections → Products → Blog
 */

import { TOPIC_PILLARS, type TopicPillar } from '@/lib/topic-cluster-pillars';

// ============= AUTHORITY HIERARCHY =============

export interface InternalLinkRule {
  sourceType: 'homepage' | 'pillar' | 'collection' | 'product' | 'blog';
  targetType: 'pillar' | 'collection' | 'product' | 'blog';
  minLinks: number;
  maxLinks: number;
  anchorStrategy: 'keyword-rich' | 'natural' | 'branded' | 'mixed';
}

export const AUTHORITY_RULES: InternalLinkRule[] = [
  // Homepage links
  { sourceType: 'homepage', targetType: 'pillar', minLinks: 8, maxLinks: 12, anchorStrategy: 'keyword-rich' },
  { sourceType: 'homepage', targetType: 'collection', minLinks: 6, maxLinks: 10, anchorStrategy: 'keyword-rich' },

  // Pillar links
  { sourceType: 'pillar', targetType: 'collection', minLinks: 5, maxLinks: 15, anchorStrategy: 'keyword-rich' },
  { sourceType: 'pillar', targetType: 'product', minLinks: 3, maxLinks: 5, anchorStrategy: 'mixed' },
  { sourceType: 'pillar', targetType: 'blog', minLinks: 3, maxLinks: 5, anchorStrategy: 'natural' },

  // Collection links
  { sourceType: 'collection', targetType: 'pillar', minLinks: 1, maxLinks: 1, anchorStrategy: 'keyword-rich' },
  { sourceType: 'collection', targetType: 'collection', minLinks: 2, maxLinks: 4, anchorStrategy: 'mixed' },
  { sourceType: 'collection', targetType: 'blog', minLinks: 2, maxLinks: 3, anchorStrategy: 'natural' },

  // Product links
  { sourceType: 'product', targetType: 'collection', minLinks: 1, maxLinks: 2, anchorStrategy: 'keyword-rich' },
  { sourceType: 'product', targetType: 'blog', minLinks: 1, maxLinks: 2, anchorStrategy: 'natural' },
  { sourceType: 'product', targetType: 'product', minLinks: 2, maxLinks: 4, anchorStrategy: 'mixed' },

  // Blog links
  { sourceType: 'blog', targetType: 'pillar', minLinks: 1, maxLinks: 1, anchorStrategy: 'keyword-rich' },
  { sourceType: 'blog', targetType: 'collection', minLinks: 1, maxLinks: 2, anchorStrategy: 'keyword-rich' },
  { sourceType: 'blog', targetType: 'product', minLinks: 2, maxLinks: 3, anchorStrategy: 'mixed' },
];

// ============= ANCHOR TEXT DISTRIBUTION =============

export const ANCHOR_DISTRIBUTION = {
  maxExactMatchPercent: 30,
  partialMatchPercent: 40,
  brandedNaturalPercent: 30,
};

/**
 * Generate varied anchor text for a collection link.
 * Avoids over-optimization by rotating between strategies.
 */
export function generateAnchorText(
  pillar: TopicPillar,
  index: number
): string {
  const allAnchors = [
    pillar.pillarKeyword,
    ...pillar.secondaryKeywords,
    `shop ${pillar.name.toLowerCase()}`,
    `explore ${pillar.name.toLowerCase()}`,
    `best ${pillar.pillarKeyword}`,
    `${pillar.name} at GetPawsy`,
  ];
  return allAnchors[index % allAnchors.length];
}

// ============= CLICK DEPTH VALIDATION =============

/**
 * Maximum click depth from homepage. 
 * All pages must be reachable in ≤3 clicks.
 */
export const MAX_CLICK_DEPTH = 3;

/**
 * Minimum internal links pointing TO each page.
 */
export const MIN_INBOUND_LINKS = {
  pillar: 5,
  collection: 3,
  product: 3,
  blog: 2,
};

// ============= PILLAR PAGE CONTENT REQUIREMENTS =============

export const CONTENT_REQUIREMENTS = {
  pillar: {
    minWords: 1500,
    maxWords: 2500,
    requiredSections: ['intro', 'subcategories', 'top-products', 'faq', 'internal-links'],
    minFaqQuestions: 5,
    minInternalLinks: 10,
  },
  collection: {
    minWords: 400,
    maxWords: 800,
    requiredSections: ['intro', 'comparison', 'faq', 'related-links'],
    minFaqQuestions: 3,
    minInternalLinks: 5,
  },
  product: {
    minWords: 300,
    requiredSections: ['description', 'features', 'use-cases', 'care-instructions', 'shipping'],
    minInternalLinks: 3,
  },
  blog: {
    minWords: 1200,
    maxWords: 2500,
    requiredSections: ['intro', 'main-content', 'product-recommendations', 'cta', 'pillar-link'],
    minInternalLinks: 5,
  },
};

// ============= 20 NEW LONG-TAIL BLOG TOPICS =============

export const LONG_TAIL_BLOG_EXPANSION = [
  // Dog Beds cluster
  { slug: 'best-dog-beds-for-golden-retrievers', keyword: 'best dog beds for golden retrievers', collection: 'orthopedic-calming-dog-beds', intent: 'commercial' as const },
  { slug: 'how-to-wash-a-dog-bed', keyword: 'how to wash a dog bed', collection: 'orthopedic-calming-dog-beds', intent: 'informational' as const },
  { slug: 'dog-bed-vs-crate-pad-which-is-better', keyword: 'dog bed vs crate pad', collection: 'orthopedic-calming-dog-beds', intent: 'commercial' as const },

  // Cat Furniture cluster
  { slug: 'best-cat-trees-for-maine-coons', keyword: 'best cat trees for maine coons', collection: 'cat-condos', intent: 'commercial' as const },
  { slug: 'how-to-get-cat-to-use-cat-tree', keyword: 'how to get cat to use cat tree', collection: 'cat-condos', intent: 'informational' as const },
  { slug: 'cat-tree-vs-cat-shelves-pros-cons', keyword: 'cat tree vs cat shelves', collection: 'cat-condos', intent: 'commercial' as const },

  // Cat Litter cluster
  { slug: 'self-cleaning-litter-box-pros-cons', keyword: 'self cleaning litter box pros and cons', collection: 'best-cat-litter-boxes', intent: 'commercial' as const },
  { slug: 'how-often-to-change-cat-litter', keyword: 'how often to change cat litter', collection: 'best-cat-litter-boxes', intent: 'informational' as const },

  // Dog Toys cluster
  { slug: 'best-toys-for-teething-puppies', keyword: 'best toys for teething puppies', collection: 'best-interactive-dog-toys', intent: 'commercial' as const },
  { slug: 'diy-dog-enrichment-ideas-at-home', keyword: 'diy dog enrichment ideas', collection: 'best-interactive-dog-toys', intent: 'informational' as const },

  // Dog Grooming cluster
  { slug: 'how-often-should-you-groom-your-dog', keyword: 'how often should you groom your dog', collection: 'best-dog-grooming-kits', intent: 'informational' as const },
  { slug: 'best-grooming-tools-for-double-coated-dogs', keyword: 'grooming tools for double coated dogs', collection: 'best-dog-grooming-kits', intent: 'commercial' as const },

  // Dog Travel cluster
  { slug: 'how-to-keep-dog-calm-in-car', keyword: 'how to keep dog calm in car', collection: 'dog-travel-accessories', intent: 'informational' as const },
  { slug: 'best-dog-car-seats-for-anxious-dogs', keyword: 'dog car seat for anxious dogs', collection: 'dog-travel-accessories', intent: 'commercial' as const },

  // Dog Feeding cluster
  { slug: 'elevated-vs-floor-dog-bowl-which-is-better', keyword: 'elevated vs floor dog bowl', collection: 'best-slow-feeder-dog-bowls', intent: 'commercial' as const },
  { slug: 'how-much-water-should-a-dog-drink', keyword: 'how much water should a dog drink', collection: 'best-slow-feeder-dog-bowls', intent: 'informational' as const },

  // Cat Enrichment cluster
  { slug: 'best-toys-for-senior-cats', keyword: 'best toys for senior cats', collection: 'best-cat-toys-for-indoor-cats', intent: 'commercial' as const },
  { slug: 'how-to-play-with-your-cat-guide', keyword: 'how to play with your cat', collection: 'best-cat-toys-for-indoor-cats', intent: 'informational' as const },

  // Dog Harness cluster
  { slug: 'best-harness-for-dogs-that-pull', keyword: 'best harness for dogs that pull', collection: 'best-dog-harnesses', intent: 'commercial' as const },
  { slug: 'harness-vs-collar-which-is-safer', keyword: 'harness vs collar for dogs', collection: 'best-dog-harnesses', intent: 'commercial' as const },
];
