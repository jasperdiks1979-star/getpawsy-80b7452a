import { forwardRef } from 'react';

interface AnimatedHamburgerProps {
  isOpen: boolean;
  className?: string;
}

/**
 * Pure CSS animated hamburger — no framer-motion dependency.
 * Uses forwardRef for Radix DialogTrigger compatibility.
 */
export const AnimatedHamburger = forwardRef<HTMLDivElement, AnimatedHamburgerProps>(
  ({ isOpen, className = '', ...props }, ref) => {
    return (
      <div ref={ref} className={`relative w-5 h-5 flex flex-col justify-center items-center ${className}`} {...props}>
        <span
          className={`absolute left-0 w-full h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out ${
            isOpen ? 'top-[9px] rotate-45' : 'top-[4px] rotate-0'
          }`}
        />
        <span
          className={`absolute left-0 top-[9px] w-full h-[2px] bg-current rounded-full transition-all duration-200 ease-in-out ${
            isOpen ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100'
          }`}
        />
        <span
          className={`absolute left-0 w-full h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out ${
            isOpen ? 'top-[9px] -rotate-45' : 'top-[14px] rotate-0'
          }`}
        />
      </div>
    );
  }
);

AnimatedHamburger.displayName = 'AnimatedHamburger';
