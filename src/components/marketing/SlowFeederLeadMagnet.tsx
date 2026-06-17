import { useState, useEffect, forwardRef } from 'react';
import { X, Gift, Sparkles, Heart, Brain, Timer, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackNewsletterSignup, trackEvent } from '@/lib/analytics';
import { useNavigate, useLocation } from 'react-router-dom';
import { getStoredUTMParams } from '@/hooks/useUTMTracking';
import { useIsMobile } from '@/hooks/use-mobile';

// Backdrop component with forwardRef for AnimatePresence compatibility
const SlowFeederBackdrop = forwardRef<HTMLDivElement, { onClick: () => void }>(
  ({ onClick }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50"
      onClick={onClick}
    />
  )
);

SlowFeederBackdrop.displayName = 'SlowFeederBackdrop';

const POPUP_STORAGE_KEY = 'getpawsy_slowfeeder_popup_seen';
const POPUP_DELAY_MS = 15000; // Show after 15 seconds on dog-related pages
const DISCOUNT_CODE = 'SLOWFEEDER25';

interface SlowFeederLeadMagnetProps {
  trigger?: 'auto' | 'scroll' | 'manual';
  onClose?: () => void;
  isOpen?: boolean;
}

export function SlowFeederLeadMagnet({ 
  trigger = 'auto', 
  onClose,
  isOpen: controlledIsOpen 
}: SlowFeederLeadMagnetProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  // Check if we're on checkout/cart pages - disable popup on mobile for these routes
  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const shouldDisable = isMobile && isCheckoutRoute;

  const isOpen = controlledIsOpen ?? internalIsOpen;

  useEffect(() => {
    if (trigger !== 'auto') return;

    const hasSeenPopup = localStorage.getItem(POPUP_STORAGE_KEY);
    const hasSeenWelcome = localStorage.getItem('getpawsy_welcome_popup_seen');
    const hasSeenExit = localStorage.getItem('getpawsy_exit_popup_seen');
    
    // Only show if they haven't seen other popups recently
    if (hasSeenPopup) return;
    if (!hasSeenWelcome && !hasSeenExit) return; // Let welcome/exit popups trigger first
    
    // Check if on a relevant page (dogs, products, homepage)
    const path = window.location.pathname;
    const search = window.location.search;
    const isDogRelated = path.includes('/products') && (
      search.includes('Dogs') || 
      search.includes('dog') ||
      !search.includes('category') // Show on all products page too
    );
    const isHomepage = path === '/' || path === '/index';
    
    if (!isDogRelated && !isHomepage) return;

    const timer = setTimeout(() => {
      setInternalIsOpen(true);
    }, POPUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [trigger]);

  // Scroll trigger
  useEffect(() => {
    if (trigger !== 'scroll') return;

    const hasSeenPopup = localStorage.getItem(POPUP_STORAGE_KEY);
    if (hasSeenPopup) return;

    const handleScroll = () => {
      const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercent > 50) {
        setInternalIsOpen(true);
        window.removeEventListener('scroll', handleScroll);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [trigger]);

  const handleClose = () => {
    setInternalIsOpen(false);
    localStorage.setItem(POPUP_STORAGE_KEY, Date.now().toString());
    onClose?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get UTM params from storage
      const utmParams = getStoredUTMParams();
      
      // Build preferences with UTM tracking data
      const preferences = {
        dogs: true,
        promotions: true,
        new_products: true,
        lead_magnet: 'slow_feeder_25',
        signup_source: 'slow_feeder_popup',
        ...(utmParams.utm_source && { utm_source: utmParams.utm_source }),
        ...(utmParams.utm_medium && { utm_medium: utmParams.utm_medium }),
        ...(utmParams.utm_campaign && { utm_campaign: utmParams.utm_campaign }),
        ...(utmParams.utm_term && { utm_term: utmParams.utm_term }),
        ...(utmParams.utm_content && { utm_content: utmParams.utm_content }),
        ...(utmParams.gclid && { gclid: utmParams.gclid }),
        ...(utmParams.fbclid && { fbclid: utmParams.fbclid }),
        ...(utmParams.landing_page && { landing_page: utmParams.landing_page }),
        signup_timestamp: new Date().toISOString()
      };

      // Subscribe to newsletter with preferences
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ 
          email, 
          is_active: true,
          preferences
        });

      if (error) {
        if (error.code === '23505') {
          // Already subscribed - update preferences and still give discount
          await supabase
            .from('newsletter_subscribers')
            .update({ preferences })
            .eq('email', email);
          setIsSuccess(true);
          localStorage.setItem('getpawsy_discount_code', DISCOUNT_CODE);
          
          // Track conversion event
          trackEvent('lead_magnet_signup', {
            page: 'slow_feeder_popup',
            discount_code: DISCOUNT_CODE,
            existing_subscriber: true,
            ...utmParams
          });
        } else {
          throw error;
        }
      } else {
        setIsSuccess(true);
        
        // Track conversion event
        trackEvent('lead_magnet_signup', {
          page: 'slow_feeder_popup',
          discount_code: DISCOUNT_CODE,
          ...utmParams
        });
        trackNewsletterSignup('slow_feeder_lead_magnet');
        localStorage.setItem('getpawsy_discount_code', DISCOUNT_CODE);
        
        // Send confirmation email with discount code
        try {
          await supabase.functions.invoke('send-newsletter-confirmation', {
            body: { 
              email,
              discountCode: DISCOUNT_CODE,
              source: 'slow_feeder_lead_magnet',
              utmParams
            }
          });
        } catch (emailError) {
          console.error('Failed to send confirmation email:', emailError);
        }
      }
    } catch (error) {
      console.error('Newsletter signup error:', error);
      // Best-effort capture — show success so the user still gets the discount.
      setIsSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyDiscountCode = () => {
    navigator.clipboard.writeText(DISCOUNT_CODE);
    toast.success('Discount code copied!');
  };

  const goToSlowFeeders = () => {
    handleClose();
    navigate('/collections/best-slow-feeder-dog-bowls');
  };

  const benefits = [
    { icon: Heart, text: 'Prevents bloating & choking' },
    { icon: Brain, text: 'Mental stimulation' },
    { icon: Timer, text: 'Slows eating by 10x' },
  ];

  // Don't render on mobile checkout pages
  if (shouldDisable) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <SlowFeederBackdrop onClick={handleClose} />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 mx-auto max-w-lg"
          >
            <div className="relative bg-card rounded-3xl shadow-2xl overflow-hidden">
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors z-10"
                aria-label="Close popup"
              >
                <X className="w-4 h-4 text-white" />
              </button>

              {/* Decorative gradient header with product image */}
              <div className="relative h-40 bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
                
                {/* Floating elements */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute top-4 left-6"
                >
                  <Sparkles className="w-6 h-6 text-white/60" />
                </motion.div>
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="absolute top-8 right-16"
                >
                  <Sparkles className="w-5 h-5 text-white/50" />
                </motion.div>

                {/* Header content */}
                <div className="absolute inset-x-0 top-6 text-center px-6">
                  <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm font-medium mb-2">
                    <Gift className="w-4 h-4" />
                    Limited Time Offer
                  </div>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
                    25% OFF Slow Feeder Bowls 🐕
                  </h2>
                </div>

                {/* Icon at bottom */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
                  <div className="w-16 h-16 rounded-full bg-card shadow-lg flex items-center justify-center">
                    <span className="text-3xl">🥣</span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 pt-12 pb-6">
                {!isSuccess ? (
                  <>
                    <div className="text-center mb-5">
                      <p className="text-muted-foreground text-sm">
                        Is your dog a fast eater? Get our #1 bestselling slow feeder bowl and improve their digestion!
                      </p>
                    </div>

                    {/* Benefits */}
                    <div className="grid grid-cols-3 gap-2 mb-5">
                      {benefits.map((benefit) => (
                        <div
                          key={benefit.text}
                          className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-950/30"
                        >
                          <benefit.icon className="w-5 h-5 mx-auto mb-1 text-green-600 dark:text-green-400" />
                          <span className="text-xs text-muted-foreground leading-tight block">
                            {benefit.text}
                          </span>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <Input
                        type="email"
                        placeholder="Enter your email for 25% off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 rounded-xl text-center"
                        disabled={isSubmitting}
                      />
                      <Button
                        type="submit"
                        className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Joining...' : 'Get My 25% Discount'}
                      </Button>
                    </form>

                    <p className="text-xs text-muted-foreground text-center mt-3">
                      Join pet owners across the US. Unsubscribe anytime.
                    </p>
                  </>
                ) : (
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', duration: 0.5 }}
                    >
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                      </div>
                    </motion.div>
                    
                    <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                      Your Code is Ready! 🎉
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      Use this exclusive code at checkout:
                    </p>

                    <button
                      onClick={copyDiscountCode}
                      className="group relative w-full py-4 px-6 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-950/50 dark:to-emerald-950/50 hover:from-green-200 hover:to-emerald-200 dark:hover:from-green-900/50 dark:hover:to-emerald-900/50 border-2 border-dashed border-green-500 rounded-xl transition-colors"
                    >
                      <span className="text-2xl font-mono font-bold text-green-600 dark:text-green-400 tracking-wider">
                        {DISCOUNT_CODE}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-1 group-hover:text-green-600 transition-colors">
                        Click to copy
                      </span>
                    </button>

                    <Button
                      onClick={goToSlowFeeders}
                      className="mt-4 w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      Shop Slow Feeder Bowls →
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
