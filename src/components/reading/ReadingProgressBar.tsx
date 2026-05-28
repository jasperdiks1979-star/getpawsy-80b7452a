import { useEffect, useState } from 'react';
import { getConversionFlag } from '@/lib/conversionFlags';

/**
 * CI-14 — Sticky reading-progress bar for editorial pages (guides + blog).
 * Pure presentation; tracks documentElement scroll position with rAF
 * throttling. SSR-safe. Hidden when the premiumReading flag is off.
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getConversionFlag('premiumReading')) return;
    let ticking = false;
    const update = () => {
      const doc = document.documentElement;
      const total = (doc.scrollHeight - window.innerHeight) || 1;
      const pct = Math.max(0, Math.min(100, (window.scrollY / total) * 100));
      setProgress(pct);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  if (!getConversionFlag('premiumReading')) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-40 h-[2px] bg-transparent pointer-events-none"
    >
      <div
        className="h-full bg-primary transition-[width] duration-100 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default ReadingProgressBar;