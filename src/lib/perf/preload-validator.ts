/**
 * Preload Validator — ensures hero image preload matches actual request.
 *
 * Checks:
 * 1. Preload uses single href (not imagesrcset)
 * 2. Has fetchpriority="high"
 * 3. href matches the actual hero img src
 *
 * Dev/preview only — zero production cost.
 */

export function validateHeroPreload(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const preloads = document.querySelectorAll<HTMLLinkElement>(
        'link[rel="preload"][as="image"]'
      );

      if (!preloads.length) {
        console.warn('[CLS-GUARD] No image preload found in <head>');
        return;
      }

      for (const link of preloads) {
        // Check for imagesrcset usage (fragile)
        if (link.getAttribute('imagesrcset')) {
          console.warn(
            '[CLS-GUARD] Hero preload uses imagesrcset — prefer single href for reliability',
            link.href
          );
        }

        // Check fetchpriority
        if (link.getAttribute('fetchpriority') !== 'high') {
          console.warn('[CLS-GUARD] Hero preload missing fetchpriority="high"', link.href);
        }
      }

      // Match preload href against hero image src
      const heroImg = document.querySelector<HTMLImageElement>(
        '#static-hero-shell img, [data-hero-image] img, .hero-image'
      );
      if (!heroImg) return;

      const heroSrc = heroImg.currentSrc || heroImg.src;
      const preloadHref = preloads[0]?.href;

      if (preloadHref && heroSrc && !heroSrc.includes(new URL(preloadHref).pathname.split('/').pop() || '____')) {
        // Fuzzy match — compare last path segment
        console.warn(
          `[CLS-GUARD] Hero preload mismatch:\n  preload: ${preloadHref}\n  actual:  ${heroSrc}`
        );
      }
    });
  });
}
