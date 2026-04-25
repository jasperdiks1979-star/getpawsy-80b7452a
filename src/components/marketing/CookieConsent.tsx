import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getConsent, setConsent, type ConsentValue } from '@/lib/cookieConsent';
import { canAutoGrantConsent } from '@/lib/geoConsent';

// ⚡ Heavy deps deferred — not needed until banner interaction
const showToast = (msg: string) => import('sonner').then(m => m.toast.success(msg));
const markCookieBannerMounted = () => import('@/lib/lcp-debug').then(m => m.markCookieBannerMounted()).catch(() => {});
const markCookieBannerInteractive = () => import('@/lib/lcp-debug').then(m => m.markCookieBannerInteractive()).catch(() => {});

/**
 * CookieConsent — Ultra-lightweight, zero-CLS, zero-dependency cookie banner.
 * 
 * Performance optimizations:
 * - NO lucide-react icons (saves ~15KB from chunk)
 * - NO Button component import (saves shadcn/radix chain)
 * - NO sonner at top level (deferred to interaction)
 * - NO useIsMobile hook (inline check)
 * - Pure HTML buttons with inline styles matching design system
 * - Fixed overlay position — NEVER pushes layout (CLS = 0)
 * - Mounts after 1500ms / user interaction / idle — never blocks LCP
 */
export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [prefs, setPrefs] = useState({ functional: true, analytics: true, marketing: true });
  const mountedRef = useRef(false);
  const interactiveMarkedRef = useRef(false);
  const location = useLocation();

  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  // Skip on mobile checkout to not interfere with purchase flow
  const shouldDisable = isCheckoutRoute && typeof window !== 'undefined' && window.innerWidth < 768;

  // Show banner only if no consent stored — DEFERRED
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const existing = getConsent();
    if (existing) return;

    // Geo-aware auto-consent: non-EU visitors (US/CCPA regime) get full
    // consent automatically — no banner needed. EU/GDPR visitors must
    // explicitly opt-in via the banner below.
    if (canAutoGrantConsent()) {
      setConsent('all');
      return;
    }

    const mount = () => {
      requestAnimationFrame(() => {
        markCookieBannerMounted();
        setShowBanner(true);
        requestAnimationFrame(() => setIsVisible(true));
      });
    };

    const handle = setTimeout(mount, 1500);
    const interactionHandler = () => { mount(); cleanup(); };
    const events = ['scroll', 'click', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, interactionHandler, { once: true, passive: true }));

    function cleanup() {
      clearTimeout(handle);
      events.forEach(e => window.removeEventListener(e, interactionHandler));
    }

    return cleanup;
  }, []);

  // Mark interactive once banner is visible
  useEffect(() => {
    if (showBanner && !interactiveMarkedRef.current) {
      interactiveMarkedRef.current = true;
      requestAnimationFrame(() => { markCookieBannerInteractive(); });
    }
  }, [showBanner]);

  // Allow reopening via custom event
  useEffect(() => {
    const handler = () => {
      const existing = getConsent();
      if (existing === 'all') {
        setPrefs({ functional: true, analytics: true, marketing: true });
      } else {
        setPrefs({ functional: false, analytics: false, marketing: false });
      }
      setShowSettings(true);
      setShowBanner(true);
      requestAnimationFrame(() => setIsVisible(true));
    };
    window.addEventListener('open-cookie-settings', handler);
    return () => window.removeEventListener('open-cookie-settings', handler);
  }, []);

  const hideBanner = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  }, []);

  const save = useCallback((value: ConsentValue, msg?: string) => {
    setConsent(value);
    hideBanner();
    setShowSettings(false);
    if (msg) showToast(msg);
  }, [hideBanner]);

  const acceptAll = useCallback(() => save('all', 'All cookies accepted! 🍪'), [save]);
  const acceptNecessary = useCallback(() => save('necessary', 'Only necessary cookies enabled 🍪'), [save]);
  const saveCustom = useCallback(() => {
    const anyMarketing = prefs.functional || prefs.analytics || prefs.marketing;
    save(anyMarketing ? 'all' : 'necessary', 'Cookie preferences saved! 🍪');
  }, [prefs, save]);

  if (shouldDisable) return null;
  if (!showBanner) return null;

  // Inline button styles matching the design system (avoids importing Button component)
  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer', border: 'none',
    background: 'hsl(22 70% 48%)', color: '#fff',
    transition: 'opacity 0.15s',
  };
  const btnOutline: React.CSSProperties = {
    ...btnPrimary,
    background: 'transparent', color: 'hsl(25 30% 12%)',
    border: '1px solid hsl(38 30% 88%)',
  };
  const btnGhost: React.CSSProperties = {
    ...btnPrimary,
    background: 'transparent', color: 'hsl(25 18% 42%)',
    border: 'none', padding: '6px 12px',
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] p-4 pb-safe"
      style={{
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        opacity: isVisible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'transform, opacity',
        contain: 'layout',
      }}
      data-testid="cookie-banner"
      data-cwvnolcp="true"
    >
      <div className="max-w-md sm:max-w-2xl lg:max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground mb-2 text-sm sm:text-base">🍪 We use cookies</h3>

              {!showSettings ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    We use cookies to improve your experience.{' '}
                    {showFullText ? (
                      <>Analyze site traffic and personalize content. By clicking "Accept All", you consent to our use of cookies.{' '}</>
                    ) : null}
                    <button onClick={() => setShowFullText(v => !v)} className="text-primary hover:underline text-sm inline">
                      {showFullText ? 'Less' : 'Read more'}
                    </button>{' '}
                    <Link to="/cookies" className="text-primary hover:underline">Cookie policy</Link>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button onClick={acceptAll} style={btnPrimary}>Accept All</button>
                    <button onClick={acceptNecessary} style={btnOutline}>Necessary Only</button>
                    <button onClick={() => setShowSettings(true)} style={btnGhost}>⚙ Customize</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    <CookieToggle label="Necessary Cookies" description="Required for the website to function" checked disabled />
                    <CookieToggle label="Functional" description="Remember your preferences" checked={prefs.functional} onChange={() => setPrefs(p => ({ ...p, functional: !p.functional }))} />
                    <CookieToggle label="Analytics" description="Help us understand usage" checked={prefs.analytics} onChange={() => setPrefs(p => ({ ...p, analytics: !p.analytics }))} />
                    <CookieToggle label="Marketing" description="Personalized ads" checked={prefs.marketing} onChange={() => setPrefs(p => ({ ...p, marketing: !p.marketing }))} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button onClick={saveCustom} style={btnPrimary}>Save Preferences</button>
                    <button onClick={() => setShowSettings(false)} style={btnGhost}>Back</button>
                  </div>
                </>
              )}
            </div>

            <button onClick={acceptNecessary} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="Close cookie banner">
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CookieToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}

const CookieToggle = ({ label, description, checked, disabled, onChange }: CookieToggleProps) => (
  <div
    className={`flex items-center justify-between gap-4 p-3 rounded-lg ${disabled ? 'bg-muted/50' : 'bg-muted/30 hover:bg-muted/50'} transition-colors`}
    onClick={!disabled ? onChange : undefined}
    role={!disabled ? 'button' : undefined}
    tabIndex={!disabled ? 0 : undefined}
  >
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <div className={`w-10 h-6 rounded-full flex items-center transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </div>
  </div>
);
