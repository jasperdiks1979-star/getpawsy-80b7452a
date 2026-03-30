/**
 * StickyMobileCta — Fixed bottom bar on mobile (≤768px) with Buy Now CTA.
 * Hides on scroll down, shows on scroll up.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

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
      <div className="flex items-center justify-between border-t border-border bg-card/95 backdrop-blur-sm shadow-lg px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground">$268.99</span>
          <span className="text-[10px] text-muted-foreground">Free US Shipping</span>
        </div>
        <Link
          to="/product/automatic-cat-litter-box-self-cleaning-app-control"
          className="rounded-full px-6 py-2.5 text-sm font-semibold bg-[hsl(24,95%,53%)] text-white hover:bg-[hsl(24,95%,47%)] active:scale-[0.97] transition-all duration-200"
        >
          Buy Now — Free US Shipping
        </Link>
      </div>
    </div>
  );
}

export default StickyMobileCta;
