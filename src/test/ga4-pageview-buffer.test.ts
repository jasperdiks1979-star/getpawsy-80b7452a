import { describe, expect, it, vi } from 'vitest';
const consent = vi.hoisted(() => ({ choice: null as 'all' | 'necessary' | null, auto: true }));
vi.mock('../lib/cookieConsent', () => ({ getConsent: () => consent.choice }));
vi.mock('../lib/geoConsent', () => ({ canAutoGrantConsent: () => consent.auto }));
import { createPageViewBuffer, hasAnalyticsConsent } from '../lib/ga4PageViews';
const view = (path: string) => ({ page_path: path, page_location: `https://getpawsy.pet${path}`, page_title: 'GetPawsy' });
describe('consented canonical pageview buffer', () => {
  it('preserves cold PDP until delayed readiness', () => {
    const send = vi.fn(); const b = createPageViewBuffer(send, () => true);
    b.enqueue(view('/products/stainless-steel')); expect(send).not.toHaveBeenCalled(); b.ready();
    expect(send).toHaveBeenCalledExactlyOnceWith(view('/products/stainless-steel'));
  });
  it('dedupes callbacks but permits home → product → home', () => {
    const send = vi.fn(); const b = createPageViewBuffer(send, () => true);
    for (const path of ['/', '/', '/products/example', '/products/example', '/']) b.enqueue(view(path));
    b.ready(); b.ready(); expect(send.mock.calls.map(([hit]) => hit.page_path)).toEqual(['/', '/products/example', '/']);
  });
  it('does not retain or send EU browsing before permission', () => {
    let allowed = false; const send = vi.fn(); const b = createPageViewBuffer(send, () => allowed);
    b.ready(); b.enqueue(view('/products/private')); expect(send).not.toHaveBeenCalled();
    allowed = true; b.consentChanged(); expect(send).not.toHaveBeenCalled();
    b.enqueue(view('/')); expect(send).toHaveBeenCalledExactlyOnceWith(view('/'));
  });
  it('sends US consented visits once after readiness', () => {
    const send = vi.fn(); const b = createPageViewBuffer(send, () => true);
    b.ready(); b.enqueue(view('/')); b.enqueue(view('/')); expect(send).toHaveBeenCalledTimes(1);
  });
  it('never sends when blocked script is not ready', () => {
    const send = vi.fn(); const b = createPageViewBuffer(send, () => true);
    b.enqueue(view('/')); b.enqueue(view('/products/example')); expect(send).not.toHaveBeenCalled();
  });
  it('drops queued views on consent revocation', () => {
    let allowed = true; const send = vi.fn(); const b = createPageViewBuffer(send, () => allowed);
    b.enqueue(view('/')); allowed = false; b.consentChanged(); b.ready();
    allowed = true; b.consentChanged(); expect(send).not.toHaveBeenCalled();
  });
  it('respects explicit US opt-out over automatic consent', () => {
    consent.auto = true; consent.choice = 'necessary'; expect(hasAnalyticsConsent()).toBe(false);
    consent.choice = null; expect(hasAnalyticsConsent()).toBe(true);
    consent.auto = false; expect(hasAnalyticsConsent()).toBe(false);
    consent.choice = 'all'; expect(hasAnalyticsConsent()).toBe(true);
  });
  it('permits current page only after EU consent without replaying earlier browsing', () => {
    let allowed = false; const send = vi.fn(); const b = createPageViewBuffer(send, () => allowed);
    b.enqueue(view('/products/example')); allowed = true; b.consentChanged();
    b.enqueue(view('/products/example')); b.ready();
    expect(send).toHaveBeenCalledExactlyOnceWith(view('/products/example'));
  });
});