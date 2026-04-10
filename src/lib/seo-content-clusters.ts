/**
 * SEO Content Clusters Strategy V2
 * 
 * STRATEGIC FOCUS: Dog Enrichment, Cat Enrichment, Behavior
 * De-prioritized: Exotic birds, Hedgehog, Non-core pets
 * 
 * Structure:
 * - Money Page = Main commercial hub targeting head terms
 * - Supporting Articles = Long-tail content linking TO money page
 * - Money page links BACK to all support pages
 * - Anchor text variation enforced (no repetition)
 */

// ============= TYPES =============

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
  priority: 'critical' | 'high' | 'medium' | 'low' | 'deprioritized';
}

// ============= CORE CLUSTERS (Dog & Cat Enrichment + Behavior) =============

export const SEO_CONTENT_CLUSTERS: ContentCluster[] = [
  // ===================== DOG ENRICHMENT CLUSTER (MONEY PAGE) =====================
  {
    name: 'Dog Enrichment',
    pillarSlug: 'best-interactive-dog-toys',
    pillarKeyword: 'interactive dog toys',
    priority: 'critical',
    secondaryKeywords: [
      'dog enrichment toys',
      'dog puzzle toys',
      'mental stimulation dogs',
      'dog boredom solutions',
      'indoor dog activities',
    ],
    blogTopics: [
      {
        slug: 'signs-your-dog-is-bored',
        title: 'Signs Your Dog Is Bored (And What to Do About It)',
        targetKeyword: 'signs dog is bored',
        searchIntent: 'informational',
        linkedCollection: 'best-interactive-dog-toys',
      },
      {
        slug: 'mental-stimulation-for-dogs',
        title: 'Mental Stimulation for Dogs: Why It Matters More Than Exercise',
        targetKeyword: 'mental stimulation for dogs',
        searchIntent: 'informational',
        linkedCollection: 'best-interactive-dog-toys',
      },
      {
        slug: 'indoor-dog-games',
        title: 'Indoor Dog Games That Actually Tire Out Your Dog',
        targetKeyword: 'indoor dog games',
        searchIntent: 'informational',
        linkedCollection: 'best-interactive-dog-toys',
      },
      {
        slug: 'dog-puzzle-toys-guide',
        title: 'Dog Puzzle Toys: Complete Guide to Choosing the Right One',
        targetKeyword: 'dog puzzle toys guide',
        searchIntent: 'commercial',
        linkedCollection: 'best-interactive-dog-toys',
      },
      {
        slug: 'outdoor-dog-enrichment-ideas',
        title: 'Outdoor Dog Enrichment Ideas for Every Backyard',
        targetKeyword: 'outdoor dog enrichment',
        searchIntent: 'informational',
        linkedCollection: 'best-interactive-dog-toys',
      },
    ],
    internalLinkAnchors: [
      'interactive dog toys',
      'dog enrichment toys',
      'best dog puzzle toys',
      'dog mental stimulation toys',
      'toys for bored dogs',
    ],
  },

  // ===================== CAT ENRICHMENT CLUSTER (MONEY PAGE) =====================
  {
    name: 'Cat Enrichment',
    pillarSlug: 'best-cat-toys-for-indoor-cats',
    pillarKeyword: 'best enrichment toys cats',
    priority: 'critical',
    secondaryKeywords: [
      'indoor cat toys',
      'cat enrichment ideas',
      'cat boredom solutions',
      'interactive cat toys',
      'cat mental stimulation',
    ],
    blogTopics: [
      {
        slug: 'indoor-cat-boredom-signs',
        title: 'Indoor Cat Boredom: Signs, Risks, and Easy Fixes',
        targetKeyword: 'indoor cat boredom signs',
        searchIntent: 'informational',
        linkedCollection: 'best-cat-toys-for-indoor-cats',
      },
      {
        slug: 'cat-climbing-behavior-explained',
        title: 'Cat Climbing Behavior Explained: Why Cats Need Vertical Space',
        targetKeyword: 'cat climbing behavior',
        searchIntent: 'informational',
        linkedCollection: 'best-cat-toys-for-indoor-cats',
      },
      {
        slug: 'cat-water-fountain-benefits',
        title: 'Cat Water Fountain Benefits: What Vets Actually Say',
        targetKeyword: 'cat water fountain benefits',
        searchIntent: 'informational',
        linkedCollection: 'best-cat-toys-for-indoor-cats',
      },
      {
        slug: 'cat-sleep-patterns-explained',
        title: 'Cat Sleep Patterns Explained: How Much Sleep Is Normal?',
        targetKeyword: 'cat sleep patterns',
        searchIntent: 'informational',
        linkedCollection: 'best-cat-toys-for-indoor-cats',
      },
      {
        slug: 'best-cat-trees-guide',
        title: 'Best Cat Trees (2026) – Size, Material & Safety Guide',
        targetKeyword: 'best cat trees guide',
        searchIntent: 'commercial',
        linkedCollection: 'best-cat-toys-for-indoor-cats',
      },
    ],
    internalLinkAnchors: [
      'enrichment toys for cats',
      'indoor cat toys',
      'best cat enrichment ideas',
      'interactive cat toys',
      'cat boredom solutions',
    ],
  },

  // ===================== DOG BEHAVIOR CLUSTER =====================
  {
    name: 'Dog Behavior',
    pillarSlug: 'dog-enrichment-toys',
    pillarKeyword: 'dog enrichment',
    priority: 'high',
    secondaryKeywords: [
      'dog anxiety solutions',
      'dog destructive behavior',
      'dog separation anxiety',
      'calm dog training',
      'dog behavioral enrichment',
    ],
    blogTopics: [
      {
        slug: 'dog-separation-anxiety-solutions',
        title: 'Dog Separation Anxiety: Proven Solutions That Work',
        targetKeyword: 'dog separation anxiety solutions',
        searchIntent: 'informational',
        linkedCollection: 'dog-enrichment-toys',
      },
      {
        slug: 'why-dogs-chew-everything',
        title: 'Why Dogs Chew Everything (And How to Redirect It)',
        targetKeyword: 'why dogs chew everything',
        searchIntent: 'informational',
        linkedCollection: 'dog-enrichment-toys',
      },
      {
        slug: 'calming-activities-for-dogs',
        title: 'Calming Activities for Anxious Dogs – Premium Quality Guide',
        targetKeyword: 'calming activities for dogs',
        searchIntent: 'informational',
        linkedCollection: 'dog-enrichment-toys',
      },
    ],
    internalLinkAnchors: [
      'dog enrichment toys',
      'dog behavioral enrichment',
      'calming toys for dogs',
      'anxiety solutions for dogs',
    ],
  },

  // ===================== CAT BEHAVIOR CLUSTER =====================
  {
    name: 'Cat Behavior',
    pillarSlug: 'best-cat-litter-boxes',
    pillarKeyword: 'cat behavior',
    priority: 'high',
    secondaryKeywords: [
      'cat litter box behavior',
      'cat spraying solutions',
      'cat scratching behavior',
      'multi-cat household tips',
    ],
    blogTopics: [
      {
        slug: 'cat-litter-box-problems-solutions',
        title: 'Cat Litter Box Problems: Why They Happen & How to Fix Them',
        targetKeyword: 'cat litter box problems',
        searchIntent: 'informational',
        linkedCollection: 'best-cat-litter-boxes',
      },
      {
        slug: 'why-cats-scratch-furniture',
        title: 'Why Cats Scratch Furniture (And How to Stop It)',
        targetKeyword: 'cats scratch furniture',
        searchIntent: 'informational',
        linkedCollection: 'best-cat-litter-boxes',
      },
    ],
    internalLinkAnchors: [
      'best cat litter boxes',
      'cat behavior solutions',
      'cat litter box guide',
      'self-cleaning litter boxes',
    ],
  },

  // ===================== DOG FEEDING (HIGH PRIORITY) =====================
  {
    name: 'Dog Feeding Solutions',
    pillarSlug: 'best-slow-feeder-dog-bowls',
    pillarKeyword: 'slow feeder dog bowls',
    priority: 'high',
    secondaryKeywords: [
      'no spill dog bowls',
      'elevated dog bowls',
      'dog food puzzles',
      'mess-free dog feeding',
    ],
    blogTopics: [
      {
        slug: 'benefits-of-slow-feeder-bowls',
        title: 'Why Slow Feeder Bowls Are Better for Your Dog',
        targetKeyword: 'slow feeder bowl benefits',
        searchIntent: 'informational',
        linkedCollection: 'best-slow-feeder-dog-bowls',
      },
      {
        slug: 'how-to-stop-dog-eating-too-fast',
        title: 'How to Stop Your Dog from Eating Too Fast',
        targetKeyword: 'dog eating too fast solutions',
        searchIntent: 'informational',
        linkedCollection: 'best-slow-feeder-dog-bowls',
      },
    ],
    internalLinkAnchors: [
      'slow feeder dog bowls',
      'no-spill dog bowls',
      'dog feeding solutions',
      'best dog bowls',
    ],
  },

  // ===================== DOG BEDS CLUSTER (MONEY PAGE) =====================
  {
    name: 'Dog Beds',
    pillarSlug: 'orthopedic-calming-dog-beds',
    pillarKeyword: 'best dog beds',
    priority: 'critical',
    secondaryKeywords: [
      'orthopedic dog beds',
      'calming dog beds',
      'memory foam dog beds',
      'dog beds for large dogs',
      'waterproof dog beds',
    ],
    blogTopics: [
      {
        slug: 'best-orthopedic-dog-beds-2026',
        title: 'Best Orthopedic Dog Beds (2026) – Premium Quality Picks',
        targetKeyword: 'best orthopedic dog beds',
        searchIntent: 'commercial',
        linkedCollection: 'orthopedic-calming-dog-beds',
      },
      {
        slug: 'how-to-choose-dog-bed-size',
        title: 'How to Choose the Right Dog Bed Size – Complete Guide',
        targetKeyword: 'dog bed size guide',
        searchIntent: 'informational',
        linkedCollection: 'orthopedic-calming-dog-beds',
      },
    ],
    internalLinkAnchors: [
      'best dog beds',
      'orthopedic dog beds',
      'calming dog beds',
      'dog beds for large dogs',
    ],
  },

  // ===================== DOG GROOMING CLUSTER =====================
  {
    name: 'Dog Grooming',
    pillarSlug: 'best-dog-grooming-kits',
    pillarKeyword: 'dog grooming kit',
    priority: 'high',
    secondaryKeywords: [
      'pet grooming vacuum',
      'dog grooming at home',
      'grooming supplies for dogs',
    ],
    blogTopics: [
      {
        slug: 'dog-grooming-at-home-tips',
        title: 'Dog Grooming at Home: Step-by-Step Guide',
        targetKeyword: 'dog grooming at home',
        searchIntent: 'informational',
        linkedCollection: 'best-dog-grooming-kits',
      },
    ],
    internalLinkAnchors: [
      'dog grooming kits',
      'grooming supplies',
      'at-home dog grooming',
    ],
  },

  // ===================== DOG TRAVEL CLUSTER =====================
  {
    name: 'Dog Travel',
    pillarSlug: 'dog-travel-accessories',
    pillarKeyword: 'dog travel accessories',
    priority: 'high',
    secondaryKeywords: ['dog car seat', 'pet travel carrier', 'dog travel water bottle'],
    blogTopics: [],
    internalLinkAnchors: ['dog travel gear', 'dog car seat', 'pet travel accessories'],
  },

  // ===================== CAT BEDS CLUSTER =====================
  {
    name: 'Cat Beds',
    pillarSlug: 'best-cat-beds',
    pillarKeyword: 'best cat beds',
    priority: 'medium',
    secondaryKeywords: ['calming cat bed', 'cat bed for kittens', 'cave cat bed'],
    blogTopics: [],
    internalLinkAnchors: ['best cat beds', 'calming cat beds', 'cozy cat beds'],
  },

  // ===================== DOG WALKING & HARNESSES =====================
  {
    name: 'Dog Harnesses',
    pillarSlug: 'best-dog-harnesses',
    pillarKeyword: 'best dog harnesses',
    priority: 'medium',
    secondaryKeywords: ['no pull dog harness', 'dog harness for pulling'],
    blogTopics: [],
    internalLinkAnchors: ['best dog harnesses', 'no-pull harnesses', 'dog walking gear'],
  },

  // ===================== DE-PRIORITIZED CLUSTERS =====================
  {
    name: 'Pet Comfort',
    pillarSlug: 'pet-comfort-beds',
    pillarKeyword: 'pet beds',
    priority: 'low',
    secondaryKeywords: ['orthopedic dog beds', 'calming dog beds'],
    blogTopics: [],
    internalLinkAnchors: ['pet beds', 'dog beds'],
  },
  {
    name: 'Guinea Pig Care',
    pillarSlug: 'guinea-pig-cages-playpens',
    pillarKeyword: 'guinea pig cage',
    priority: 'deprioritized',
    secondaryKeywords: ['guinea pig playpen'],
    blogTopics: [],
    internalLinkAnchors: ['guinea pig cage'],
  },
  {
    name: 'Cat Travel',
    pillarSlug: 'cat-carriers',
    pillarKeyword: 'cat carrier',
    priority: 'deprioritized',
    secondaryKeywords: ['portable cat carrier'],
    blogTopics: [],
    internalLinkAnchors: ['cat carrier'],
  },
];

// ============= INTERNAL LINKING RULES =============

export const INTERNAL_LINKING_RULES = {
  maxLinksPerBlog: 10,
  minWordsBetweenLinks: 30,
  priorityOrder: ['money-page', 'collection', 'product', 'related-blog'],
  anchorVariation: true,
  maxExactMatchPct: 30, // Never exceed 30% exact-match anchors
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

// ============= RELATED ENRICHMENT GUIDES BLOCK =============

export interface RelatedGuideLink {
  slug: string;
  title: string;
  anchor: string;
}

/**
 * Get related guides for a "Related Enrichment Guides" contextual block
 */
export function getRelatedEnrichmentGuides(currentSlug: string): RelatedGuideLink[] {
  const links: RelatedGuideLink[] = [];

  for (const cluster of SEO_CONTENT_CLUSTERS) {
    if (cluster.priority === 'deprioritized' || cluster.priority === 'low') continue;

    // If current page is within this cluster, link to the money page + sibling articles
    const isInCluster = cluster.pillarSlug === currentSlug ||
      cluster.blogTopics.some(t => t.slug === currentSlug);

    if (isInCluster) {
      // Add money page if not current
      if (cluster.pillarSlug !== currentSlug) {
        links.push({
          slug: cluster.pillarSlug,
          title: cluster.pillarKeyword,
          anchor: cluster.internalLinkAnchors[0] || cluster.pillarKeyword,
        });
      }

      // Add sibling support articles (not self)
      for (const topic of cluster.blogTopics) {
        if (topic.slug !== currentSlug) {
          links.push({
            slug: topic.slug,
            title: topic.title,
            anchor: topic.targetKeyword,
          });
        }
      }
    }
  }

  // Limit to 5 related guides
  return links.slice(0, 5);
}

// ============= HELPER FUNCTIONS =============

export function getBlogTopicsForCluster(clusterName: string): BlogTopic[] {
  const cluster = SEO_CONTENT_CLUSTERS.find(c => c.name === clusterName);
  return cluster?.blogTopics || [];
}

export function getLinkAnchorsForCollection(collectionSlug: string): string[] {
  const cluster = SEO_CONTENT_CLUSTERS.find(c => c.pillarSlug === collectionSlug);
  return cluster?.internalLinkAnchors || [];
}

export function getTotalBlogTopics(): number {
  return SEO_CONTENT_CLUSTERS.reduce((sum, cluster) => sum + cluster.blogTopics.length, 0);
}

export function getClustersByPriority(): ContentCluster[] {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3, deprioritized: 4 };
  return [...SEO_CONTENT_CLUSTERS].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export function getActiveClusterCount(): number {
  return SEO_CONTENT_CLUSTERS.filter(c => c.priority !== 'deprioritized').length;
}
