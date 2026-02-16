import { lazy, Suspense, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { CartAnimationProvider } from "@/contexts/CartAnimationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { LiveCheckoutWidget } from "@/components/admin/LiveCheckoutWidget";
import { SafePinterestTag } from "@/components/tracking/SafePinterestTag";
import { SafeGlobalVisitorTracker } from "@/components/tracking/SafeGlobalVisitorTracker";
import { MarketingErrorBoundary } from "@/components/error/MarketingErrorBoundary";
import { RecentPurchaseNotification } from "@/components/social-proof/RecentPurchaseNotification";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setupGlobalErrorHandler } from "@/lib/error-reporter";
import { initDataHealer } from "@/lib/data-healer";
import { initLegacyLinkGuard, initLegacyFetchGuard } from "@/lib/legacy-link-guard";
import { AppErrorBoundary } from "@/components/error/AppErrorBoundary";

// Production-safe initialization
try { setupGlobalErrorHandler(); } catch (e) { console.error('[ProdSafe] setupGlobalErrorHandler failed:', e); }
try { initDataHealer(); } catch (e) { console.error('[ProdSafe] initDataHealer failed:', e); }
try { initLegacyLinkGuard(); } catch (e) { console.error('[ProdSafe] initLegacyLinkGuard failed:', e); }
try { initLegacyFetchGuard(); } catch (e) { console.error('[ProdSafe] initLegacyFetchGuard failed:', e); }
try { import('@/lib/analytics').then(m => m.initAnalyticsUserProperties()); } catch (e) { console.error('[ProdSafe] initAnalyticsUserProperties failed:', e); }

// Critical routes - loaded immediately
import Index from "./pages/Index";
import Products from "./pages/Products";
import NotFound from "./pages/NotFound";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RouteErrorBoundary] Caught error:', error);
    import('@/lib/error-reporter').then(({ reportError, isReact310Error, reportReact310Error }) => {
      if (isReact310Error(error)) {
        reportReact310Error(error, 'RouteErrorBoundary', { componentStack: errorInfo.componentStack?.substring(0, 1000) });
      } else {
        reportError(error, 'RouteErrorBoundary', { componentStack: errorInfo.componentStack?.substring(0, 1000) });
      }
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
          <div className="max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Oops, something went wrong</h2>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const lazyWithRetry = (importFn: () => Promise<{ default: React.ComponentType }>) => {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      console.error('[LazyLoad] Import failed:', error);
      throw error;
    }
  });
};

const ProductDetail = lazyWithRetry(() => import("./pages/ProductDetail"));
const Cart = lazyWithRetry(() => import("./pages/Cart"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout"));
const PaymentSuccess = lazyWithRetry(() => import("./pages/PaymentSuccess"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Wishlist = lazyWithRetry(() => import("./pages/Wishlist"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Orders = lazyWithRetry(() => import("./pages/Orders"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const About = lazyWithRetry(() => import("./pages/About"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const ReturnPolicy = lazyWithRetry(() => import("./pages/ReturnPolicy"));
const CookiePolicy = lazyWithRetry(() => import("./pages/CookiePolicy"));
const Contact = lazyWithRetry(() => import("./pages/Contact"));
const Shipping = lazyWithRetry(() => import("./pages/Shipping"));
const FAQ = lazyWithRetry(() => import("./pages/FAQ"));
const TrackOrder = lazyWithRetry(() => import("./pages/TrackOrder"));
const BestsellerDetail = lazyWithRetry(() => import("./pages/BestsellerDetail"));
const Bestsellers = lazyWithRetry(() => import("./pages/Bestsellers"));
const LiveMap = lazyWithRetry(() => import("./pages/LiveMap"));
const Blog = lazyWithRetry(() => import("./pages/Blog"));
const BlogPost = lazyWithRetry(() => import("./pages/BlogPost"));
const FounderMode = lazyWithRetry(() => import("./pages/FounderMode"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      refetchOnMount: false,
    },
  },
});

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => {
  return (
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <CartAnimationProvider>
              <WishlistProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <LiveCheckoutWidget />
                  <ScrollToTop />
                  <MarketingErrorBoundary>
                    <SafePinterestTag />
                    <SafeGlobalVisitorTracker />
                    <RecentPurchaseNotification />
                  </MarketingErrorBoundary>
                  <RouteErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/products" element={<Products />} />
                      
                      <Route path="/product/:id" element={<Suspense fallback={<RouteLoader />}><ProductDetail /></Suspense>} />
                      <Route path="/cart" element={<Suspense fallback={<RouteLoader />}><Cart /></Suspense>} />
                      <Route path="/checkout" element={<Suspense fallback={<RouteLoader />}><Checkout /></Suspense>} />
                      <Route path="/payment-success" element={<Suspense fallback={<RouteLoader />}><PaymentSuccess /></Suspense>} />
                      <Route path="/dashboard" element={<Suspense fallback={<RouteLoader />}><Admin /></Suspense>} />
                      <Route path="/auth" element={<Suspense fallback={<RouteLoader />}><Auth /></Suspense>} />
                      <Route path="/wishlist" element={<Suspense fallback={<RouteLoader />}><Wishlist /></Suspense>} />
                      <Route path="/profile" element={<Suspense fallback={<RouteLoader />}><Profile /></Suspense>} />
                      <Route path="/orders" element={<Suspense fallback={<RouteLoader />}><Orders /></Suspense>} />
                      <Route path="/install" element={<Suspense fallback={<RouteLoader />}><Install /></Suspense>} />
                      <Route path="/about" element={<Suspense fallback={<RouteLoader />}><About /></Suspense>} />
                      <Route path="/privacy" element={<Suspense fallback={<RouteLoader />}><PrivacyPolicy /></Suspense>} />
                      <Route path="/terms" element={<Suspense fallback={<RouteLoader />}><TermsOfService /></Suspense>} />
                      <Route path="/returns" element={<Suspense fallback={<RouteLoader />}><ReturnPolicy /></Suspense>} />
                      <Route path="/cookies" element={<Suspense fallback={<RouteLoader />}><CookiePolicy /></Suspense>} />
                      <Route path="/contact" element={<Suspense fallback={<RouteLoader />}><Contact /></Suspense>} />
                      <Route path="/shipping" element={<Suspense fallback={<RouteLoader />}><Shipping /></Suspense>} />
                      <Route path="/faq" element={<Suspense fallback={<RouteLoader />}><FAQ /></Suspense>} />
                      <Route path="/track" element={<Suspense fallback={<RouteLoader />}><TrackOrder /></Suspense>} />
                      <Route path="/bestsellers" element={<Suspense fallback={<RouteLoader />}><Bestsellers /></Suspense>} />
                      <Route path="/bestseller/:slug" element={<Suspense fallback={<RouteLoader />}><BestsellerDetail /></Suspense>} />
                      <Route path="/live-map" element={<Suspense fallback={<RouteLoader />}><LiveMap /></Suspense>} />
                      <Route path="/blog" element={<Suspense fallback={<RouteLoader />}><Blog /></Suspense>} />
                      <Route path="/blog/:slug" element={<Suspense fallback={<RouteLoader />}><BlogPost /></Suspense>} />
                      <Route path="/founder-mode" element={<Suspense fallback={<RouteLoader />}><FounderMode /></Suspense>} />
                      
                      <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </RouteErrorBoundary>
                </BrowserRouter>
              </WishlistProvider>
            </CartAnimationProvider>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;
