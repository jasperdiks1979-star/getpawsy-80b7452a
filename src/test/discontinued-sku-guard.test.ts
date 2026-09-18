import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Supplier discontinuation guard — CJ SKU CJTC276169401AZ.
 *
 * CJ ticket T202609161615150281 (2026-09-16) confirmed the SKU is out of stock
 * and removed from the supplier's shelves. The product row keeps its URL and
 * content (stock 0, availability "out of stock"), but it must never be
 * re-promoted into merchandising or product feed surfaces.
 */
const DISCONTINUED_ID = 'e265e7fe-af60-4efc-b927-5c4f79fc1bf0';
const DISCONTINUED_SLUG =
  'front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const heroSource = read('src/components/v2/storefront/V2HomePage.tsx');
const bundles = read('src/lib/bundles.ts');
const merchantTop = read('src/config/merchant-top50.ts');
const feedExporter = read('supabase/functions/export-merchant-feed/index.ts');

/** Strips comments so a documented historical reference does not fail the test. */
function codeWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('discontinued CJ SKU CJTC276169401AZ', () => {
  it('is not one of the homepage hero products', () => {
    expect(codeWithoutComments(heroSource)).not.toContain(DISCONTINUED_ID);
  });

  it('keeps five homepage hero products', () => {
    const block = heroSource.match(/const HERO_PRODUCT_IDS = \[([\s\S]*?)\] as const;/);
    expect(block).toBeTruthy();
    const ids = (block![1].match(/'[0-9a-f-]{36}'/g) ?? []);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it('is not a component of any curated bundle', () => {
    expect(codeWithoutComments(bundles)).not.toContain(DISCONTINUED_SLUG);
  });

  it('is not in the curated merchant feed selections', () => {
    expect(codeWithoutComments(merchantTop)).not.toContain(DISCONTINUED_ID);
    expect(codeWithoutComments(feedExporter)).not.toContain(DISCONTINUED_ID);
  });

  it('is not present in the generated product feed snapshots', () => {
    for (const file of [
      'public/merchant-feed.xml',
      'public/google-feed.xml',
      'public/google-shopping-feed.xml',
    ]) {
      expect(read(file)).not.toContain(DISCONTINUED_ID);
    }
  });

  it('is not advertised in the product sitemap snapshot', () => {
    expect(read('public/sitemap-products-1.xml')).not.toContain(DISCONTINUED_SLUG);
  });

});
