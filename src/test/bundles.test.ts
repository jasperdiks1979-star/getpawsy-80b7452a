import { describe, expect, it } from 'vitest';
import {
  BUNDLE_DEFINITIONS,
  buildBundleCartLines,
  bundleTotalIfComplete,
  evaluateBundle,
  initialSelection,
  missingSelections,
  type BundleCatalogProduct,
  type BundleComponent,
} from '@/lib/bundles';

const base = (over: Partial<BundleCatalogProduct> = {}): BundleCatalogProduct => ({
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'box',
  name: 'Litter Box',
  price: 80,
  image_url: null,
  is_active: true,
  merch_hidden: false,
  supplier_name: 'CJ Dropshipping',
  supplier_warehouse: 'US',
  stock: 10,
  variants: null,
  ...over,
});

const variant = (vid: string, name: string, stock = 50, price?: number) => ({
  vid,
  variantNameEn: name,
  variantSellPrice: price,
  inventories: [{ countryCode: 'US', storageNum: stock }],
});

const twoOptionProduct = base({
  id: '22222222-2222-2222-2222-222222222222',
  slug: 'tree',
  name: 'Cat Tree',
  price: 158.99,
  variants: [variant('v-grey', 'Light grey', 40, 158.99), variant('v-pink', 'Pink', 0)],
});

function componentsFor(products: BundleCatalogProduct[]): BundleComponent[] {
  const def = { slug: 's', name: 'S', intro: '', componentSlugs: products.map((p) => p.slug) };
  const status = evaluateBundle(def, new Map(products.map((p) => [p.slug, p])));
  if (!status.active) throw new Error(`expected active, got ${JSON.stringify(status)}`);
  return status.components;
}

describe('bundle activation gates', () => {
  it('blocks a component that is out of stock', () => {
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['box'] };
    const status = evaluateBundle(def, new Map([['box', base({ stock: 0 })]]));
    expect(status.active).toBe(false);
  });

  it('blocks a non-US warehouse component', () => {
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['box'] };
    const status = evaluateBundle(def, new Map([['box', base({ supplier_warehouse: 'CN' })]]));
    expect(status.active).toBe(false);
  });

  it('blocks a hidden or inactive component', () => {
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['box'] };
    expect(evaluateBundle(def, new Map([['box', base({ merch_hidden: true })]])).active).toBe(false);
    expect(evaluateBundle(def, new Map([['box', base({ is_active: false })]])).active).toBe(false);
  });

  it('blocks a missing component rather than silently shrinking the set', () => {
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['box', 'ghost'] };
    const status = evaluateBundle(def, new Map([['box', base()]]));
    expect(status.active).toBe(false);
  });

  it('blocks components from different suppliers (no split shipment)', () => {
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['box', 'tree'] };
    const status = evaluateBundle(
      def,
      new Map([
        ['box', base()],
        ['tree', { ...twoOptionProduct, supplier_name: 'Other Supplier' }],
      ]),
    );
    expect(status.active).toBe(false);
  });

  it('blocks a product whose every option is sold out', () => {
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['tree'] };
    const status = evaluateBundle(
      def,
      new Map([['tree', { ...twoOptionProduct, variants: [variant('v1', 'Grey', 0), variant('v2', 'Pink', 0)] }]]),
    );
    expect(status.active).toBe(false);
  });
});

describe('option selection', () => {
  it('auto-selects only when a single purchasable option exists', () => {
    const single = base({
      slug: 'single',
      variants: [variant('only-v', 'White', 20)],
    });
    const [component] = componentsFor([single]);
    expect(component.requiresSelection).toBe(false);
    expect(component.autoVariantId).toBe('only-v');
    expect(missingSelections([component], initialSelection([component]))).toEqual([]);
  });

  it('never pre-selects a variant when more than one is purchasable', () => {
    const multi = base({
      slug: 'multi',
      variants: [variant('a', 'Grey', 5), variant('b', 'Pink', 5)],
    });
    const [component] = componentsFor([multi]);
    expect(component.requiresSelection).toBe(true);
    const selection = initialSelection([component]);
    expect(selection[component.product.id]).toBeUndefined();
    expect(missingSelections([component], selection)).toEqual([component.product.id]);
  });

  it('treats a sold-out option as not selectable', () => {
    const [component] = componentsFor([twoOptionProduct]);
    expect(component.allOptions).toHaveLength(2);
    expect(component.options.map((o) => o.vid)).toEqual(['v-grey']);
    // Only one purchasable option left → auto-selected, nothing to choose.
    expect(component.requiresSelection).toBe(false);
  });

  it('rejects a selection that is not a purchasable option', () => {
    const multi = base({ slug: 'multi', variants: [variant('a', 'Grey', 5), variant('b', 'Pink', 5)] });
    const [component] = componentsFor([multi]);
    const result = buildBundleCartLines([component], { [component.product.id]: 'not-a-variant' });
    expect(result.ok).toBe(false);
  });
});

describe('bundle cart lines', () => {
  it('fails closed until every option is chosen — no first-variant fallback', () => {
    const multi = base({ slug: 'multi', variants: [variant('a', 'Grey', 5), variant('b', 'Pink', 5)] });
    const components = componentsFor([multi]);
    expect(buildBundleCartLines(components, {}).ok).toBe(false);
    expect(bundleTotalIfComplete(components, {})).toBeNull();
  });

  it('emits one exact `${productId}-${vid}` line per component at variant price', () => {
    const multi = base({
      slug: 'multi',
      price: 100,
      variants: [variant('a', 'Grey', 5, 120), variant('b', 'Pink', 5, 130)],
    });
    const plain = base({ slug: 'plain', id: '33333333-3333-3333-3333-333333333333', price: 45.99, variants: null });
    const components = componentsFor([multi, plain]);
    const result = buildBundleCartLines(components, { [multi.id]: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0].id).toBe(`${multi.id}-b`);
    expect(result.lines[0].price).toBe(130);
    expect(result.lines[0].variant).toBe('Pink');
    expect(result.lines[1].id).toBe(plain.id);
    expect(result.total).toBe(175.99);
  });

  it('applies no bundle discount — the total is the sum of catalogue prices', () => {
    const a = base({ slug: 'a', price: 80 });
    const b = base({ slug: 'b', id: '44444444-4444-4444-4444-444444444444', price: 20 });
    const components = componentsFor([a, b]);
    const result = buildBundleCartLines(components, {});
    expect(result.ok && result.total).toBe(100);
  });
});

describe('bundle definitions', () => {
  it('has unique slugs and at least two components each', () => {
    const slugs = BUNDLE_DEFINITIONS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const b of BUNDLE_DEFINITIONS) {
      expect(b.componentSlugs.length).toBeGreaterThanOrEqual(2);
      expect(new Set(b.componentSlugs).size).toBe(b.componentSlugs.length);
    }
  });

  it('makes no savings or discount claim in its copy', () => {
    for (const b of BUNDLE_DEFINITIONS) {
      expect(`${b.name} ${b.intro}`.toLowerCase()).not.toMatch(/save|discount|% off|deal|bargain/);
    }
  });
});

describe('warehouse inventory outranks the flat stock field', () => {
  // Live catalogue reality: 45 supplier variants carry `stock: 0` alongside a
  // US warehouse record holding hundreds of units. Treating the flat field as
  // truth blocked checkout on genuinely available products.
  const withWarehouse = base({
    slug: 'warehouse',
    variants: [
      {
        vid: 'v-grey',
        variantNameEn: 'Grey',
        stock: 0,
        variantSellPrice: 111.99,
        inventories: [{ countryCode: 'US', totalInventory: 204, verifiedWarehouse: 1 }],
      },
    ],
  });

  it('treats a US-stocked option as purchasable despite stock: 0', () => {
    const [component] = componentsFor([withWarehouse]);
    expect(component.options.map((o) => o.vid)).toEqual(['v-grey']);
    expect(component.autoVariantId).toBe('v-grey');
  });

  it('still blocks an option whose US warehouse record is empty', () => {
    const empty = base({
      slug: 'empty',
      variants: [
        { vid: 'v', variantNameEn: 'Grey', stock: 99, inventories: [{ countryCode: 'US', totalInventory: 0 }] },
      ],
    });
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['empty'] };
    expect(evaluateBundle(def, new Map([['empty', empty]])).active).toBe(false);
  });

  it('blocks an option stocked only outside the US', () => {
    const cn = base({
      slug: 'cn',
      variants: [{ vid: 'v', variantNameEn: 'Grey', inventories: [{ countryCode: 'CN', totalInventory: 500 }] }],
    });
    const def = { slug: 's', name: 'S', intro: '', componentSlugs: ['cn'] };
    expect(evaluateBundle(def, new Map([['cn', cn]])).active).toBe(false);
  });
});
