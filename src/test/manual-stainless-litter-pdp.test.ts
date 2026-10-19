import { describe, expect, it } from 'vitest';
import { getProductContentOverride, isSectionHiddenForProduct } from '@/config/product-content-overrides';

const productId = '1daefaa0-7892-4760-87a9-0aa34c49c767';

describe('manual stainless-steel litter box product copy', () => {
  it('has a verified SKU-specific override', () => {
    expect(getProductContentOverride(productId)).toBeDefined();
  });
  it('explicitly discloses manual scooping', () => {
    const override = getProductContentOverride(productId)!;
    expect(override.intro).toMatch(/manual/i);
    expect(override.faqs?.some(f => /self-cleaning|automatic/i.test(f.q) && /No\./i.test(f.a))).toBe(true);
  });
  it('hides unverified automatic/sensor comparison sections', () => {
    for (const section of ['problemSolution','productVsAlternatives','productIdealFor','litterBoxLovedSection','litterBoxConversionBoost'] as const) {
      expect(isSectionHiddenForProduct(productId, section)).toBe(true);
    }
  });
  it('does not show generic category ad claims or unsupported best-value badges', () => {
    const override = getProductContentOverride(productId)!;
    expect(override.hideAdIntentHeadline).toBe(true);
    expect(override.hideBestValueBadge).toBe(true);
  });
  it('does not invent specifications in benefits', () => {
    const override = getProductContentOverride(productId)!;
    const claims = [override.intro, ...(override.benefits ?? []), ...(override.specs ?? []).map(x => x.value)].join(' ');
    expect(claims).not.toMatch(/infrared|motorized|app.control|automatic waste removal|sensor system|self.cleaning/i);
  });
});
