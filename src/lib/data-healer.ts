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
const OBJECT_KEYS = ['cart'];

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
  return SKIP_KEYS.some((skip) => key.startsWith(skip));
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
      // Invalid JSON - remove it
      localStorage.removeItem(key);
      result.wasCorrupted = true;
      result.fixed = true;
      result.details = 'Invalid JSON removed';
      return result;
    }
    
    // Handle specific key types
    if (key === 'cart') {
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
    } else {
      // General sanitization for other keys
      const sanitized = sanitizeValue(parsed);
      const sanitizedStr = JSON.stringify(sanitized);
      if (sanitizedStr !== rawValue) {
        localStorage.setItem(key, sanitizedStr);
        result.wasCorrupted = true;
        result.fixed = true;
        result.details = 'General sanitization applied';
      }
    }
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
  
  // Run periodically (every 5 minutes)
  setInterval(() => {
    runDataHealing();
  }, 5 * 60 * 1000);
  
  // Run before page unload to catch any last-minute corruption
  window.addEventListener('beforeunload', () => {
    runDataHealing();
  });
  
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
