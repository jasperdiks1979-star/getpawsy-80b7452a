import { useState, useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '@/lib/utils';

export const ScrollToTop = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldPulse, setShouldPulse] = useState(false);
  const hasShownBefore = useRef(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        if (!hasShownBefore.current) {
          hasShownBefore.current = true;
          setShouldPulse(true);
          setTimeout(() => setShouldPulse(false), 1500);
        }
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // Check if we're on checkout or cart page - hide scroll button there on mobile
  const [isCheckoutPage, setIsCheckoutPage] = useState(false);
  
  useEffect(() => {
    const checkPage = () => {
      const path = window.location.pathname;
      setIsCheckoutPage(path === '/checkout' || path === '/cart');
    };
    checkPage();
    window.addEventListener('popstate', checkPage);
    return () => window.removeEventListener('popstate', checkPage);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={scrollToTop}
          size="icon"
          className={cn(
            'fixed z-50 rounded-full shadow-lg transition-all duration-300',
            'bg-primary hover:bg-primary/90 hover:animate-wiggle',
            // Move higher on mobile to avoid checkout bar overlap, hide on checkout/cart pages on mobile
            'bottom-24 right-4 h-12 w-12',
            'md:bottom-6 md:right-6 md:h-10 md:w-10',
            isCheckoutPage && 'hidden md:flex',
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
            shouldPulse && 'animate-bounce'
          )}
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Back to top</p>
      </TooltipContent>
    </Tooltip>
  );
};
