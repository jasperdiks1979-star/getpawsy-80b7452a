/**
 * Performance Max Campaign Assets
 * 
 * US-English, benefit-driven copy for Google Performance Max campaigns.
 * All copy is compliant with pet product advertising guidelines.
 * 
 * Target Market: United States
 * Brand: GetPawsy
 */

import { FREE_SHIPPING_THRESHOLD } from './shipping-constants';

// ============= SHORT HEADLINES (≤30 characters) =============

export const PMAX_SHORT_HEADLINES = [
  // Brand + Value
  'GetPawsy Pet Supplies',
  'Shop Premium Pet Gear',
  'Quality Pet Products',
  
  // Benefit-driven
  'Happy Pets Start Here',
  'Comfort for Your Pet',
  'Pet Essentials Made Easy',
  'Trusted Pet Products',
  
  // Shipping/Trust
  'Free US Shipping $35+',
  'Estimated 5–10 Day Delivery',
  '30-Day Easy Returns',
  
  // Category-specific
  'Dog Beds & Comfort',
  'Cat Trees & Toys',
  'Pet Travel Gear',
  'Interactive Pet Toys',
  'Cozy Pet Beds',
] as const;

// ============= LONG HEADLINES (≤90 characters) =============

export const PMAX_LONG_HEADLINES = [
  // Brand + Trust
  'GetPawsy: Trusted Pet Products with US Shipping',
  'Shop Quality Pet Supplies – Free Shipping on Orders Over $35',
  'Premium Pet Products Designed for Comfort & Durability',
  
  // Benefit-driven
  'Give Your Pet the Comfort They Deserve – Shop GetPawsy Today',
  'Discover Pet Essentials That Make Daily Life Easier',
  'From Cozy Beds to Interactive Toys – Everything Your Pet Needs',
  
  // Category-focused
  'Dog Beds, Cat Trees & More – US Delivery to Your Door',
  'Pet Travel Accessories for Stress-Free Adventures',
  'Interactive Toys That Keep Pets Happy & Engaged',
  
  // Trust + Conversion
  'Quality Pet Gear with 30-Day Easy Returns',
  'Shop with Confidence – Secure Checkout & Dedicated Support',
] as const;

// ============= DESCRIPTIONS (≤90 characters) =============

export const PMAX_DESCRIPTIONS = [
  // Primary descriptions (benefit-first)
  'Shop quality pet products. Free US shipping on orders over $35. Fast 5–10 day delivery.',
  'Trusted pet supplies for dogs, cats & more. 30-day easy returns on all orders.',
  'Premium pet essentials designed for comfort. Shipping to the United States.',
  
  // Category descriptions
  'Cozy dog beds, interactive toys & travel gear. Free shipping on $35+ orders.',
  'Cat trees, scratchers & enrichment toys. Quality products with US delivery.',
  'Pet travel accessories for stress-free trips. Secure checkout, easy returns.',
  
  // Trust-focused
  'Quality pet products you can trust. Dedicated support & 30-day return policy.',
  'Shop GetPawsy for pet essentials. Free shipping, US delivery, easy returns.',
  
  // Seasonal/Generic
  'Everything your pet needs for comfort & play. Shop now with free shipping.',
  'Happy pets start with quality products. Discover GetPawsy today.',
] as const;

// ============= CALL-TO-ACTION OPTIONS =============

export const PMAX_CTAS = [
  'Shop Now',
  'Shop Pet Supplies',
  'Explore Collection',
  'Get Started',
  'Browse Products',
] as const;

// ============= SITELINK HEADLINES (≤25 characters) =============

export const PMAX_SITELINKS = [
  { headline: 'Dog Products', description: 'Beds, toys, leashes & more' },
  { headline: 'Cat Supplies', description: 'Trees, scratchers & toys' },
  { headline: 'Travel Gear', description: 'Carriers & accessories' },
  { headline: 'New Arrivals', description: 'Latest pet products' },
  { headline: 'Best Sellers', description: 'Top-rated pet items' },
  { headline: 'Free Shipping', description: `On orders $${FREE_SHIPPING_THRESHOLD}+` },
] as const;

// ============= AUDIENCE SIGNALS =============

export const PMAX_AUDIENCE_KEYWORDS = [
  // Intent keywords
  'dog supplies',
  'cat products',
  'pet accessories',
  'dog bed',
  'cat tree',
  'pet carrier',
  'dog toys',
  'cat toys',
  'pet travel',
  'dog grooming',
  
  // Affinity
  'pet owner',
  'dog lover',
  'cat lover',
  'pet parent',
] as const;

// ============= ASSET GROUP TEMPLATES =============

export interface PMaxAssetGroup {
  name: string;
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}

export const PMAX_ASSET_GROUPS: PMaxAssetGroup[] = [
  {
    name: 'Dogs - All Products',
    finalUrl: 'https://getpawsy.pet/products?category=dogs',
    headlines: [
      'Dog Supplies & Gear',
      'Shop Dog Products',
      'Quality Dog Essentials',
      'Comfort for Dogs',
      'Happy Dogs Start Here',
    ],
    longHeadlines: [
      'Premium Dog Supplies – Beds, Toys & Travel Gear with Free Shipping',
      'Everything Your Dog Needs for Comfort & Play',
    ],
    descriptions: [
      'Shop dog beds, toys, leashes & more. Free US shipping on orders $35+.',
      'Quality dog products designed for comfort. Fast 5–10 day delivery.',
    ],
  },
  {
    name: 'Cats - All Products',
    finalUrl: 'https://getpawsy.pet/products?category=cats',
    headlines: [
      'Cat Supplies & Toys',
      'Shop Cat Products',
      'Cat Trees & Scratchers',
      'Happy Cats Start Here',
      'Interactive Cat Toys',
    ],
    longHeadlines: [
      'Premium Cat Supplies – Trees, Toys & Scratchers with Free Shipping',
      'Keep Your Cat Happy & Engaged with Quality Products',
    ],
    descriptions: [
      'Shop cat trees, toys, scratchers & more. Free shipping on $35+ orders.',
      'Quality cat products for enrichment & comfort. US delivery.',
    ],
  },
  {
    name: 'Pet Travel',
    finalUrl: 'https://getpawsy.pet/collection/dog-travel-accessories',
    headlines: [
      'Pet Travel Gear',
      'Dog Travel Essentials',
      'Travel with Your Pet',
      'Pet Carriers & More',
      'Stress-Free Pet Travel',
    ],
    longHeadlines: [
      'Pet Travel Accessories for Stress-Free Adventures',
      'Dog Car Seats, Carriers & Travel Gear – Free Shipping $35+',
    ],
    descriptions: [
      'Shop pet carriers, car seats & travel accessories. Free US shipping.',
      'Travel comfortably with your pet. Quality gear with US delivery.',
    ],
  },
] as const;

// ============= EXPORT HELPERS =============

/**
 * Get random selection of headlines for A/B testing
 */
export function getRandomHeadlines(count: number = 5): string[] {
  const shuffled = [...PMAX_SHORT_HEADLINES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get random selection of descriptions for A/B testing
 */
export function getRandomDescriptions(count: number = 4): string[] {
  const shuffled = [...PMAX_DESCRIPTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
