import { useState, useEffect, lazy, Suspense, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { CartProvider } from "@/contexts/CartContext";
import { CartAnimationProvider } from "@/contexts/CartAnimationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { LiveCheckoutWidget } from "@/components/admin/LiveCheckoutWidget";
import { PinterestTag } from "@/components/tracking/PinterestTag";
import { GlobalVisitorTracker } from "@/components/tracking/GlobalVisitorTracker";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setupGlobalErrorHandler } from "@/lib/error-reporter";
import { initDataHealer } from "@/lib/data-healer";
import { initLegacyLinkGuard, initLegacyFetchGuard } from "@/lib/legacy-link-guard";

// Setup global error handler for automatic error reporting
setupGlobalErrorHandler();

// Initialize self-healing data sanitization
initDataHealer();

// Block deprecated external admin links
initLegacyLinkGuard();
initLegacyFetchGuard();

// Critical routes - loaded immediately
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Error boundary for lazy loaded routes
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
    console.error('[RouteErrorBoundary] Error info:', errorInfo);
    
    // Report error to database via error reporter
    import('@/lib/error-reporter').then(({ reportError, isReact310Error, reportReact310Error }) => {
      if (isReact310Error(error)) {
        reportReact310Error(error, 'RouteErrorBoundary', {
          componentStack: errorInfo.componentStack?.substring(0, 1000),
        });
      } else {
        reportError(error, 'RouteErrorBoundary', {
          componentStack: errorInfo.componentStack?.substring(0, 1000),
        });
      }
    });
  }

  render() {
    if (this.state.hasError) {
      // Safely extract error message - ensure it's a string to prevent React error #310
      let errorMessage = 'An error occurred while loading the page.';
      try {
        const msg = this.state.error?.message;
        if (msg && typeof msg === 'string') {
          errorMessage = msg.length > 150 ? msg.substring(0, 150) + '...' : msg;
        } else if (msg && typeof msg === 'object') {
          errorMessage = 'A rendering error occurred.';
        }
      } catch {
        errorMessage = 'An unexpected error occurred.';
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Oops, something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              {errorMessage}
            </p>
            <div className="flex gap-2 justify-center">
              <Button 
                onClick={() => window.location.reload()}
                variant="default"
              >
                Refresh
              </Button>
              <Button 
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.history.back();
                }}
                variant="outline"
              >
                Go Back
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Lazy load heavy route components with error handling
const lazyWithRetry = (importFn: () => Promise<{ default: React.ComponentType }>) => {
  return lazy(async () => {
    try {
      console.log('[LazyLoad] Starting import...');
      const module = await importFn();
      console.log('[LazyLoad] Import successful');
      return module;
    } catch (error) {
      console.error('[LazyLoad] Import failed:', error);
      throw error;
    }
  });
};

const Products = lazyWithRetry(() => import("./pages/Products"));
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

const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));
const NewsletterPreferences = lazyWithRetry(() => import("./pages/NewsletterPreferences"));
const SlowFeederOffer = lazyWithRetry(() => import("./pages/SlowFeederOffer"));
const DownloadAds = lazyWithRetry(() => import("./pages/DownloadAds"));
const TechnicalDeclaration = lazyWithRetry(() => import("./pages/TechnicalDeclaration"));
const AppealResponse = lazyWithRetry(() => import("./pages/AppealResponse"));
const MyClaims = lazyWithRetry(() => import("./pages/MyClaims"));
const Security = lazyWithRetry(() => import("./pages/Security"));
const GoogleReview = lazyWithRetry(() => import("./pages/GoogleReview"));
const CrawlerAnalytics = lazyWithRetry(() => import("./pages/CrawlerAnalytics"));
const UserAgentComparison = lazyWithRetry(() => import("./pages/UserAgentComparison"));
const GuidesDashboard = lazyWithRetry(() => import("./pages/admin/GuidesDashboard"));
const AnalyticsHub = lazyWithRetry(() => import("./pages/admin/AnalyticsHub"));
const ClusterMapPage = lazyWithRetry(() => import("./pages/dashboard/ClusterMapPage"));
const SeoMonitorDashboard = lazyWithRetry(() => import("./pages/dashboard/SeoMonitorDashboard"));
const SeoMonitoringDashboard = lazyWithRetry(() => import("./pages/dashboard/SeoMonitoringDashboard"));
const AdminSeoDashboard = lazyWithRetry(() => import("./pages/admin/AdminSeoDashboard"));
const InternalLinkLog = lazyWithRetry(() => import("./pages/admin/InternalLinkLog"));
const SeoCollection = lazyWithRetry(() => import("./pages/SeoCollection"));
const GuidesIndex = lazyWithRetry(() => import("./pages/GuidesIndex"));
const GuidePage = lazyWithRetry(() => import("./pages/GuidePage"));
const AboutTheAuthor = lazyWithRetry(() => import("./pages/AboutTheAuthor"));
const EditorialGuidelines = lazyWithRetry(() => import("./pages/EditorialGuidelines"));
const HowWeTestProducts = lazyWithRetry(() => import("./pages/HowWeTestProducts"));
const AffiliateDisclosure = lazyWithRetry(() => import("./pages/AffiliateDisclosure"));

// Redirect component for /products/:slug -> /product/:slug (fixes duplicate page SEO issue)
const ProductsSlugRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/product/${slug}`} replace />;
};

// Redirect root-level guide slugs to /guides/{slug}
import GuideSlugRedirect from '@/components/routing/GuideSlugRedirect';

// Optimized React Query client with aggressive caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache data for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus for most queries
      refetchOnWindowFocus: false,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
    },
  },
});

// Route loading fallback component
const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex items-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span>Loading...</span>
    </div>
  </div>
);

const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Reduced loading time for faster perceived performance
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <CartAnimationProvider>
              <WishlistProvider>
                <AnimatePresence mode="wait">
                  {isLoading && <LoadingScreen key="loading" />}
                </AnimatePresence>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <LiveCheckoutWidget />
                  <ScrollToTop />
                  <PinterestTag />
                  <GlobalVisitorTracker />
                  <RouteErrorBoundary>
                    <Suspense fallback={<RouteLoader />}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/product/:id" element={<ProductDetail />} />
                        <Route path="/cart" element={<Cart />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/payment-success" element={<PaymentSuccess />} />
                        <Route path="/dashboard" element={<Admin />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/wishlist" element={<Wishlist />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/my-claims" element={<MyClaims />} />
                        <Route path="/install" element={<Install />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/privacy" element={<PrivacyPolicy />} />
                        <Route path="/terms" element={<TermsOfService />} />
                        <Route path="/returns" element={<ReturnPolicy />} />
                        <Route path="/cookies" element={<CookiePolicy />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/shipping" element={<Shipping />} />
                        <Route path="/faq" element={<FAQ />} />
                        <Route path="/track" element={<TrackOrder />} />
                        <Route path="/bestsellers" element={<Bestsellers />} />
                        <Route path="/bestseller/:slug" element={<BestsellerDetail />} />
                        <Route path="/live-map" element={<LiveMap />} />
                        <Route path="/blog" element={<Blog />} />
                        <Route path="/blog/:slug" element={<BlogPost />} />
                        <Route path="/unsubscribe" element={<Unsubscribe />} />
                        <Route path="/newsletter-preferences" element={<NewsletterPreferences />} />
                        <Route path="/slow-feeder-offer" element={<SlowFeederOffer />} />
                        <Route path="/download-ads" element={<DownloadAds />} />
                        <Route path="/technical-declaration" element={<TechnicalDeclaration />} />
                        <Route path="/appeal-response" element={<AppealResponse />} />
                        <Route path="/security" element={<Security />} />
                        <Route path="/google-review" element={<GoogleReview />} />
                        <Route path="/dashboard/crawler-analytics" element={<CrawlerAnalytics />} />
                         <Route path="/dashboard/user-agent-comparison" element={<UserAgentComparison />} />
                         <Route path="/dashboard/guides-seo" element={<GuidesDashboard />} />
                         <Route path="/dashboard/analytics" element={<AnalyticsHub />} />
                         <Route path="/dashboard/cluster-map" element={<ClusterMapPage />} />
                          <Route path="/dashboard/seo-monitor" element={<SeoMonitorDashboard />} />
                          <Route path="/dashboard/seo-monitoring" element={<SeoMonitoringDashboard />} />
                         
                         {/* Legacy /admin redirects to /dashboard */}
                         <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
                          <Route path="/admin/seo-dashboard" element={<AdminSeoDashboard />} />
                          <Route path="/admin/internal-link-log" element={<InternalLinkLog />} />
                          <Route path="/admin/guides-seo" element={<Navigate to="/dashboard/guides-seo" replace />} />
                         <Route path="/admin/analytics" element={<Navigate to="/dashboard/analytics" replace />} />
                         <Route path="/admin/crawler-analytics" element={<Navigate to="/dashboard/crawler-analytics" replace />} />
                         <Route path="/admin/user-agent-comparison" element={<Navigate to="/dashboard/user-agent-comparison" replace />} />
                        
                        {/* SEO Collection Pages */}
                        <Route path="/collections/:slug" element={<SeoCollection />} />
                        
                        {/* Guides */}
                        <Route path="/guides" element={<GuidesIndex />} />
                        <Route path="/guides/:slug" element={<GuidePage />} />
                        
                        {/* Trust & Transparency Pages */}
                        <Route path="/about-the-author" element={<AboutTheAuthor />} />
                        <Route path="/editorial-guidelines" element={<EditorialGuidelines />} />
                        <Route path="/how-we-test-products" element={<HowWeTestProducts />} />
                        <Route path="/affiliate-disclosure" element={<AffiliateDisclosure />} />
                        
                        {/* Legacy URL redirects for SEO */}
                        <Route path="/return-policy" element={<Navigate to="/returns" replace />} />
                        <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
                        <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
                        <Route path="/cookie-policy" element={<Navigate to="/cookies" replace />} />
                        
                        {/* Fix duplicate page issue: redirect /products/:slug to /product/:slug */}
                        <Route path="/products/:slug" element={<ProductsSlugRedirect />} />
                        
                        {/* Root-level guide slug redirects → /guides/{slug}, else 404 */}
                        <Route path="/:slug" element={<GuideSlugRedirect />} />
                        
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </RouteErrorBoundary>
                </BrowserRouter>
              </WishlistProvider>
            </CartAnimationProvider>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
