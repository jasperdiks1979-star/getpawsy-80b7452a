/**
 * Revenue Tier Engine — GetPawsy
 * 
 * Classifies collections and products into revenue tiers based on RPS.
 * Drives internal link weight allocation, sitemap priority, and homepage prominence.
 */

import { RPS_RANKED_COLLECTIONS, type RPSCollection } from './seo-revenue-priority';
import { SPRINT_PRODUCTS, type SprintProduct } from './sprint-products';
import { MONEY_COLLECTION_SLUGS } from './money-collections';

// ── Revenue Tier Classification ────────────────────────────

export type RevenueTier = 'tier_1' | 'tier_2' | 'tier_3';

export interface TieredCollection {
  slug: string;
  name: string;
  rps: number;
  tier: RevenueTier;
  linkWeightMultiplier: number;
  sitemapPriority: number;
  homepageEligible: boolean;
}

export interface TieredProduct {
  slug: string;
  name: string;
  conversionScore: number;
  margin: number;
  tier: RevenueTier;
  badgeLabel: string | null;
  internalLinkBoost: boolean;
}

/**
 * Classify collections into revenue tiers.
 * Tier 1 = top 20% by RPS (platinum + top gold)
 * Tier 2 = next 30% (remaining gold + silver)
 * Tier 3 = remaining (bronze + low silver)
 */
export function classifyCollections(): TieredCollection[] {
  const sorted = [...RPS_RANKED_COLLECTIONS];
  const t1Cutoff = Math.ceil(sorted.length * 0.2);
  const t2Cutoff = Math.ceil(sorted.length * 0.5);

  return sorted.map((c, i): TieredCollection => {
    const tier: RevenueTier = i < t1Cutoff ? 'tier_1' : i < t2Cutoff ? 'tier_2' : 'tier_3';
    const isMoney = MONEY_COLLECTION_SLUGS.has(c.slug);

    return {
      slug: c.slug,
      name: c.name,
      rps: c.rps,
      tier,
      // +40% for tier 1, normal for tier 2, -30% for tier 3
      linkWeightMultiplier: tier === 'tier_1' ? 1.4 : tier === 'tier_2' ? 1.0 : 0.7,
      sitemapPriority: tier === 'tier_1' ? 0.95 : tier === 'tier_2' ? 0.80 : 0.55,
      homepageEligible: tier === 'tier_1' || isMoney,
    };
  });
}

/**
 * Classify sprint products into revenue tiers.
 * RPS ≥ 80 → Tier 1, ≥ 60 → Tier 2, rest → Tier 3
 */
export function classifyProducts(): TieredProduct[] {
  return SPRINT_PRODUCTS.map((p): TieredProduct => {
    const tier: RevenueTier = p.conversionScore >= 80 ? 'tier_1'
      : p.conversionScore >= 60 ? 'tier_2'
      : 'tier_3';

    return {
      slug: p.slug,
      name: p.name,
      conversionScore: p.conversionScore,
      margin: p.margin,
      tier,
      badgeLabel: p.conversionScore >= 80 ? 'Best Value Pick' : null,
      internalLinkBoost: p.conversionScore >= 80,
    };
  });
}

// ── Cached lookups ─────────────────────────────────────────

let _collections: TieredCollection[] | null = null;
let _products: TieredProduct[] | null = null;

export function getTieredCollections(): TieredCollection[] {
  if (!_collections) _collections = classifyCollections();
  return _collections;
}

export function getTieredProducts(): TieredProduct[] {
  if (!_products) _products = classifyProducts();
  return _products;
}

export function getTier1Collections(): TieredCollection[] {
  return getTieredCollections().filter(c => c.tier === 'tier_1');
}

export function getTier1Products(): TieredProduct[] {
  return getTieredProducts().filter(p => p.tier === 'tier_1');
}

export function getCollectionTier(slug: string): RevenueTier {
  const entry = getTieredCollections().find(c => c.slug === slug);
  return entry?.tier ?? 'tier_3';
}

export function getProductTier(slug: string): RevenueTier {
  const entry = getTieredProducts().find(p => p.slug === slug);
  return entry?.tier ?? 'tier_3';
}

export function getLinkWeightMultiplier(collectionSlug: string): number {
  const entry = getTieredCollections().find(c => c.slug === collectionSlug);
  return entry?.linkWeightMultiplier ?? 1.0;
}

/**
 * Get revenue-weighted sitemap priority for any URL.
 * Integrates with existing pagerank-sculpt.ts by providing tier-aware overrides.
 */
export function getRevenueSitemapPriority(url: string): number {
  if (url === '/' || url === '') return 1.0;

  // Check collection tiers
  const collMatch = url.match(/^\/collections\/(.+?)(?:\?|$)/);
  if (collMatch) {
    const entry = getTieredCollections().find(c => c.slug === collMatch[1]);
    if (entry) return entry.sitemapPriority;
    return 0.60; // uncategorized collection
  }

  // Product pages: tier 1 products get elevated priority
  const prodMatch = url.match(/^\/product\/(.+?)(?:\?|$)/);
  if (prodMatch) {
    const entry = getTieredProducts().find(p => p.slug === prodMatch[1]);
    if (entry?.tier === 'tier_1') return 0.85;
    if (entry?.tier === 'tier_2') return 0.70;
    return 0.55;
  }

  // Blog / guides
  if (url.startsWith('/blog/') || url.startsWith('/guides/')) return 0.65;

  return 0.30;
}
