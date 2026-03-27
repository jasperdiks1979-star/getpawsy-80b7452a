import { lazy, Suspense, useEffect, useState, forwardRef } from 'react';
import { useLocation } from 'react-router-dom';

// Lazy load the chat widget for performance
const ChatWidget = lazy(() => 
  import('./ChatWidget').then(module => ({ default: module.ChatWidget }))
);

interface ChatWidgetWrapperProps {
  productContext?: Array<{
    id: string;
    name: string;
    price: number;
    category?: string | null;
    description?: string | null;
  }>;
}

export const ChatWidgetWrapper = forwardRef<HTMLDivElement, ChatWidgetWrapperProps>(
  function ChatWidgetWrapper({ productContext }, ref) {
    const location = useLocation();
    const [shouldLoad, setShouldLoad] = useState(false);

    // Only load on product/shop pages
    const isValidPage = 
      location.pathname.startsWith('/product/') ||
      location.pathname.startsWith('/bestseller/') ||
      location.pathname === '/bestsellers' ||
      location.pathname === '/shop';

    // Delay loading to not impact LCP
    useEffect(() => {
      if (!isValidPage) {
        setShouldLoad(false);
        return;
      }

      // Load after initial render + slight delay
      const timer = setTimeout(() => {
        setShouldLoad(true);
      }, 2000);

      return () => clearTimeout(timer);
    }, [isValidPage]);

    // Never show on checkout
    if (location.pathname.includes('/checkout')) {
      return null;
    }

    if (!shouldLoad) {
      return null;
    }

    return (
      <div ref={ref}>
        <Suspense fallback={null}>
          <ChatWidget productContext={productContext} />
        </Suspense>
      </div>
    );
  }
);
