/**
 * Client-side deduplication safety guard.
 * The products_public view already filters is_duplicate=false,
 * but this provides a last-resort guarantee that no two products
 * with the same dedupe_key appear in a list.
 */
export function dedupeProducts<T extends { dedupe_key?: string | null; id?: string | null }>(
  products: T[]
): T[] {
  const seen = new Set<string>();
  return products.filter(p => {
    const key = p.dedupe_key;
    if (!key) return true; // no dedupe_key = unique
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
