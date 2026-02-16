/**
 * Products initial-page cache for instant first paint on /products.
 * 
 * Stores the first page (24 items) keyed by (category, sort) in memory + sessionStorage.
 * On repeat visits or filter changes, shows cached products instantly while fetching fresh data.
 */

const CACHE_KEY_PREFIX = 'getpawsy_products_cache_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  products: unknown[];
  timestamp: number;
  total: number;
}

const memoryCache = new Map<string, CacheEntry>();

function buildKey(category: string | null, sort: string): string {
  return `${category || 'all'}_${sort}`;
}

export function getCachedProducts(category: string | null, sort: string): CacheEntry | null {
  const key = buildKey(category, sort);
  
  // Check memory first
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return mem;
  }
  
  // Check sessionStorage
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + key);
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw);
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        memoryCache.set(key, entry);
        return entry;
      }
      sessionStorage.removeItem(CACHE_KEY_PREFIX + key);
    }
  } catch {
    // silent
  }
  
  return null;
}

export function setCachedProducts(category: string | null, sort: string, products: unknown[], total: number) {
  const key = buildKey(category, sort);
  const entry: CacheEntry = {
    products: products.slice(0, 24), // Only cache first page
    timestamp: Date.now(),
    total,
  };
  
  memoryCache.set(key, entry);
  
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full, silent
  }
}
