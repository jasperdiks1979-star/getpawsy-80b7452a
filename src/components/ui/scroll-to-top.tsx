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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={scrollToTop}
          size="icon"
          className={cn(
            'fixed bottom-6 right-6 z-50 rounded-full shadow-lg transition-all duration-300',
            'bg-primary hover:bg-primary/90 hover:animate-wiggle',
            'h-14 w-14 md:h-10 md:w-10',
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
            shouldPulse && 'animate-bounce'
          )}
          aria-label="Scroll naar boven"
        >
          <ArrowUp className="h-6 w-6 md:h-5 md:w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Terug naar boven</p>
      </TooltipContent>
    </Tooltip>
  );
};
