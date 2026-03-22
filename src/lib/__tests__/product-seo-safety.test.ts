/**
 * Product SEO Safety Guards
 * Ensures product routes never regress to noindex/404 for valid slugs.
 */
import { describe, it, expect } from 'vitest';
import { getRobotsDirective, getRobotsContent } from '@/lib/seo-robots-policy';
import { buildCanonicalUrl } from '@/lib/seo-canonical';
import { shouldNoindex } from '@/lib/seo-canonical';

describe('Product SEO Safety', () => {
  const VALID_SLUGS = [
    'duck-coop-wooden-duck-house-with-openable-roof-double-doors-natural-wood',
    'parrot-stand-large-bird-perch-stand-with-toy-hook-3-ladders',
    'dog-agility-equipment-ramp',
    'simple-product',
  ];

  it.each(VALID_SLUGS)('product/%s must be indexable', (slug) => {
    const directive = getRobotsDirective(`/product/${slug}`, '');
    expect(directive).toBe('index');
  });

  it.each(VALID_SLUGS)('product/%s robots content includes index,follow', (slug) => {
    const directive = getRobotsDirective(`/product/${slug}`, '');
    const content = getRobotsContent(directive);
    expect(content).toContain('index');
    expect(content).toContain('follow');
    expect(content).not.toContain('noindex');
  });

  it.each(VALID_SLUGS)('product/%s canonical includes exact slug', (slug) => {
    const canonical = buildCanonicalUrl(`/product/${slug}`);
    expect(canonical).toBe(`https://getpawsy.pet/product/${slug}`);
  });

  it.each(VALID_SLUGS)('product/%s must not be in noindex paths', (slug) => {
    expect(shouldNoindex(`/product/${slug}`)).toBe(false);
  });

  // Utility routes must remain noindex
  it.each(['/cart', '/checkout', '/admin', '/search', '/account'])(
    '%s must be noindex',
    (path) => {
      const directive = getRobotsDirective(path, '');
      expect(directive).toBe('noindex');
    }
  );
});
