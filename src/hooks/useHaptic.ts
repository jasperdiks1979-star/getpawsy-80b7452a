import { useCallback } from 'react';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const hapticPatterns: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 30],
  warning: [30, 50, 30],
  error: [50, 30, 50, 30, 50],
  selection: 5,
};

export const useHaptic = () => {
  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const trigger = useCallback((style: HapticStyle = 'medium') => {
    if (!isSupported) return false;
    
    try {
      const pattern = hapticPatterns[style];
      navigator.vibrate(pattern);
      return true;
    } catch {
      return false;
    }
  }, [isSupported]);

  const lightTap = useCallback(() => trigger('light'), [trigger]);
  const mediumTap = useCallback(() => trigger('medium'), [trigger]);
  const heavyTap = useCallback(() => trigger('heavy'), [trigger]);
  const success = useCallback(() => trigger('success'), [trigger]);
  const warning = useCallback(() => trigger('warning'), [trigger]);
  const error = useCallback(() => trigger('error'), [trigger]);
  const selection = useCallback(() => trigger('selection'), [trigger]);

  return {
    isSupported,
    trigger,
    lightTap,
    mediumTap,
    heavyTap,
    success,
    warning,
    error,
    selection,
  };
};
