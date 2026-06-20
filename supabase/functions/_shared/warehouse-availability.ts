// Edge mirror of src/lib/warehouse-availability.ts (Item 14).

export type WarehouseSource = "US" | "EU" | "CN" | "NONE";
export type WarehouseStatus =
  | "in_stock_us"
  | "eu_fallback"
  | "cn_fallback"
  | "sold_out";

export interface WarehouseProductRow {
  stock?: number | null;
  is_active?: boolean | null;
  us_stock?: number | null;
  eu_stock?: number | null;
  cn_stock?: number | null;
}

export interface WarehouseResolution {
  status: WarehouseStatus;
  source: WarehouseSource;
  pinterestEligible: boolean;
  isFallback: boolean;
  isPurchasable: boolean;
  estimatedDelivery: string | null;
  shippingLabel: string | null;
  label: "In Stock" | "Available" | "Sold Out";
}

const SOLD_OUT: WarehouseResolution = {
  status: "sold_out",
  source: "NONE",
  pinterestEligible: false,
  isFallback: false,
  isPurchasable: false,
  estimatedDelivery: null,
  shippingLabel: null,
  label: "Sold Out",
};

export function resolveWarehouse(p: WarehouseProductRow | null | undefined): WarehouseResolution {
  if (!p) return SOLD_OUT;
  if (p.is_active === false) return SOLD_OUT;

  const us = Number(p.us_stock ?? 0);
  const eu = Number(p.eu_stock ?? 0);
  const cn = Number(p.cn_stock ?? 0);
  const hasCols = p.us_stock != null || p.eu_stock != null || p.cn_stock != null;

  if (hasCols) {
    if (us > 0) {
      return {
        status: "in_stock_us", source: "US", pinterestEligible: true,
        isFallback: false, isPurchasable: true,
        estimatedDelivery: "3-7 business days", shippingLabel: "Fast US Shipping",
        label: "In Stock",
      };
    }
    if (eu > 0) {
      return {
        status: "eu_fallback", source: "EU", pinterestEligible: true,
        isFallback: true, isPurchasable: true,
        estimatedDelivery: "7-15 business days", shippingLabel: "Ships From Overseas",
        label: "Available",
      };
    }
    if (cn > 0) {
      return {
        status: "cn_fallback", source: "CN", pinterestEligible: true,
        isFallback: true, isPurchasable: true,
        estimatedDelivery: "7-15 business days", shippingLabel: "Ships From Overseas",
        label: "Available",
      };
    }
    return SOLD_OUT;
  }

  if (p.stock === 0) return SOLD_OUT;
  return {
    status: "in_stock_us", source: "US", pinterestEligible: true,
    isFallback: false, isPurchasable: true,
    estimatedDelivery: "3-7 business days", shippingLabel: "Fast US Shipping",
    label: "In Stock",
  };
}

export function fallbackCopyTags(source: WarehouseSource): string[] {
  if (source === "CN") return ["Back In Stock", "Still Available", "Worldwide Shipping"];
  if (source === "EU") return ["EU Warehouse", "Fast EU Shipping", "Limited Stock"];
  return [];
}

export function pickInventoryHook(source: WarehouseSource): string | null {
  const tags = fallbackCopyTags(source);
  if (tags.length === 0) return null;
  return tags[Math.floor(Math.random() * tags.length)];
}

export function computeInventoryScore(p: WarehouseProductRow | null | undefined): number {
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

export function computeInventoryPriority(p: WarehouseProductRow | null | undefined): number {
  if (!p) return 0;
  const us = Number(p.us_stock ?? 0);
  const eu = Number(p.eu_stock ?? 0);
  const cn = Number(p.cn_stock ?? 0);
  if (us > 0) return 100;
  if (eu > 0) return 70;
  if (cn > 0) return 40;
  return 0;
}

export function deriveWarehouseFlags(p: WarehouseProductRow): {
  primary_warehouse: WarehouseSource;
  fallback_active: boolean;
} {
  const r = resolveWarehouse(p);
  return { primary_warehouse: r.source, fallback_active: r.isFallback };
}
