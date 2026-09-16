/**
 * Curated bundles ("sets") — Phase 4 B.
 *
 * SAFETY MODEL
 * ------------
 * A bundle is nothing more than a curated list of catalogue products that can
 * genuinely ship together. It never creates a new SKU and never picks an
 * option for the shopper:
 *
 *  - every component with more than one purchasable option REQUIRES an
 *    explicit selection before the set can be added (no first-variant
 *    fallback, ever);
 *  - a component with exactly one purchasable option auto-selects that one —
 *    there is nothing to choose;
 *  - sold-out options cannot be selected;
 *  - each component enters the cart as its own line carrying the exact
 *    supplier variant id (`${uuid}-${vid}`), so `create-checkout` re-validates
 *    identity, price and stock line by line exactly as for a PDP add;
 *  - no discount is applied. The server prices every line at the canonical
 *    variant price, so a bundle discount would be a promise checkout cannot
 *    keep. A set is sold as convenience, not as a saving, and no saving is
 *    claimed anywhere.
 *
 * ACTIVATION GATES (evaluated at runtime against the live catalogue):
 *  active, merchandised, US warehouse, stock > 0, one supplier for the whole
 *  set, and at least one purchasable option per component. A set that fails
 *  any gate is not shown.
 */

import {
  isVariantPurchasable,
  parseQuickAddVariants,
  quickAddUnitPrice,
  variantLabel,
  type QuickAddItem,
  type QuickAddVariant,
} from '@/lib/quickAdd';

export interface BundleDefinition {
  slug: string;
  name: string;
  /** Plain description of what the set is for. No savings or outcome claims. */
  intro: string;
  componentSlugs: string[];
}

/** Curated sets. Each was checked against the Phase 1 fulfilment-safety rule. */
export const BUNDLE_DEFINITIONS: BundleDefinition[] = [
  {
    slug: 'new-cat-starter-set',
    name: 'New Cat Starter Set',
    intro: 'The three things a cat needs on day one indoors: a litter box, a feeding bowl and something to work for their food.',
    componentSlugs: [
      'front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265',
      'pet-slow-food-bowl-anti-choking-cat-bowl-3in1-interactive-dog-feeder-puzzle-29d9',
      'cat-puzzle-toy-with-ball-and-spring-loaded-wand-felt-indoor-cat-toy-box-suction-84be',
    ],
  },
  {
    slug: 'vertical-territory-set',
    name: 'Vertical Territory Set',
    intro: 'A tall tower plus steps, so a cat can reach height in a room where floor space is limited.',
    componentSlugs: [
      '54-cat-tree-tower-multi-level-with-sisal-grab-post-indoor-apartment-with-ladder-plush-toys-rest-and-',
      'adjustable-height-3-step-4-step-cat-stairs-with-cat-scratching-post-cat-condo-toy-ball-for-bed-sofa-',
    ],
  },
  {
    slug: 'scratch-free-living-room-set',
    name: 'Scratch-Free Living Room Set',
    intro: 'Sisal posts to scratch and a puzzle to hunt — an alternative target for the two behaviours that cost sofas.',
    componentSlugs: [
      '54-cat-tree-tower-multi-level-with-sisal-grab-post-indoor-apartment-with-ladder-plush-toys-rest-and-',
      'cat-puzzle-toy-with-ball-and-spring-loaded-wand-felt-indoor-cat-toy-box-suction-84be',
    ],
  },
  {
    slug: 'multi-cat-litter-set',
    name: 'Multi-Cat Litter Set',
    intro: 'Two separate litter boxes for a household with more than one cat, so neither has to queue.',
    componentSlugs: [
      'stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included',
      '6-in-deep-cat-litter-box-odor-free-litter-box-with-filtering-foot-board',
    ],
  },
  {
    slug: 'feeding-and-play-corner-set',
    name: 'Feeding & Play Corner',
    intro: 'A slow feeder for mealtimes and a self-rolling ball for the hours in between.',
    componentSlugs: [
      'pet-slow-food-bowl-anti-choking-cat-bowl-3in1-interactive-dog-feeder-puzzle-29d9',
      'interactive-rolling-cat-ball',
    ],
  },
];

export interface BundleCatalogProduct {
  id: string;
  slug: string;
  name: string;
  price: number | null;
  image_url: string | null;
  category?: string | null;
  is_active?: boolean | null;
  merch_hidden?: boolean | null;
  supplier_name?: string | null;
  supplier_warehouse?: string | null;
  stock?: number | null;
  variants?: unknown;
}

export type ComponentBlockReason =
  | 'missing'
  | 'inactive'
  | 'not_merchandised'
  | 'not_us_warehouse'
  | 'out_of_stock'
  | 'no_purchasable_option'
  | 'no_price';

export interface BundleComponent {
  product: BundleCatalogProduct;
  /** Purchasable options only. Empty means the product has no variant list. */
  options: QuickAddVariant[];
  /** True when the shopper must pick — more than one purchasable option. */
  requiresSelection: boolean;
  /** Auto-selected variant id when there is exactly one option. */
  autoVariantId: string | null;
  /** All options, including sold-out ones (rendered disabled). */
  allOptions: QuickAddVariant[];
}

export type BundleStatus =
  | { active: true; components: BundleComponent[]; supplier: string }
  | { active: false; reasons: Array<{ slug: string; reason: ComponentBlockReason | 'supplier_mismatch' }> };

function componentBlockReason(p: BundleCatalogProduct | undefined): ComponentBlockReason | null {
  if (!p) return 'missing';
  if (p.is_active === false) return 'inactive';
  if (p.merch_hidden === true) return 'not_merchandised';
  if (String(p.supplier_warehouse ?? '').toUpperCase() !== 'US') return 'not_us_warehouse';
  if (!(Number(p.stock ?? 0) > 0)) return 'out_of_stock';
  if (!(Number(p.price ?? 0) > 0)) return 'no_price';
  const variants = parseQuickAddVariants(p.variants);
  if (variants.length > 0 && variants.filter(isVariantPurchasable).length === 0) return 'no_purchasable_option';
  return null;
}

/** Runtime activation gate for one bundle definition. */
export function evaluateBundle(
  definition: BundleDefinition,
  catalog: Map<string, BundleCatalogProduct>,
): BundleStatus {
  const reasons: Array<{ slug: string; reason: ComponentBlockReason | 'supplier_mismatch' }> = [];
  const components: BundleComponent[] = [];

  for (const slug of definition.componentSlugs) {
    const product = catalog.get(slug);
    const reason = componentBlockReason(product);
    if (reason || !product) {
      reasons.push({ slug, reason: reason ?? 'missing' });
      continue;
    }
    const allOptions = parseQuickAddVariants(product.variants);
    const options = allOptions.filter(isVariantPurchasable).filter((v) => String(v.vid ?? '').trim().length > 0);
    // A product whose options carry no supplier id cannot produce an exact line.
    if (allOptions.length > 0 && options.length === 0) {
      reasons.push({ slug, reason: 'no_purchasable_option' });
      continue;
    }
    components.push({
      product,
      options,
      allOptions,
      requiresSelection: options.length > 1,
      autoVariantId: options.length === 1 ? String(options[0].vid) : null,
    });
  }

  if (reasons.length > 0) return { active: false, reasons };

  const suppliers = new Set(components.map((c) => String(c.product.supplier_name ?? '').trim().toLowerCase()));
  if (suppliers.size > 1) {
    return { active: false, reasons: [{ slug: definition.slug, reason: 'supplier_mismatch' }] };
  }

  return { active: true, components, supplier: components[0]?.product.supplier_name ?? '' };
}

/** Selection map: product id -> chosen variant id (or null for no-variant items). */
export type BundleSelection = Record<string, string | null>;

/** Pre-fills the selections that need no choice. Never guesses. */
export function initialSelection(components: BundleComponent[]): BundleSelection {
  const out: BundleSelection = {};
  for (const c of components) {
    if (c.allOptions.length === 0) out[c.product.id] = null;
    else if (!c.requiresSelection && c.autoVariantId) out[c.product.id] = c.autoVariantId;
  }
  return out;
}

export function findOption(component: BundleComponent, variantId: string | null): QuickAddVariant | null {
  if (!variantId) return null;
  return component.options.find((v) => String(v.vid) === variantId) ?? null;
}

/** Components still waiting for an explicit, valid choice. */
export function missingSelections(components: BundleComponent[], selection: BundleSelection): string[] {
  return components
    .filter((c) => {
      if (c.allOptions.length === 0) return false;
      const chosen = selection[c.product.id];
      if (!chosen) return true;
      return !findOption(c, chosen);
    })
    .map((c) => c.product.id);
}

export interface BundleLine extends QuickAddItem {
  quantity: 1;
}

export type BundleAddResult =
  | { ok: true; lines: BundleLine[]; total: number }
  | { ok: false; missing: string[] };

/**
 * Builds the exact cart lines for a set. Fails closed when any component still
 * needs a choice — there is deliberately no fallback branch.
 */
export function buildBundleCartLines(
  components: BundleComponent[],
  selection: BundleSelection,
): BundleAddResult {
  const missing = missingSelections(components, selection);
  if (missing.length > 0) return { ok: false, missing };

  const lines: BundleLine[] = components.map((c) => {
    const variant = findOption(c, selection[c.product.id] ?? null);
    const basePrice = Number(c.product.price ?? 0);
    const price = quickAddUnitPrice(basePrice, variant);
    const label = variant ? variantLabel(variant) : '';
    return {
      id: variant ? `${c.product.id}-${String(variant.vid)}` : c.product.id,
      slug: c.product.slug,
      name: label ? `${c.product.name} - ${label}` : c.product.name,
      price,
      image: variant?.variantImage || c.product.image_url || '/placeholder.svg',
      variant: label || undefined,
      category: c.product.category ?? undefined,
      quantity: 1,
    };
  });

  const total = Math.round(lines.reduce((sum, l) => sum + l.price, 0) * 100) / 100;
  return { ok: true, lines, total };
}

/** Price shown before every option is chosen: null means "not priced yet". */
export function bundleTotalIfComplete(
  components: BundleComponent[],
  selection: BundleSelection,
): number | null {
  const result = buildBundleCartLines(components, selection);
  return result.ok ? result.total : null;
}
