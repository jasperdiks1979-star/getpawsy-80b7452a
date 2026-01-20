import { useScrollToTop } from '@/hooks/useScrollToTop';

/**
 * Component that automatically scrolls to top on route change.
 * Place this inside BrowserRouter to enable scroll restoration.
 */
export const ScrollToTop = () => {
  useScrollToTop();
  return null;
};
