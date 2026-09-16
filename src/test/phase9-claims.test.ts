import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProductEvidence, evidenceBenefitBullets } from '@/lib/product-evidence';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Phase 9 regression cover.
 *
 * 1. PDP key points may only come from a per-SKU verified override or from the
 *    supplier specification block. The old category-guessed copy asserted
 *    automation, sensors, materials, weight limits and airline fit that no
 *    source documents.
 * 2. GetPawsy does not physically test products (stated on "how we select
 *    products"). No page may claim that it does.
 */
describe('phase 9 — PDP key points are evidence-only', () => {
  const pdp = read('src/pages/ProductDetail.tsx');

  it.each([
    'Automatic cleaning helps reduce daily scooping',
    'Built-in sensors for pet safety',
    'Supports cats up to 25+ lbs safely',
    'Non-toxic, pet-safe materials throughout',
    'Durable build withstands aggressive chewers',
    'Fits under most airline cabin seats',
    'Premium materials built for daily pet life',
  ])('does not render the invented bullet %s', (claim) => {
    // The strings may only survive inside the explanatory comment block.
    const codeOnly = pdp.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toContain(claim);
  });

  it('produces no bullets for a product with no documented specification', () => {
    const evidence = buildProductEvidence({
      name: 'Cat Litter Box',
      description: 'A lovely litter box for your cat.',
      variants: [],
    });
    expect(evidenceBenefitBullets(evidence)).toEqual([]);
  });

  it('produces labelled bullets from a supplier specification block', () => {
    const evidence = buildProductEvidence({
      name: 'Covered Litter Box',
      description: 'Material: Polypropylene\nSuitable for: cats under 10 lbs\nAssembly: no assembly required',
      variants: [],
    });
    const bullets = evidenceBenefitBullets(evidence);
    expect(bullets.some((b) => b.includes('Polypropylene'))).toBe(true);
    expect(bullets.some((b) => /cats under 10 lbs/i.test(b))).toBe(true);
  });
});

describe('phase 9 — no first-party product testing claims', () => {
  const files = [
    'src/lib/serp-domination-engine.ts',
    'src/lib/seo-route-config.ts',
    'src/lib/silo-config.ts',
    'src/pages/seo/SeoIntentPage.tsx',
    'src/pages/seo/BestInteractiveCatToys.tsx',
    'src/pages/guides/CatCondoVsCatTree2026.tsx',
    'src/pages/guides/IndoorCatFurnitureGuide.tsx',
    'src/pages/collections/DogCarTravelSafety.tsx',
  ];

  const banned = [
    /we've tested/i,
    /we have tested/i,
    /load-tested every/i,
    /stability-tested every/i,
    /our picks are stability-tested/i,
    /our top-rated picks are load-tested/i,
    /trees tested for stability/i,
    /all tested for stability/i,
  ];

  it.each(files)('%s makes no first-party testing claim', (file) => {
    const src = read(file);
    for (const rx of banned) expect(src).not.toMatch(rx);
  });
});

describe('phase 9 — review-request email stays safe and disabled', () => {
  const fn = read('supabase/functions/send-review-request/index.ts');

  it('is gated behind REVIEW_REQUEST_EMAILS_ENABLED', () => {
    expect(fn).toContain('REVIEW_REQUEST_EMAILS_ENABLED');
    expect(fn).toMatch(/!==\s*"true"/);
  });

  it('only targets delivered orders', () => {
    expect(fn).toContain('.eq("status", "delivered")');
    expect(fn).not.toContain('"shipped"');
  });

  it('skips unsubscribed addresses and includes an unsubscribe link', () => {
    expect(fn).toContain('newsletter_subscribers');
    expect(fn).toContain('is_active', );
    expect(fn).toContain('/unsubscribe?email=');
  });

  it('protects against duplicate sends per order', () => {
    expect(fn).toContain('review_requests');
    expect(fn).toMatch(/\.eq\("order_id", order\.id\)/);
  });
});
