/**
 * StickyMobileCta — Fixed bottom bar on mobile (≤768px) with Dog/Cat collection links.
 * Hides on scroll down, shows on scroll up. No JS libraries.
 */
import { useState, useEffect, useRef } from 'react';

export function StickyMobileCta() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Show when scrolling up or near top
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
          href="/collections/dog"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5" />
            <path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5" />
            <path d="M8 14v.5" /><path d="M16 14v.5" />
            <path d="M11.25 16.25h1.5L12 17l-.75-.75z" />
            <path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306" />
          </svg>
          Shop Dog
        </a>
        <a
          href="/collections/cat"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3.1-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5z" />
            <path d="M8 14v.5" /><path d="M16 14v.5" />
            <path d="M11.25 16.25h1.5L12 17l-.75-.75z" />
          </svg>
          Shop Cat
        </a>
      </div>
    </div>
  );
}

export default StickyMobileCta;
