/**
 * CI-8 — Homepage personalization client lib.
 *
 * Tiny, side-effect-free reader/writer in front of the `ai-homepage-engine`
 * edge function. Designed so that the storefront ALWAYS renders the static
 * premium homepage first, and the variant (if any) is applied only after
 * hydration. Failures are silent; nothing here can break a render.
 */

import { supabase } from '@/integrations/supabase/client';
import { getConversionFlag } from '@/lib/conversionFlags';
import { getDeviceClassification } from '@/lib/deviceClassify';
import { getCachedGeoQuality } from '@/lib/geoClassify';

export type HomepageVariant = {
  variantKey: string;
  hero: {
    category: string;
    productId: string | null;
    headline: string | null;
    subheadline: string | null;
    primaryCta: string | null;
    emotionalAngle: string;
  };
  categoryBias: string[];
  blockOrder: string[];
  ttlSeconds: number;
  fetchedAt: number;
};

const CACHE_KEY = 'gp_hp_variant_v1';
const SESSION_ID_KEY = 'gp_session_id';
let inflight: Promise<HomepageVariant | null> | null = null;

function isBotUA(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = (navigator.userAgent || '').toLowerCase();
  return /bot|crawl|spider|preview|lighthouse|headless/.test(ua);
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

function detectTrafficSource(): string {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = params.get('utm_source');
    if (utm) return utm.toLowerCase();
    const ref = (document.referrer || '').toLowerCase();
    if (ref.includes('tiktok')) return 'tiktok';
    if (ref.includes('pinterest') || ref.includes('pin.it')) return 'pinterest';
    if (ref.includes('instagram')) return 'instagram';
    if (ref.includes('facebook') || ref.includes('fb.com')) return 'facebook';
    if (ref.includes('google')) return 'google';
    if (!ref) return 'direct';
    return 'referral';
  } catch {
    return 'unknown';
  }
}

function readCache(): HomepageVariant | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomepageVariant;
    const age = (Date.now() - (parsed.fetchedAt || 0)) / 1000;
    if (age > (parsed.ttlSeconds || 900)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(v: HomepageVariant): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/**
 * Hard gate. Personalization NEVER runs unless every check passes.
 */
export function shouldUsePersonalization(): boolean {
  if (typeof window === 'undefined') return false;
  if (!getConversionFlag('aiHomepage')) return false;
  if (isBotUA()) return false;
  const path = window.location.pathname || '';
  if (path.startsWith('/admin')) return false;
  const dev = getDeviceClassification();
  if ((dev.device_confidence ?? 0) < 60) return false;
  return true;
}

/**
 * Returns the cached variant if available. Otherwise kicks off a background
 * fetch (fire-and-forget) and returns null so the first paint stays static.
 */
export function getHomepageVariant(): HomepageVariant | null {
  if (!shouldUsePersonalization()) return null;
  const cached = readCache();
  if (cached) return cached;
  void prefetchHomepageVariant();
  return null;
}

export function prefetchHomepageVariant(): Promise<HomepageVariant | null> {
  if (!shouldUsePersonalization()) return Promise.resolve(null);
  const cached = readCache();
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  const dev = getDeviceClassification();
  const payload = {
    traffic_source: detectTrafficSource(),
    geo_quality: getCachedGeoQuality(),
    device_quality: dev.device ?? 'unknown',
    returning: !!(() => {
      try {
        return localStorage.getItem('gp_returning_v1') === '1';
      } catch {
        return false;
      }
    })(),
    session_id: getSessionId(),
  };

  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-homepage-engine', {
        body: payload,
      });
      if (error || !data || typeof data !== 'object') return null;
      const v = (data as { variant?: HomepageVariant }).variant;
      if (!v || !v.variantKey) return null;
      const enriched: HomepageVariant = { ...v, fetchedAt: Date.now() };
      writeCache(enriched);
      try {
        localStorage.setItem('gp_returning_v1', '1');
      } catch {
        /* ignore */
      }
      return enriched;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function getHeroBias(): HomepageVariant['hero'] | null {
  const v = getHomepageVariant();
  return v ? v.hero : null;
}

export function getCategoryBias(): string[] {
  const v = getHomepageVariant();
  return v ? v.categoryBias : [];
}

export function getBlockOrder(): string[] | null {
  const v = getHomepageVariant();
  return v ? v.blockOrder : null;
}

/**
 * Fire-and-forget event tracker. Uses sendBeacon when available so the
 * request survives navigation. Never throws.
 */
export function trackHomepageVariant(
  eventType: 'impression' | 'hero_click' | 'pdp_view' | 'atc' | 'purchase' | 'bounce',
  productId?: string,
): void {
  try {
    if (!shouldUsePersonalization()) return;
    const v = readCache();
    if (!v) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-homepage-event`;
    const body = JSON.stringify({
      session_id: getSessionId(),
      variant_key: v.variantKey,
      event_type: eventType,
      product_id: productId ?? null,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}