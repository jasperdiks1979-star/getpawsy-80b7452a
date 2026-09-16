import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const html = read('index.html');
const home = read('src/components/v2/storefront/V2HomePage.tsx');
const main = read('src/main.tsx');

const HERO_IDS = [
  '2022147992715550722',
  '1898265961711509505',
  '2003462558293204994',
  '1993160057093906434',
  '1976569563728994306',
];

describe('homepage delivery consistency', () => {
  it('keeps stale generic merchandising out of raw and hydrated homepages', () => {
    const renderedSources = `${html}\n${home}`;
    for (const phrase of [
      'Shop Bestsellers',
      'Best sellers',
      'Popular Picks',
      'most-loved',
      'PREMIUM PET PRODUCTS',
      'Premium Pet Comfort',
    ]) {
      expect(renderedSources).not.toContain(phrase);
    }
  });

  it('never uses the dog-training campaign artwork as homepage imagery', () => {
    expect(html).not.toContain('/hero/dog-training-hero');
    expect(home).not.toContain('dog-training-hero');
    expect(html).toContain('/hero/cat-litter-box-hero');
    expect(home).toContain('/hero/cat-litter-box-hero');
  });

  it('renders the exact five commercial-rebuild heroes in source order', () => {
    expect(HERO_IDS).toHaveLength(5);
    for (const id of HERO_IDS) expect(home).toContain(id);
    expect(home).toContain(".in('id', [...HERO_PRODUCT_IDS])");
  });

  it('keeps raw shipping language evidence-safe', () => {
    expect(html).not.toMatch(/3[–-]7 business days/i);
    expect(html).toContain('Delivery details confirmed at checkout');
    expect(html).toContain('delivery timing are confirmed at checkout before payment');
    expect(html).toContain('Free shipping on orders over $35');
    expect(html).toContain('30-day return policy');
  });

  it('removes recovery remnants after a healthy React mount', () => {
    const healthyBoot = main.indexOf('(window as any).__BOOT_OK__ = true');
    const removeChunkRecovery = main.indexOf("document.getElementById('chunk-recovery')?.remove()", healthyBoot);
    const removeBootRecovery = main.indexOf("document.getElementById('boot-recovery')?.remove()", healthyBoot);
    expect(healthyBoot).toBeGreaterThan(-1);
    expect(removeChunkRecovery).toBeGreaterThan(healthyBoot);
    expect(removeBootRecovery).toBeGreaterThan(healthyBoot);
  });
});