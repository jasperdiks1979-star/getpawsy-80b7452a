import { useEffect } from 'react';
import { buildCanonicalUrl } from '@/lib/seo-canonical';

/**
 * CanonicalTag — updates the pre-hydration canonical link in index.html
 * instead of adding a duplicate via Helmet.
 * 
 * This ensures exactly 1 canonical tag exists at all times.
 */
export function useCanonical(path: string) {
  const canonical = buildCanonicalUrl(path);

  useEffect(() => {
    const el = document.getElementById('gp-canonical') as HTMLLinkElement | null;
    if (el) {
      el.setAttribute('href', canonical);
    }

    // Also sync hreflang tags
    const hIds = ['gp-hreflang-en', 'gp-hreflang-en-us', 'gp-hreflang-default'];
    hIds.forEach(id => {
      const hEl = document.getElementById(id) as HTMLLinkElement | null;
      if (hEl) hEl.setAttribute('href', canonical);
    });
  }, [canonical]);

  return canonical;
}
