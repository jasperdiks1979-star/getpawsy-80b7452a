import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from '../ui/scroll-to-top';
import { PageTransition } from '../ui/page-transition';
import { MarketingErrorBoundary } from '../error/MarketingErrorBoundary';
import { lazy, Suspense, useState, useEffect } from 'react';

// Lazy-load all non-critical marketing/overlay widgets
const WelcomePopup = lazy(() => import('../marketing/WelcomePopup').then(m => ({ default: m.WelcomePopup })).catch(() => ({ default: () => null })));
const ExitIntentPopup = lazy(() => import('../marketing/ExitIntentPopup').then(m => ({ default: m.ExitIntentPopup })).catch(() => ({ default: () => null })));
const SlowFeederLeadMagnet = lazy(() => import('../marketing/SlowFeederLeadMagnet').then(m => ({ default: m.SlowFeederLeadMagnet })).catch(() => ({ default: () => null })));
const CookieConsent = lazy(() => import('../marketing/CookieConsent').then(m => ({ default: m.CookieConsent })).catch(() => ({ default: () => null })));
const LiveVisitorBadge = lazy(() => import('../admin/LiveVisitorBadge').then(m => ({ default: m.LiveVisitorBadge })).catch(() => ({ default: () => null })));
const ChatWidgetWrapper = lazy(() => import('../chat/ChatWidgetWrapper').then(m => ({ default: m.ChatWidgetWrapper })).catch(() => ({ default: () => null })));

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

    const activate = () => setReady(true);

    // 5s hard cap
    const timer = setTimeout(activate, 5000);

    // User interaction triggers immediate mount
    const events = ['scroll', 'click', 'touchstart'] as const;
    const handler = () => { activate(); cleanup(); };
    events.forEach(e => window.addEventListener(e, handler, { once: true, passive: true }));

    // Check if grid has already rendered via the timing mark
    const checkGrid = setInterval(() => {
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

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col w-full max-w-[100vw] overflow-x-hidden">
      <Navbar />
      <PageTransition>
        <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden pb-safe">{children}</main>
      </PageTransition>
      <Footer />
      {/* CookieConsent always mounts (has its own defer logic) */}
      <MarketingErrorBoundary>
        <Suspense fallback={null}>
          <ScrollToTop />
          <CookieConsent />
        </Suspense>
      </MarketingErrorBoundary>
      {/* Other marketing widgets deferred until after grid paint / interaction / 5s */}
      {widgetsReady && (
        <MarketingErrorBoundary>
          <Suspense fallback={null}>
            <LiveVisitorBadge />
            <WelcomePopup />
            <ExitIntentPopup />
            <SlowFeederLeadMagnet />
            <ChatWidgetWrapper />
          </Suspense>
        </MarketingErrorBoundary>
      )}
    </div>
  );
};
