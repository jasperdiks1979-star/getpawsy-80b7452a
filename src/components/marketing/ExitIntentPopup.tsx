import { useState, useEffect, useCallback, forwardRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Heart, Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackNewsletterSignup } from '@/lib/analytics';
import { useIsMobile } from '@/hooks/use-mobile';

const EXIT_POPUP_STORAGE_KEY = 'getpawsy_exit_popup_seen';

const ExitBackdrop = forwardRef<HTMLDivElement, { onClick: () => void }>(
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
ExitBackdrop.displayName = 'ExitBackdrop';

const ExitPopupContent = forwardRef<HTMLDivElement, {
  onClose: () => void;
  isSuccess: boolean;
  email: string;
  setEmail: (v: string) => void;
  isSubmitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}>(({ onClose, isSuccess, email, setEmail, isSubmitting, handleSubmit }, ref) => (
  <motion.div
    ref={ref}
    initial={{ opacity: 0, scale: 0.9, y: -20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.9, y: -20 }}
    transition={{ type: 'spring', duration: 0.5 }}
    className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 mx-auto max-w-lg"
  >
    <div className="relative bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-2 rounded-full bg-muted/80 hover:bg-muted transition-colors z-10"
        aria-label="Close"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Header — warm, not aggressive */}
      <div className="bg-gradient-to-br from-primary/10 via-secondary/20 to-accent/30 px-6 py-6 text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-primary/15 flex items-center justify-center">
          <Heart className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          Get Our Free Pet Care Guide 🐾
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tips to keep your pet happier &amp; healthier
        </p>
      </div>

      <div className="px-6 py-6">
        {!isSuccess ? (
          <>
            <p className="text-center text-muted-foreground text-sm mb-5">
              Join pet owners who get expert tips, product recommendations, and exclusive early access to new arrivals.
            </p>

            {/* Trust signals — compliant, factual */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              {[
                { icon: Truck, label: 'Free Shipping on Orders $35+' },
                { icon: RotateCcw, label: '30-Day Return Policy' },
                { icon: ShieldCheck, label: 'Secure Checkout' },
                { icon: Heart, label: 'Pet-Friendly Products' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl text-center"
                disabled={isSubmitting}
              />
              <Button
                type="submit"
                className="w-full h-11 rounded-xl text-sm font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Get Free Guide + Updates'}
              </Button>
            </form>

            <button
              onClick={onClose}
              className="w-full text-xs text-muted-foreground hover:text-foreground mt-3 py-1.5 transition-colors"
            >
              No thanks, maybe later
            </button>
          </>
        ) : (
          <div className="text-center py-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.5 }}
            >
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-secondary flex items-center justify-center">
                <Heart className="w-8 h-8 text-secondary-foreground" />
              </div>
            </motion.div>
            <h3 className="text-lg font-display font-bold text-foreground mb-1">
              You're In! 🎉
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Check your inbox for your free pet care guide. Happy shopping!
            </p>
            <Button onClick={onClose} className="w-full">
              Continue Shopping →
            </Button>
          </div>
        )}
      </div>
    </div>
  </motion.div>
));
ExitPopupContent.displayName = 'ExitPopupContent';

export function ExitIntentPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();

  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const shouldDisable = isAdminRoute || isCheckoutRoute;

  const tryOpen = useCallback(() => {
    if (hasTriggered) return;
    const hasSeenPopup = localStorage.getItem(EXIT_POPUP_STORAGE_KEY);
    if (!hasSeenPopup) {
      setIsOpen(true);
      setHasTriggered(true);
    }
  }, [hasTriggered]);

  // Desktop: mouseleave (exit intent)
  useEffect(() => {
    const isMobileDevice = window.matchMedia('(max-width: 768px)').matches;
    if (isMobileDevice) return;

    const handler = (e: MouseEvent) => {
      if (e.clientY <= 5) tryOpen();
    };
    const timer = setTimeout(() => {
      document.addEventListener('mouseleave', handler);
    }, 8000);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', handler);
    };
  }, [tryOpen]);

  // Mobile: 70% scroll depth OR 45-second delay
  useEffect(() => {
    const isMobileDevice = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobileDevice) return;

    let scrollFired = false;
    const onScroll = () => {
      if (scrollFired) return;
      const scrollPct = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      if (scrollPct >= 0.7) {
        scrollFired = true;
        tryOpen();
      }
    };

    // Delay adding scroll listener to avoid early triggers
    const scrollTimer = setTimeout(() => {
      window.addEventListener('scroll', onScroll, { passive: true });
    }, 10000);

    // Fallback: 45s delay
    const delayTimer = setTimeout(() => {
      tryOpen();
    }, 45000);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(delayTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [tryOpen]);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(EXIT_POPUP_STORAGE_KEY, Date.now().toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email, is_active: true });
      if (error) {
        if (error.code === '23505') {
          setIsSuccess(true);
        } else {
          throw error;
        }
      } else {
        setIsSuccess(true);
        trackNewsletterSignup('exit_intent_popup');
      }
    } catch (error) {
      console.error('Newsletter signup error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (shouldDisable) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <ExitBackdrop onClick={handleClose} />
          <ExitPopupContent
            onClose={handleClose}
            isSuccess={isSuccess}
            email={email}
            setEmail={setEmail}
            isSubmitting={isSubmitting}
            handleSubmit={handleSubmit}
          />
        </>
      )}
    </AnimatePresence>
  );
}
