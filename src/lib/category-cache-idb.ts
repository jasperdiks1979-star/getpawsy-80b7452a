/**
 * IndexedDB-backed persistent cache for category product data.
 * 
 * Provides instant first paint on repeat visits to category pages
 * by storing the first 12 products per category with a 6-hour TTL.
 * 
 * Falls back gracefully if IndexedDB is unavailable (private browsing, etc.)
 */

const DB_NAME = 'getpawsy_category_cache';
const DB_VERSION = 1;
const STORE_NAME = 'categories';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CachedCategoryData {
  categorySlug: string;
  products: unknown[];
  total: number;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'categorySlug' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getCachedCategoryProducts(categorySlug: string): Promise<CachedCategoryData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(categorySlug);
      req.onsuccess = () => {
        const entry = req.result as CachedCategoryData | undefined;
        if (entry && Date.now() - entry.timestamp < TTL_MS) {
          resolve(entry);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedCategoryProducts(
  categorySlug: string,
  products: unknown[],
  total: number,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      categorySlug,
      products: products.slice(0, 12), // Only cache first 12
      timestamp: Date.now(),
      total,
    } satisfies CachedCategoryData);
  } catch {
    // silent
  }
}

/**
 * Prefetch category data into IDB cache.
 * Called on hover/tap of category chips for instant navigation.
 */
export async function prefetchCategoryToIDB(
  categorySlug: string,
  fetchFn: () => Promise<{ products: unknown[]; total: number }>,
  signal?: AbortSignal,
): Promise<void> {
  try {
    // Check if already cached
    const existing = await getCachedCategoryProducts(categorySlug);
    if (existing) return; // Already cached and fresh

    if (signal?.aborted) return;

    const { products, total } = await fetchFn();
    if (signal?.aborted) return;

    await setCachedCategoryProducts(categorySlug, products, total);
  } catch {
    // silent — prefetch is best-effort
  }
}
