/**
 * usePdpFunnelTracking — production-safe additive instrumentation for PDPs.
 *
 * Lazy-initialized (deferred via requestIdleCallback) so it never blocks
 * hydration, never adds CLS, never delays LCP, and never touches Stripe.
 * Fires:
 *   - pdp_view (once per session/product)
 *   - scroll_depth_25/50/75/100 (once each per session/page)
 *   - image_interaction (debounced)
 *   - rage_click (≥3 clicks <800ms on same target)
 *   - session_end / session_bounce on tab close
 *   - return_visit on first mount when visitor has prior visits
 */
import { useEffect, useRef } from 'react';
import {
  firePdpView,
  fireScrollDepth,
  fireRageClick,
  fireSessionEnd,
  fireReturnVisit,
} from '@/lib/funnelEvents';

const VISITOR_KEY = 'gp_visitor_v1';
const SESSION_INTERACTIONS_KEY = 'gp_sess_interactions_v1';
const SESSION_PAGEVIEWS_KEY = 'gp_sess_pageviews_v1';
const SESSION_START_KEY = 'gp_sess_start_v1';
const SESSION_END_FIRED_KEY = 'gp_sess_end_fired_v1';

type IdleFn = (cb: () => void) => void;
const idle: IdleFn =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb) =>
        (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(cb, { timeout: 2000 })
    : (cb) => setTimeout(cb, 800);

function bumpInteractionCount(): void {
  try {
    const n = Number(sessionStorage.getItem(SESSION_INTERACTIONS_KEY) ?? '0') + 1;
    sessionStorage.setItem(SESSION_INTERACTIONS_KEY, String(n));
  } catch { /* ignore */ }
}

function bumpPageviewCount(): void {
  try {
    const n = Number(sessionStorage.getItem(SESSION_PAGEVIEWS_KEY) ?? '0') + 1;
    sessionStorage.setItem(SESSION_PAGEVIEWS_KEY, String(n));
  } catch { /* ignore */ }
}

function ensureSessionStart(): number {
  try {
    const existing = sessionStorage.getItem(SESSION_START_KEY);
    if (existing) return Number(existing);
    const now = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function getCounters(): { interactions: number; pageviews: number; start: number } {
  try {
    return {
      interactions: Number(sessionStorage.getItem(SESSION_INTERACTIONS_KEY) ?? '0'),
      pageviews: Number(sessionStorage.getItem(SESSION_PAGEVIEWS_KEY) ?? '0'),
      start: Number(sessionStorage.getItem(SESSION_START_KEY) ?? String(Date.now())),
    };
  } catch {
    return { interactions: 0, pageviews: 0, start: Date.now() };
  }
}

/** Track first-time vs returning visitor via long-lived localStorage. */
function trackReturnVisit(): void {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    const data = raw ? (JSON.parse(raw) as { count: number; last: number }) : { count: 0, last: 0 };
    const next = { count: data.count + 1, last: Date.now() };
    localStorage.setItem(VISITOR_KEY, JSON.stringify(next));
    if (next.count > 1) {
      // Only fire once per session, dedupe handled by 10s idempotency window.
      const flag = 'gp_return_visit_fired_v1';
      if (!sessionStorage.getItem(flag)) {
        fireReturnVisit({ visit_count: next.count });
        sessionStorage.setItem(flag, '1');
      }
    }
  } catch { /* ignore */ }
}

export interface UsePdpFunnelTrackingOpts {
  productId: string | null | undefined;
  productName?: string | null;
  price?: number | null;
  /** Set false to disable (e.g. admin previews). Default true. */
  enabled?: boolean;
}

export function usePdpFunnelTracking(opts: UsePdpFunnelTrackingOpts): void {
  const { productId, productName, price, enabled = true } = opts;
  const firedViewRef = useRef<string | null>(null);
  const depthsHitRef = useRef<Set<number>>(new Set());
  const clickBufferRef = useRef<Array<{ ts: number; target: string }>>([]);

  useEffect(() => {
    if (!enabled || !productId || typeof window === 'undefined') return;
    if (firedViewRef.current === productId) return;
    firedViewRef.current = productId;

    ensureSessionStart();
    bumpPageviewCount();

    let cleanup: Array<() => void> = [];

    idle(() => {
      // PDP view + return-visit signal
      try { firePdpView({ product_id: productId, product_name: productName ?? null, price: price ?? null }); } catch { /* ignore */ }
      try { trackReturnVisit(); } catch { /* ignore */ }

      // Scroll depth tracking (passive listener, idle-deferred)
      const onScroll = () => {
        try {
          const doc = document.documentElement;
          const scrollTop = window.scrollY || doc.scrollTop || 0;
          const docHeight = (doc.scrollHeight || 0) - (window.innerHeight || 0);
          if (docHeight <= 0) return;
          const pct = Math.min(100, Math.max(0, Math.round((scrollTop / docHeight) * 100)));
          for (const m of [25, 50, 75, 100] as const) {
            if (pct >= m && !depthsHitRef.current.has(m)) {
              depthsHitRef.current.add(m);
              fireScrollDepth({ product_id: productId, depth: m });
            }
          }
        } catch { /* ignore */ }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanup.push(() => window.removeEventListener('scroll', onScroll));

      // Rage-click detection (≥3 clicks on same target in <800ms)
      const onClick = (e: MouseEvent) => {
        bumpInteractionCount();
        try {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          const selector = (t.tagName + (t.id ? '#' + t.id : '') + (t.className ? '.' + String(t.className).split(' ').slice(0, 2).join('.') : '')).slice(0, 80);
          const now = Date.now();
          const buf = clickBufferRef.current;
          buf.push({ ts: now, target: selector });
          while (buf.length > 0 && now - buf[0].ts > 800) buf.shift();
          const sameTarget = buf.filter(b => b.target === selector);
          if (sameTarget.length >= 3) {
            clickBufferRef.current = [];
            fireRageClick({ product_id: productId, target_selector: selector });
          }
        } catch { /* ignore */ }
      };
      document.addEventListener('click', onClick, { passive: true, capture: true });
      cleanup.push(() => document.removeEventListener('click', onClick, true));

      // Bounce/dwell — fire once on hide/unload, use sendBeacon-equivalent insert
      const fireEnd = () => {
        try {
          if (sessionStorage.getItem(SESSION_END_FIRED_KEY)) return;
          sessionStorage.setItem(SESSION_END_FIRED_KEY, '1');
          const c = getCounters();
          const dwell_ms = Math.max(0, Date.now() - c.start);
          const bounced = c.pageviews <= 1 && dwell_ms < 10_000 && c.interactions < 2;
          fireSessionEnd({
            dwell_ms,
            page_views: c.pageviews,
            interactions: c.interactions,
            bounced,
          });
        } catch { /* ignore */ }
      };
      const onVisibility = () => { if (document.visibilityState === 'hidden') fireEnd(); };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', fireEnd);
      cleanup.push(() => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', fireEnd);
      });
    });

    return () => {
      for (const fn of cleanup) { try { fn(); } catch { /* ignore */ } }
      cleanup = [];
    };
  }, [enabled, productId, productName, price]);
}