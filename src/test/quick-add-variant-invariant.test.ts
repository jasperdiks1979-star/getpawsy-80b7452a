import { describe, it, expect } from 'vitest';
import {
  resolveQuickAddPlan,
  cartLineProductId,
  cartLineHasVariant,
  cartLineNeedsVariantChoice,
  quickAddUnitPrice,
  isVariantPurchasable,
} from '@/lib/quickAdd';

const PID = '11111111-2222-4333-8444-555555555555';

const product = (variants: unknown, extra: Record<string, unknown> = {}) => ({
  id: PID,
  slug: 'test-product',
  name: 'Test Product',
  price: 29.99,
  image_url: '/img.jpg',
  variants,
  ...extra,
});

describe('quick add — variant invariant (non-PDP entry points)', () => {
  it('single catalog variant quick-adds that exact variant with its id suffix', () => {
    const plan = resolveQuickAddPlan(
      product([{ vid: 'V1', variantKey: 'Blue', variantSellPrice: 31.5, variantStock: 5 }]),
    );
    expect(plan.kind).toBe('add');
    if (plan.kind !== 'add') return;
    expect(plan.variantId).toBe('V1');
    expect(plan.item.id).toBe(`${PID}-V1`);
    expect(plan.item.price).toBe(31.5);
  });

  it('product with no variants quick-adds the bare product id', () => {
    const plan = resolveQuickAddPlan(product([]));
    expect(plan.kind).toBe('add');
    if (plan.kind !== 'add') return;
    expect(plan.item.id).toBe(PID);
    expect(plan.variantId).toBeNull();
  });

  it('multi-variant product never silently defaults to the first variant', () => {
    const plan = resolveQuickAddPlan(
      product([
        { vid: 'A', variantKey: 'Small', variantStock: 3 },
        { vid: 'B', variantKey: 'Large', variantStock: 4 },
      ]),
    );
    expect(plan.kind).toBe('choose');
    if (plan.kind !== 'choose') return;
    expect(plan.reason).toBe('multiple_variants');
    expect(plan.url).toBe('/products/test-product');
  });

  it('multi-variant with exactly one purchasable variant adds that exact variant', () => {
    const plan = resolveQuickAddPlan(
      product([
        { vid: 'A', variantKey: 'Small', variantStock: 0 },
        { vid: 'B', variantKey: 'Large', variantStock: 7 },
      ]),
    );
    expect(plan.kind).toBe('add');
    if (plan.kind !== 'add') return;
    expect(plan.variantId).toBe('B');
    expect(plan.item.id).toBe(`${PID}-B`);
  });

  it('zero-stock variants are unavailable, never added', () => {
    const plan = resolveQuickAddPlan(
      product([
        { vid: 'A', variantStock: 0 },
        { vid: 'B', variantStock: 0 },
      ]),
    );
    expect(plan.kind).toBe('unavailable');
  });

  it('out-of-stock or inactive products are never quick-added', () => {
    expect(resolveQuickAddPlan(product([]), { inStock: false }).kind).toBe('unavailable');
    expect(resolveQuickAddPlan(product([], { is_active: false })).kind).toBe('unavailable');
  });

  it('unloaded variants fail safe to the product page', () => {
    expect(resolveQuickAddPlan(product(undefined)).kind).toBe('choose');
    expect(resolveQuickAddPlan(product(null)).kind).toBe('choose');
  });

  it('a variant without an exact supplier id is sent to the product page', () => {
    const plan = resolveQuickAddPlan(product([{ variantKey: 'Only', variantStock: 2 }]));
    expect(plan.kind).toBe('choose');
  });

  it('missing stock data keeps a variant purchasable (product stock governs)', () => {
    expect(isVariantPurchasable({ vid: 'A' })).toBe(true);
    expect(isVariantPurchasable({ vid: 'A', variantStock: 0 })).toBe(false);
  });
});

describe('cart -> checkout parity and legacy recovery', () => {
  it('cart line id yields the base product id and variant presence', () => {
    expect(cartLineProductId(`${PID}-V1`)).toBe(PID);
    expect(cartLineProductId(PID)).toBe(PID);
    expect(cartLineHasVariant(`${PID}-V1`)).toBe(true);
    expect(cartLineHasVariant(PID)).toBe(false);
  });

  it('legacy bare line on a multi-variant product needs a choice', () => {
    const variants = [{ vid: 'A' }, { vid: 'B' }];
    expect(cartLineNeedsVariantChoice(PID, variants)).toBe(true);
    expect(cartLineNeedsVariantChoice(`${PID}-A`, variants)).toBe(false);
    expect(cartLineNeedsVariantChoice(PID, [{ vid: 'A' }])).toBe(false);
    expect(cartLineNeedsVariantChoice(PID, [])).toBe(false);
  });

  it('quick-add unit price matches the server canonical unit price rules', () => {
    expect(quickAddUnitPrice(29.99, { variantSellPrice: 34.5 })).toBe(34.5);
    expect(quickAddUnitPrice(29.99, { variantSellPrice: 0 })).toBe(29.99);
    expect(quickAddUnitPrice(29.994, null)).toBe(29.99);
  });

  it('added multi-variant line carries the variant id checkout extracts', () => {
    const plan = resolveQuickAddPlan(
      product([
        { vid: 'A', variantStock: 0 },
        { vid: 'B', variantStock: 1, variantSellPrice: 40 },
      ]),
    );
    if (plan.kind !== 'add') throw new Error('expected add');
    const base = cartLineProductId(plan.item.id)!;
    const extracted = plan.item.id.slice(base.length).replace(/^[_-]/, '');
    expect(extracted).toBe('B');
    expect(plan.item.price).toBe(40);
  });
});
