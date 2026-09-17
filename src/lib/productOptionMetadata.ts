import { supabase } from '@/integrations/supabase/client';

/**
 * Cart-side option/variant validation source of truth.
 *
 * `products_public` intentionally hides products the storefront must not list
 * (out of stock, duplicates, inactive). That filter also hid legitimately
 * saleable-but-out-of-stock products from the cart's option check, so the
 * storefront could not tell whether a line required an option and the shopper
 * only found out at checkout.
 *
 * `product_option_metadata(p_ids)` is a read-only, id-scoped RPC returning
 * option descriptors only — no price, cost, supplier or admin fields — for
 * active, non-duplicate products. It cannot enumerate the catalog.
 */
export interface ProductOptionMetadata {
  id: string;
  slug: string | null;
  is_active: boolean | null;
  stock: number | null;
  /** `null` means the catalog has no variant array -> treat as unknown. */
  variants: unknown;
}

export async function fetchProductOptionMetadata(
  ids: string[],
): Promise<Map<string, ProductOptionMetadata>> {
  const out = new Map<string, ProductOptionMetadata>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;

  const { data, error } = await supabase.rpc('product_option_metadata', { p_ids: unique });
  if (error || !Array.isArray(data)) return out;

  for (const row of data as ProductOptionMetadata[]) {
    if (row?.id) out.set(row.id, row);
  }
  return out;
}
