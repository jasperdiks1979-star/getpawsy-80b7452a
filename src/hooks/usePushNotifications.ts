import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => {
    const saved = localStorage.getItem("push-notifications-enabled");
    return saved === "true";
  });

  // Check if browser supports notifications
  useEffect(() => {
    const supported = "Notification" in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Save push enabled preference
  useEffect(() => {
    localStorage.setItem("push-notifications-enabled", String(pushEnabled));
  }, [pushEnabled]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast({
        title: "Niet ondersteund",
        description: "Je browser ondersteunt geen push notificaties",
        variant: "destructive",
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === "granted") {
        setPushEnabled(true);
        toast({
          title: "✅ Push notificaties ingeschakeld",
          description: "Je ontvangt nu meldingen bij nieuwe checkouts",
        });
        return true;
      } else if (result === "denied") {
        toast({
          title: "Geblokkeerd",
          description: "Push notificaties zijn geblokkeerd. Wijzig dit in je browserinstellingen.",
          variant: "destructive",
        });
        return false;
      }
      return false;
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [isSupported]);

  // Send a push notification
  const sendNotification = useCallback(
    ({ title, body, icon, tag, requireInteraction = false }: PushNotificationOptions) => {
      if (!isSupported || permission !== "granted" || !pushEnabled) {
        return null;
      }

      try {
        const notification = new Notification(title, {
          body,
          icon: icon || "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: tag || `notification-${Date.now()}`,
          requireInteraction,
          silent: false,
        });

        // Auto-close after 10 seconds
        setTimeout(() => {
          notification.close();
        }, 10000);

        // Focus window when clicked
        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        return notification;
      } catch (error) {
        console.error("Error sending notification:", error);
        return null;
      }
    },
    [isSupported, permission, pushEnabled]
  );

  // Toggle push notifications
  const togglePush = useCallback(async (enabled: boolean) => {
    if (enabled) {
      if (permission === "granted") {
        setPushEnabled(true);
        return true;
      } else {
        return await requestPermission();
      }
    } else {
      setPushEnabled(false);
      return true;
    }
  }, [permission, requestPermission]);

  return {
    isSupported,
    permission,
    pushEnabled,
    requestPermission,
    sendNotification,
    togglePush,
  };
};
