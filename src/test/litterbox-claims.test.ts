import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Phase 8 regression: the litter-box conversion blocks describe a
 * self-cleaning, app-controlled, sensor-driven unit. No stocked product in the
 * curated range is automatic, so these blocks must stay gated behind a product
 * title that documents automatic/self-cleaning operation.
 */
describe('litter box claim gating', () => {
  const pdp = readFileSync('src/pages/ProductDetail.tsx', 'utf8');

  it('gates the conversion boost and loved section on an automatic product', () => {
    expect(pdp).toContain('isAutomaticLitterBoxProduct');
    expect(pdp).not.toMatch(/\{isLitterBoxProduct &&[^}]*litterBoxConversionBoost/);
    expect(pdp).not.toMatch(/\{isLitterBoxProduct &&[^}]*LitterBoxLovedSection/);
  });

  it('renders no fabricated rating or review count on the TikTok PDP', () => {
    const tt = readFileSync('src/components/product/TikTokPdpVariant.tsx', 'utf8');
    expect(tt).not.toContain('247');
    expect(tt).not.toContain('4.8');
  });

  it('makes no unsupported popularity claim in the litter box block', () => {
    const boost = readFileSync('src/components/products/LitterBoxConversionBoost.tsx', 'utf8');
    expect(boost).not.toMatch(/Popular this week|Best ?seller|Most popular/i);
  });
});
