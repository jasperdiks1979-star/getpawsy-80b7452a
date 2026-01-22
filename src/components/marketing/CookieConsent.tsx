import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Cookie, X, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

type ConsentPreferences = {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

const CONSENT_KEY = 'cookie-consent';
const CONSENT_PREFERENCES_KEY = 'cookie-preferences';

export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    necessary: true,
    functional: true,
    analytics: true,
    marketing: true,
  });

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      // Small delay to not show immediately on page load
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    } else {
      // Load saved preferences and apply them
      const savedPreferences = localStorage.getItem(CONSENT_PREFERENCES_KEY);
      if (savedPreferences) {
        const parsed = JSON.parse(savedPreferences);
        setPreferences(parsed);
        applyConsent(parsed);
      }
    }
  }, []);

  // Listen for custom event to reopen cookie settings
  useEffect(() => {
    const handleOpenCookieSettings = () => {
      const savedPreferences = localStorage.getItem(CONSENT_PREFERENCES_KEY);
      if (savedPreferences) {
        setPreferences(JSON.parse(savedPreferences));
      }
      setShowSettings(true);
      setShowBanner(true);
    };

    window.addEventListener('open-cookie-settings', handleOpenCookieSettings);
    return () => window.removeEventListener('open-cookie-settings', handleOpenCookieSettings);
  }, []);

  const applyConsent = (prefs: ConsentPreferences) => {
    // Enable/disable Google Analytics based on consent
    // We use dataLayer.push for consent updates to avoid type conflicts
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push('consent', 'update', {
        'analytics_storage': prefs.analytics ? 'granted' : 'denied',
        'ad_storage': prefs.marketing ? 'granted' : 'denied',
        'ad_user_data': prefs.marketing ? 'granted' : 'denied',
        'ad_personalization': prefs.marketing ? 'granted' : 'denied',
      });
    }
  };

  const saveConsent = (prefs: ConsentPreferences, showToast = false) => {
    localStorage.setItem(CONSENT_KEY, 'true');
    localStorage.setItem(CONSENT_PREFERENCES_KEY, JSON.stringify(prefs));
    applyConsent(prefs);
    setShowBanner(false);
    setShowSettings(false);
    if (showToast) {
      toast.success('Cookie preferences saved! 🍪');
    }
  };

  const acceptAll = () => {
    const allAccepted = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    setPreferences(allAccepted);
    saveConsent(allAccepted);
  };

  const acceptNecessary = () => {
    const onlyNecessary = {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    setPreferences(onlyNecessary);
    saveConsent(onlyNecessary);
  };

  const savePreferences = () => {
    saveConsent(preferences, true);
  };

  const togglePreference = (key: keyof ConsentPreferences) => {
    if (key === 'necessary') return; // Necessary cookies cannot be disabled
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-4 pb-safe"
        >
          <div className="max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="p-4 md:p-6">
              <div className="flex items-start gap-4">
                <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 flex-shrink-0">
                  <Cookie className="w-6 h-6 text-primary" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-2">
                    🍪 We use cookies
                  </h3>
                  
                  {!showSettings ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        We use cookies to improve your experience, analyze site traffic, and personalize content. 
                        By clicking "Accept All", you consent to our use of cookies. You can customize your preferences 
                        or reject non-essential cookies.{' '}
                        <Link to="/cookies" className="text-primary hover:underline">
                          Learn more
                        </Link>
                      </p>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={acceptAll} size="sm">
                          Accept All
                        </Button>
                        <Button onClick={acceptNecessary} variant="outline" size="sm">
                          Necessary Only
                        </Button>
                        <Button 
                          onClick={() => setShowSettings(true)} 
                          variant="ghost" 
                          size="sm"
                          className="gap-1"
                        >
                          <Settings className="w-4 h-4" />
                          Customize
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-3 mb-4">
                        <CookieToggle
                          label="Necessary Cookies"
                          description="Required for the website to function properly"
                          checked={preferences.necessary}
                          disabled
                        />
                        <CookieToggle
                          label="Functional Cookies"
                          description="Remember your preferences and settings"
                          checked={preferences.functional}
                          onChange={() => togglePreference('functional')}
                        />
                        <CookieToggle
                          label="Analytics Cookies"
                          description="Help us understand how visitors use our site"
                          checked={preferences.analytics}
                          onChange={() => togglePreference('analytics')}
                        />
                        <CookieToggle
                          label="Marketing Cookies"
                          description="Used for personalized ads and remarketing"
                          checked={preferences.marketing}
                          onChange={() => togglePreference('marketing')}
                        />
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={savePreferences} size="sm">
                          Save Preferences
                        </Button>
                        <Button 
                          onClick={() => setShowSettings(false)} 
                          variant="ghost" 
                          size="sm"
                        >
                          Back
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                
                <button
                  onClick={acceptNecessary}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  aria-label="Close cookie banner"
                >
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
    <div 
      className={`w-10 h-6 rounded-full flex items-center transition-colors flex-shrink-0 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div 
        className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </div>
  </div>
);
