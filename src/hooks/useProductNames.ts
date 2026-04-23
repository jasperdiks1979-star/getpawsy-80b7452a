import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Batch-fetch `{ id → { name, slug } }` for a set of product ids so the
 * release-issue evidence list can show human-readable product names + a
 * deep link to the live PDP. Single round-trip, deduped, cached at module
 * scope so re-renders across multiple issue rows don't refetch the same
 * ids.
 *
 * Note: `products_public` is the security-definer view used everywhere
 * else for anon-safe reads, so we re-use it here too.
 */
export interface ProductMeta {
  name: string;
  slug: string | null;
}

const cache = new Map<string, ProductMeta | null>();
const inFlight = new Map<string, Promise<void>>();

async function fetchMissing(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length === 0) return;
  const key = missing.slice().sort().join(',');
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = (async () => {
    const { data, error } = await supabase
      .from('products_public')
      .select('id,name,slug')
      .in('id', missing);
    if (error) {
      // Non-fatal: leave entries unset so callers fall back to id.
      console.warn('[useProductNames] fetch failed:', error.message);
      return;
    }
    const seen = new Set<string>();
    for (const row of data ?? []) {
      cache.set(row.id, { name: row.name, slug: row.slug ?? null });
      seen.add(row.id);
    }
    // Mark unseen ids as null so we don't refetch them on every render.
    for (const id of missing) {
      if (!seen.has(id)) cache.set(id, null);
    }
  })();
  inFlight.set(key, p);
  try {
    await p;
  } finally {
    inFlight.delete(key);
  }
}

export function useProductNames(ids: string[] | null | undefined): Record<string, ProductMeta | null> {
  const [, force] = useState(0);
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];

  useEffect(() => {
    if (list.length === 0) return;
    let cancelled = false;
    void fetchMissing(list).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // We intentionally key on a stable join — re-running for the exact
    // same id set is wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join(',')]);

  const out: Record<string, ProductMeta | null> = {};
  for (const id of list) out[id] = cache.get(id) ?? null;
  return out;
}