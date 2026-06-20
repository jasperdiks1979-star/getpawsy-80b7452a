/**
 * Multi-warehouse availability resolver (Item 14).
 *
 * Priority: US > EU > CN. Products with any warehouse > 0 stay purchasable
 * to prevent revenue loss. Only `sold_out` when every warehouse is 0.
 *
 * Legacy products without per-warehouse columns fall back to the existing
 * `stock` field and behave exactly like before.
 */

export type WarehouseSource = 'US' | 'EU' | 'CN' | 'NONE';
export type WarehouseStatus =
  | 'in_stock_us'
  | 'eu_fallback'
  | 'cn_fallback'
  | 'sold_out';

export interface WarehouseProduct {
  stock?: number | null;
  is_active?: boolean | null;
  us_stock?: number | null;
  eu_stock?: number | null;
  cn_stock?: number | null;
}

export interface WarehouseResolution {
  status: WarehouseStatus;
  label: 'In Stock' | 'Available' | 'Sold Out';
  shippingLabel: 'Fast US Shipping' | 'Ships From Overseas' | null;
  estimatedDelivery: '3-7 business days' | '7-15 business days' | null;
  pinterestEligible: boolean;
  source: WarehouseSource;
  isFallback: boolean;
  isPurchasable: boolean;
}

export interface WarehouseProductExtended extends WarehouseProduct {
  effective_stock?: number | null;
  inventory_source?: WarehouseSource | string | null;
  inventory_priority?: number | null;
  inventory_score?: number | null;
}

const SOLD_OUT: WarehouseResolution = {
  status: 'sold_out',
  label: 'Sold Out',
  shippingLabel: null,
  estimatedDelivery: null,
  pinterestEligible: false,
  source: 'NONE',
  isFallback: false,
  isPurchasable: false,
};

function hasAnyWarehouseColumn(p: WarehouseProduct): boolean {
  return (
    p.us_stock !== undefined && p.us_stock !== null
  ) || (
    p.eu_stock !== undefined && p.eu_stock !== null
  ) || (
    p.cn_stock !== undefined && p.cn_stock !== null
  );
}

export function resolveWarehouse(
  product: WarehouseProduct | null | undefined,
): WarehouseResolution {
  if (!product) return SOLD_OUT;
  if (product.is_active === false) return SOLD_OUT;

  const us = Number(product.us_stock ?? 0);
  const eu = Number(product.eu_stock ?? 0);
  const cn = Number(product.cn_stock ?? 0);

  if (hasAnyWarehouseColumn(product)) {
    if (us > 0) {
      return {
        status: 'in_stock_us',
        label: 'In Stock',
        shippingLabel: 'Fast US Shipping',
        estimatedDelivery: '3-7 business days',
        pinterestEligible: true,
        source: 'US',
        isFallback: false,
        isPurchasable: true,
      };
    }
    if (eu > 0) {
      return {
        status: 'eu_fallback',
        label: 'Available',
        shippingLabel: 'Ships From Overseas',
        estimatedDelivery: '7-15 business days',
        pinterestEligible: true,
        source: 'EU',
        isFallback: true,
        isPurchasable: true,
      };
    }
    if (cn > 0) {
      return {
        status: 'cn_fallback',
        label: 'Available',
        shippingLabel: 'Ships From Overseas',
        estimatedDelivery: '7-15 business days',
        pinterestEligible: true,
        source: 'CN',
        isFallback: true,
        isPurchasable: true,
      };
    }
    return SOLD_OUT;
  }

  // Legacy fallback: rely on aggregate stock column.
  if (product.stock === 0) return SOLD_OUT;
  return {
    status: 'in_stock_us',
    label: 'In Stock',
    shippingLabel: 'Fast US Shipping',
    estimatedDelivery: '3-7 business days',
    pinterestEligible: true,
    source: 'US',
    isFallback: false,
    isPurchasable: true,
  };
}

/** Pinterest copy tags for CN/EU fallback products. Never includes "Out Of Stock". */
export function fallbackCopyTags(source: WarehouseSource): string[] {
  if (source === 'CN') return ['Back In Stock', 'Still Available', 'Worldwide Shipping'];
  if (source === 'EU') return ['EU Warehouse', 'Fast EU Shipping', 'Limited Stock'];
  return [];
}

/** Hook copy injected into Pinterest creatives for non-US fallback products. */
export function pickInventoryHook(source: WarehouseSource): string | null {
  const tags = fallbackCopyTags(source);
  if (tags.length === 0) return null;
  return tags[Math.floor(Math.random() * tags.length)];
}

/** Mirrors the DB inventory_score generated column. */
export function computeInventoryScore(p: WarehouseProduct | null | undefined): number {
  if (!p) return 0;
  const us = Number(p.us_stock ?? 0);
  const eu = Number(p.eu_stock ?? 0);
  const cn = Number(p.cn_stock ?? 0);
  if (us > 50) return 100;
  if (us >= 20) return 90;
  if (us >= 1) return 75;
  if (eu > 0) return 60;
  if (cn > 0) return 50;
  return 0;
}

/** Inventory priority mirrors DB column (US=100, EU=70, CN=40, none=0). */
export function computeInventoryPriority(p: WarehouseProduct | null | undefined): number {
  if (!p) return 0;
  const us = Number(p.us_stock ?? 0);
  const eu = Number(p.eu_stock ?? 0);
  const cn = Number(p.cn_stock ?? 0);
  if (us > 0) return 100;
  if (eu > 0) return 70;
  if (cn > 0) return 40;
  return 0;
}
