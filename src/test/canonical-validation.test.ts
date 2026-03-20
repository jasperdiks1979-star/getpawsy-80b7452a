import { describe, it, expect } from 'vitest';
import { buildCanonicalUrl, shouldNoindex } from '@/lib/seo-canonical';
import { getRobotsDirective, getRobotsContent } from '@/lib/seo-robots-policy';

describe('Canonical URL Generation', () => {
  it('homepage gets trailing slash', () => {
    expect(buildCanonicalUrl('/')).toBe('https://getpawsy.pet/');
    expect(buildCanonicalUrl('')).toBe('https://getpawsy.pet/');
  });

  it('sub-pages have no trailing slash', () => {
    expect(buildCanonicalUrl('/products')).toBe('https://getpawsy.pet/products');
    expect(buildCanonicalUrl('/products/')).toBe('https://getpawsy.pet/products');
  });

  it('strips query parameters', () => {
    expect(buildCanonicalUrl('/products?sort=price')).toBe('https://getpawsy.pet/products');
    expect(buildCanonicalUrl('/product/abc?utm_source=pinterest')).toBe('https://getpawsy.pet/product/abc');
  });

  it('strips hash fragments', () => {
    expect(buildCanonicalUrl('/guides/best-cat-bed#section')).toBe('https://getpawsy.pet/guides/best-cat-bed');
  });

  it('collapses double slashes', () => {
    expect(buildCanonicalUrl('//products//dog-toys')).toBe('https://getpawsy.pet/products/dog-toys');
  });

  it('lowercases paths', () => {
    expect(buildCanonicalUrl('/Products/Dog-Toys')).toBe('https://getpawsy.pet/products/dog-toys');
  });

  it('always uses apex domain (no www)', () => {
    const url = buildCanonicalUrl('/collections/dog-car-seats');
    expect(url).not.toContain('www.');
    expect(url).toBe('https://getpawsy.pet/collections/dog-car-seats');
  });

  it('never contains lovable.app', () => {
    const url = buildCanonicalUrl('/product/test');
    expect(url).not.toContain('lovable.app');
  });
});

describe('Robots Policy Alignment', () => {
  // Indexable routes
  const indexableRoutes = ['/', '/products', '/product/test-slug', '/collections/dog-beds', '/guides/best-cat-toy', '/blog/test-post', '/dog', '/cat', '/bestsellers'];
  for (const route of indexableRoutes) {
    it(`${route} is indexable`, () => {
      const directive = getRobotsDirective(route);
      expect(directive).toBe('index');
      expect(getRobotsContent(directive)).toContain('index, follow');
    });
  }

  // Noindex routes
  const noindexRoutes = ['/auth', '/cart', '/checkout', '/profile', '/orders', '/admin', '/admin/profit-system', '/dashboard', '/wishlist', '/payment-success', '/my-claims'];
  for (const route of noindexRoutes) {
    it(`${route} is noindex`, () => {
      const directive = getRobotsDirective(route);
      expect(directive).toBe('noindex');
      expect(getRobotsContent(directive)).toContain('noindex');
    });
  }

  // Query params trigger noindex-follow
  it('tracking params get noindex-follow', () => {
    const directive = getRobotsDirective('/products', '?utm_source=google');
    expect(directive).toBe('noindex-follow');
    expect(getRobotsContent(directive)).toBe('noindex, follow');
  });
});

describe('Canonical + Robots Consistency', () => {
  it('noindex paths also have valid canonicals', () => {
    // Even noindex pages should produce a clean canonical (self-referencing)
    expect(buildCanonicalUrl('/cart')).toBe('https://getpawsy.pet/cart');
    expect(buildCanonicalUrl('/auth')).toBe('https://getpawsy.pet/auth');
  });

  it('shouldNoindex aligns with getRobotsDirective for key paths', () => {
    expect(shouldNoindex('/cart')).toBe(true);
    expect(shouldNoindex('/auth')).toBe(true);
    expect(shouldNoindex('/products')).toBe(false);
    expect(shouldNoindex('/')).toBe(false);
  });
});
