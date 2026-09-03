import { lazy, Suspense, type ReactNode } from 'react';
import { V2Layout } from './V2Layout';
import { OrganizationSchema } from '@/components/seo/OrganizationSchema';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { MarketingErrorBoundary } from '@/components/error/MarketingErrorBoundary';

// Consent must keep mounting on every V2 page — GA4/TikTok/Pinterest gating
// depends on it. It is the only overlay widget carried over from the legacy
// Layout; no chat widget, no popups, no scroll-driven effects (WebKit safety).
const CookieConsent = lazy(() =>
  import('@/components/marketing/CookieConsent')
    .then((m) => ({ default: m.CookieConsent }))
    .catch(() => ({ default: () => null })),
);

/**
 * V2 page shell — drop-in replacement for the legacy `Layout` on V2-migrated
 * routes (PDP, cart). Same `children` API, so page bodies and all commerce
 * behaviour stay untouched; only the header/footer chrome changes.
 */
export function V2PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <OrganizationSchema />
      <V2Layout>{children}</V2Layout>
      <MarketingErrorBoundary>
        <Suspense fallback={null}>
          <ScrollToTop />
          <CookieConsent />
        </Suspense>
      </MarketingErrorBoundary>
    </>
  );
}

export default V2PageShell;
