/**
 * Image Policy Scanner — detects above-the-fold images missing intrinsic sizing
 * or incorrectly applying content-visibility.
 *
 * Dev/preview only — zero production cost.
 */

const FOLD_THRESHOLD_PX = 900; // generous above-the-fold cutoff for mobile

export function scanImagePolicy(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;

  // Run after images have had time to load/layout
  const run = () => {
    const imgs = document.querySelectorAll<HTMLImageElement>('img');

    for (const img of imgs) {
      const rect = img.getBoundingClientRect();
      const isAboveFold = rect.top < FOLD_THRESHOLD_PX && rect.bottom > 0;
      if (!isAboveFold) continue;

      // Check intrinsic sizing
      const hasWidth = img.hasAttribute('width') || img.style.width;
      const hasHeight = img.hasAttribute('height') || img.style.height;
      if (!hasWidth || !hasHeight) {
        console.error(
          `[CLS-GUARD] Missing intrinsic size on above-fold img: ${img.src.slice(0, 120)}`,
          { width: img.getAttribute('width'), height: img.getAttribute('height'), el: img }
        );
      }

      // Check content-visibility
      const cv = getComputedStyle(img).getPropertyValue('content-visibility');
      if (cv === 'auto') {
        console.error(
          `[CLS-GUARD] content-visibility:auto on above-fold img: ${img.src.slice(0, 120)}`,
          { el: img }
        );
      }
    }
  };

  // Wait for load event + idle
  if (document.readyState === 'complete') {
    requestAnimationFrame(run);
  } else {
    window.addEventListener('load', () => requestAnimationFrame(run), { once: true });
  }
}
