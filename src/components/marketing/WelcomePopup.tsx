import { useState, useEffect, forwardRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Gift, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { trackNewsletterSignup } from '@/lib/analytics';

const POPUP_STORAGE_KEY = 'getpawsy_welcome_popup_seen';
const POPUP_DELAY_MS = 60000; // Show after 60 seconds — non-intrusive delay
const DISCOUNT_CODE = 'WELCOME10';

// Inner component wrapped with forwardRef for AnimatePresence compatibility
const WelcomePopupContent = forwardRef<HTMLDivElement, { onClose: () => void; isSuccess: boolean; email: string; setEmail: (v: string) => void; isSubmitting: boolean; handleSubmit: (e: React.FormEvent) => void; copyDiscountCode: () => void }>(
  ({ onClose, isSuccess, email, setEmail, isSubmitting, handleSubmit, copyDiscountCode }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ type: 'spring', duration: 0.5 }}
      className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 mx-auto max-w-md"
    >
      <div className="relative bg-card rounded-3xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-muted/80 hover:bg-muted transition-colors z-10"
          aria-label="Close popup"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Decorative gradient header */}
        <div className="relative h-32 bg-gradient-to-br from-primary via-primary/80 to-accent overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
          
          {/* Floating icons */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-6 left-8"
          >
            <Sparkles className="w-6 h-6 text-white/60" />
          </motion.div>
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute bottom-6 right-12"
          >
            <Sparkles className="w-5 h-5 text-white/50" />
          </motion.div>

          {/* Gift icon */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
            <div className="w-16 h-16 rounded-full bg-card shadow-lg flex items-center justify-center">
              <Gift className="w-8 h-8 text-primary" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-12 pb-6">
          {!isSuccess ? (
            <>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                  Welcome to GetPawsy! 🐾
                </h2>
                <p className="text-muted-foreground">
                  Join our pack and get <span className="font-bold text-primary">10% OFF</span> your first order!
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl text-center"
                  disabled={isSubmitting}
                />
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Joining...' : 'Get My 10% Discount'}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center mt-4">
                No spam, just pawsome deals! Unsubscribe anytime.
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
                  <Sparkles className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </motion.div>
              
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                You're In! 🎉
              </h2>
              <p className="text-muted-foreground mb-4">
                Use this code at checkout:
              </p>

              <button
                onClick={copyDiscountCode}
                className="group relative w-full py-4 px-6 bg-primary/10 hover:bg-primary/20 border-2 border-dashed border-primary rounded-xl transition-colors"
              >
                <span className="text-2xl font-mono font-bold text-primary tracking-wider">
                  {DISCOUNT_CODE}
                </span>
                <span className="block text-xs text-muted-foreground mt-1 group-hover:text-primary transition-colors">
                  Click to copy
                </span>
              </button>

              <Button
                onClick={onClose}
                variant="ghost"
                className="mt-4 text-muted-foreground"
              >
                Start Shopping →
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
);

WelcomePopupContent.displayName = 'WelcomePopupContent';

// Backdrop component with forwardRef
const WelcomeBackdrop = forwardRef<HTMLDivElement, { onClick: () => void }>(
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

WelcomeBackdrop.displayName = 'WelcomeBackdrop';

export function WelcomePopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();

  // Disable popup on checkout/cart, product, and admin pages (avoid CTA obstruction & admin click-blocking)
  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const isProductRoute = location.pathname.startsWith('/product/') || location.pathname.startsWith('/bestseller/');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const shouldDisable = isCheckoutRoute || isProductRoute || isAdminRoute;

  useEffect(() => {
    // Don't show on mobile checkout pages
    if (shouldDisable) return;
    
    // Check if user has already seen the popup
    const hasSeenPopup = localStorage.getItem(POPUP_STORAGE_KEY);
    
    if (!hasSeenPopup) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, POPUP_DELAY_MS);

      return () => clearTimeout(timer);
    }
  }, [shouldDisable]);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(POPUP_STORAGE_KEY, 'true');
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
          // Duplicate email - still show success since they're already subscribed
          setIsSuccess(true);
          // Save discount code for checkout
          localStorage.setItem('getpawsy_discount_code', DISCOUNT_CODE);
        } else {
          throw error;
        }
      } else {
        setIsSuccess(true);
        trackNewsletterSignup('welcome_popup');
        // Save discount code for checkout
        localStorage.setItem('getpawsy_discount_code', DISCOUNT_CODE);
      }
    } catch (error) {
      console.error('Newsletter signup error:', error);
      // Treat the popup as best-effort: store the discount locally so the
      // visitor never sees a generic failure toast on the homepage.
      localStorage.setItem('getpawsy_discount_code', DISCOUNT_CODE);
      setIsSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyDiscountCode = () => {
    navigator.clipboard.writeText(DISCOUNT_CODE);
    toast.success('Discount code copied!');
    handleClose();
  };

  // Don't render on mobile checkout pages
  if (shouldDisable) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <WelcomeBackdrop onClick={handleClose} />
          <WelcomePopupContent
            onClose={handleClose}
            isSuccess={isSuccess}
            email={email}
            setEmail={setEmail}
            isSubmitting={isSubmitting}
            handleSubmit={handleSubmit}
            copyDiscountCode={copyDiscountCode}
          />
        </>
      )}
    </AnimatePresence>
  );
}
