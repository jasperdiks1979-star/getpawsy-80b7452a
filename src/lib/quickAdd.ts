/**
 * Quick add-to-cart safety rules (non-PDP entry points).
 *
 * WHY THIS EXISTS
 * ---------------
 * `create-checkout` resolves the EXACT supplier variant from the cart line id
 * (`${productUuid}-${vid}`). `resolveExactVariant` fails closed when a product
 * has more than one variant and the line carries no variant id
 * (`variant_required`). Quick-add buttons outside the PDP used to add the bare
 * product id, so a multi-variant product could sit in the cart and only fail at
 * checkout.
 *
 * INVARIANT: a multi-variant product must never reach checkout without an
 * explicit, valid, in-stock variant.
 *
 * Rules (mirror of the server):
 *  - variants unknown / not loaded  -> send the shopper to the PDP
 *  - 0 or 1 variant in the catalog  -> quick add is exact (server accepts it)
 *  - >1 variants, exactly 1 purchasable -> quick add that exact variant
 *  - >1 purchasable variants        -> PDP / variant chooser, never a default
 *  - nothing purchasable            -> unavailable
 */

export interface QuickAddVariant {
  vid?: string | number | null;
  variantKey?: string | null;
  variantNameEn?: string | null;
  variantSellPrice?: number | string | null;
  variantImage?: string | null;
  variantSku?: string | null;
  variantStock?: number | null;
  stock?: number | null;
}

export interface QuickAddProduct {
  id: string;
  slug?: string | null;
  name: string;
  price?: number | null;
  image_url?: string | null;
  category?: string | null;
  /** `undefined` means "not loaded" and is treated as unknown (fail safe). */
  variants?: unknown;
  stock?: number | null;
  is_active?: boolean | null;
}

export interface QuickAddItem {
  id: string;
  slug?: string;
  name: string;
  price: number;
  image: string;
  variant?: string;
  category?: string;
}

export type QuickAddPlan =
  | { kind: 'add'; item: QuickAddItem; variantId: string | null }
  | { kind: 'choose'; reason: 'variants_unknown' | 'multiple_variants'; url: string }
  | { kind: 'unavailable'; reason: 'out_of_stock' | 'inactive' };

const PLACEHOLDER_LABEL = /^(option|default|standard|-|n\/a)$/i;

/** Tolerant parser: anything that is not an array of objects yields []. */
export function parseQuickAddVariants(raw: unknown): QuickAddVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is QuickAddVariant => !!v && typeof v === 'object');
}

/**
 * A variant is purchasable unless it carries its own stock figure that is <= 0.
 * Missing stock data means product-level stock governs (same as the server).
 */
/**
 * Supplier per-warehouse inventory for a variant (mirrors the server's
 * `variantWarehouseStockOf`). It outranks the flat `stock` field, which the
 * supplier feed frequently leaves at 0 next to a warehouse record holding
 * hundreds of units.
 */
export function variantWarehouseStock(variant: QuickAddVariant, countryCode = 'US'): number | null {
  const inventories = (variant as { inventories?: unknown }).inventories;
  if (!Array.isArray(inventories)) return null;
  let best: number | null = null;
  for (const entry of inventories) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    if (String(rec.countryCode ?? '').toUpperCase() !== countryCode.toUpperCase()) continue;
    for (const key of ['totalInventory', 'cjInventory', 'inventoryNum', 'storageNum']) {
      const n = Number(rec[key]);
      if (Number.isFinite(n)) best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

export function isVariantPurchasable(variant: QuickAddVariant): boolean {
  const warehouse = variantWarehouseStock(variant);
  if (warehouse !== null) return warehouse > 0;
  const raw = variant.variantStock ?? variant.stock;
  if (raw === null || raw === undefined) return true;
  const n = Number(raw);
  if (!Number.isFinite(n)) return true;
  return n > 0;
}

export function quickAddProductUrl(product: Pick<QuickAddProduct, 'id' | 'slug'>): string {
  const slug = typeof product.slug === 'string' ? product.slug.trim() : '';
  return slug ? `/products/${slug}` : `/products/${product.id}`;
}

export function variantLabel(variant: QuickAddVariant): string {
  const raw = String(variant.variantNameEn ?? variant.variantKey ?? '').trim();
  return PLACEHOLDER_LABEL.test(raw) ? '' : raw;
}

/**
 * Canonical unit price of an exact variant — identical to the server's
 * `canonicalUnitPrice`, so the cart line always survives price parity.
 */
export function quickAddUnitPrice(basePrice: number, variant?: QuickAddVariant | null): number {
  const vp = Number(variant?.variantSellPrice);
  if (Number.isFinite(vp) && vp > 0) return Math.round(vp * 100) / 100;
  return Math.round(basePrice * 100) / 100;
}

export function resolveQuickAddPlan(
  product: QuickAddProduct,
  options: { inStock?: boolean; displayName?: string; displayPrice?: number } = {},
): QuickAddPlan {
  const url = quickAddProductUrl(product);

  if (product.is_active === false) return { kind: 'unavailable', reason: 'inactive' };
  if (options.inStock === false) return { kind: 'unavailable', reason: 'out_of_stock' };

  const basePrice = Number(
    options.displayPrice !== undefined ? options.displayPrice : product.price ?? 0,
  );
  const name = options.displayName ?? product.name;
  const image = product.image_url || '/placeholder.svg';
  const baseItem: QuickAddItem = {
    id: product.id,
    slug: product.slug ?? undefined,
    name,
    price: Math.round(basePrice * 100) / 100,
    image,
    category: product.category ?? undefined,
  };

  // Not loaded -> we cannot prove the product is single-variant. Fail safe.
  if (product.variants === undefined || product.variants === null) {
    return { kind: 'choose', reason: 'variants_unknown', url };
  }

  const variants = parseQuickAddVariants(product.variants);
  if (variants.length === 0) return { kind: 'add', item: baseItem, variantId: null };

  if (variants.length === 1) {
    const only = variants[0];
    if (!isVariantPurchasable(only)) return { kind: 'unavailable', reason: 'out_of_stock' };
    return buildVariantAdd(product, only, baseItem, basePrice);
  }

  const purchasable = variants.filter(isVariantPurchasable);
  if (purchasable.length === 0) return { kind: 'unavailable', reason: 'out_of_stock' };
  if (purchasable.length === 1) {
    return buildVariantAdd(product, purchasable[0], baseItem, basePrice);
  }
  return { kind: 'choose', reason: 'multiple_variants', url };
}

function buildVariantAdd(
  product: QuickAddProduct,
  variant: QuickAddVariant,
  baseItem: QuickAddItem,
  basePrice: number,
): QuickAddPlan {
  const vid = variant.vid === null || variant.vid === undefined ? '' : String(variant.vid).trim();
  // No exact supplier id -> we cannot build an exact line. Send to the PDP.
  if (!vid) {
    return { kind: 'choose', reason: 'variants_unknown', url: quickAddProductUrl(product) };
  }
  const label = variantLabel(variant);
  return {
    kind: 'add',
    variantId: vid,
    item: {
      ...baseItem,
      id: `${product.id}-${vid}`,
      name: label ? `${baseItem.name} - ${label}` : baseItem.name,
      price: quickAddUnitPrice(basePrice, variant),
      image: variant.variantImage || baseItem.image,
      variant: label || undefined,
    },
  };
}

/** Cart-line id -> base product uuid, mirroring the server's `extractProductId`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function cartLineProductId(lineId: string): string | null {
  const m = UUID_RE.exec(String(lineId ?? ''));
  return m ? m[0] : null;
}

/** True when the cart line carries no explicit variant id suffix. */
export function cartLineHasVariant(lineId: string): boolean {
  const base = cartLineProductId(lineId);
  if (!base) return false;
  return String(lineId).slice(base.length).replace(/^[_-]/, '').length > 0;
}

/**
 * Legacy-cart recovery: a stored line needs a variant choice when it carries no
 * variant id while the catalog product has more than one variant.
 */
export function cartLineNeedsVariantChoice(lineId: string, variants: unknown): boolean {
  if (cartLineHasVariant(lineId)) return false;
  return parseQuickAddVariants(variants).length > 1;
}
