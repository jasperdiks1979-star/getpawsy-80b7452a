import { describe, it, expect } from 'vitest';
import { commercialSessionCounters, splitCommercialSessions } from '@/lib/commercial-funnel';
import { classifyAcquisitionBucket } from '@/lib/commercialInclusion';
import { listingPrice } from '@/lib/listingPrice';
import { customerUnitPrice } from '@/lib/customerUnitPrice';
import { buildSafeOffer } from '@/lib/safe-offer';
import { productRobotsDirective } from '@/lib/seo-robots-policy';
import { isProductIndexable } from '../../scripts/seo-indexability.mjs';
import { neutralProductRecord } from '@/lib/product-claim-hygiene';
import { getCartIncentiveState, FREE_SHIPPING_THRESHOLD, BUSINESS_OPERATOR } from '@/lib/shipping-constants';
const human = { session_id: 'human', visitor_id: 'visitor', commercial_eligible_v3_strict: true, has_product_view: true, has_add_to_cart: true };
describe('commercial exclusion and distinct funnel contract', () => {
  it.each(['BOT_CONFIRMED', 'BOT_PROBABLE', 'CRAWLER', 'TECHNICAL', 'INTERNAL_PREVIEW'])('hard veto %s beats stale human verdict', verdict => {
    expect(commercialSessionCounters([{ ...human, stored_traffic_class_v2: verdict }]).sessions).toBe(0);
  });
  it('silent UNKNOWN is separate, not a bot', () => {
    const split = splitCommercialSessions([{ session_id: 'silent', page_views: 1, stored_traffic_class_v2: 'UNKNOWN' }]);
    expect(split.unknown).toHaveLength(1); expect(split.excluded).toHaveLength(0);
  });
  it('duplicate cart callbacks count one session, two sessions can share one visitor', () => {
    expect(commercialSessionCounters([human, human, { ...human, session_id: 'second' }])).toMatchObject({ sessions: 2, visitors: 1, add_to_cart: 2 });
  });
  it('explicit internal and technical flags override human commerce evidence', () => {
    expect(commercialSessionCounters([{ ...human, is_internal: true }, { ...human, session_id: 'tech', stored_technical_path: true }]).add_to_cart).toBe(0);
  });
  it('v2 acquisition does not route confirmed bots or technical labels into direct', () => {
    expect(classifyAcquisitionBucket({ traffic_class: 'BOT_CONFIRMED', classified_channel: 'direct' })).toBe('BOT');
    expect(classifyAcquisitionBucket({ traffic_class: 'TECHNICAL', classified_channel: 'direct' })).toBe('TECHNICAL');
  });
});
describe('real catalog variant price parity without catalog changes', () => {
  const pink = { vid: '1898265961791201283', variantSellPrice: 162.99, variantCostPrice: 44.38, inventoryNum: 3047 };
  const grey = { vid: '1898265961791201282', variantSellPrice: 164.99, variantCostPrice: 45.52, inventoryNum: 12350 };
  it('tree advertised Pink 162.99, selected Light grey 164.99, base remains 158.99', () => {
    const p = { price: 158.99, variants: [grey, pink] };
    expect(buildSafeOffer(p)?.price).toBe('162.99');
    expect(customerUnitPrice(p.price, grey, 2)).toBe(164.99);
    expect(customerUnitPrice(p.price, pink, 2)).toBe(162.99); expect(p.price).toBe(158.99);
  });
  it('windmill 37.99 base advertises actual 36.95 marked options', () => {
    expect(buildSafeOffer({ price: 37.99, variants: [{ variantSellPrice: 36.95, variantCostPrice: 8.74 }, { variantSellPrice: 36.95, variantCostPrice: 8.74 }] })?.price).toBe('36.95');
  });
  it('manual stainless box 96.99 base advertises 97.95 options', () => {
    expect(buildSafeOffer({ price: 96.99, variants: [{ variantSellPrice: 97.95, variantCostPrice: 32.96 }, { variantSellPrice: 97.95, variantCostPrice: 32.96 }] })?.price).toBe('97.95');
  });
  it('unprocessed supplier price cannot override customer price', () => {
    expect(listingPrice(158.99, [{ variantSellPrice: 44.38 }, { variantSellPrice: 45.52 }]).price).toBe(158.99);
  });
  it('sold out Pink does not advertise cheaper unavailable option', () => {
    expect(buildSafeOffer({ price: 158.99, variants: [{ ...pink, inventories: [{ countryCode: "US", totalInventory: 0, cjInventory: 0 }] }, grey] })?.price).toBe('164.99');
  });
});
describe('intentional index policy and verified policy terms', () => {
  it.each([{ seo_tier: 'C', seo_noindex: false }, { seo_tier: ' c ', seo_noindex: false }, { seo_tier: 'A', seo_noindex: true }, { seo_tier: 'A', seo_noindex: false }])('runtime and sitemap agree: %j', p => {
    expect(productRobotsDirective(p) === 'index').toBe(isProductIndexable({ ...p, is_active: true, is_duplicate: false, slug: 'real-product' }));
  });
  it('neutral bowl wording does not change catalog or URL', () => {
    const p = { name: 'Elevated Cat Bowl – Double Dish with Cervical Vertebra Protection for Cats', slug: 'cat-double-bowl-cat-food-bowl-protects-cervical-vertebra' };
    const clean = neutralProductRecord(p); expect(clean.name).toBe('Elevated Cat Bowl – Double Dish');
    expect(clean.slug).toBe(p.slug); expect(p.name).toContain('Cervical Vertebra Protection');
  });
  it('free shipping includes exactly 35 dollars, not 34.99', () => {
    expect(FREE_SHIPPING_THRESHOLD).toBe(35); expect(getCartIncentiveState(35, 1).freeShippingUnlocked).toBe(true);
    expect(getCartIncentiveState(34.99, 1).freeShippingUnlocked).toBe(false);
  });
  it('legal operator remains Skidzo', () => expect(BUSINESS_OPERATOR).toBe('Skidzo'));
});
