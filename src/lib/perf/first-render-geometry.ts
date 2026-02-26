/**
 * First-Render Geometry Freeze — detects hydration-induced layout shifts.
 *
 * Captures boundingClientRect of above-the-fold elements on first paint,
 * then re-measures after hydration (rAF x2). If vertical offset delta > 2px,
 * it flags a geometry mismatch.
 *
 * Zero production impact — gated by import.meta.env.PROD.
 */

const SELECTORS = ['#static-hero-shell', 'nav.navbar, nav[class*="navbar"]', '.trending-strip, [class*="trending"]'] as const;
const TOLERANCE_PX = 2;

interface Rect { top: number; height: number; selector: string }

function measure(): Rect[] {
  return SELECTORS.flatMap(sel => {
    const el = document.querySelector(sel);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{ top: Math.round(r.top), height: Math.round(r.height), selector: sel }];
  });
}

let firstPaintRects: Rect[] = [];

export function captureFirstPaintGeometry(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;
  firstPaintRects = measure();
}

export function verifyHydrationGeometry(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;
  if (!firstPaintRects.length) return;

  // Double rAF to wait for React paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const postRects = measure();
      const mismatches: string[] = [];

      for (const pre of firstPaintRects) {
        const post = postRects.find(p => p.selector === pre.selector);
        if (!post) continue;
        const delta = Math.abs(post.top - pre.top);
        if (delta > TOLERANCE_PX) {
          mismatches.push(
            `${pre.selector}: top ${pre.top}→${post.top} (Δ${delta}px)`
          );
        }
      }

      if (mismatches.length) {
        const msg = `[CLS-GUARD] Hydration geometry mismatch:\n${mismatches.join('\n')}`;
        console.error(msg);

        // Expose on window for CI/test assertions
        if ((window as any).__CLS_GUARD__) {
          (window as any).__CLS_GUARD__.geometryMismatch = true;
          (window as any).__CLS_GUARD__.geometryDeltas = mismatches;
        }

        if (import.meta.env.DEV) {
          throw new Error(msg);
        }
      } else {
        if ((window as any).__CLS_GUARD__) {
          (window as any).__CLS_GUARD__.geometryMismatch = false;
        }
      }
    });
  });
}
