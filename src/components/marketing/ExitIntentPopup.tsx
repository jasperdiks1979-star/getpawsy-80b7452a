import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle, Gift, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackNewsletterSignup } from '@/lib/analytics';

const EXIT_POPUP_STORAGE_KEY = 'getpawsy_exit_popup_seen';
const DISCOUNT_CODE = 'DONTGO15';

export function ExitIntentPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  const handleExitIntent = useCallback((e: MouseEvent) => {
    // Only trigger when mouse moves to top of viewport (exit intent)
    if (e.clientY <= 5 && !hasTriggered) {
      const hasSeenPopup = localStorage.getItem(EXIT_POPUP_STORAGE_KEY);
      
      // Also check if they've seen the welcome popup recently (don't bombard with popups)
      const hasSeenWelcome = localStorage.getItem('getpawsy_welcome_popup_seen');
      const timeSinceWelcome = hasSeenWelcome ? Date.now() - parseInt(hasSeenWelcome) : Infinity;
      
      // Only show if they haven't seen this popup AND it's been at least 30 seconds since welcome popup
      if (!hasSeenPopup && timeSinceWelcome > 30000) {
        setIsOpen(true);
        setHasTriggered(true);
      }
    }
  }, [hasTriggered]);

  useEffect(() => {
    // Only add listener on desktop (exit intent doesn't work well on mobile)
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    if (!isMobile) {
      // Delay adding the listener to avoid triggering immediately
      const timer = setTimeout(() => {
        document.addEventListener('mouseleave', handleExitIntent);
      }, 5000);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('mouseleave', handleExitIntent);
      };
    }
  }, [handleExitIntent]);

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

  const copyDiscountCode = () => {
    navigator.clipboard.writeText(DISCOUNT_CODE);
    toast.success('Discount code copied!');
    handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/70 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 mx-auto max-w-lg"
          >
            <div className="relative bg-card rounded-3xl shadow-2xl overflow-hidden">
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-muted/80 hover:bg-muted transition-colors z-10"
                aria-label="Close popup"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              {/* Alert header */}
              <div className="relative bg-gradient-to-br from-destructive via-destructive/90 to-orange-500 px-6 py-8 overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.3),transparent_70%)]" />
                </div>
                
                {/* Pulsing alert icon */}
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex justify-center mb-4"
                >
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-white" />
                  </div>
                </motion.div>

                <h2 className="text-2xl md:text-3xl font-display font-bold text-white text-center">
                  Wait! Don't Leave Empty-Handed! 🐾
                </h2>
              </div>

              {/* Content */}
              <div className="px-6 py-8">
                {!isSuccess ? (
                  <>
                    <div className="text-center mb-6">
                      <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 rounded-full mb-4">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">Limited Time Offer</span>
                      </div>
                      
                      <p className="text-lg text-foreground mb-2">
                        Get an <span className="font-bold text-destructive text-2xl">EXTRA 15% OFF</span>
                      </p>
                      <p className="text-muted-foreground">
                        Just for considering us! Enter your email and we'll send you an exclusive discount code.
                      </p>
                    </div>

                    {/* Benefits list */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {[
                        '🚚 Free Shipping $50+',
                        '🔄 30-Day Returns',
                        '⭐ Premium Quality',
                        '💝 Pet-Approved'
                      ].map((benefit) => (
                        <div
                          key={benefit}
                          className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-center"
                        >
                          {benefit}
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <Input
                        type="email"
                        placeholder="Enter your email for 15% off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 rounded-xl text-center"
                        disabled={isSubmitting}
                      />
                      <Button
                        type="submit"
                        className="w-full h-12 rounded-xl text-base font-semibold bg-destructive hover:bg-destructive/90"
                        disabled={isSubmitting}
                      >
                        <Gift className="w-5 h-5 mr-2" />
                        {isSubmitting ? 'Sending...' : 'Claim My 15% Discount'}
                      </Button>
                    </form>

                    <button
                      onClick={handleClose}
                      className="w-full text-sm text-muted-foreground hover:text-foreground mt-4 py-2 transition-colors"
                    >
                      No thanks, I'll pay full price
                    </button>
                  </>
                ) : (
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', duration: 0.5 }}
                    >
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Gift className="w-10 h-10 text-green-600 dark:text-green-400" />
                      </div>
                    </motion.div>
                    
                    <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                      Here's Your Special Code! 🎁
                    </h2>
                    <p className="text-muted-foreground mb-6">
                      Use this exclusive code at checkout for 15% off:
                    </p>

                    <button
                      onClick={copyDiscountCode}
                      className="group relative w-full py-5 px-6 bg-gradient-to-r from-destructive/10 to-orange-500/10 hover:from-destructive/20 hover:to-orange-500/20 border-2 border-dashed border-destructive rounded-xl transition-colors"
                    >
                      <span className="text-3xl font-mono font-bold text-destructive tracking-wider">
                        {DISCOUNT_CODE}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-2 group-hover:text-destructive transition-colors">
                        Click to copy
                      </span>
                    </button>

                    <Button
                      onClick={handleClose}
                      className="mt-6 w-full"
                    >
                      Start Shopping with 15% Off →
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
