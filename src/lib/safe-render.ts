/**
 * Safe render utilities to prevent React Error #310
 * "Objects are not valid as a React child"
 */

/**
 * Safely converts any value to a renderable string.
 * Prevents React error #310 by ensuring objects are never passed to JSX.
 */
export function safeString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (typeof value === 'object') {
    // Log warning in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[safeString] Received object, converting to empty string:', value);
    }
    return '';
  }
  
  return String(value);
}

/**
 * Safely renders a value, returning empty string for objects/arrays
 */
export function safeRender(value: unknown): string | number {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  if (typeof value === 'object') {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[safeRender] Attempted to render object:', value);
    }
    return '';
  }
  
  return String(value);
}

/**
 * Safe price formatting
 */
export function safePrice(value: unknown): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  
  const num = Number(value);
  if (isNaN(num)) {
    return '0.00';
  }
  
  return num.toFixed(2);
}

/**
 * Safely get a nested property value as string
 */
export function safeGet<T>(obj: T, path: string, defaultValue: string = ''): string {
  try {
    const result = path.split('.').reduce((acc: any, key) => acc?.[key], obj);
    return safeString(result) || defaultValue;
  } catch {
    return defaultValue;
  }
}
