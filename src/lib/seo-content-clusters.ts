/**
 * SEO Content Clusters Strategy
 * 
 * Defines core collection pages and supporting blog topics
 * for building topical authority in the US pet market.
 * 
 * Structure:
 * - Pillar Page (Collection) = Main topic targeting head terms
 * - Supporting Blogs = Long-tail content linking back to collection
 * - Product Links = Internal links from blogs to relevant products
 */

// ============= CONTENT CLUSTER DEFINITIONS =============

export interface BlogTopic {
  slug: string;
  title: string;
  targetKeyword: string;
  searchIntent: 'informational' | 'commercial' | 'transactional';
  linkedCollection: string;
  linkedProducts?: string[];
}

export interface ContentCluster {
  name: string;
  pillarSlug: string;
  pillarKeyword: string;
  secondaryKeywords: string[];
  blogTopics: BlogTopic[];
  internalLinkAnchors: string[];
}

export const SEO_CONTENT_CLUSTERS: ContentCluster[] = [
  // ============= DOG TRAVEL CLUSTER =============
  {
    name: 'Dog Travel',
    pillarSlug: 'dog-travel-accessories',
    pillarKeyword: 'dog travel accessories',
    secondaryKeywords: [
      'dog car seat',
      'dog travel carrier',
      'dog car hammock',
      'pet travel essentials',
      'dog road trip gear',
    ],
    blogTopics: [
      {
        slug: 'best-dog-car-seats-for-road-trips',
        title: 'Best Dog Car Seats for Safe Road Trips',
        targetKeyword: 'dog car seats for road trips',
        searchIntent: 'commercial',
        linkedCollection: 'dog-travel-accessories',
      },
      {
        slug: 'how-to-travel-with-anxious-dog',
        title: 'How to Travel with an Anxious Dog: A Calming Guide',
        targetKeyword: 'traveling with anxious dog',
        searchIntent: 'informational',
        linkedCollection: 'dog-travel-accessories',
      },
      {
        slug: 'dog-road-trip-checklist',
        title: 'The Complete Dog Road Trip Checklist',
        targetKeyword: 'dog road trip checklist',
        searchIntent: 'informational',
        linkedCollection: 'dog-travel-accessories',
      },
      {
        slug: 'keeping-dogs-safe-in-cars',
        title: 'How to Keep Your Dog Safe in the Car',
        targetKeyword: 'dog car safety',
        searchIntent: 'informational',
        linkedCollection: 'dog-travel-accessories',
      },
      {
        slug: 'dog-friendly-road-trip-destinations',
        title: 'Dog-Friendly Road Trip Destinations in the US',
        targetKeyword: 'dog friendly road trips',
        searchIntent: 'informational',
        linkedCollection: 'dog-travel-accessories',
      },
    ],
    internalLinkAnchors: [
      'dog travel accessories',
      'dog car seat',
      'dog car hammock',
      'pet carrier',
      'travel gear for dogs',
    ],
  },

  // ============= INDOOR CAT ENRICHMENT CLUSTER =============
  {
    name: 'Indoor Cat Enrichment',
    pillarSlug: 'indoor-cat-enrichment',
    pillarKeyword: 'indoor cat enrichment',
    secondaryKeywords: [
      'cat trees',
      'cat scratching posts',
      'interactive cat toys',
      'cat window perch',
      'cat enrichment ideas',
    ],
    blogTopics: [
      {
        slug: 'best-cat-trees-for-apartments',
        title: 'Best Cat Trees for Small Apartments',
        targetKeyword: 'cat trees for apartments',
        searchIntent: 'commercial',
        linkedCollection: 'indoor-cat-enrichment',
      },
      {
        slug: 'how-to-keep-indoor-cats-entertained',
        title: 'How to Keep Your Indoor Cat Entertained All Day',
        targetKeyword: 'keeping indoor cats entertained',
        searchIntent: 'informational',
        linkedCollection: 'indoor-cat-enrichment',
      },
      {
        slug: 'diy-cat-enrichment-ideas',
        title: 'Easy DIY Cat Enrichment Ideas for Bored Cats',
        targetKeyword: 'cat enrichment ideas',
        searchIntent: 'informational',
        linkedCollection: 'indoor-cat-enrichment',
      },
      {
        slug: 'why-cats-need-scratching-posts',
        title: 'Why Your Cat Needs a Scratching Post (And How to Choose One)',
        targetKeyword: 'cat scratching post guide',
        searchIntent: 'informational',
        linkedCollection: 'indoor-cat-enrichment',
      },
      {
        slug: 'interactive-toys-for-solo-cats',
        title: 'Best Interactive Toys for Cats Who Play Alone',
        targetKeyword: 'interactive cat toys',
        searchIntent: 'commercial',
        linkedCollection: 'indoor-cat-enrichment',
      },
    ],
    internalLinkAnchors: [
      'cat trees',
      'cat scratching posts',
      'interactive cat toys',
      'cat enrichment toys',
      'indoor cat entertainment',
    ],
  },

  // ============= DOG FEEDING & NUTRITION CLUSTER =============
  {
    name: 'Dog Feeding Solutions',
    pillarSlug: 'no-spill-dog-feeding',
    pillarKeyword: 'no spill dog bowls',
    secondaryKeywords: [
      'slow feeder dog bowls',
      'elevated dog bowls',
      'dog water fountains',
      'mess-free dog feeding',
      'dog food storage',
    ],
    blogTopics: [
      {
        slug: 'benefits-of-slow-feeder-bowls',
        title: 'Why Slow Feeder Bowls Are Better for Your Dog',
        targetKeyword: 'slow feeder bowl benefits',
        searchIntent: 'informational',
        linkedCollection: 'no-spill-dog-feeding',
      },
      {
        slug: 'how-to-stop-dog-eating-too-fast',
        title: 'How to Stop Your Dog from Eating Too Fast',
        targetKeyword: 'dog eating too fast solutions',
        searchIntent: 'informational',
        linkedCollection: 'no-spill-dog-feeding',
      },
      {
        slug: 'elevated-dog-bowl-guide',
        title: 'Are Elevated Dog Bowls Better? A Complete Guide',
        targetKeyword: 'elevated dog bowls',
        searchIntent: 'informational',
        linkedCollection: 'no-spill-dog-feeding',
      },
      {
        slug: 'best-dog-bowls-for-messy-eaters',
        title: 'Best Dog Bowls for Messy Eaters',
        targetKeyword: 'dog bowls for messy eaters',
        searchIntent: 'commercial',
        linkedCollection: 'no-spill-dog-feeding',
      },
    ],
    internalLinkAnchors: [
      'slow feeder bowls',
      'no-spill dog bowls',
      'elevated dog bowls',
      'dog feeding solutions',
      'mess-free dog bowls',
    ],
  },

  // ============= PET COMFORT & BEDS CLUSTER =============
  {
    name: 'Pet Comfort',
    pillarSlug: 'pet-comfort-beds',
    pillarKeyword: 'pet beds',
    secondaryKeywords: [
      'orthopedic dog beds',
      'calming dog beds',
      'cat beds',
      'pet blankets',
      'cozy pet accessories',
    ],
    blogTopics: [
      {
        slug: 'best-orthopedic-dog-beds-for-senior-dogs',
        title: 'Best Orthopedic Dog Beds for Senior Dogs',
        targetKeyword: 'orthopedic dog beds for seniors',
        searchIntent: 'commercial',
        linkedCollection: 'pet-comfort-beds',
      },
      {
        slug: 'calming-beds-for-anxious-dogs',
        title: 'Do Calming Dog Beds Actually Work?',
        targetKeyword: 'calming dog beds',
        searchIntent: 'informational',
        linkedCollection: 'pet-comfort-beds',
      },
      {
        slug: 'how-to-choose-right-dog-bed-size',
        title: 'How to Choose the Right Dog Bed Size',
        targetKeyword: 'dog bed size guide',
        searchIntent: 'informational',
        linkedCollection: 'pet-comfort-beds',
      },
      {
        slug: 'best-cat-beds-for-curlers',
        title: 'Best Cat Beds for Cats Who Love to Curl Up',
        targetKeyword: 'cat beds for curling',
        searchIntent: 'commercial',
        linkedCollection: 'pet-comfort-beds',
      },
    ],
    internalLinkAnchors: [
      'orthopedic dog beds',
      'calming pet beds',
      'cozy cat beds',
      'pet comfort products',
      'dog beds',
    ],
  },
];

// ============= INTERNAL LINKING RULES =============

export const INTERNAL_LINKING_RULES = {
  maxLinksPerBlog: 10,
  minWordsBetweenLinks: 30,
  priorityOrder: ['collection', 'product', 'related-blog'],
  anchorVariation: true, // Use varied anchor text
};

// ============= CONTENT TEMPLATES =============

export const BLOG_CONTENT_GUIDELINES = {
  minWordCount: 1200,
  maxWordCount: 1600,
  targetReadingTime: '5-7 minutes',
  requiredSections: [
    'Introduction (problem statement)',
    'Why this matters for pet owners',
    'Product recommendations (with links)',
    'Practical tips',
    'Conclusion with CTA',
  ],
  toneGuidelines: [
    'US-English spelling and idioms',
    'Friendly but not condescending',
    'Evidence-based claims only',
    'No medical advice without disclaimers',
    'Include shipping/returns mention naturally',
  ],
};

// ============= HELPER FUNCTIONS =============

/**
 * Get all blog topics for a specific cluster
 */
export function getBlogTopicsForCluster(clusterName: string): BlogTopic[] {
  const cluster = SEO_CONTENT_CLUSTERS.find(c => c.name === clusterName);
  return cluster?.blogTopics || [];
}

/**
 * Get recommended internal link anchors for a collection
 */
export function getLinkAnchorsForCollection(collectionSlug: string): string[] {
  const cluster = SEO_CONTENT_CLUSTERS.find(c => c.pillarSlug === collectionSlug);
  return cluster?.internalLinkAnchors || [];
}

/**
 * Count total planned blog topics
 */
export function getTotalBlogTopics(): number {
  return SEO_CONTENT_CLUSTERS.reduce((sum, cluster) => sum + cluster.blogTopics.length, 0);
}

/**
 * Get clusters by priority (for content calendar)
 */
export function getClustersByPriority(): ContentCluster[] {
  // Priority based on search volume potential
  return SEO_CONTENT_CLUSTERS.sort((a, b) => b.blogTopics.length - a.blogTopics.length);
}
