import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition — now a zero-cost passthrough.
 * The previous framer-motion wrapper added ~2s render delay to LCP
 * because the animation frame cycle delayed first paint of the hero image.
 */
export const PageTransition = ({ children, className }: PageTransitionProps) => {
  return (
    <div className={className}>
      {children}
    </div>
  );
};
