/**
 * Debug logger for React #310 errors
 * Helps identify when objects are accidentally passed to React rendering
 */

const DEBUG_ENABLED = process.env.NODE_ENV === 'development' || 
  (typeof window !== 'undefined' && window.location.search.includes('debug=true'));

/**
 * Log when data is fetched and sanitized
 */
export function logDataSanitization(
  source: string, 
  originalData: unknown, 
  sanitizedData: unknown
): void {
  if (!DEBUG_ENABLED) return;
  
  console.group(`[Debug] Data sanitization: ${source}`);
  console.log('Original data type:', typeof originalData);
  console.log('Original data:', originalData);
  console.log('Sanitized data:', sanitizedData);
  
  // Check for potential objects in data
  if (Array.isArray(sanitizedData)) {
    sanitizedData.forEach((item, index) => {
      checkForObjects(item, `${source}[${index}]`);
    });
  } else if (sanitizedData && typeof sanitizedData === 'object') {
    checkForObjects(sanitizedData, source);
  }
  
  console.groupEnd();
}

/**
 * Recursively check for nested objects that could cause React #310
 */
function checkForObjects(obj: unknown, path: string): void {
  if (!obj || typeof obj !== 'object') return;
  
  const record = obj as Record<string, unknown>;
  
  Object.entries(record).forEach(([key, value]) => {
    const currentPath = `${path}.${key}`;
    
    // Skip known safe object types
    if (key === 'variants' || key === 'images' || Array.isArray(value)) {
      return;
    }
    
    // Flag potential issues
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      console.warn(`[Debug] ⚠️ Nested object found at ${currentPath}:`, value);
    }
  });
}

/**
 * Log when a value is about to be rendered
 */
export function logRenderValue(
  componentName: string, 
  propName: string, 
  value: unknown
): void {
  if (!DEBUG_ENABLED) return;
  
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    console.error(
      `[Debug] 🚨 React #310 Risk: ${componentName}.${propName} is an object:`,
      value
    );
    console.trace('Stack trace for object render:');
  }
}

/**
 * Safe wrapper for rendering that logs issues
 */
export function safeRenderWithLog<T>(
  value: T, 
  componentName: string, 
  propName: string
): T | string {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    console.error(
      `[Debug] 🚨 Prevented React #310: ${componentName}.${propName}`,
      value
    );
    return '[Object]';
  }
  return value;
}

/**
 * Log localStorage data for debugging mobile Safari issues
 */
export function logLocalStorageData(key: string): void {
  if (!DEBUG_ENABLED) return;
  
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      console.group(`[Debug] localStorage: ${key}`);
      console.log('Raw value:', raw);
      try {
        const parsed = JSON.parse(raw);
        console.log('Parsed value:', parsed);
        console.log('Type:', typeof parsed);
        
        if (Array.isArray(parsed)) {
          parsed.forEach((item, index) => {
            if (item && typeof item === 'object') {
              console.log(`Item ${index} type:`, typeof item);
              checkForObjects(item, `${key}[${index}]`);
            }
          });
        }
      } catch (e) {
        console.log('Not valid JSON');
      }
      console.groupEnd();
    }
  } catch (e) {
    console.warn(`[Debug] Cannot read localStorage: ${key}`, e);
  }
}

/**
 * Create a debug wrapper for a component section
 */
export function createSectionDebugger(sectionName: string) {
  return {
    logDataReceived: (dataName: string, data: unknown) => {
      if (!DEBUG_ENABLED) return;
      console.log(`[${sectionName}] Received ${dataName}:`, typeof data, data);
    },
    
    logRenderStart: () => {
      if (!DEBUG_ENABLED) return;
      console.log(`[${sectionName}] Render started`);
    },
    
    logRenderComplete: () => {
      if (!DEBUG_ENABLED) return;
      console.log(`[${sectionName}] Render complete`);
    },
    
    logError: (error: unknown) => {
      console.error(`[${sectionName}] Error:`, error);
      if (error instanceof Error) {
        console.error(`[${sectionName}] Stack:`, error.stack);
      }
    },
    
    warnIfObject: (name: string, value: unknown) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        console.warn(`[${sectionName}] ⚠️ ${name} is an object:`, value);
        return true;
      }
      return false;
    }
  };
}

/**
 * Initialize debug mode for the page
 */
export function initPageDebug(pageName: string): void {
  if (!DEBUG_ENABLED) return;
  
  console.log(`%c[Debug] ${pageName} loaded at ${new Date().toISOString()}`, 
    'background: #4f46e5; color: white; padding: 4px 8px; border-radius: 4px;');
  
  // Log relevant localStorage
  logLocalStorageData('recentlyViewed');
  logLocalStorageData('cart');
  logLocalStorageData('wishlist');
}
