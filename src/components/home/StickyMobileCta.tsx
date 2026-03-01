/**
 * StickyMobileCta — Fixed bottom bar on mobile (≤768px) with dog training links.
 * Hides on scroll down, shows on scroll up. No JS libraries.
 */
import { useState, useEffect, useRef } from 'react';

export function StickyMobileCta() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y < 100 || y < lastScrollY.current);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 md:hidden transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ contain: 'layout' }}
    >
      <div className="flex border-t border-border bg-card/95 backdrop-blur-sm shadow-lg">
        <a
          href="/collections/dog-potty-training"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
        >
          🚽 Potty Training
        </a>
        <a
          href="/collections/dog-leash-control"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
        >
          🦮 Leash & Control
        </a>
      </div>
    </div>
  );
}

export default StickyMobileCta;
