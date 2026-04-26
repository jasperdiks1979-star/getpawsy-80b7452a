import { ScrollToTop } from '../ui/scroll-to-top';
import { PageTransition } from '../ui/page-transition';
import { MarketingErrorBoundary } from '../error/MarketingErrorBoundary';

import { lazy, Suspense, useState, useEffect, useMemo } from 'react';

// ⚡ Navbar + Footer: lazy-loaded — keeps them out of initial JS evaluation
// The static HTML shell in index.html covers the visual gap for hero
const Navbar = lazy(() => import('./Navbar').then(m => ({ default: m.Navbar })));
const Footer = lazy(() => import('./Footer').then(m => ({ default: m.Footer })));

import { OrganizationSchema } from '../seo/OrganizationSchema';
import { SitewiseTrustBar } from './SitewiseTrustBar';

// Lazy-load all non-critical marketing/overlay widgets
// WelcomePopup / SlowFeederLeadMagnet / ExitIntentPopup disabled for Merchant recovery mode
const CookieConsent = lazy(() => import('../marketing/CookieConsent').then(m => ({ default: m.CookieConsent })).catch(() => ({ default: () => null })));
const ChatWidgetWrapper = lazy(() => import('../chat/ChatWidgetWrapper').then(m => ({ default: m.ChatWidgetWrapper })).catch(() => ({ default: (() => null) as any })));
// Dev-only: floating consent simulator (renders nothing on production hosts)
const DevConsentToggle = lazy(() => import('../dev/DevConsentToggle').then(m => ({ default: m.DevConsentToggle })).catch(() => ({ default: () => null })));
const ConsentLeakWarning = lazy(() => import('../dev/ConsentLeakWarning').then(m => ({ default: m.ConsentLeakWarning })).catch(() => ({ default: () => null })));

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Hook that defers mounting of non-critical widgets until after:
 * - A product card has rendered (gridFirstItemRendered), OR
 * - User interaction (scroll/click/touch), OR
 * - 5 seconds, whichever comes first.
 * 
 * This reduces main-thread contention during the critical LCP window on mobile.
 */
function useDeferWidgets(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    let cancelled = false;
    const activate = () => { if (!cancelled) setReady(true); };

    // 5s hard cap
    const timer = setTimeout(activate, 5000);

    // User interaction triggers immediate mount
    const events = ['scroll', 'click', 'touchstart'] as const;
    const handler = () => { activate(); cleanup(); };
    events.forEach(e => window.addEventListener(e, handler, { once: true, passive: true }));

    // Check if grid has already rendered via the timing mark — reduced polling, with cleanup
    let checkCount = 0;
    const maxChecks = 15; // max 3 seconds of checking (200ms * 15)
    const checkGrid = setInterval(() => {
      checkCount++;
      if (checkCount >= maxChecks) {
        clearInterval(checkGrid);
        return;
      }
      try {
        import('@/lib/grid-timing').then(({ getGridTiming }) => {
          if (getGridTiming().gridFirstItemRenderedAt !== null) {
            activate();
            cleanup();
          }
        });
      } catch {}
    }, 200);

    function cleanup() {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(checkGrid);
      events.forEach(e => window.removeEventListener(e, handler));
    }

    return cleanup;
  }, [ready]);

  return ready;
}

export const Layout = ({ children }: LayoutProps) => {
  const widgetsReady = useDeferWidgets();

  // Read promo banner state synchronously to match Suspense fallback height with actual Navbar.
  // This prevents a 40px CLS when the promo banner has been dismissed.
  const navbarFallbackHeight = useMemo(() => {
    try {
      return localStorage.getItem('promo-banner-dismissed') === 'true' ? 72 : 112;
    } catch {
      return 112; // default: promo visible
    }
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col w-full max-w-[100vw] overflow-x-hidden">
      <OrganizationSchema />
      <Suspense fallback={<div style={{ height: navbarFallbackHeight }} aria-hidden="true" />}>
        <Navbar />
      </Suspense>
      {/* TrendingNowStrip removed for cleaner homepage */}
      <PageTransition>
        <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden pb-safe">{children}</main>
      </PageTransition>
      <SitewiseTrustBar />
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
      {/* CookieConsent always mounts (has its own defer logic) */}
      <MarketingErrorBoundary>
        <Suspense fallback={null}>
          <ScrollToTop />
          <CookieConsent />
          <DevConsentToggle />
          <ConsentLeakWarning />
        </Suspense>
      </MarketingErrorBoundary>
      {/* Chat widget deferred until after grid paint / interaction / 5s */}
      {widgetsReady && (
        <MarketingErrorBoundary>
          <Suspense fallback={null}>
            <ChatWidgetWrapper />
          </Suspense>
        </MarketingErrorBoundary>
      )}
      
    </div>
  );
};
