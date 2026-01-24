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
 * Safe price formatting - returns formatted string
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
 * Safe number conversion - returns 0 for invalid values
 */
export function safeNumber(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Safely get a nested property value as string
 */
export function safeGet<T>(obj: T, path: string, defaultValue: string = ''): string {
  try {
    const result = path.split('.').reduce((acc: unknown, key) => {
      if (acc && typeof acc === 'object' && acc !== null) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
    return safeString(result) || defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safe currency formatting
 */
export function safeCurrency(
  value: unknown, 
  currency: string = 'EUR', 
  locale: string = 'nl-NL'
): string {
  const num = safeNumber(value, 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(num);
  } catch {
    return `€${num.toFixed(2)}`;
  }
}

/**
 * Safe date formatting
 */
export function safeDate(value: unknown, fallback: string = ''): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Safe array access - ensures we always get an array
 */
export function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

/**
 * Safe product sanitization - ensures all fields are safe for React rendering
 * Prevents React error #310 when database returns unexpected objects
 */
export interface SafeProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  image_url: string;
  images: string[];
  price: number;
  compare_at_price: number | null;
  stock: number | null;
  variants: unknown;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export function safeProduct(product: unknown): SafeProduct | null {
  if (!product || typeof product !== 'object') {
    return null;
  }
  
  const p = product as Record<string, unknown>;
  
  return {
    ...p,
    id: safeString(p.id),
    name: safeString(p.name),
    slug: safeString(p.slug),
    description: safeString(p.description),
    category: safeString(p.category),
    image_url: safeString(p.image_url),
    images: safeArray<string>(p.images),
    price: safeNumber(p.price, 0),
    compare_at_price: p.compare_at_price != null ? safeNumber(p.compare_at_price, 0) : null,
    stock: p.stock != null ? safeNumber(p.stock, 0) : null,
    variants: p.variants,
    created_at: safeString(p.created_at),
    updated_at: safeString(p.updated_at),
  };
}
