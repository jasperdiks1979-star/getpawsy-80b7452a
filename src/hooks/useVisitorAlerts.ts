import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface AlertThresholds {
  visitors: number;
  checkouts: number;
  enabled: boolean;
  soundEnabled: boolean;
}

interface AlertState {
  visitorsTriggered: boolean;
  checkoutsTriggered: boolean;
  lastVisitorAlert: Date | null;
  lastCheckoutAlert: Date | null;
}

const STORAGE_KEY = "visitor-alert-thresholds";
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between alerts

const DEFAULT_THRESHOLDS: AlertThresholds = {
  visitors: 50,
  checkouts: 5,
  enabled: false,
  soundEnabled: true,
};

export const useVisitorAlerts = (currentVisitors: number, currentCheckouts: number) => {
  const [thresholds, setThresholds] = useState<AlertThresholds>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Error loading alert thresholds:", e);
    }
    return DEFAULT_THRESHOLDS;
  });

  const [alertState, setAlertState] = useState<AlertState>({
    visitorsTriggered: false,
    checkoutsTriggered: false,
    lastVisitorAlert: null,
    lastCheckoutAlert: null,
  });

  const { sendNotification, pushEnabled } = usePushNotifications();
  const alertSoundRef = useRef<HTMLAudioElement | null>(null);

  // Initialize alert sound (use existing cha-ching sound)
  useEffect(() => {
    alertSoundRef.current = new Audio("/sounds/cha-ching.mp3");
    alertSoundRef.current.volume = 0.5;
  }, []);

  // Save thresholds to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  }, [thresholds]);

  const playAlertSound = useCallback(() => {
    if (thresholds.soundEnabled && alertSoundRef.current) {
      alertSoundRef.current.currentTime = 0;
      alertSoundRef.current.play().catch(() => {
        // Ignore audio play errors (e.g., user hasn't interacted yet)
      });
    }
  }, [thresholds.soundEnabled]);

  const canTriggerAlert = useCallback((lastAlert: Date | null): boolean => {
    if (!lastAlert) return true;
    return Date.now() - lastAlert.getTime() > ALERT_COOLDOWN_MS;
  }, []);

  // Monitor visitor threshold
  useEffect(() => {
    if (!thresholds.enabled) return;

    const exceedsThreshold = currentVisitors >= thresholds.visitors;
    const wasBelow = !alertState.visitorsTriggered;

    if (exceedsThreshold && wasBelow && canTriggerAlert(alertState.lastVisitorAlert)) {
      // Trigger alert
      setAlertState((prev) => ({
        ...prev,
        visitorsTriggered: true,
        lastVisitorAlert: new Date(),
      }));

      playAlertSound();

      toast({
        title: "🚀 Bezoekersdrempel bereikt!",
        description: `${currentVisitors} bezoekers actief (drempel: ${thresholds.visitors})`,
      });

      if (pushEnabled) {
        sendNotification({
          title: "Bezoekersdrempel bereikt!",
          body: `${currentVisitors} bezoekers zijn nu actief op je webshop`,
          tag: "visitor-threshold",
        });
      }
    } else if (!exceedsThreshold && alertState.visitorsTriggered) {
      // Reset when back below threshold
      setAlertState((prev) => ({
        ...prev,
        visitorsTriggered: false,
      }));
    }
  }, [
    currentVisitors,
    thresholds.enabled,
    thresholds.visitors,
    alertState.visitorsTriggered,
    alertState.lastVisitorAlert,
    canTriggerAlert,
    playAlertSound,
    sendNotification,
    pushEnabled,
  ]);

  // Monitor checkout threshold
  useEffect(() => {
    if (!thresholds.enabled) return;

    const exceedsThreshold = currentCheckouts >= thresholds.checkouts;
    const wasBelow = !alertState.checkoutsTriggered;

    if (exceedsThreshold && wasBelow && canTriggerAlert(alertState.lastCheckoutAlert)) {
      // Trigger alert
      setAlertState((prev) => ({
        ...prev,
        checkoutsTriggered: true,
        lastCheckoutAlert: new Date(),
      }));

      playAlertSound();

      toast({
        title: "💰 Checkout-drempel bereikt!",
        description: `${currentCheckouts} checkouts actief (drempel: ${thresholds.checkouts})`,
      });

      if (pushEnabled) {
        sendNotification({
          title: "Checkout-drempel bereikt!",
          body: `${currentCheckouts} klanten zijn nu aan het afrekenen`,
          tag: "checkout-threshold",
        });
      }
    } else if (!exceedsThreshold && alertState.checkoutsTriggered) {
      // Reset when back below threshold
      setAlertState((prev) => ({
        ...prev,
        checkoutsTriggered: false,
      }));
    }
  }, [
    currentCheckouts,
    thresholds.enabled,
    thresholds.checkouts,
    alertState.checkoutsTriggered,
    alertState.lastCheckoutAlert,
    canTriggerAlert,
    playAlertSound,
    sendNotification,
    pushEnabled,
  ]);

  const updateThresholds = useCallback((updates: Partial<AlertThresholds>) => {
    setThresholds((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetAlertState = useCallback(() => {
    setAlertState({
      visitorsTriggered: false,
      checkoutsTriggered: false,
      lastVisitorAlert: null,
      lastCheckoutAlert: null,
    });
  }, []);

  return {
    thresholds,
    alertState,
    updateThresholds,
    resetAlertState,
  };
};
