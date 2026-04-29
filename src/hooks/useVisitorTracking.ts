import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUtm } from "@/lib/utmNormalizer";

type ActivityType = "browsing" | "cart" | "checkout" | "product_view" | "add_to_cart" | "view_cart" | "purchase";

interface GeoLocation {
  latitude: number;
  longitude: number;
  country?: string;
  city?: string;
}

interface UTMParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

interface DeviceInfo {
  device_type: "mobile" | "tablet" | "desktop";
  browser: string;
  screen_width: number;
  screen_height: number;
}

type ReferrerCategory = "google" | "social" | "direct" | "email" | "paid" | "organic" | "other";

import { PRODUCTION_DOMAINS } from '@/lib/constants';

// Countries to mark as internal traffic
const INTERNAL_COUNTRIES = ['Netherlands', 'The Netherlands', 'NL'];

// Known bot user agent patterns
const BOT_PATTERNS = [
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp', 'baiduspider',
  'facebookexternalhit', 'twitterbot', 'rogerbot', 'linkedinbot', 'embedly',
  'quora link preview', 'showyoubot', 'outbrain', 'pinterestbot',
  'applebot', 'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot',
  'bytespider', 'gptbot', 'chatgpt', 'claudebot', 'anthropic', 'bot/', '/bot',
  'crawler', 'spider', 'scraper', 'headless', 'phantom', 'selenium', 'puppeteer',
  'lighthouse', 'pagespeed', 'gtmetrix', 'pingdom', 'uptimerobot',
  'mediapartners-google', 'adsbot-google', 'apis-google', 'feedfetcher-google',
];

// Check if the current user agent is a bot
const isBot = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  return BOT_PATTERNS.some(pattern => userAgent.includes(pattern));
};

// Check if we're on a production domain
const isProductionDomain = (): boolean => {
  const hostname = window.location.hostname;
  return PRODUCTION_DOMAINS.includes(hostname);
};

// Generate a unique session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem("visitor_session_id");
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem("visitor_session_id", sessionId);
  }
  return sessionId;
};

// Detect Pinterest in-app browser via user agent
const isPinterestInAppBrowser = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('pinterest') || ua.includes('pinterestbot');
};

// Extract all UTM parameters via the central normalizer. Resolution
// order (URL > sessionStorage > TikTok/Pinterest inference) and
// persistence semantics live in src/lib/utmNormalizer.ts so every
// surface (redirects, trackers, deep-link buttons) stays consistent.
const getUTMParams = (): UTMParams => {
  const resolved = resolveUtm();
  return {
    utm_source: resolved.utm_source ?? null,
    utm_medium: resolved.utm_medium ?? null,
    utm_campaign: resolved.utm_campaign ?? null,
    utm_term: resolved.utm_term ?? null,
    utm_content: resolved.utm_content ?? null,
  };
};

// Get full referrer URL for better tracking
const getReferrer = (): string | null => {
  const storedReferrer = sessionStorage.getItem("original_referrer");
  if (storedReferrer) return storedReferrer;
  
  if (!document.referrer) return null;
  
  sessionStorage.setItem("original_referrer", document.referrer);
  return document.referrer;
};

// Detect device type based on screen size and user agent
const getDeviceInfo = (): DeviceInfo => {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  
  let device_type: "mobile" | "tablet" | "desktop" = "desktop";
  
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|tablet|playbook|silk/i.test(userAgent) || 
    (isMobile && Math.min(screenWidth, screenHeight) >= 600);
  
  if (isTablet) {
    device_type = "tablet";
  } else if (isMobile || screenWidth < 768) {
    device_type = "mobile";
  }
  
  let browser = "unknown";
  if (userAgent.includes("firefox")) browser = "Firefox";
  else if (userAgent.includes("edg/")) browser = "Edge";
  else if (userAgent.includes("chrome") && !userAgent.includes("edg/")) browser = "Chrome";
  else if (userAgent.includes("safari") && !userAgent.includes("chrome")) browser = "Safari";
  else if (userAgent.includes("opera") || userAgent.includes("opr/")) browser = "Opera";
  
  return { device_type, browser, screen_width: screenWidth, screen_height: screenHeight };
};

// Categorize the referrer source
const categorizeReferrer = (referrer: string | null, utmParams: UTMParams): ReferrerCategory => {
  // Pinterest in-app browser detection — overrides "direct" when referrer is stripped
  if (utmParams.utm_source === 'pinterest' || isPinterestInAppBrowser()) {
    return "social";
  }

  if (utmParams.utm_medium === 'paid' || utmParams.utm_medium === 'cpc' || utmParams.utm_medium === 'ppc') {
    return "paid";
  }
  
  if (utmParams.utm_medium === 'email' || utmParams.utm_source?.includes('email')) {
    return "email";
  }
  
  if (!referrer) return "direct";
  
  const referrerLower = referrer.toLowerCase();
  
  if (referrerLower.includes('google.') && !utmParams.utm_medium?.includes('paid')) {
    return utmParams.utm_medium === 'organic' || !utmParams.utm_medium ? "google" : "paid";
  }
  
  const socialPlatforms = [
    'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com',
    'pinterest.com', 'pin.it', 'linkedin.com', 'tiktok.com', 'youtube.com',
    'reddit.com', 'snapchat.com', 'whatsapp.com', 't.co'
  ];
  
  if (socialPlatforms.some(platform => referrerLower.includes(platform))) return "social";
  
  const searchEngines = ['bing.com', 'yahoo.com', 'duckduckgo.com', 'ecosia.org'];
  if (searchEngines.some(engine => referrerLower.includes(engine))) return "organic";
  
  return "other";
};

// Check if location is internal (Netherlands)
const isInternalTraffic = (country?: string): boolean => {
  if (!country) return false;
  return INTERNAL_COUNTRIES.some(c => 
    country.toLowerCase().includes(c.toLowerCase())
  );
};

export interface TrackingOptions {
  productId?: string;
  productName?: string;
  productPrice?: number;
  productQuantity?: number;
  pagePath?: string;
  orderId?: string;
  orderValue?: number;
}

export const useVisitorTracking = () => {
  const locationRef = useRef<GeoLocation | null>(null);
  const lastActivityRef = useRef<string | null>(null);
  const sessionId = useRef<string>(getSessionId());
  const referrerRef = useRef<string | null>(getReferrer());
  const deviceInfoRef = useRef<DeviceInfo>(getDeviceInfo());

  const fetchLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (locationRef.current) return locationRef.current;

    try {
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) throw new Error("Failed to fetch location");
      
      const data = await response.json();
      
      if (data.latitude && data.longitude) {
        locationRef.current = {
          latitude: data.latitude,
          longitude: data.longitude,
          country: data.country_name,
          city: data.city,
        };
        // Persist for cross-module access (e.g. GA4 purchase guard)
        sessionStorage.setItem("visitor_location", JSON.stringify(locationRef.current));
        return locationRef.current;
      }
    } catch (error) {
      console.error("Error fetching location:", error);
    }
    
    return null;
  }, []);

  const trackActivity = useCallback(async (
    activityType: ActivityType,
    options?: TrackingOptions
  ) => {
    // Only track on production domains
    if (!isProductionDomain()) {
      console.log('[Visitor Tracking] Skipped - not a production domain');
      return;
    }

    // Don't track bot traffic
    if (isBot()) {
      console.log('[Visitor Tracking] Skipped - bot detected');
      return;
    }

    const currentPath = options?.pagePath || window.location.pathname;
    const activityKey = `${activityType}-${currentPath}-${options?.productId || ''}-${options?.orderId || ''}`;
    
    // Don't track duplicate consecutive activities
    if (lastActivityRef.current === activityKey) return;
    lastActivityRef.current = activityKey;

    try {
      const location = await fetchLocation();
      // Re-resolve every call so URL UTMs added later in the funnel
      // (e.g. /go rewriting utm_campaign=hookN on mount, or a deep-link
      // click into /product/?utm_campaign=hookN) are tracked on the row
      // they actually apply to — not frozen to the first page's URL.
      const utmParams = getUTMParams();
      const referrer = referrerRef.current;
      const deviceInfo = deviceInfoRef.current;
      const referrerCategory = categorizeReferrer(referrer, utmParams);
      const isInternal = isInternalTraffic(location?.country);
      
      const { error } = await supabase
        .from("visitor_activity")
        .insert({
          session_id: sessionId.current,
          activity_type: activityType,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          country: location?.country || null,
          city: location?.city || null,
          referrer: referrer,
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          utm_term: utmParams.utm_term,
          utm_content: utmParams.utm_content,
          page_path: currentPath,
          product_id: options?.productId || null,
          product_name: options?.productName || null,
          product_price: options?.productPrice || null,
          product_quantity: options?.productQuantity || null,
          order_id: options?.orderId || null,
          order_value: options?.orderValue || null,
          device_type: deviceInfo.device_type,
          browser: deviceInfo.browser,
          screen_width: deviceInfo.screen_width,
          screen_height: deviceInfo.screen_height,
          referrer_category: referrerCategory,
          is_internal: isInternal,
        });

      if (error) {
        console.error("Error tracking activity:", error);
      } else {
        // Remember this path so the NEXT navigation can infer attribution
        // (e.g. PDP after /go) even if a redirect strips the query string.
        try {
          sessionStorage.setItem(
            'gp_internal_prev_path',
            window.location.pathname + window.location.search,
          );
        } catch {
          // sessionStorage can throw in private mode — non-fatal.
        }
        console.log(`[Visitor Tracking] ${activityType} tracked`, { 
          productId: options?.productId, 
          orderId: options?.orderId,
          isInternal
        });
      }
    } catch (error) {
      console.error("Error tracking activity:", error);
    }
  }, [fetchLocation]);

  // Track browsing activity on mount (only once)
  useEffect(() => {
    trackActivity("browsing");
  }, [trackActivity]);

  return {
    trackActivity,
    trackBrowsing: (pagePath?: string) => trackActivity("browsing", { pagePath }),
    trackCart: () => trackActivity("cart"),
    trackCheckout: () => trackActivity("checkout"),
    trackProductView: (productId: string, productName: string, productPrice?: number) => 
      trackActivity("product_view", { productId, productName, productPrice }),
    // New funnel events
    trackAddToCart: (productId: string, productName: string, productPrice: number, quantity: number = 1) =>
      trackActivity("add_to_cart", { productId, productName, productPrice, productQuantity: quantity }),
    trackViewCart: () => trackActivity("view_cart"),
    trackPurchase: (orderId: string, orderValue: number) =>
      trackActivity("purchase", { orderId, orderValue }),
    sessionId: sessionId.current,
  };
};

// Helper to track events from outside React components
export const trackVisitorEvent = async (
  activityType: ActivityType,
  options?: TrackingOptions
) => {
  if (!isProductionDomain() || isBot()) return;

  const sessionId = getSessionId();
  const utmParams = getUTMParams();
  const referrer = getReferrer();
  const deviceInfo = getDeviceInfo();
  const referrerCategory = categorizeReferrer(referrer, utmParams);

  // Try to get cached location
  const cachedLocation = sessionStorage.getItem("visitor_location");
  let location: GeoLocation | null = null;
  if (cachedLocation) {
    try {
      location = JSON.parse(cachedLocation);
    } catch {
      // Ignore parse errors
    }
  }

  const isInternal = isInternalTraffic(location?.country);

  const { error } = await supabase
    .from("visitor_activity")
    .insert({
      session_id: sessionId,
      activity_type: activityType,
      latitude: location?.latitude || null,
      longitude: location?.longitude || null,
      country: location?.country || null,
      city: location?.city || null,
      referrer: referrer,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_term: utmParams.utm_term,
      utm_content: utmParams.utm_content,
      page_path: options?.pagePath || window.location.pathname,
      product_id: options?.productId || null,
      product_name: options?.productName || null,
      product_price: options?.productPrice || null,
      product_quantity: options?.productQuantity || null,
      order_id: options?.orderId || null,
      order_value: options?.orderValue || null,
      device_type: deviceInfo.device_type,
      browser: deviceInfo.browser,
      screen_width: deviceInfo.screen_width,
      screen_height: deviceInfo.screen_height,
      referrer_category: referrerCategory,
      is_internal: isInternal,
    });

  if (error) {
    console.error("Error tracking activity:", error);
  }
};
