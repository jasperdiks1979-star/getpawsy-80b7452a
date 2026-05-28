import { useEffect, useState } from 'react';

/**
 * Tracks vertical scroll direction with a small threshold so it doesn't
 * flap on every wheel tick. Returns `'down' | 'up' | null`.
 *
 * Used by the CI-11 navbar + checkout sticky bars to hide on scroll-down
 * and reveal on scroll-up. Read-only, passive listener, SSR-safe.
 */
export function useScrollDirection(threshold = 8): 'down' | 'up' | null {
  const [direction, setDirection] = useState<'down' | 'up' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const diff = y - lastY;
      if (Math.abs(diff) > threshold) {
        setDirection(diff > 0 ? 'down' : 'up');
        lastY = y;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return direction;
}

export default useScrollDirection;