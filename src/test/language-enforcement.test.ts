/**
 * Tests for language enforcement utilities
 * Run with: npx vitest run src/test/language-enforcement.test.ts
 */

import { describe, it, expect } from 'vitest';
import { 
  validateText, 
  formatUSD, 
  formatUSDCompact, 
  sanitizeCurrency,
  assertEnglishOnly 
} from '@/lib/language-enforcement';

describe('validateText', () => {
  it('should pass valid English text', () => {
    const result = validateText('Add to cart');
    expect(result.isValid).toBe(true);
    expect(result.hasDutchWords).toBe(false);
    expect(result.hasEuroSymbols).toBe(false);
  });

  it('should detect Dutch words', () => {
    const result = validateText('Voeg toe aan winkelwagen');
    expect(result.isValid).toBe(false);
    expect(result.hasDutchWords).toBe(true);
    expect(result.dutchWordsFound).toContain('winkelwagen');
    // Check that at least some Dutch words are detected
    expect(result.dutchWordsFound.length).toBeGreaterThan(0);
  });

  it('should detect common Dutch words like hallo and wereld', () => {
    const result = validateText('Hallo wereld');
    expect(result.isValid).toBe(false);
    expect(result.hasDutchWords).toBe(true);
    expect(result.dutchWordsFound).toContain('hallo');
    expect(result.dutchWordsFound).toContain('wereld');
  });

  it('should detect Euro symbols', () => {
    const result = validateText('Price: €29.99');
    expect(result.isValid).toBe(false);
    expect(result.hasEuroSymbols).toBe(true);
  });

  it('should detect EUR currency code', () => {
    const result = validateText('Total: EUR 50.00');
    expect(result.isValid).toBe(false);
    expect(result.hasEuroSymbols).toBe(true);
  });

  it('should allow USD currency', () => {
    const result = validateText('Price: $29.99');
    expect(result.isValid).toBe(true);
    expect(result.hasEuroSymbols).toBe(false);
  });

  it('should handle empty strings', () => {
    const result = validateText('');
    expect(result.isValid).toBe(true);
  });

  it('should handle null/undefined gracefully', () => {
    const result = validateText(null as unknown as string);
    expect(result.isValid).toBe(true);
  });
});

describe('formatUSD', () => {
  it('should format numbers as USD', () => {
    expect(formatUSD(29.99)).toBe('$29.99');
    expect(formatUSD(1000)).toBe('$1,000.00');
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('should round to 2 decimal places', () => {
    expect(formatUSD(29.999)).toBe('$30.00');
    expect(formatUSD(29.991)).toBe('$29.99');
  });
});

describe('formatUSDCompact', () => {
  it('should format whole numbers without cents', () => {
    expect(formatUSDCompact(50)).toBe('$50');
    expect(formatUSDCompact(1000)).toBe('$1,000');
  });

  it('should show cents for non-whole numbers', () => {
    expect(formatUSDCompact(29.99)).toBe('$29.99');
    expect(formatUSDCompact(50.5)).toBe('$50.50');
  });
});

describe('sanitizeCurrency', () => {
  it('should replace € with $', () => {
    expect(sanitizeCurrency('€29.99')).toBe('$29.99');
    expect(sanitizeCurrency('Price: € 50')).toBe('Price: $ 50');
  });

  it('should replace EUR with USD', () => {
    expect(sanitizeCurrency('Total: EUR 100')).toBe('Total: USD 100');
    expect(sanitizeCurrency('50 eur')).toBe('50 USD');
  });

  it('should handle European number formatting', () => {
    expect(sanitizeCurrency('€1.000,00')).toBe('$1,000.00');
  });
});

describe('assertEnglishOnly', () => {
  it('should not throw for English text', () => {
    expect(() => assertEnglishOnly('Hello world')).not.toThrow();
  });

  it('should throw for Dutch text', () => {
    expect(() => assertEnglishOnly('Hallo wereld, dit is Nederlands')).toThrow();
  });

  it('should throw for Euro symbols', () => {
    expect(() => assertEnglishOnly('€50')).toThrow();
  });
});
