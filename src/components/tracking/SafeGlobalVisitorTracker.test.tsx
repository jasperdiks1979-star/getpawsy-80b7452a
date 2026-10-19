import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ path: '/', hits: vi.fn() }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: state.path }) }));
vi.mock('@/hooks/useVisitorTracking', () => ({ useVisitorTracking: () => ({ trackBrowsing: vi.fn(), trackViewCart: vi.fn(), trackCheckout: vi.fn() }) }));
vi.mock('@/hooks/useVisitorHeartbeat', () => ({ useVisitorHeartbeat: vi.fn() }));
vi.mock('@/lib/marketingClient', () => ({ MARKETING_FLAGS: { GOOGLE_ENABLED: true }, fireMarketingAsync: (_: string, fn: () => void) => fn() }));
vi.mock('@/lib/ga4PageViews', () => ({ queueGa4PageView: (view: unknown) => state.hits('event', 'page_view', view) }));
vi.mock('@/components/error/MarketingErrorBoundary', () => ({ MarketingErrorBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/lib/traffic', () => ({ pushTrafficContext: vi.fn() }));
vi.mock('@/lib/utmNormalizer', () => ({ resolveUtm: vi.fn(), syncUtmToUrl: vi.fn(), captureFirstTouch: vi.fn() }));
vi.mock('@/lib/ux-signals', () => ({ installUxSignals: vi.fn() }));
vi.mock('@/lib/engagementStart', () => ({ armEngagementStart: vi.fn() }));
vi.mock('@/lib/sessionQuality', () => ({ installSessionQuality: vi.fn(), sessionQualitySignals: { page: vi.fn(), product: vi.fn() } }));
vi.mock('@/lib/analyticsFunnel', () => ({ recordFunnelStep: vi.fn() }));
vi.mock('@/lib/cci', () => ({ trackCci: vi.fn() }));
vi.mock('@/lib/canonicalSession', () => ({ getCanonicalSessionId: () => 'test-session' }));
vi.mock('@/lib/crawlerCoverage', () => ({ claimCrawlerLog: () => false }));
import { SafeGlobalVisitorTracker } from './SafeGlobalVisitorTracker';
describe('GA4 pageview deduplication', () => {
  beforeEach(() => { state.path = '/'; state.hits.mockClear(); window.gtag = state.hits; });
  it('emits once despite geo callback refreshes', () => {
    const view = render(<SafeGlobalVisitorTracker />);
    view.rerender(<SafeGlobalVisitorTracker />); view.rerender(<SafeGlobalVisitorTracker />);
    expect(state.hits).toHaveBeenCalledTimes(1);
    expect(state.hits).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ page_path: '/' }));
  });
  it('emits once per navigation, including returning to a previous path', () => {
    const view = render(<SafeGlobalVisitorTracker />);
    state.path = '/products/example'; view.rerender(<SafeGlobalVisitorTracker />);
    view.rerender(<SafeGlobalVisitorTracker />);
    state.path = '/'; view.rerender(<SafeGlobalVisitorTracker />);
    expect(state.hits.mock.calls.map(call => call[2].page_path)).toEqual(['/', '/products/example', '/']);
  });
});