import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Cookie, X, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { getConsent, setConsent, type ConsentValue } from '@/lib/cookieConsent';
import { markCookieBannerMounted, markCookieBannerInteractive } from '@/lib/lcp-debug';

export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState({ functional: true, analytics: true, marketing: true });
  const mountedRef = useRef(false);
  const interactiveMarkedRef = useRef(false);
  const location = useLocation();
  const isMobile = useIsMobile();

  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const shouldDisable = isMobile && isCheckoutRoute;

  // Show banner only if no consent stored — DEFERRED via requestIdleCallback
  // to avoid blocking hero/grid paint. Falls back to rAF+setTimeout for Safari.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const existing = getConsent();
    if (!existing) {
      // Use requestIdleCallback so banner mounts after main content paints,
      // but within ~1-2s instead of the previous hard 2500ms delay.
      // Fallback: double-rAF + 200ms setTimeout ensures post-first-paint mount.
      const mount = () => {
        requestAnimationFrame(() => {
          markCookieBannerMounted();
          setShowBanner(true);
        });
      };

      let handle: number | ReturnType<typeof setTimeout>;
      if ('requestIdleCallback' in window) {
        handle = (window as any).requestIdleCallback(mount, { timeout: 2000 });
      } else {
        // Double-rAF ensures we're past the first paint frame
        handle = setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(mount);
          });
        }, 200);
      }
      return () => {
        if ('requestIdleCallback' in window) {
          (window as any).cancelIdleCallback(handle as number);
        } else {
          clearTimeout(handle as ReturnType<typeof setTimeout>);
        }
      };
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
    };
    window.addEventListener('open-cookie-settings', handler);
    return () => window.removeEventListener('open-cookie-settings', handler);
  }, []);

  const save = useCallback((value: ConsentValue, msg?: string) => {
    setConsent(value);
    setShowBanner(false);
    setShowSettings(false);
    if (msg) toast.success(msg);
  }, []);

  const acceptAll = useCallback(() => save('all', 'All cookies accepted! 🍪'), [save]);
  const acceptNecessary = useCallback(() => save('necessary', 'Only necessary cookies enabled 🍪'), [save]);
  const saveCustom = useCallback(() => {
    const anyMarketing = prefs.functional || prefs.analytics || prefs.marketing;
    save(anyMarketing ? 'all' : 'necessary', 'Cookie preferences saved! 🍪');
  }, [prefs, save]);

  if (shouldDisable) return null;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-4 pb-safe"
          data-testid="cookie-banner"
        >
          {/* max-w-md on mobile keeps visual area smaller than H1 so banner can't win LCP */}
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
                        We use cookies to improve your experience, analyze site traffic, and personalize content.
                        By clicking "Accept All", you consent to our use of cookies.{' '}
                        <Link to="/cookies" className="text-primary hover:underline">Learn more</Link>
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
        </motion.div>
      )}
    </AnimatePresence>
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
