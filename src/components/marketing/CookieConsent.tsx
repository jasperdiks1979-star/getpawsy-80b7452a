import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, X, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { getConsent, setConsent, type ConsentValue } from '@/lib/cookieConsent';
import { markCookieBannerMounted, markCookieBannerInteractive } from '@/lib/lcp-debug';

/**
 * CookieConsent — Phase 2 CWV optimisation
 * Replaced framer-motion (AnimatePresence + motion.div) with CSS transitions.
 * Saves ~60KB gzip from cookie banner chunk on first load.
 */
export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false); // controls CSS transition
  const [showSettings, setShowSettings] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [prefs, setPrefs] = useState({ functional: true, analytics: true, marketing: true });
  const mountedRef = useRef(false);
  const interactiveMarkedRef = useRef(false);
  const isInitialLoad = useRef(true);
  const location = useLocation();
  const isMobile = useIsMobile();

  // After 4s, allow full expansion (prevent large banner during LCP window)
  useEffect(() => {
    const t = setTimeout(() => { isInitialLoad.current = false; }, 4000);
    return () => clearTimeout(t);
  }, []);

  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const shouldDisable = isMobile && isCheckoutRoute;

  // Show banner only if no consent stored — DEFERRED via requestIdleCallback
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const existing = getConsent();
    if (!existing) {
      const mount = () => {
        requestAnimationFrame(() => {
          markCookieBannerMounted();
          setShowBanner(true);
          // Trigger CSS transition on next frame
          requestAnimationFrame(() => setIsVisible(true));
        });
      };

      // Mount after 1500ms OR on first user interaction, whichever comes first
      let handle: ReturnType<typeof setTimeout>;
      handle = setTimeout(mount, 1500);

      const interactionHandler = () => { mount(); cleanup(); };
      const events = ['scroll', 'click', 'touchstart'] as const;
      events.forEach(e => window.addEventListener(e, interactionHandler, { once: true, passive: true }));

      function cleanup() {
        clearTimeout(handle);
        events.forEach(e => window.removeEventListener(e, interactionHandler));
      }

      return cleanup;
    }
  }, []);

  // Mark interactive once banner is visible and buttons are rendered
  useEffect(() => {
    if (showBanner && !interactiveMarkedRef.current) {
      interactiveMarkedRef.current = true;
      requestAnimationFrame(() => {
        markCookieBannerInteractive();
      });
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
    // Wait for CSS transition to finish before unmounting
    setTimeout(() => setShowBanner(false), 300);
  }, []);

  const save = useCallback((value: ConsentValue, msg?: string) => {
    setConsent(value);
    hideBanner();
    setShowSettings(false);
    if (msg) toast.success(msg);
  }, [hideBanner]);

  const acceptAll = useCallback(() => save('all', 'All cookies accepted! 🍪'), [save]);
  const acceptNecessary = useCallback(() => save('necessary', 'Only necessary cookies enabled 🍪'), [save]);
  const saveCustom = useCallback(() => {
    const anyMarketing = prefs.functional || prefs.analytics || prefs.marketing;
    save(anyMarketing ? 'all' : 'necessary', 'Cookie preferences saved! 🍪');
  }, [prefs, save]);

  if (shouldDisable) return null;
  if (!showBanner) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] p-4 pb-safe"
      style={{
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        opacity: isVisible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'transform, opacity',
      }}
      data-testid="cookie-banner"
      data-cwvnolcp="true"
    >
      <div className="max-w-md sm:max-w-2xl lg:max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 flex-shrink-0">
              <Cookie className="w-6 h-6 text-primary" />
            </div>

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
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={acceptAll} size="sm">Accept All</Button>
                    <Button onClick={acceptNecessary} variant="outline" size="sm">Necessary Only</Button>
                    <Button onClick={() => setShowSettings(true)} variant="ghost" size="sm" className="gap-1">
                      <Settings className="w-4 h-4" /> Customize
                    </Button>
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
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={saveCustom} size="sm">Save Preferences</Button>
                    <Button onClick={() => setShowSettings(false)} variant="ghost" size="sm">Back</Button>
                  </div>
                </>
              )}
            </div>

            <button onClick={acceptNecessary} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="Close cookie banner">
              <X className="w-5 h-5" />
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
