/**
 * SEO → Retargeting Audience Strategy
 * 
 * Defines audience segments and messaging strategy for retargeting
 * organic visitors who didn't convert.
 * 
 * Rules:
 * - No aggressive discounts
 * - Brand-first messaging
 * - Focus on reassurance and convenience
 * - Trust-building, not hard selling
 */

// ============================================
// AUDIENCE DEFINITIONS
// ============================================

export interface RetargetingAudience {
  id: string;
  name: string;
  description: string;
  
  // Targeting criteria
  pagePaths: string[];
  minTimeOnSite?: number;  // seconds
  excludePurchasers: boolean;
  
  // Messaging
  primaryMessage: string;
  secondaryMessage: string;
  ctaText: string;
  destinationPath: string;
  
  // Strategy
  retargetAfterDays: number;
  maxImpressions: number;
  priority: number;
}

export const RETARGETING_AUDIENCES: RetargetingAudience[] = [
  // ─────────────────────────────────────
  // Audience 1: Blog Readers
  // ─────────────────────────────────────
  {
    id: 'blog_readers',
    name: 'Blog Readers',
    description: 'Users who read blog content but didn\'t view products',
    
    pagePaths: ['/blog/*'],
    minTimeOnSite: 60,
    excludePurchasers: true,
    
    primaryMessage: 'Practical pet essentials for everyday life',
    secondaryMessage: 'Discover trusted products designed for comfort and convenience',
    ctaText: 'Explore Products',
    destinationPath: '/products',
    
    retargetAfterDays: 1,
    maxImpressions: 5,
    priority: 3,
  },
  
  // ─────────────────────────────────────
  // Audience 2: Collection Viewers
  // ─────────────────────────────────────
  {
    id: 'collection_viewers',
    name: 'Collection Viewers',
    description: 'Users who viewed collections but didn\'t click through to products',
    
    pagePaths: ['/collections/*'],
    minTimeOnSite: 30,
    excludePurchasers: true,
    
    primaryMessage: 'Still exploring pet essentials?',
    secondaryMessage: 'Quality products with US shipping and easy returns',
    ctaText: 'Continue Browsing',
    destinationPath: '/collections/{last_viewed}', // Dynamic
    
    retargetAfterDays: 1,
    maxImpressions: 7,
    priority: 2,
  },
  
  // ─────────────────────────────────────
  // Audience 3: Product Viewers (No Purchase)
  // ─────────────────────────────────────
  {
    id: 'product_viewers',
    name: 'Product Viewers',
    description: 'Users who viewed specific products but didn\'t purchase',
    
    pagePaths: ['/products/*', '/bestseller/*'],
    minTimeOnSite: 45,
    excludePurchasers: true,
    
    primaryMessage: 'Designed for everyday comfort and care',
    secondaryMessage: 'Free shipping over $35 • 30-day easy returns',
    ctaText: 'View Details',
    destinationPath: '/products/{last_viewed}', // Dynamic
    
    retargetAfterDays: 1,
    maxImpressions: 10,
    priority: 1,
  },
];

// ============================================
// MESSAGING GUIDELINES
// ============================================

export const MESSAGING_GUIDELINES = {
  // What TO do
  allowed: [
    'Use trust-building language ("trusted", "reliable", "quality")',
    'Mention convenience benefits (shipping, easy returns)',
    'Focus on everyday practicality',
    'Show social proof if available (reviews, customer count)',
    'Use calm, helpful tone',
    'Reference the specific category they viewed',
  ],
  
  // What NOT to do
  prohibited: [
    'NO aggressive discount offers (e.g., "50% OFF TODAY ONLY!")',
    'NO urgency tactics (e.g., "Last chance!", "Limited time!")',
    'NO popup-style messaging',
    'NO guilt-based messaging (e.g., "You left something behind")',
    'NO over-promising or exaggeration',
    'NO multiple exclamation marks',
  ],
  
  // Tone
  tone: {
    primary: 'Calm and helpful',
    secondary: 'Trustworthy and reliable',
    avoid: 'Pushy, aggressive, or salesy',
  },
};

// ============================================
// AD COPY TEMPLATES
// ============================================

export const AD_COPY_TEMPLATES = {
  blog_readers: {
    headlines: [
      'Practical Pet Essentials',
      'Designed for Everyday Life',
      'Trusted Products for Your Pet',
      'Quality Pet Care Made Simple',
    ],
    descriptions: [
      'Discover thoughtfully selected products for dogs and cats. US shipping, easy returns.',
      'From feeding solutions to travel gear — practical essentials for everyday pet care.',
      'Quality products designed for comfort and convenience. Free shipping over $35.',
    ],
  },
  
  collection_viewers: {
    headlines: [
      'Still Exploring?',
      'Quality Pet Products',
      'Everyday Essentials',
      'Trusted by Pet Parents',
    ],
    descriptions: [
      'Continue discovering practical pet essentials. Shipping, easy returns.',
      'Find the right products for your pet. Quality you can trust, delivered fast.',
      'Designed for everyday comfort. Free shipping on eligible orders over $35.',
    ],
  },
  
  product_viewers: {
    headlines: [
      'Designed for Comfort',
      'Quality Pet Essentials',
      'US Shipping',
      'Everyday Reliability',
    ],
    descriptions: [
      'Quality products designed for everyday life. Free shipping over $35, 30-day returns.',
      'Trusted by pet parents nationwide. US delivery, easy returns available.',
      'Practical solutions for your pet. Quality, comfort, and convenience.',
    ],
  },
};

// ============================================
// PIXEL EVENT HELPERS
// ============================================

export interface TrackingEvent {
  eventName: string;
  eventCategory: string;
  pagePath: string;
  timestamp: string;
  sessionId?: string;
  productId?: string;
  productName?: string;
  collectionSlug?: string;
}

/**
 * Determine which retargeting audience a user belongs to based on their events
 */
export function determineAudience(events: TrackingEvent[]): RetargetingAudience | null {
  // Check in priority order (product viewers are highest priority)
  const sortedAudiences = [...RETARGETING_AUDIENCES].sort((a, b) => a.priority - b.priority);
  
  for (const audience of sortedAudiences) {
    const matchingEvents = events.filter(event => {
      return audience.pagePaths.some(pathPattern => {
        if (pathPattern.includes('*')) {
          const basePath = pathPattern.replace('/*', '');
          return event.pagePath.startsWith(basePath);
        }
        return event.pagePath === pathPattern;
      });
    });
    
    if (matchingEvents.length > 0) {
      return audience;
    }
  }
  
  return null;
}

/**
 * Get personalized messaging for a user based on their viewed content
 */
export function getPersonalizedMessaging(
  audience: RetargetingAudience,
  lastViewedPath?: string
): {
  headline: string;
  description: string;
  cta: string;
  destination: string;
} {
  const templates = AD_COPY_TEMPLATES[audience.id as keyof typeof AD_COPY_TEMPLATES];
  
  // Pick random headline and description
  const headline = templates.headlines[Math.floor(Math.random() * templates.headlines.length)];
  const description = templates.descriptions[Math.floor(Math.random() * templates.descriptions.length)];
  
  // Replace dynamic path placeholders
  let destination = audience.destinationPath;
  if (lastViewedPath && destination.includes('{last_viewed}')) {
    const slug = lastViewedPath.split('/').pop() || '';
    destination = destination.replace('{last_viewed}', slug);
  } else if (destination.includes('{last_viewed}')) {
    // Fallback to generic path
    destination = audience.pagePaths[0].replace('/*', '');
  }
  
  return {
    headline,
    description,
    cta: audience.ctaText,
    destination,
  };
}

// ============================================
// META & GOOGLE PIXEL CONFIGURATION
// ============================================

export const PIXEL_CONFIGURATION = {
  // Meta (Facebook) Pixel Events to fire
  meta: {
    blogView: {
      event: 'ViewContent',
      params: {
        content_type: 'article',
        content_category: 'blog',
      },
    },
    collectionView: {
      event: 'ViewContent',
      params: {
        content_type: 'product_group',
        content_category: 'collection',
      },
    },
    productView: {
      event: 'ViewContent',
      params: {
        content_type: 'product',
      },
    },
  },
  
  // Google Ads Events to fire
  google: {
    blogView: {
      event: 'view_item_list',
      params: {
        item_list_name: 'Blog Content',
      },
    },
    collectionView: {
      event: 'view_item_list',
      params: {
        item_list_name: 'Collection',
      },
    },
    productView: {
      event: 'view_item',
    },
  },
};

// ============================================
// AUDIENCE SIZE ESTIMATION
// ============================================

export interface AudienceSizeEstimate {
  audienceId: string;
  last7Days: number;
  last30Days: number;
  qualifiedForRetargeting: number;
}

/**
 * Estimate audience sizes based on visitor activity data
 * This would typically query the visitor_activity table
 */
export function estimateAudienceDescription(audienceId: string): string {
  const audience = RETARGETING_AUDIENCES.find(a => a.id === audienceId);
  if (!audience) return 'Unknown audience';
  
  return `
Audience: ${audience.name}
─────────────────────────────
${audience.description}

Targeting Criteria:
• Page paths: ${audience.pagePaths.join(', ')}
• Min time on site: ${audience.minTimeOnSite || 0}s
• Exclude purchasers: ${audience.excludePurchasers ? 'Yes' : 'No'}

Retargeting Settings:
• Start retargeting after: ${audience.retargetAfterDays} day(s)
• Maximum impressions: ${audience.maxImpressions}
• Priority level: ${audience.priority}

Messaging:
• Primary: "${audience.primaryMessage}"
• Secondary: "${audience.secondaryMessage}"
• CTA: "${audience.ctaText}"
• Destination: ${audience.destinationPath}
  `.trim();
}
