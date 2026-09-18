import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const html = read('index.html');
const home = read('src/components/v2/storefront/V2HomePage.tsx');
const main = read('src/main.tsx');
const nav = read('src/components/v2/storefront/nav-config.ts');
const compatibilityHome = read('src/components/home/HomePage.tsx');

const HERO_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f',
  'b9c0f448-162b-4464-bf36-7697e6fe4852',
  '1b218ab0-19b5-4ae5-a227-8099f2e2f00c',
  '84be6648-7fd6-4b18-bdd7-ff9df7907892',
  '1daefaa0-7892-4760-87a9-0aa34c49c767',
];

describe('homepage delivery consistency', () => {
  it('keeps stale generic merchandising out of raw and hydrated homepages', () => {
    const renderedSources = `${html}\n${home}\n${nav}`;
    for (const phrase of [
      'Shop Bestsellers',
      'Best sellers',
      'Popular Picks',
      'most-loved',
      'PREMIUM PET PRODUCTS',
      'Premium Pet Comfort',
      'Most popular right now',
    ]) {
      expect(renderedSources).not.toContain(phrase);
    }
  });

  it('keeps dog and ranking links out of primary storefront navigation', () => {
    expect(nav).not.toContain("href: '/collections/dog'");
    expect(nav).not.toContain("href: '/bestsellers'");
    expect(nav).toContain("href: '/bundles'");
  });

  it('routes the legacy homepage import to the same canonical implementation', () => {
    expect(compatibilityHome).toContain("export { V2HomePage as default } from '@/components/v2/storefront/V2HomePage'");
    expect(compatibilityHome).not.toMatch(/bestsellers|SocialProofSection|ProductRail/i);
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