import { getConsent } from './cookieConsent';
import { canAutoGrantConsent } from './geoConsent';
import { isSyntheticTraffic } from './syntheticTraffic';

export const GA4_ID = 'G-5WYL8RJDZF';
export const CONSENT_CHANGED = 'gp:consent-changed';
export function hasAnalyticsConsent(): boolean {
  const choice = getConsent();
  return choice === 'all' || (choice === null && canAutoGrantConsent());
}
type PageView = { page_path: string; page_location: string; page_title: string };
/** In-memory only; consecutive callbacks dedupe, back navigation survives. */
export function createPageViewBuffer(send: (view: PageView) => void, allowed: () => boolean) {
  let ready = false;
  let lastPath: string | null = null;
  const pending: PageView[] = [];
  const flush = () => {
    if (!ready || !allowed()) return;
    while (pending.length) {
      const view = pending.shift();
      if (view) send(view);
    }
  };
  return {
    enqueue(view: PageView) {
      if (!allowed()) return;
      if (lastPath === view.page_path) return;
      lastPath = view.page_path;
      pending.push({ ...view });
      if (pending.length > 50) pending.shift();
      flush();
    },
    ready() { ready = true; flush(); },
    consentChanged() {
      if (!allowed()) { pending.length = 0; lastPath = null; }
      flush();
    },
  };
}
const buffer = createPageViewBuffer(
  view => window.gtag('event', 'page_view', { ...view, send_to: GA4_ID }),
  hasAnalyticsConsent,
);
export const queueGa4PageView = (view: PageView) => {
  if (isSyntheticTraffic()) return;
  buffer.enqueue(view);
};
export const markGa4Ready = buffer.ready;
if (typeof window !== 'undefined') window.addEventListener(CONSENT_CHANGED, buffer.consentChanged);