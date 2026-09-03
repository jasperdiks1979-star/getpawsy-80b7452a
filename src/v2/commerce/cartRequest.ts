/**
 * V2 cart request contract.
 *
 * The client may only ever assert *identity* and *quantity*. Prices, discounts,
 * shipping and tax are resolved server-side. Any client-supplied price is
 * ignored — never trusted, never echoed into a quote.
 *
 * Legacy contrast: `CartItem` in `src/contexts/CartContext.tsx` carries
 * `{ id, name, price, image, quantity, variant?: string }`, where `id` is
 * `${product.id}-${vid}` string-concatenated and `variant` is a *display label*.
 * That shape loses the exact CJ `vid`, which is why
 * `supabase/functions/create-cj-order/index.ts` falls back to `variants[0]`.
 */

export interface V2CartLineRequest {
  /** Internal product id (products.id UUID). */
  readonly productId: string;
  /** Internal/exact variant id (V2 variant id, e.g. `cjv_<vid>`). */
  readonly variantId: string;
  /** CJ product id (products.cj_product_id / variant `pid`). */
  readonly cjProductId: string;
  /** CJ variant id (`vid`). Mandatory — no positional fallback exists. */
  readonly cjVariantId: string;
  /** Supplier SKU (`variantSku`). */
  readonly sku: string;
  readonly quantity: number;
}

export interface V2CartRequest {
  readonly lines: readonly V2CartLineRequest[];
  /** Optional promo code; validated and priced server-side only. */
  readonly promoCode?: string;
  /** ISO-3166 alpha-2 destination. */
  readonly destinationCountry: string;
}

export type CartRequestErrorCode =
  | "empty_cart"
  | "missing_product_id"
  | "missing_variant_id"
  | "missing_cj_product_id"
  | "missing_cj_variant_id"
  | "missing_sku"
  | "invalid_quantity"
  | "duplicate_variant"
  | "missing_destination_country"
  | "client_price_supplied";

export interface CartRequestError {
  readonly code: CartRequestErrorCode;
  readonly message: string;
  readonly index?: number;
}

export type CartRequestValidation =
  | { readonly ok: true; readonly request: V2CartRequest; readonly errors?: undefined }
  | { readonly ok: false; readonly request?: undefined; readonly errors: readonly CartRequestError[] };

/** Fields a legacy client might try to smuggle in. All are rejected outright. */
const FORBIDDEN_CLIENT_FIELDS = [
  "price",
  "unitPrice",
  "unitPriceCents",
  "priceCents",
  "total",
  "totalPrice",
  "discount",
  "discountPercent",
  "discountedPrice",
  "variantSellPrice",
] as const;

const MAX_QUANTITY_PER_LINE = 99;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseCartRequest(input: unknown): CartRequestValidation {
  const errors: CartRequestError[] = [];
  const raw = (input ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(raw["lines"]) ? (raw["lines"] as unknown[]) : [];

  const destinationCountry =
    typeof raw["destinationCountry"] === "string" ? raw["destinationCountry"].trim().toUpperCase() : "";
  if (destinationCountry.length !== 2) {
    errors.push({ code: "missing_destination_country", message: "destinationCountry must be ISO-3166 alpha-2" });
  }

  if (rawLines.length === 0) {
    errors.push({ code: "empty_cart", message: "Cart has no lines" });
  }

  const seen = new Set<string>();
  const lines: V2CartLineRequest[] = [];

  rawLines.forEach((entry, index) => {
    const line = (entry ?? {}) as Record<string, unknown>;

    for (const field of FORBIDDEN_CLIENT_FIELDS) {
      if (line[field] !== undefined) {
        errors.push({
          code: "client_price_supplied",
          message: `Line ${index} supplied client-authoritative field "${field}"; prices are server-resolved`,
          index,
        });
      }
    }

    if (!nonEmpty(line["productId"]))
      errors.push({ code: "missing_product_id", message: `Line ${index} has no productId`, index });
    if (!nonEmpty(line["variantId"]))
      errors.push({ code: "missing_variant_id", message: `Line ${index} has no variantId`, index });
    if (!nonEmpty(line["cjProductId"]))
      errors.push({ code: "missing_cj_product_id", message: `Line ${index} has no cjProductId`, index });
    if (!nonEmpty(line["cjVariantId"]))
      errors.push({ code: "missing_cj_variant_id", message: `Line ${index} has no cjVariantId (vid)`, index });
    if (!nonEmpty(line["sku"]))
      errors.push({ code: "missing_sku", message: `Line ${index} has no sku`, index });

    const quantity = line["quantity"];
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY_PER_LINE) {
      errors.push({ code: "invalid_quantity", message: `Line ${index} has invalid quantity`, index });
    }

    if (nonEmpty(line["cjVariantId"])) {
      const key = `${String(line["productId"])}::${String(line["cjVariantId"])}`;
      if (seen.has(key)) {
        errors.push({ code: "duplicate_variant", message: `Line ${index} duplicates an earlier variant`, index });
      }
      seen.add(key);
    }

    if (
      nonEmpty(line["productId"]) &&
      nonEmpty(line["variantId"]) &&
      nonEmpty(line["cjProductId"]) &&
      nonEmpty(line["cjVariantId"]) &&
      nonEmpty(line["sku"]) &&
      typeof quantity === "number"
    ) {
      lines.push({
        productId: String(line["productId"]).trim(),
        variantId: String(line["variantId"]).trim(),
        cjProductId: String(line["cjProductId"]).trim(),
        cjVariantId: String(line["cjVariantId"]).trim(),
        sku: String(line["sku"]).trim(),
        quantity,
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  const promoCode = nonEmpty(raw["promoCode"]) ? String(raw["promoCode"]).trim().toUpperCase() : null;
  return {
    ok: true,
    request: { lines, destinationCountry, ...(promoCode === null ? {} : { promoCode }) },
  };
}

/**
 * Best-effort upgrade of a legacy cart item to a V2 cart line. Returns null
 * when the exact CJ variant identity is not recoverable — callers MUST then
 * re-resolve from the catalog instead of guessing.
 */
export interface LegacyCartItemLike {
  readonly id?: unknown;
  readonly quantity?: unknown;
  readonly variant?: unknown;
  readonly [key: string]: unknown;
}

export function legacyCartItemToV2Line(
  item: LegacyCartItemLike,
  resolve: (productId: string, vidHint: string | null) => Omit<V2CartLineRequest, "quantity"> | null,
): V2CartLineRequest | null {
  const rawId = nonEmpty(item.id) ? item.id.trim() : null;
  if (rawId === null) return null;
  const quantity = typeof item.quantity === "number" ? item.quantity : NaN;
  if (!Number.isInteger(quantity) || quantity <= 0) return null;

  // Legacy id shape is `${productId}` or `${productId}-${vid}`.
  const dash = rawId.lastIndexOf("-");
  const candidateVid = dash > 0 ? rawId.slice(dash + 1) : "";
  const productId = dash > 0 && /^\d+$/.test(candidateVid) === false && candidateVid.length >= 8 ? rawId.slice(0, dash) : rawId;
  const vidHint = productId === rawId ? null : candidateVid;

  const identity = resolve(productId, vidHint);
  if (identity === null) return null;
  if (!nonEmpty(identity.cjVariantId)) return null;
  return { ...identity, quantity };
}
