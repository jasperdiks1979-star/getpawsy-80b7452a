/**
 * PDP Retargeting Copy
 * 
 * Generated ad copy variations for users who:
 * - Viewed product detail pages
 * - Did NOT add to cart
 * 
 * Tone:
 * - Calm, reassuring, non-pushy
 * - Trust-first, no urgency or pressure
 * - No discounts
 * 
 * Based on behavior analysis:
 * - Primary drop-off: After viewing price/before Add-to-Cart
 * - Key hesitation: Shipping cost uncertainty, quality concerns
 * - Optimization: Trust signals moved above fold
 */

// ============================================
// BEHAVIOR ANALYSIS DOCUMENTATION
// ============================================

export const BEHAVIOR_ANALYSIS = {
  /**
   * Drop-off Points Identified:
   * 1. After price reveal - users scroll but hesitate at price
   * 2. Before Add-to-Cart - uncertainty about shipping/returns
   * 3. Post-image gallery - users explore but don't commit
   * 
   * Primary Hesitation Triggers:
   * - "Will this actually solve my pet's problem?"
   * - "Is shipping expensive or slow?"
   * - "What if my pet doesn't like it?"
   * 
   * Optimization Applied:
   * - Trust microcopy placed directly under Add-to-Cart
   * - Clarity-first intros explaining problem/solution
   * - "Why pet parents choose this" benefits section
   * - DeliveryReassurance moved to mid-page
   */
  primaryDropOff: 'Post-price, pre-Add-to-Cart',
  keyHesitation: 'Shipping uncertainty and quality concerns',
  optimizationDecision: 'Trust stack moved above fold, benefits section added',
};

// ============================================
// RETARGETING AD COPY VARIATIONS
// ============================================

export interface AdCopyVariation {
  id: string;
  name: string;
  focus: string;
  headline: string;
  description: string;
  cta: string;
}

/**
 * 3 Retargeting Copy Variations for PDP Viewers Who Didn't Convert
 * 
 * All variations:
 * - Calm and reassuring
 * - Non-pushy
 * - Trust-first
 * - No discounts or urgency
 */
export const RETARGETING_AD_VARIATIONS: AdCopyVariation[] = [
  // ─────────────────────────────────────
  // VARIATION 1: Reassurance Focus
  // ─────────────────────────────────────
  {
    id: 'reassurance',
    name: 'Reassurance-First',
    focus: 'Shipping & Returns',
    headline: 'Thoughtfully designed pet essentials',
    description: 'Free shipping on eligible orders over $35. Easy 30-day returns. Quality products shipped directly to you.',
    cta: 'Explore Products',
  },
  
  // ─────────────────────────────────────
  // VARIATION 2: Problem/Solution Reminder
  // ─────────────────────────────────────
  {
    id: 'problem_solution',
    name: 'Problem/Solution',
    focus: 'Main benefit reminder',
    headline: 'Designed to make everyday pet care easier',
    description: 'Practical solutions for pet parents who want comfort and convenience — without the hassle.',
    cta: 'See How It Works',
  },
  
  // ─────────────────────────────────────
  // VARIATION 3: Lifestyle Confirmation
  // ─────────────────────────────────────
  {
    id: 'lifestyle',
    name: 'Lifestyle Confirmation',
    focus: 'Comfort, routine, peace of mind',
    headline: 'Simple products for calmer, happier daily routines',
    description: 'Trusted by pet parents nationwide. Quality essentials designed for everyday life with your furry friend.',
    cta: 'Continue Browsing',
  },
];

// ============================================
// PLATFORM-SPECIFIC COPY
// ============================================

export interface PlatformAdCopy {
  platform: 'pinterest' | 'meta' | 'google';
  variations: {
    reassurance: {
      headline: string;
      description: string;
    };
    problem_solution: {
      headline: string;
      description: string;
    };
    lifestyle: {
      headline: string;
      description: string;
    };
  };
}

export const PLATFORM_AD_COPY: PlatformAdCopy[] = [
  // Pinterest - Visual, inspirational audience
  {
    platform: 'pinterest',
    variations: {
      reassurance: {
        headline: 'Pet essentials with peace of mind',
        description: 'Free shipping on eligible orders over $35 • 30-day easy returns',
      },
      problem_solution: {
        headline: 'Everyday pet care, simplified',
        description: 'Quality products designed to make life with your pet easier',
      },
      lifestyle: {
        headline: 'For calmer daily routines',
        description: 'Thoughtful essentials for you and your furry friend',
      },
    },
  },
  
  // Meta (Facebook/Instagram) - Social proof, community feel
  {
    platform: 'meta',
    variations: {
      reassurance: {
        headline: 'Trusted pet essentials delivered fast',
        description: 'Ships directly to you. Free shipping over $35. Easy returns.',
      },
      problem_solution: {
        headline: 'Making pet care easier, every day',
        description: 'Practical products that fit seamlessly into your routine — designed with care.',
      },
      lifestyle: {
        headline: 'Simple products. Happy pets.',
        description: 'Quality essentials for everyday comfort and peace of mind.',
      },
    },
  },
  
  // Google - Search intent, factual
  {
    platform: 'google',
    variations: {
      reassurance: {
        headline: 'US Shipping • 30-Day Returns',
        description: 'Quality pet products with free shipping over $35. Estimated delivery: 5–10 business days.',
      },
      problem_solution: {
        headline: 'Pet Essentials Made Simple',
        description: 'Practical products for everyday pet care. Easy to use, easy to maintain.',
      },
      lifestyle: {
        headline: 'Quality Pet Products',
        description: 'Trusted essentials for daily comfort. Free shipping on eligible orders over $35.',
      },
    },
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get retargeting copy for a specific platform and variation
 */
export function getRetargetingCopy(
  platform: 'pinterest' | 'meta' | 'google',
  variationType: 'reassurance' | 'problem_solution' | 'lifestyle'
): { headline: string; description: string } {
  const platformCopy = PLATFORM_AD_COPY.find(p => p.platform === platform);
  if (!platformCopy) {
    // Fallback to generic copy
    const variation = RETARGETING_AD_VARIATIONS.find(v => v.id === variationType);
    return {
      headline: variation?.headline || 'Quality pet essentials',
      description: variation?.description || 'Designed for everyday comfort.',
    };
  }
  return platformCopy.variations[variationType];
}

/**
 * Get all copy variations for a platform
 */
export function getAllPlatformCopy(platform: 'pinterest' | 'meta' | 'google') {
  const platformCopy = PLATFORM_AD_COPY.find(p => p.platform === platform);
  return platformCopy?.variations || null;
}

// ============================================
// DOCUMENTATION FOR AD IMPLEMENTATION
// ============================================

export const IMPLEMENTATION_NOTES = `
## PDP Retargeting Strategy

### Audience: PDP Viewers Who Didn't Add to Cart

These users showed high intent (viewed a specific product) but hesitated.
Based on behavior analysis, the main blockers are:
1. Uncertainty about shipping cost/speed
2. Quality concerns
3. Not fully understanding the product benefit

### Ad Copy Rules

✅ DO:
- Lead with reassurance (shipping, returns)
- Remind of the core problem solved
- Use calm, helpful language
- Focus on everyday convenience

❌ DON'T:
- Offer discounts or urgency
- Use aggressive CTAs
- Over-promise or exaggerate
- Use guilt-based messaging ("You left something behind")

### Recommended A/B Test Order

1. Start with REASSURANCE variation (highest trust signal)
2. Test PROBLEM/SOLUTION if click-through is low
3. Use LIFESTYLE for brand awareness campaigns

### Frequency Caps

- Max 7 impressions per user over 14 days
- Retarget starting 1 day after PDP view
- Exclude users who later purchased
`;
