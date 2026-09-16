/**
 * Commercial rebuild — merchandising layer invariants.
 *
 * The cat-first assortment is enforced by a data layer (products_shop) plus a
 * per-product noindex flag. These tests lock the wiring so a later refactor
 * cannot silently put retired or legacy long-tail products back into the shop
 * window, or re-index pages that were deliberately de-indexed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(p), 'utf8');

/** Listing / discovery surfaces that must only ever show the curated range. */
const SHOP_SURFACES = [
  'src/pages/Products.tsx',
  'src/hooks/useCategoryProducts.ts',
  'src/hooks/useCategoryPrefetch.ts',
  'src/components/home/ProductRail.tsx',
  'src/components/home/CuratedProductSection.tsx',
  'src/components/home/FeaturedProductsSection.tsx',
  'src/components/home/NewArrivalsSection.tsx',
  'src/components/home/TrendingProducts.tsx',
  'src/components/home/HeroProductSpotlight.tsx',
  'src/components/homepage/TrendingWinnersBlock.tsx',
  'src/components/search/EnhancedSearch.tsx',
  'src/components/search/SearchSuggestions.tsx',
  'src/hooks/useRelatedProducts.ts',
  'src/hooks/usePersonalizedRecommendations.ts',
  'src/hooks/useCustomersAlsoBought.ts',
  'src/hooks/useCompleteTheLook.ts',
  'src/components/cart/CartUpsell.tsx',
  'src/components/cart/PostPurchaseOffer.tsx',
  'src/components/seo/RecommendedProductsBlock.tsx',
  'src/components/seo/ExploreMoreCategory.tsx',
  'src/components/products/CustomersAlsoTrainWith.tsx',
];

describe('merchandising layer', () => {
  it.each(SHOP_SURFACES)('%s reads the curated shop window, not the raw catalog', (file) => {
    const src = read(file);
    expect(src).toContain("from('products_shop')");
    // Products.tsx keeps one products_public read: the shopper's own
    // recently-viewed list must still resolve a product they already opened,
    // even if it has since left the curated range.
    const allowed = file === 'src/pages/Products.tsx' ? 1 : 0;
    const remaining = src.match(/from\(['"]products_public['"]\)/g)?.length ?? 0;
    expect(remaining).toBe(allowed);
  });


  it('the product page honours the per-product noindex flag', () => {
    const src = read('src/pages/ProductDetail.tsx');
    expect(src).toContain('seo_noindex');
    // noindex must still allow link following so legacy equity keeps flowing.
    expect(src).toContain('noindex, follow');
  });

  it('the product page still resolves any product, including retired ones', () => {
    // Retired products keep working URLs — the detail view is never filtered
    // by the merchandising flag.
    const src = read('src/pages/ProductDetail.tsx');
    expect(src).toContain('products_detail');
    expect(src).not.toContain("from('products_shop')");
  });

  it('the sitemap excludes de-indexed products', () => {
    const src = read('scripts/generate-sitemaps.mjs');
    const productQueries = src
      .split('\n')
      .filter((l) => l.includes('is_duplicate=eq.false') && l.includes('is_active=eq.true'));
    expect(productQueries.length).toBeGreaterThan(0);
    for (const q of productQueries) expect(q).toContain('seo_noindex=eq.false');
  });
});
