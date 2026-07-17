import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUtm } from "@/lib/utmNormalizer";
import { sanitizeTrackingFields, isBotUserAgent } from "@/lib/eventSanitizer";
import { getCanonicalSessionId } from "@/lib/canonicalSession";
import { isTechnicalPath } from "@/lib/technicalRoutes";

type ActivityType = "browsing" | "cart" | "checkout" | "begin_checkout" | "product_view" | "add_to_cart" | "view_cart" | "remove_from_cart" | "purchase";

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

// Paths that must NEVER appear in commercial analytics
const EXCLUDED_PATH_PREFIXES = [
  '/admin', '/auth', '/login', '/signup', '/reset-password',
  '/diagnostics', '/healthz', '/health', '/founder-mode',
  '/merchant-oauth-callback', '/payment-success',
];

const isExcludedPath = (path: string): boolean => {
  const p = (path || '').toLowerCase();
  return EXCLUDED_PATH_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix + '?'));
};

const isPreviewHost = (): boolean => {
  try {
    const h = window.location.hostname.toLowerCase();
    return h.includes('localhost') ||
      h.includes('lovableproject.com') ||
      h.includes('lovable.app') && h.includes('preview') ||
      h.includes('127.0.0.1') ||
      h.endsWith('.local');
  } catch { return false; }
};

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
  return BOT_PATTERNS.some(pattern => userAgent.includes(pattern)) || isBotUserAgent(userAgent);
};

// Check if we're on a production domain
const isProductionDomain = (): boolean => {
  const hostname = window.location.hostname;
  return PRODUCTION_DOMAINS.includes(hostname);
};

// Heuristic: is this likely a bot/test session?
// Common bot signature: desktop Chrome at exactly 800x600 (Lighthouse/headless default).
const detectBotSuspect = (deviceInfo: DeviceInfo): { suspect: boolean; reason: string | null } => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('headless') || ua.includes('phantom') || ua.includes('puppeteer') || ua.includes('playwright')) {
    return { suspect: true, reason: 'headless_ua' };
  }
  if (deviceInfo.device_type === 'desktop' && deviceInfo.browser === 'Chrome' &&
      deviceInfo.screen_width <= 1024 && deviceInfo.screen_height <= 768 &&
      deviceInfo.screen_width >= 600) {
    return { suspect: true, reason: 'lighthouse_viewport' };
  }
  if (deviceInfo.screen_width < 320 || deviceInfo.screen_height < 240) {
    return { suspect: true, reason: 'tiny_viewport' };
  }
  return { suspect: false, reason: null };
};

// First-touch UTM persistence (across whole session)
const UTM_FIRST_KEY = 'gp_utm_first';
const getFirstTouchUtm = (current: UTMParams): { first_source: string | null; first_medium: string | null; first_campaign: string | null } => {
  try {
    const cached = sessionStorage.getItem(UTM_FIRST_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { first_source: parsed.s ?? null, first_medium: parsed.m ?? null, first_campaign: parsed.c ?? null };
    }
    const payload = { s: current.utm_source, m: current.utm_medium, c: current.utm_campaign };
    sessionStorage.setItem(UTM_FIRST_KEY, JSON.stringify(payload));
    return { first_source: payload.s, first_medium: payload.m, first_campaign: payload.c };
  } catch {
    return { first_source: current.utm_source, first_medium: current.utm_medium, first_campaign: current.utm_campaign };
  }
};

function classifyTrafficQuality(args: {
  isAdminPath: boolean;
  isInternal: boolean;
  isBotSuspect: boolean;
  isPreview: boolean;
  country?: string | null;
}): string {
  if (args.isAdminPath) return 'admin';
  if (args.isPreview) return 'preview';
  if (args.isBotSuspect) return 'bot';
  if (args.isInternal) return 'internal';
  if (!args.country) return 'unknown';
  return 'clean';
}

function geoConfidenceFor(country?: string | null): string {
  if (!country) return 'none';
  return 'high';
}

// Generate a unique session ID
const getSessionId = (): string => {
  // Phase 4A: canonical unified sid. Also mirrors to `visitor_session_id`
  // so this hook, utm-session-logger, and any legacy reader receive the
  // same value that cci_events / checkout_funnel_events / canonical_events use.
  try { return getCanonicalSessionId(); } catch {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
};

// Persistent visitor ID (localStorage) — stable across browser sessions so we
// can identify returning visitors. Falls back to in-memory if localStorage
// is unavailable (private mode, blocked storage, etc.).
const VISITOR_ID_KEY = "gp_visitor_id";
let inMemoryVisitorId: string | null = null;
const getVisitorId = (): string => {
  if (inMemoryVisitorId) return inMemoryVisitorId;
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    inMemoryVisitorId = id;
    return id;
  } catch {
    if (!inMemoryVisitorId) {
      inMemoryVisitorId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
    return inMemoryVisitorId;
  }
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
  productCategory?: string;
  pagePath?: string;
  orderId?: string;
  orderValue?: number;
}

export const useVisitorTracking = () => {
  const locationRef = useRef<GeoLocation | null>(null);
  const lastActivityRef = useRef<string | null>(null);
  const sessionId = useRef<string>(getSessionId());
  const visitorId = useRef<string>(getVisitorId());
  const referrerRef = useRef<string | null>(getReferrer());
  const deviceInfoRef = useRef<DeviceInfo>(getDeviceInfo());

  const fetchLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (locationRef.current) return locationRef.current;

    // Multi-provider fallback. ipapi.co is rate-limited (1k/day) and is
    // frequently blocked or throttled inside the TikTok in-app browser, which
    // was leaving ~88% of visitor_activity rows with NULL country/lat/lng and
    // making them invisible on the visitor map. Try providers in order and
    // accept the first successful response.
    type Provider = { url: string; map: (j: any) => GeoLocation | null };
    const providers: Provider[] = [
      {
        url: "https://ipapi.co/json/",
        map: (d) => (d?.latitude && d?.longitude ? {
          latitude: d.latitude, longitude: d.longitude,
          country: d.country_name, city: d.city,
        } : null),
      },
      {
        url: "https://ipwho.is/",
        map: (d) => (d?.success !== false && d?.latitude && d?.longitude ? {
          latitude: d.latitude, longitude: d.longitude,
          country: d.country, city: d.city,
        } : null),
      },
      {
        url: "https://get.geojs.io/v1/ip/geo.json",
        map: (d) => (d?.latitude && d?.longitude ? {
          latitude: parseFloat(d.latitude), longitude: parseFloat(d.longitude),
          country: d.country, city: d.city,
        } : null),
      },
    ];

    for (const p of providers) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(p.url, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) continue;
        const data = await response.json();
        const loc = p.map(data);
        if (loc) {
          locationRef.current = loc;
          sessionStorage.setItem("visitor_location", JSON.stringify(loc));
          return loc;
        }
      } catch (_err) {
        // try next provider
      }
    }

    return null;
  }, []);

  const trackActivity = useCallback(async (
    activityType: ActivityType,
    options?: TrackingOptions
  ) => {
    if (!isProductionDomain()) return;
    if (isBot()) return;

    const currentPath = options?.pagePath || window.location.pathname;
    // Hard-exclude admin/auth/diagnostic/preview paths from commercial analytics.
    if (isExcludedPath(currentPath)) return;
    // Additional technical-route guard (favicon, /api/*, /img/*, static assets,
    // sitemaps, healthchecks, _lovable_* preview routes).
    if (isTechnicalPath(currentPath)) return;

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
      const botSuspect = detectBotSuspect(deviceInfo);
      const isPreview = isPreviewHost();
      const firstTouch = getFirstTouchUtm(utmParams);
      const quality = classifyTrafficQuality({
        isAdminPath: false,
        isInternal,
        isBotSuspect: botSuspect.suspect,
        isPreview,
        country: location?.country,
      });

      const clean = sanitizeTrackingFields({
        page_path: currentPath,
        referrer,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_term: utmParams.utm_term,
        utm_content: utmParams.utm_content,
      });
      // Drop the row entirely if its page_path is malformed/spam.
      if (!clean.page_path) {
        console.warn('[Visitor Tracking] Quarantined: malformed page_path');
        return;
      }

      const { error } = await supabase
        .from("visitor_activity")
        .insert({
          session_id: sessionId.current,
          visitor_id: visitorId.current,
          activity_type: activityType,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          country: location?.country || null,
          city: location?.city || null,
          referrer: clean.referrer,
          utm_source: clean.utm_source,
          utm_medium: clean.utm_medium,
          utm_campaign: clean.utm_campaign,
          utm_term: clean.utm_term,
          utm_content: clean.utm_content,
          utm_first_source: firstTouch.first_source,
          utm_first_medium: firstTouch.first_medium,
          utm_first_campaign: firstTouch.first_campaign,
          page_path: clean.page_path,
          product_id: options?.productId || null,
          product_name: options?.productName || null,
          product_price: options?.productPrice || null,
          product_quantity: options?.productQuantity || null,
          product_category: options?.productCategory || null,
          order_id: options?.orderId || null,
          order_value: options?.orderValue || null,
          device_type: deviceInfo.device_type,
          browser: deviceInfo.browser,
          screen_width: deviceInfo.screen_width,
          screen_height: deviceInfo.screen_height,
          referrer_category: referrerCategory,
          is_internal: isInternal,
          is_admin_path: false,
          is_bot_suspect: botSuspect.suspect,
          bot_suspect_reason: botSuspect.reason,
          traffic_quality: quality,
          geo_confidence: geoConfidenceFor(location?.country),
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
    trackBeginCheckout: () => trackActivity("begin_checkout"),
    trackProductView: (productId: string, productName: string, productPrice?: number, productCategory?: string) =>
      trackActivity("product_view", { productId, productName, productPrice, productCategory }),
    // New funnel events
    trackAddToCart: (productId: string, productName: string, productPrice: number, quantity: number = 1, productCategory?: string) =>
      trackActivity("add_to_cart", { productId, productName, productPrice, productQuantity: quantity, productCategory }),
    trackViewCart: () => trackActivity("view_cart"),
    trackRemoveFromCart: (productId: string, productName: string, productPrice: number, quantity: number = 1) =>
      trackActivity("remove_from_cart", { productId, productName, productPrice, productQuantity: quantity }),
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
  const path = options?.pagePath || window.location.pathname;
  if (isExcludedPath(path)) return;

  const sessionId = getSessionId();
  const visitorId = getVisitorId();
  const utmParams = getUTMParams();
  const referrer = getReferrer();
  const deviceInfo = getDeviceInfo();
  const referrerCategory = categorizeReferrer(referrer, utmParams);
  const botSuspect = detectBotSuspect(deviceInfo);
  const isPreview = isPreviewHost();
  const firstTouch = getFirstTouchUtm(utmParams);

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
  const quality = classifyTrafficQuality({
    isAdminPath: false,
    isInternal,
    isBotSuspect: botSuspect.suspect,
    isPreview,
    country: location?.country,
  });

  const clean = sanitizeTrackingFields({
    page_path: options?.pagePath || window.location.pathname,
    referrer,
    utm_source: utmParams.utm_source,
    utm_medium: utmParams.utm_medium,
    utm_campaign: utmParams.utm_campaign,
    utm_term: utmParams.utm_term,
    utm_content: utmParams.utm_content,
  });
  if (!clean.page_path) return;

  const { error } = await supabase
    .from("visitor_activity")
    .insert({
      session_id: sessionId,
      visitor_id: visitorId,
      activity_type: activityType,
      latitude: location?.latitude || null,
      longitude: location?.longitude || null,
      country: location?.country || null,
      city: location?.city || null,
      referrer: clean.referrer,
      utm_source: clean.utm_source,
      utm_medium: clean.utm_medium,
      utm_campaign: clean.utm_campaign,
      utm_term: clean.utm_term,
      utm_content: clean.utm_content,
      utm_first_source: firstTouch.first_source,
      utm_first_medium: firstTouch.first_medium,
      utm_first_campaign: firstTouch.first_campaign,
      page_path: clean.page_path,
      product_id: options?.productId || null,
      product_name: options?.productName || null,
      product_price: options?.productPrice || null,
      product_quantity: options?.productQuantity || null,
      product_category: options?.productCategory || null,
      order_id: options?.orderId || null,
      order_value: options?.orderValue || null,
      device_type: deviceInfo.device_type,
      browser: deviceInfo.browser,
      screen_width: deviceInfo.screen_width,
      screen_height: deviceInfo.screen_height,
      referrer_category: referrerCategory,
      is_internal: isInternal,
      is_admin_path: false,
      is_bot_suspect: botSuspect.suspect,
      bot_suspect_reason: botSuspect.reason,
      traffic_quality: quality,
      geo_confidence: geoConfidenceFor(location?.country),
    });

  if (error) {
    console.error("Error tracking activity:", error);
  }
};
