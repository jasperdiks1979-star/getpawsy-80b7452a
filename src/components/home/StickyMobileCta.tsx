/**
 * StickyMobileCta — Fixed bottom bar on mobile (≤768px) with Shop Now CTA.
 * Hides on scroll down, shows on scroll up.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fireStickyAtcView } from '@/lib/funnelEvents';

export function StickyMobileCta() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y < 100 || y < lastScrollY.current);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Track first time the sticky CTA is actually visible in the viewport.
  // Passive IntersectionObserver, fires at most once per session via centralized dedupe.
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !firedRef.current) {
            firedRef.current = true;
            try {
              fireStickyAtcView({ source_component: 'sticky_mobile_cta' });
            } catch {
              /* analytics never breaks UX */
            }
            io.disconnect();
            return;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={barRef}
      className={`fixed bottom-0 left-0 right-0 z-40 md:hidden transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ contain: 'layout' }}
    >
      <div className="flex items-center justify-between border-t border-border bg-card/95 backdrop-blur-sm shadow-lg px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground">Free Shipping $35+</span>
          <span className="text-[10px] text-muted-foreground">5–10 business day delivery</span>
        </div>
        <Link
          to="/bestsellers"
          className="rounded-full px-6 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all duration-200"
        >
          Shop Bestsellers
        </Link>
      </div>
    </div>
  );
}

export default StickyMobileCta;
