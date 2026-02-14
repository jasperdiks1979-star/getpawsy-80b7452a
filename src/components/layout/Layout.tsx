import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from '../ui/scroll-to-top';
import { PageTransition } from '../ui/page-transition';
import { MarketingErrorBoundary } from '../error/MarketingErrorBoundary';
import { lazy, Suspense } from 'react';

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

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col w-full max-w-[100vw] overflow-x-hidden">
      <Navbar />
      <PageTransition>
        <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden pb-safe">{children}</main>
      </PageTransition>
      <Footer />
      <MarketingErrorBoundary>
        <Suspense fallback={null}>
          <ScrollToTop />
          <LiveVisitorBadge />
          <WelcomePopup />
          <ExitIntentPopup />
          <SlowFeederLeadMagnet />
          <CookieConsent />
          <ChatWidgetWrapper />
        </Suspense>
      </MarketingErrorBoundary>
    </div>
  );
};
