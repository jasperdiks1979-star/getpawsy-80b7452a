/**
 * Self-Healing Data Sanitization System
 * Automatically detects and repairs corrupted localStorage data
 * to prevent React #310 errors
 */

import { reportError } from './error-reporter';

interface HealingResult {
  key: string;
  wasCorrupted: boolean;
  fixed: boolean;
  details?: string;
}

interface HealingReport {
  timestamp: string;
  totalKeys: number;
  corruptedKeys: number;
  fixedKeys: number;
  results: HealingResult[];
}

// Keys that should be arrays
const ARRAY_KEYS = ['recentlyViewed', 'wishlist'];

// Keys that should be objects with specific structures
const OBJECT_KEYS = ['cart', 'pawsy-cart'];

// Canonical allow-list. DataHealer will ONLY touch these keys. Everything
// else (attribution, visitor identity, consent, timestamps, UTM strings)
// is stored by other subsystems as raw scalars and must be left alone.
// Historical bug (2026-07): the pre-allow-list version JSON.parsed EVERY
// key and `removeItem`-ed anything that wasn't valid JSON, wiping
// `first_utm_source`, `gp_visitor_id`, `gp_cookie_consent`, `first_seen_at`
// etc. on every page load. That silently broke Pinterest attribution
// (808 real visitors → 17 canonical sessions) and re-triggered the
// consent banner on every visit, blocking pixels. Do not re-widen this
// list without a matching JSON-serialization contract.
const OWNED_KEYS = new Set<string>([
  ...ARRAY_KEYS,
  ...OBJECT_KEYS,
]);

// Keys to skip (system keys)
const SKIP_KEYS = ['supabase.auth.token', 'sb-', 'debug'];

/**
 * Check if a value is a plain object (not array, not null)
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Recursively sanitize a value, converting nested objects to safe strings
 */
const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 10) return '[Max Depth]';
  
  if (value === null || value === undefined) return value;
  
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  
  if (isPlainObject(value)) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val, depth + 1);
    }
    return sanitized;
  }
  
  // Convert other types to string
  return String(value);
};

/**
 * Validate and fix cart items structure
 */
const healCartData = (data: unknown): { healed: unknown; wasCorrupted: boolean } => {
  if (!isPlainObject(data)) {
    return { healed: { items: [] }, wasCorrupted: true };
  }
  
  let wasCorrupted = false;
  const healed: Record<string, unknown> = { ...data };
  
  // Ensure items is an array
  if (!Array.isArray(healed.items)) {
    healed.items = [];
    wasCorrupted = true;
  } else {
    // Validate each cart item
    healed.items = (healed.items as unknown[]).filter((item) => {
      if (!isPlainObject(item)) {
        wasCorrupted = true;
        return false;
      }
      
      // Ensure required fields are primitives
      const cartItem = item as Record<string, unknown>;
      
      if (typeof cartItem.id !== 'string') {
        wasCorrupted = true;
        return false;
      }
      
      // Sanitize name and other string fields
      if (typeof cartItem.name !== 'string') {
        cartItem.name = String(cartItem.name || 'Unknown Product');
        wasCorrupted = true;
      }
      
      if (typeof cartItem.price !== 'number') {
        cartItem.price = Number(cartItem.price) || 0;
        wasCorrupted = true;
      }
      
      if (typeof cartItem.quantity !== 'number') {
        cartItem.quantity = Number(cartItem.quantity) || 1;
        wasCorrupted = true;
      }
      
      // Ensure image_url is string or null
      if (cartItem.image_url !== null && typeof cartItem.image_url !== 'string') {
        cartItem.image_url = null;
        wasCorrupted = true;
      }
      
      return true;
    });
  }
  
  return { healed, wasCorrupted };
};

/**
 * Validate and fix array data (recentlyViewed, wishlist)
 */
const healArrayData = (data: unknown): { healed: unknown; wasCorrupted: boolean } => {
  if (!Array.isArray(data)) {
    return { healed: [], wasCorrupted: true };
  }
  
  let wasCorrupted = false;
  
  // Filter out invalid items and ensure all items are strings (IDs)
  const healed = data.filter((item) => {
    if (typeof item === 'string' && item.length > 0) {
      return true;
    }
    wasCorrupted = true;
    return false;
  });
  
  return { healed, wasCorrupted };
};

/**
 * Check if a key should be skipped
 */
const shouldSkipKey = (key: string): boolean => {
  if (SKIP_KEYS.some((skip) => key.startsWith(skip))) return true;
  // Only touch keys we explicitly own. Any other key (attribution,
  // visitor id, consent, UTM, timestamps) is stored by another
  // subsystem in its own format and must never be parsed/removed here.
  return !OWNED_KEYS.has(key);
};

/**
 * Heal a single localStorage key
 */
const healKey = (key: string): HealingResult => {
  const result: HealingResult = {
    key,
    wasCorrupted: false,
    fixed: false,
  };
  
  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return result;
    
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      // Non-JSON scalar for an owned key: reset only the known
      // structured keys to a safe empty container. Never blanket-remove.
      if (key === 'cart' || key === 'pawsy-cart') {
        localStorage.setItem(key, JSON.stringify({ items: [] }));
        result.wasCorrupted = true;
        result.fixed = true;
        result.details = 'Reset non-JSON cart to empty';
      } else if (ARRAY_KEYS.includes(key)) {
        localStorage.setItem(key, JSON.stringify([]));
        result.wasCorrupted = true;
        result.fixed = true;
        result.details = 'Reset non-JSON array to []';
      }
      return result;
    }
    
    // Handle specific key types
    if (key === 'cart' || key === 'pawsy-cart') {
      const { healed, wasCorrupted } = healCartData(parsed);
      if (wasCorrupted) {
        localStorage.setItem(key, JSON.stringify(healed));
        result.wasCorrupted = true;
        result.fixed = true;
        result.details = 'Cart data sanitized';
      }
    } else if (ARRAY_KEYS.includes(key)) {
      const { healed, wasCorrupted } = healArrayData(parsed);
      if (wasCorrupted) {
        localStorage.setItem(key, JSON.stringify(healed));
        result.wasCorrupted = true;
        result.fixed = true;
        result.details = 'Array data sanitized';
      }
    }
    // Unowned keys never reach here (shouldSkipKey filters them out).
  } catch (error) {
    result.details = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
  }
  
  return result;
};

/**
 * Run self-healing on all localStorage data
 */
export const runDataHealing = (): HealingReport => {
  const report: HealingReport = {
    timestamp: new Date().toISOString(),
    totalKeys: 0,
    corruptedKeys: 0,
    fixedKeys: 0,
    results: [],
  };
  
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !shouldSkipKey(key)) {
        keys.push(key);
      }
    }
    
    report.totalKeys = keys.length;
    
    for (const key of keys) {
      const result = healKey(key);
      report.results.push(result);
      
      if (result.wasCorrupted) {
        report.corruptedKeys++;
        if (result.fixed) {
          report.fixedKeys++;
        }
      }
    }
    
    // Log if any corruption was found and fixed
    if (report.corruptedKeys > 0) {
      console.info(
        `[DataHealer] Fixed ${report.fixedKeys}/${report.corruptedKeys} corrupted keys`,
        report.results.filter((r) => r.wasCorrupted)
      );
      
      // Report to error logging system
      reportError(
        `Auto-healed ${report.fixedKeys} corrupted localStorage keys`,
        'DataHealer',
        {
          errorType: 'DATA_HEALING',
          corruptedKeys: report.corruptedKeys,
          fixedKeys: report.fixedKeys,
          details: report.results.filter((r) => r.wasCorrupted),
        }
      );
    }
  } catch (error) {
    console.error('[DataHealer] Error during healing:', error);
  }
  
  return report;
};

/**
 * Initialize self-healing system
 * Runs immediately and sets up periodic checks
 */
export const initDataHealer = (): void => {
  // Run immediately on page load
  setTimeout(() => {
    runDataHealing();
  }, 1000); // Slight delay to not block initial render
  
  // Run periodically (every 60 minutes). The 5-minute cadence used to
  // race with mid-session attribution writes and wipe them; hourly is
  // more than enough for the two cart/array keys we still touch.
  setInterval(() => {
    runDataHealing();
  }, 60 * 60 * 1000);

  // NOTE: the previous `beforeunload` handler wiped localStorage right
  // before the browser navigated to /checkout, which nuked cart state
  // and first-touch UTMs mid-funnel. Do not re-add without a full
  // regression on the ATC → checkout path.
  
  // Listen for storage events (changes from other tabs)
  window.addEventListener('storage', (event) => {
    if (event.key && !shouldSkipKey(event.key)) {
      healKey(event.key);
    }
  });
  
  console.info('[DataHealer] Self-healing system initialized');
};

/**
 * Manual trigger for data healing (for debug panel)
 */
export const triggerManualHealing = (): HealingReport => {
  console.info('[DataHealer] Manual healing triggered');
  return runDataHealing();
};
