import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      const next = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(prev => (prev === next ? prev : next));
    };
    mql.addEventListener("change", onChange);
    // Sync state on mount — only if different
    const initial = window.innerWidth < MOBILE_BREAKPOINT;
    setIsMobile(prev => (prev === initial ? prev : initial));
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
