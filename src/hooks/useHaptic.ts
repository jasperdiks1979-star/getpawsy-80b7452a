import { useCallback, useEffect, useState } from 'react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

// Check if we're running in a Capacitor native environment
const isNative = (): boolean => {
  return typeof window !== 'undefined' && 
    (window as any).Capacitor !== undefined && 
    (window as any).Capacitor.isNativePlatform?.() === true;
};

// Web fallback patterns for navigator.vibrate (Android only)
const webHapticPatterns: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 30],
  warning: [30, 50, 30],
  error: [50, 30, 50, 30, 50],
  selection: 5,
};

export const useHaptic = () => {
  const [isCapacitor, setIsCapacitor] = useState(false);
  const isWebSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  useEffect(() => {
    setIsCapacitor(isNative());
  }, []);

  const trigger = useCallback(async (style: HapticStyle = 'medium') => {
    // Try Capacitor Haptics first (works on iOS and Android native apps)
    if (isCapacitor) {
      try {
        switch (style) {
          case 'light':
            await Haptics.impact({ style: ImpactStyle.Light });
            break;
          case 'medium':
            await Haptics.impact({ style: ImpactStyle.Medium });
            break;
          case 'heavy':
            await Haptics.impact({ style: ImpactStyle.Heavy });
            break;
          case 'success':
            await Haptics.notification({ type: NotificationType.Success });
            break;
          case 'warning':
            await Haptics.notification({ type: NotificationType.Warning });
            break;
          case 'error':
            await Haptics.notification({ type: NotificationType.Error });
            break;
          case 'selection':
            await Haptics.selectionStart();
            await Haptics.selectionEnd();
            break;
        }
        return true;
      } catch (err) {
        console.warn('Capacitor Haptics failed:', err);
        return false;
      }
    }

    // Fallback to web vibration API (Android browsers only)
    if (isWebSupported) {
      try {
        const pattern = webHapticPatterns[style];
        navigator.vibrate(pattern);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }, [isCapacitor, isWebSupported]);

  const lightTap = useCallback(() => trigger('light'), [trigger]);
  const mediumTap = useCallback(() => trigger('medium'), [trigger]);
  const heavyTap = useCallback(() => trigger('heavy'), [trigger]);
  const success = useCallback(() => trigger('success'), [trigger]);
  const warning = useCallback(() => trigger('warning'), [trigger]);
  const error = useCallback(() => trigger('error'), [trigger]);
  const selection = useCallback(() => trigger('selection'), [trigger]);

  return {
    isSupported: isCapacitor || isWebSupported,
    isNative: isCapacitor,
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
