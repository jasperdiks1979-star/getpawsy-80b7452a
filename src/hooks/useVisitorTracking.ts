import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type ActivityType = "browsing" | "cart" | "checkout" | "product_view";

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
}

interface DeviceInfo {
  device_type: "mobile" | "tablet" | "desktop";
  browser: string;
  screen_width: number;
  screen_height: number;
}

type ReferrerCategory = "google" | "social" | "direct" | "email" | "paid" | "organic" | "other";

// Production domains where tracking should be active
const PRODUCTION_DOMAINS = [
  'getpawsy.pet',
  'www.getpawsy.pet',
  'getpawsy.lovable.app',
];

// Known bot user agent patterns
const BOT_PATTERNS = [
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp', 'baiduspider',
  'facebookexternalhit', 'twitterbot', 'rogerbot', 'linkedinbot', 'embedly',
  'quora link preview', 'showyoubot', 'outbrain', 'pinterest', 'pinterestbot',
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

// Extract UTM parameters from URL, with Pinterest auto-detection
const getUTMParams = (): UTMParams => {
  const params = new URLSearchParams(window.location.search);
  
  // Check for Pinterest-specific parameters
  // Pinterest adds epik parameter for tracking
  const hasPinterestParam = params.has('epik') || params.has('pin_id');
  
  // Auto-detect Pinterest as source if their params are present
  let utm_source = params.get('utm_source');
  if (!utm_source && hasPinterestParam) {
    utm_source = 'pinterest';
  }
  
  return {
    utm_source,
    utm_medium: params.get('utm_medium') || (hasPinterestParam ? 'social' : null),
    utm_campaign: params.get('utm_campaign') || (hasPinterestParam ? 'pinterest_auto' : null),
  };
};

// Get full referrer URL for better tracking
const getReferrer = (): string | null => {
  if (!document.referrer) return null;
  return document.referrer;
};

// Detect device type based on screen size and user agent
const getDeviceInfo = (): DeviceInfo => {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  
  // Detect device type
  let device_type: "mobile" | "tablet" | "desktop" = "desktop";
  
  // Check for mobile devices
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|tablet|playbook|silk/i.test(userAgent) || 
    (isMobile && Math.min(screenWidth, screenHeight) >= 600);
  
  if (isTablet) {
    device_type = "tablet";
  } else if (isMobile || screenWidth < 768) {
    device_type = "mobile";
  }
  
  // Detect browser
  let browser = "unknown";
  if (userAgent.includes("firefox")) {
    browser = "Firefox";
  } else if (userAgent.includes("edg/")) {
    browser = "Edge";
  } else if (userAgent.includes("chrome") && !userAgent.includes("edg/")) {
    browser = "Chrome";
  } else if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
    browser = "Safari";
  } else if (userAgent.includes("opera") || userAgent.includes("opr/")) {
    browser = "Opera";
  }
  
  return {
    device_type,
    browser,
    screen_width: screenWidth,
    screen_height: screenHeight,
  };
};

// Categorize the referrer source
const categorizeReferrer = (referrer: string | null, utmParams: UTMParams): ReferrerCategory => {
  // If UTM params indicate paid traffic
  if (utmParams.utm_medium === 'paid' || utmParams.utm_medium === 'cpc' || utmParams.utm_medium === 'ppc') {
    return "paid";
  }
  
  // If UTM params indicate email
  if (utmParams.utm_medium === 'email' || utmParams.utm_source?.includes('email')) {
    return "email";
  }
  
  // No referrer = direct traffic
  if (!referrer) {
    return "direct";
  }
  
  const referrerLower = referrer.toLowerCase();
  
  // Google search (organic)
  if (referrerLower.includes('google.') && !utmParams.utm_medium?.includes('paid')) {
    if (utmParams.utm_medium === 'organic' || !utmParams.utm_medium) {
      return "google";
    }
    return "paid";
  }
  
  // Social media platforms
  const socialPlatforms = [
    'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com',
    'pinterest.com', 'linkedin.com', 'tiktok.com', 'youtube.com',
    'reddit.com', 'snapchat.com', 'whatsapp.com', 't.co'
  ];
  
  if (socialPlatforms.some(platform => referrerLower.includes(platform))) {
    return "social";
  }
  
  // Other search engines (organic)
  const searchEngines = ['bing.com', 'yahoo.com', 'duckduckgo.com', 'ecosia.org'];
  if (searchEngines.some(engine => referrerLower.includes(engine))) {
    return "organic";
  }
  
  return "other";
};

export const useVisitorTracking = () => {
  const locationRef = useRef<GeoLocation | null>(null);
  const lastActivityRef = useRef<string | null>(null); // Changed to track activity + path combo
  const sessionId = useRef<string>(getSessionId());
  const utmParamsRef = useRef<UTMParams>(getUTMParams());
  const referrerRef = useRef<string | null>(getReferrer());
  const deviceInfoRef = useRef<DeviceInfo>(getDeviceInfo());

  // Fetch approximate location using IP geolocation
  const fetchLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (locationRef.current) return locationRef.current;

    try {
      // Use a free IP geolocation API
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
        return locationRef.current;
      }
    } catch (error) {
      console.error("Error fetching location:", error);
    }
    
    return null;
  }, []);

  // Track visitor activity with enhanced data
  const trackActivity = useCallback(async (
    activityType: ActivityType,
    options?: {
      productId?: string;
      productName?: string;
      pagePath?: string;
    }
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
    const activityKey = `${activityType}-${currentPath}-${options?.productId || ''}`;
    
    // Don't track duplicate consecutive activities on the same page
    if (lastActivityRef.current === activityKey) return;
    lastActivityRef.current = activityKey;

    try {
      const location = await fetchLocation();
      const utmParams = utmParamsRef.current;
      const referrer = referrerRef.current;
      const deviceInfo = deviceInfoRef.current;
      const referrerCategory = categorizeReferrer(referrer, utmParams);
      
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
          // Enhanced tracking fields
          page_path: currentPath,
          product_id: options?.productId || null,
          product_name: options?.productName || null,
          device_type: deviceInfo.device_type,
          browser: deviceInfo.browser,
          screen_width: deviceInfo.screen_width,
          screen_height: deviceInfo.screen_height,
          referrer_category: referrerCategory,
        });

      if (error) {
        console.error("Error tracking activity:", error);
      }
    } catch (error) {
      console.error("Error tracking activity:", error);
    }
  }, [fetchLocation]);

  // Track browsing activity on mount
  useEffect(() => {
    trackActivity("browsing");
  }, [trackActivity]);

  return {
    trackActivity,
    trackBrowsing: (pagePath?: string) => trackActivity("browsing", { pagePath }),
    trackCart: () => trackActivity("cart"),
    trackCheckout: () => trackActivity("checkout"),
    trackProductView: (productId: string, productName: string) => 
      trackActivity("product_view", { productId, productName }),
  };
};
