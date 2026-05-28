/**
 * Lightweight, additive geo classifier.
 *
 * - Calls the `geo-classify` edge function at most ONCE per session.
 * - Caches result in sessionStorage under `gp_geo_quality_v1` / `gp_geo_country_v1`.
 * - Fully best-effort: never throws, never blocks render, never affects checkout.
 *
 * Consumed by `src/lib/funnelEvents.ts::getGeoQuality()` (no behavior change
 * when the cache key is missing — falls back to `"unknown"`).
 */
import { supabase } from '@/integrations/supabase/client';

const QUALITY_KEY = 'gp_geo_quality_v1';
const COUNTRY_KEY = 'gp_geo_country_v1';
const INFLIGHT_KEY = 'gp_geo_inflight_v1';

let inflight: Promise<void> | null = null;

function alreadyCached(): boolean {
  try {
    return !!sessionStorage.getItem(QUALITY_KEY);
  } catch {
    return false;
  }
}

function schedule(cb: () => void): void {
  try {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(cb, { timeout: 2000 });
    } else {
      setTimeout(cb, 250);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Fire-and-forget. Safe to call from anywhere; only resolves the network
 * call once per session.
 */
export function ensureGeoClassified(): void {
  if (typeof window === 'undefined') return;
  if (alreadyCached()) return;
  if (inflight) return;
  try {
    if (sessionStorage.getItem(INFLIGHT_KEY)) return;
    sessionStorage.setItem(INFLIGHT_KEY, '1');
  } catch {
    /* ignore */
  }

  schedule(() => {
    inflight = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('geo-classify', {
          body: {},
        });
        if (error) return;
        const quality =
          (data && typeof data === 'object' && (data as Record<string, unknown>).geo_quality) ||
          'unknown';
        const country =
          (data && typeof data === 'object' && (data as Record<string, unknown>).country) || null;
        try {
          sessionStorage.setItem(QUALITY_KEY, String(quality));
          if (country) sessionStorage.setItem(COUNTRY_KEY, String(country));
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      } finally {
        try {
          sessionStorage.removeItem(INFLIGHT_KEY);
        } catch {
          /* ignore */
        }
        inflight = null;
      }
    })();
  });
}

export function getCachedGeoQuality(): string {
  try {
    return sessionStorage.getItem(QUALITY_KEY) || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getCachedGeoCountry(): string | null {
  try {
    return sessionStorage.getItem(COUNTRY_KEY);
  } catch {
    return null;
  }
}