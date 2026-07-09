import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useVisitorHeartbeat } from '@/hooks/useVisitorHeartbeat';
import { fireMarketingAsync, MARKETING_FLAGS } from '@/lib/marketingClient';
import { MarketingErrorBoundary } from '@/components/error/MarketingErrorBoundary';
import { pushTrafficContext } from '@/lib/traffic';
import { resolveUtm, syncUtmToUrl, captureFirstTouch } from '@/lib/utmNormalizer';
import { installUxSignals } from '@/lib/ux-signals';
import { armEngagementStart } from '@/lib/engagementStart';
import { installSessionQuality, sessionQualitySignals } from '@/lib/sessionQuality';
import { recordFunnelStep } from '@/lib/analyticsFunnel';
import { trackCci } from '@/lib/cci';

/**
 * Safe Global Visitor Tracker — deferred gtag calls, never blocks rendering.
 * Now also pushes traffic context to dataLayer on every route change.
 */
const TrackerInner = () => {
  const location = useLocation();
  const { trackBrowsing, trackViewCart, trackCheckout } = useVisitorTracking();

  useVisitorHeartbeat(30000);

  useEffect(() => {
    // One-time install of rage / dead-click / scroll-depth / form-abandon
    // capture. Never throws — wraps its own listeners.
    try { installUxSignals(); } catch { /* non-fatal */ }
    // Engagement-start gate (true human visit signal) — non-blocking.
    try { armEngagementStart(); } catch { /* non-fatal */ }
    // Session quality collector.
    try { installSessionQuality(); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    const path = location.pathname;

    // Backfill the URL with inferred UTMs (e.g. TikTok ad clicks that
    // arrive with only `ttclid` / `ad=tt`) BEFORE firing GA4 page_view,
    // so `page_location` carries the correct utm_source / utm_medium and
    // GA4 stops bucketing paid TikTok traffic as `direct`.
    try {
      const resolved = resolveUtm({ search: window.location.search });
      syncUtmToUrl(resolved);
      // First-touch snapshot (idempotent): pins the ORIGINAL referrer,
      // UTM and landing page for this browser so a later purchase can
      // still be credited to the true entry channel, even after internal
      // navigation rewrites the URL.
      captureFirstTouch({ utm: resolved });
    } catch {
      /* non-fatal — never block render or analytics */
    }

    // Push traffic context to dataLayer (non-blocking, fires before page_view)
    pushTrafficContext(path);

    // Defer Google Analytics page_view — non-blocking
    if (MARKETING_FLAGS.GOOGLE_ENABLED) {
      fireMarketingAsync('gtag-pageview', () => {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'page_view', {
            page_location: window.location.href,
            page_path: path,
            page_title: document.title,
          });
        }
      }, 'google');
    }

    // Visitor tracking (internal analytics — always runs)
    // Canonical page_view — fires on EVERY route change so every real
    // visitor enters the canonical pipeline (cci_events → canonical_events
    // → canonical_sessions → analytics-truth), regardless of which route
    // they landed on. Without this, only /, /products/*, /products,
    // /collections/* and /cart produced a CCI event, so visitors landing
    // on /guides/*, /blog/*, /dashboard, /checkout, etc. never showed up
    // in the "Last hour / 5h / 10h / 24h" dashboards even though
    // visitor_activity + Live Presence recorded them.
    // Dedup key = cci|CANONICAL_PAGE_VIEW|session_id|page_path|60s bucket,
    // so overlap with homepage_view / collection_view / product_view on
    // the same path collapses to a single canonical_events row.
    try { trackCci('page_view', { funnel_stage: 'page' }); } catch {}
    if (path === '/checkout') {
      trackCheckout();
      try { sessionQualitySignals.checkout(); } catch {}
      try { recordFunnelStep('begin_checkout'); } catch {}
      // NOTE: `checkout_loaded` CCI event is owned by Checkout.tsx to avoid
      // double-firing (route-change + component-mount would emit twice and
      // inflate CANONICAL_CHECKOUT). Do not re-add here.
    } else if (path === '/cart') {
      trackViewCart();
      try { sessionQualitySignals.cart(); } catch {}
      // GA4 canonical view_cart fire (cart page mount). Internal DB already
      // recorded via trackViewCart() above; this adds GA4 parity.
      try {
        if (MARKETING_FLAGS.GOOGLE_ENABLED) {
          import('@/lib/analytics').then((m) => m.trackViewCart([])).catch(() => {});
        }
      } catch {}
      try { recordFunnelStep('view_cart'); } catch {}
      try { trackCci('cart_open', { funnel_stage: 'cart' }); } catch {}
    } else {
      trackBrowsing(path);
      if (path.startsWith('/products/')) {
        try { sessionQualitySignals.product(); } catch {}
        try { recordFunnelStep('view_item'); } catch {}
        // Note: product_view CCI event is already fired from ProductDetail
        // once the PDP mounts with a resolved product — do NOT double-emit
        // here (would inflate CANONICAL_PRODUCT_VIEW).
      } else if (path === '/') {
        // Homepage — feeds CANONICAL_PAGE_VIEW so the Revenue War Room
        // "visitors" tile reflects real storefront traffic.
        try { trackCci('homepage_view', { funnel_stage: 'landing' }); } catch {}
      } else if (path === '/products' || path.startsWith('/collections')) {
        try { trackCci('collection_view', { funnel_stage: 'browse' }); } catch {}
      }
    }
    try { recordFunnelStep('page_view'); sessionQualitySignals.page(); } catch {}
  }, [location.pathname, trackBrowsing, trackViewCart, trackCheckout]);

  return null;
};

export const SafeGlobalVisitorTracker = () => (
  <MarketingErrorBoundary>
    <TrackerInner />
  </MarketingErrorBoundary>
);
