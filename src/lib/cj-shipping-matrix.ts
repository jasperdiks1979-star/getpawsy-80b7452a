/**
 * CJ Dropshipping shipping matrix.
 *
 * Source of truth for which destination countries CJ can fulfil from each
 * warehouse, plus realistic delivery estimates. Used by:
 *   - `src/components/checkout/ShippingPrecheck.tsx` (frontend pre-check UI)
 *   - `supabase/functions/create-checkout/index.ts` (server-side validation)
 *
 * Keep this file and the inlined copy in `create-checkout/index.ts` in sync.
 */

export type WarehouseCode = "US" | "CN" | "DE" | "UNKNOWN";
export type CountryCode =
  | "US"
  | "CA"
  | "GB"
  | "NL"
  | "BE"
  | "DE"
  | "FR"
  | "AU";

export const SUPPORTED_COUNTRIES: { code: CountryCode; name: string; flag: string }[] = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
];

export interface ShippingQuote {
  supported: boolean;
  daysMin: number;
  daysMax: number;
  /** Carrier cost estimate (USD) — for internal margin reporting only. */
  carrierCostUsd: number;
}

const NOT_SUPPORTED: ShippingQuote = {
  supported: false,
  daysMin: 0,
  daysMax: 0,
  carrierCostUsd: 0,
};

/**
 * Normalise the raw `products.supplier_warehouse` value into a known code.
 * CJ tags inventory as "US", "CN", "DE", "unknown" or "none".
 */
export function normalizeWarehouse(raw: string | null | undefined): WarehouseCode {
  const v = (raw || "").trim().toUpperCase();
  if (v === "US") return "US";
  if (v === "CN") return "CN";
  if (v === "DE") return "DE";
  // "unknown" / "none" / "" → treat as global (CN-equivalent) so we never
  // falsely block a sale when CJ has multi-warehouse fulfilment available.
  return "UNKNOWN";
}

/**
 * Shipping matrix.
 *
 * Rules (sourced from CJ documentation + production audit):
 *   US warehouse → US only ground (3-7d). Cross-border to CA via CJPacket
 *                  (7-12d). Other destinations not reliably fulfilled.
 *   DE warehouse → EU + UK fast (4-9d). US/CA available via re-export
 *                  (7-14d). AU not supported.
 *   CN warehouse → Global via CJPacket (8-22d depending on lane).
 *   UNKNOWN      → Treat as CN (fallback, ships globally).
 */
const MATRIX: Record<WarehouseCode, Record<CountryCode, ShippingQuote>> = {
  US: {
    US: { supported: true, daysMin: 3, daysMax: 7, carrierCostUsd: 3.5 },
    CA: { supported: true, daysMin: 7, daysMax: 12, carrierCostUsd: 6.5 },
    GB: NOT_SUPPORTED,
    NL: NOT_SUPPORTED,
    BE: NOT_SUPPORTED,
    DE: NOT_SUPPORTED,
    FR: NOT_SUPPORTED,
    AU: NOT_SUPPORTED,
  },
  DE: {
    US: { supported: true, daysMin: 7, daysMax: 14, carrierCostUsd: 8.5 },
    CA: { supported: true, daysMin: 8, daysMax: 15, carrierCostUsd: 9.5 },
    GB: { supported: true, daysMin: 4, daysMax: 9, carrierCostUsd: 5.5 },
    NL: { supported: true, daysMin: 3, daysMax: 7, carrierCostUsd: 4.5 },
    BE: { supported: true, daysMin: 3, daysMax: 7, carrierCostUsd: 4.5 },
    DE: { supported: true, daysMin: 2, daysMax: 5, carrierCostUsd: 3.5 },
    FR: { supported: true, daysMin: 4, daysMax: 8, carrierCostUsd: 5.0 },
    AU: NOT_SUPPORTED,
  },
  CN: {
    US: { supported: true, daysMin: 8, daysMax: 15, carrierCostUsd: 4.5 },
    CA: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.5 },
    GB: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    NL: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    BE: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    DE: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    FR: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    AU: { supported: true, daysMin: 12, daysMax: 22, carrierCostUsd: 6.0 },
  },
  UNKNOWN: {
    US: { supported: true, daysMin: 8, daysMax: 15, carrierCostUsd: 4.5 },
    CA: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.5 },
    GB: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    NL: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    BE: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    DE: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    FR: { supported: true, daysMin: 10, daysMax: 18, carrierCostUsd: 5.0 },
    AU: { supported: true, daysMin: 12, daysMax: 22, carrierCostUsd: 6.0 },
  },
};

export function getShippingQuote(
  warehouse: string | null | undefined,
  country: CountryCode,
): ShippingQuote {
  const wh = normalizeWarehouse(warehouse);
  return MATRIX[wh][country] ?? NOT_SUPPORTED;
}

export interface CartLine {
  productId: string;
  name: string;
  warehouse: string | null | undefined;
}

export interface CartShippingCheck {
  ok: boolean;
  country: CountryCode;
  /** Combined delivery window across all products (slowest line). */
  daysMin: number;
  daysMax: number;
  perProduct: Array<{
    productId: string;
    name: string;
    warehouse: WarehouseCode;
    quote: ShippingQuote;
  }>;
  blocked: Array<{ productId: string; name: string; warehouse: WarehouseCode }>;
}

export function checkCartShipping(
  lines: CartLine[],
  country: CountryCode,
): CartShippingCheck {
  const perProduct = lines.map((l) => {
    const warehouse = normalizeWarehouse(l.warehouse);
    return {
      productId: l.productId,
      name: l.name,
      warehouse,
      quote: getShippingQuote(l.warehouse, country),
    };
  });
  const blocked = perProduct
    .filter((p) => !p.quote.supported)
    .map(({ productId, name, warehouse }) => ({ productId, name, warehouse }));
  const supported = perProduct.filter((p) => p.quote.supported);
  const daysMin = supported.length
    ? Math.max(...supported.map((p) => p.quote.daysMin))
    : 0;
  const daysMax = supported.length
    ? Math.max(...supported.map((p) => p.quote.daysMax))
    : 0;
  return {
    ok: blocked.length === 0,
    country,
    daysMin,
    daysMax,
    perProduct,
    blocked,
  };
}