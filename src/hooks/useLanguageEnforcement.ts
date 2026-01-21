/**
 * React hook for language enforcement in components
 * 
 * Provides utilities to validate and sanitize text in real-time
 */

import { useCallback, useEffect } from 'react';
import { 
  validateText, 
  sanitizeCurrency, 
  formatUSD, 
  formatUSDCompact,
  warnIfDutch,
  type TextValidationResult 
} from '@/lib/language-enforcement';

interface UseLanguageEnforcementOptions {
  /** Enable console warnings in development */
  enableWarnings?: boolean;
  /** Context name for debugging */
  context?: string;
}

/**
 * Hook for enforcing English-only text and USD currency
 */
export function useLanguageEnforcement(options: UseLanguageEnforcementOptions = {}) {
  const { enableWarnings = true, context } = options;

  /**
   * Validate text and optionally warn in development
   */
  const validate = useCallback((text: string): TextValidationResult => {
    const result = validateText(text);
    
    if (enableWarnings && !result.isValid) {
      warnIfDutch(text, context);
    }
    
    return result;
  }, [enableWarnings, context]);

  /**
   * Sanitize text by replacing Euro symbols with USD
   */
  const sanitize = useCallback((text: string): string => {
    return sanitizeCurrency(text);
  }, []);

  /**
   * Format a number as USD currency
   */
  const formatPrice = useCallback((amount: number, compact = false): string => {
    return compact ? formatUSDCompact(amount) : formatUSD(amount);
  }, []);

  /**
   * Check if text contains Dutch words
   */
  const hasDutch = useCallback((text: string): boolean => {
    return validateText(text).hasDutchWords;
  }, []);

  /**
   * Check if text contains Euro symbols
   */
  const hasEuro = useCallback((text: string): boolean => {
    return validateText(text).hasEuroSymbols;
  }, []);

  return {
    validate,
    sanitize,
    formatPrice,
    hasDutch,
    hasEuro,
    formatUSD,
    formatUSDCompact,
  };
}

/**
 * Development-only hook that monitors text changes and warns about Dutch content
 */
export function useTextMonitor(text: string, context?: string): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && text) {
      warnIfDutch(text, context);
    }
  }, [text, context]);
}

export default useLanguageEnforcement;
