/**
 * Product priority helper — single source of truth for tier lookups.
 * Reads from `product_priority` table. Cached in-memory for the page load.
 */
import { supabase } from '@/integrations/supabase/client';

export type ProductTier = 'hero' | 'testing' | 'low_priority' | 'seasonal' | 'clearance';

export interface ProductPriorityRow {
  product_id: string;
  tier: ProductTier;
  notes: string | null;
  updated_at: string;
}

let cache: Map<string, ProductTier> | null = null;
let inflight: Promise<Map<string, ProductTier>> | null = null;

async function load(): Promise<Map<string, ProductTier>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from('product_priority')
      .select('product_id, tier');
    const m = new Map<string, ProductTier>();
    if (!error && Array.isArray(data)) {
      for (const r of data as Array<{ product_id: string; tier: ProductTier }>) {
        m.set(r.product_id, r.tier);
      }
    }
    cache = m;
    inflight = null;
    return m;
  })();
  return inflight;
}

export async function getProductPriority(productId: string): Promise<ProductTier | null> {
  const m = await load();
  return m.get(productId) ?? null;
}

export async function getAllProductPriorities(): Promise<Map<string, ProductTier>> {
  return load();
}

export function invalidateProductPriorityCache(): void {
  cache = null;
}

export const TIER_WEIGHT: Record<ProductTier, number> = {
  hero: 100,
  testing: 60,
  seasonal: 40,
  low_priority: 10,
  clearance: 5,
};

export const TIER_LABEL: Record<ProductTier, string> = {
  hero: 'Hero',
  testing: 'Testing',
  seasonal: 'Seasonal',
  low_priority: 'Low priority',
  clearance: 'Clearance',
};

export const TIER_COLOR: Record<ProductTier, string> = {
  hero: 'bg-primary text-primary-foreground',
  testing: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  seasonal: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  low_priority: 'bg-muted text-muted-foreground',
  clearance: 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
};