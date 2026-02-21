import { useEffect, useState } from 'react';

/** Minimal scroll progress bar at top of viewport (Phase 6 behavioral signal) */
export function ScrollProgressIndicator() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (progress < 1) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-muted/30">
      <div
        className="h-full bg-primary transition-[width] duration-75"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
