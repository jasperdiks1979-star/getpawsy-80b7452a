import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { categoryCollectionHref } from '@/lib/canonical-category-registry';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('PDP cross-sell claims stay verifiable', () => {
  it('does not claim purchase frequency or popularity in the cross-sell block', () => {
    const src = read('src/components/products/FrequentlyBoughtTogether.tsx');
    const rendered = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rendered).not.toMatch(/Frequently Bought Together/);
    expect(rendered).not.toMatch(/Most customers/i);
  });

  it('does not label related products as popular', () => {
    const src = read('src/pages/ProductDetail.tsx');
    expect(src).not.toMatch(/Popular picks/i);
  });
});

describe('categoryCollectionHref', () => {
  it('resolves a known category to its canonical collection', () => {
    expect(categoryCollectionHref('cat-litter-boxes')).toBe('/collections/cat-litter-boxes');
  });

  it('never emits an unescaped ampersand slug', () => {
    const href = categoryCollectionHref('Cat Bowls & Feeders');
    expect(href).not.toContain('&');
    expect(href.startsWith('/collections/') || href.startsWith('/products?category=')).toBe(true);
  });

  it('falls back to the product grid when there is no category', () => {
    expect(categoryCollectionHref(null)).toBe('/products');
  });
});
