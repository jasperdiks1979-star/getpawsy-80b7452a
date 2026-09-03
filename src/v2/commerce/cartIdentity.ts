/**
 * Bridge between the legacy `CartItem` (src/contexts/CartContext.tsx) and V2
 * exact identity.
 *
 * The legacy item stays byte-identical when the V2 UI flag is OFF. When ON, an
 * additional `v2` object is attached carrying the exact identifiers. A V2 cart
 * line can never exist without an exact `cjVariantId` — `buildCartIdentity`
 * returns null instead of guessing.
 */

import type { V2CartLineRequest } from "./cartRequest";

export interface V2CartIdentity {
  readonly productId: string;
  readonly variantId: string;
  readonly cjProductId: string;
  readonly cjVariantId: string;
  readonly sku: string;
}

export interface LegacyCartItemWithV2 {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  slug?: string;
  variant?: string;
  category?: string;
  /** Present only when the V2 UI flag was on at add-to-cart time. */
  v2?: V2CartIdentity;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Returns null unless every exact identifier is present. Never positional. */
export function buildCartIdentity(input: {
  productId?: unknown;
  variantId?: unknown;
  cjProductId?: unknown;
  cjVariantId?: unknown;
  sku?: unknown;
}): V2CartIdentity | null {
  const { productId, variantId, cjProductId, cjVariantId, sku } = input;
  if (!nonEmpty(productId) || !nonEmpty(cjProductId) || !nonEmpty(cjVariantId) || !nonEmpty(sku)) {
    return null;
  }
  return {
    productId: productId.trim(),
    variantId: nonEmpty(variantId) ? variantId.trim() : `cjv_${cjVariantId.trim()}`,
    cjProductId: cjProductId.trim(),
    cjVariantId: cjVariantId.trim(),
    sku: sku.trim(),
  };
}

/** Drops a malformed `v2` block during localStorage hydration; keeps the legacy item. */
export function sanitizeCartIdentity(value: unknown): V2CartIdentity | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const identity = buildCartIdentity(value as Record<string, unknown>);
  return identity === null ? undefined : identity;
}

export function hasV2Identity(item: { v2?: unknown }): boolean {
  return sanitizeCartIdentity(item.v2) !== undefined;
}

/**
 * Converts cart items to V2 cart lines. Fails closed: if ANY item lacks exact
 * identity the whole cart is rejected, because a partial V2 cart would silently
 * fall back to the legacy heuristic path.
 */
export type CartIdentityExtraction =
  | { readonly ok: true; readonly lines: readonly V2CartLineRequest[]; readonly missing?: undefined }
  | { readonly ok: false; readonly lines?: undefined; readonly missing: readonly string[] };

export function extractV2CartLines(
  items: readonly { id: string; quantity: number; v2?: unknown }[],
): CartIdentityExtraction {
  const lines: V2CartLineRequest[] = [];
  const missing: string[] = [];

  for (const item of items) {
    const identity = sanitizeCartIdentity(item.v2);
    if (identity === undefined || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      missing.push(item.id);
      continue;
    }
    lines.push({ ...identity, quantity: item.quantity });
  }

  if (missing.length > 0 || lines.length === 0) {
    return { ok: false, missing: missing.length > 0 ? missing : ["<empty cart>"] };
  }
  return { ok: true, lines };
}
