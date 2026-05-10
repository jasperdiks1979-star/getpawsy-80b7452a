/**
 * useTikTokLanding — detects TikTok ad traffic.
 *
 * Activates the TikTok-optimized PDP variant when any of these are present:
 *   ?utm_source=tiktok
 *   ?ad=tt
 *   ?src=tiktok
 *
 * Returns { isTikTok, scrollToBuy } so components can branch safely without
 * touching the canonical PDP for organic / Google traffic.
 */
import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useTikTokLanding() {
  const [searchParams] = useSearchParams();

  const isTikTok = useMemo(() => {
    const utm = (searchParams.get('utm_source') || '').toLowerCase();
    const ad = (searchParams.get('ad') || '').toLowerCase();
    const src = (searchParams.get('src') || '').toLowerCase();
    if (utm.includes('tiktok') || ad === 'tt' || ad === 'tiktok' || src.includes('tiktok')) {
      return true;
    }
    // Organic TikTok in-app browser: referrer + UA hint.
    if (typeof document !== 'undefined') {
      const ref = (document.referrer || '').toLowerCase();
      if (ref.includes('tiktok.com')) return true;
    }
    if (typeof navigator !== 'undefined') {
      const ua = (navigator.userAgent || '').toLowerCase();
      // TikTok in-app webview UA contains "musical_ly" or "bytedance"
      if (ua.includes('musical_ly') || ua.includes('bytedance') || ua.includes('tiktok')) {
        return true;
      }
    }
    return false;
  }, [searchParams]);

  const scrollToBuy = useCallback(() => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('pdp-buy-box');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  return { isTikTok, scrollToBuy };
}

export default useTikTokLanding;