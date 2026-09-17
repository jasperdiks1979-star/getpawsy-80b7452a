import { useEffect, useMemo, useState } from 'react';
import { fetchProductOptionMetadata } from '@/lib/productOptionMetadata';
import {
  cartLineNeedsVariantChoice,
  cartLineProductId,
  cartLineHasVariant,
  quickAddProductUrl,
} from '@/lib/quickAdd';


export interface CartVariantIssue {
  lineId: string;
  productId: string;
  url: string;
}

interface MinimalCartLine {
  id: string;
  slug?: string;
}

/**
 * Legacy-cart recovery.
 *
 * A cart line stored before the quick-add guard (or hand-edited localStorage)
 * can reference a multi-variant product without an explicit option. The server
 * fails closed on that line at checkout (`variant_required`), which used to
 * surface as a generic checkout failure. Detecting it in the cart lets us show
 * a precise "choose an option" recovery path instead.
 *
 * Read-only: this never mutates the cart.
 */
export function useCartVariantIssues(items: MinimalCartLine[]): {
  issues: Map<string, CartVariantIssue>;
  checked: boolean;
} {
  const [variantCounts, setVariantCounts] = useState<Record<string, unknown>>({});
  const [checked, setChecked] = useState(false);

  const candidates = useMemo(() => {
    const map = new Map<string, MinimalCartLine>();
    for (const item of items) {
      if (cartLineHasVariant(item.id)) continue;
      const productId = cartLineProductId(item.id);
      if (productId) map.set(item.id, item);
    }
    return map;
  }, [items]);

  const productIds = useMemo(
    () =>
      Array.from(
        new Set(
          Array.from(candidates.values())
            .map((i) => cartLineProductId(i.id))
            .filter((v): v is string => !!v),
        ),
      ).sort(),
    [candidates],
  );

  const key = productIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (productIds.length === 0) {
      setVariantCounts({});
      setChecked(true);
      return;
    }
    setChecked(false);
    (async () => {
      try {
        const rows = await fetchProductOptionMetadata(productIds);
        if (cancelled) return;
        const next: Record<string, unknown> = {};
        for (const [id, row] of rows) next[id] = row;
        setVariantCounts(next);
      } catch {
        // Unknown => no false "choose an option" prompt; the server stays
        // authoritative and still fails closed.
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const issues = useMemo(() => {
    const out = new Map<string, CartVariantIssue>();
    for (const [lineId] of candidates) {
      const productId = cartLineProductId(lineId);
      if (!productId) continue;
      const row = variantCounts[productId] as
        | { id: string; slug?: string | null; variants?: unknown }
        | undefined;
      if (!row) continue;
      if (cartLineNeedsVariantChoice(lineId, row.variants)) {
        out.set(lineId, {
          lineId,
          productId,
          url: quickAddProductUrl({ id: productId, slug: row.slug ?? null }),
        });
      }
    }
    return out;
  }, [candidates, variantCounts]);

  return { issues, checked };
}
