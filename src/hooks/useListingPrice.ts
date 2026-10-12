/**
 * Card-level listing price. Listing queries omit the heavy `variants` column
 * (statement timeouts), so cards fell back to products.price even when the
 * charged price is a marked variant price. This hook batches the visible
 * cards' ids into one small `id, price, variants` read and resolves the
 * advertised price with the shared listingPrice rule (customerUnitPrice +
 * stock), i.e. the same number the PDP, feed and checkout use.
 * Failure is non-blocking: the card keeps products.price.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { listingPrice, type ListingPrice } from '@/lib/listingPrice';

type Row = { id: string; price: number; variants: unknown };

let pending = new Map<string, Array<(r: Row | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = pending;
  pending = new Map();
  timer = null;
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    let rows: Row[] = [];
    try {
      const { data } = await supabase.from('products_public').select('id, price, variants').in('id', chunk);
      rows = (data as Row[] | null) ?? [];
    } catch {
      rows = [];
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of chunk) for (const cb of batch.get(id) ?? []) cb(byId.get(id) ?? null);
  }
}

function loadRow(id: string): Promise<Row | null> {
  return new Promise((resolve) => {
    const list = pending.get(id) ?? [];
    list.push(resolve);
    pending.set(id, list);
    if (!timer) timer = setTimeout(flush, 30);
  });
}

export function useListingPrice(
  product: { id?: string; price?: number | null; variants?: unknown },
): ListingPrice | null | 'loading' {
  const hasVariants = product.variants !== undefined;
  const { data, isPending, isError } = useQuery({
    queryKey: ['listing-price-row', product.id],
    queryFn: () => loadRow(product.id as string),
    enabled: Boolean(product.id) && !hasVariants,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (hasVariants) return listingPrice(Number(product.price), product.variants);
  // While loading, callers render a neutral placeholder instead of the base
  // price (which can differ from the charged price). Errors/missing rows fall
  // back to null → caller shows products.price, never blocking the card.
  if (isPending && !isError && product.id) return 'loading';
  if (!data) return null;
  return listingPrice(Number(data.price), data.variants);
}
