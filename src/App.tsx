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
import { InternalTrafficChip } from "@/components/tracking/InternalTrafficChip";
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
try { import('@/lib/founder-mode').then(m => m.consumeFounderKeyFromUrl()); } catch (e) { console.error('[ProdSafe] consumeFounderKeyFromUrl failed:', e); }
try { import('@/lib/traffic').then(m => m.consumeInternalParamFromUrl()); } catch (e) { console.error('[ProdSafe] consumeInternalParamFromUrl failed:', e); }
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
      console.error('[LazyLoad] Import failed, attempting recovery:', error);
      
      // Chunk load failure = likely stale SW cache after deployment
      // Unregister SW, clear caches, and force reload ONCE
      const reloadKey = 'chunk-reload-' + window.location.pathname;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        try {
          // Unregister all service workers
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(r => r.unregister()));
          }
          // Clear all caches
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
        } catch (swErr) {
          console.error('[LazyLoad] SW cleanup failed:', swErr);
        }
        // Force hard reload to get fresh assets
        window.location.reload();
        // Return a never-resolving promise to prevent React from rendering an error
        return new Promise(() => {});
      }
      
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

// Admin sub-pages (all lazy-loaded, admin-only)
const DiagnosticsPage = lazyWithRetry(() => import("./pages/admin/DiagnosticsPage"));
const SeoCommandCenterPage = lazyWithRetry(() => import("./pages/admin/SeoCommandCenterPage"));
const RevenueScalingPage = lazyWithRetry(() => import("./pages/admin/RevenueScalingPage"));
const AutonomousSeoPage = lazyWithRetry(() => import("./pages/admin/AutonomousSeoPage"));
const SeoWarRoomPage = lazyWithRetry(() => import("./pages/admin/SeoWarRoomPage"));
const CompetitiveIntelligencePage = lazyWithRetry(() => import("./pages/admin/CompetitiveIntelligencePage"));
const AuthorityEnginePage = lazyWithRetry(() => import("./pages/admin/AuthorityEnginePage"));
const InternalLinkLog = lazyWithRetry(() => import("./pages/admin/InternalLinkLog"));
const AdminSeoDashboard = lazyWithRetry(() => import("./pages/admin/AdminSeoDashboard"));
const CrawlDiagnosticsDashboard = lazyWithRetry(() => import("./pages/admin/CrawlDiagnosticsDashboard"));
const CrawlHealthDashboard = lazyWithRetry(() => import("./pages/admin/CrawlHealthDashboard"));
const SnippetMonitor = lazyWithRetry(() => import("./pages/admin/SnippetMonitor"));
const ClusterWarDashboard = lazyWithRetry(() => import("./pages/admin/ClusterWarDashboard"));
const DogBedsClusterDashboard = lazyWithRetry(() => import("./pages/admin/DogBedsClusterDashboard"));
const CatLitterClusterDashboard = lazyWithRetry(() => import("./pages/admin/CatLitterClusterDashboard"));
const AnalyticsHub = lazyWithRetry(() => import("./pages/admin/AnalyticsHub"));
const GuidesDashboard = lazyWithRetry(() => import("./pages/admin/GuidesDashboard"));
const SeoIntelligencePage = lazyWithRetry(() => import("./pages/admin/SeoIntelligencePage"));
const SeoMonitorPage = lazyWithRetry(() => import("./pages/admin/SeoMonitorPage"));
const FeedGapReportPage = lazyWithRetry(() => import("./pages/admin/FeedGapReportPage"));
const FeedInsightsPage = lazyWithRetry(() => import("./pages/admin/FeedInsightsPage"));
const RedirectCheckPage = lazyWithRetry(() => import("./pages/admin/RedirectCheckPage"));
const SecurityCredentialsDashboard = lazyWithRetry(() => import("./pages/admin/SecurityCredentialsDashboard"));
const ScalingEnginePage = lazyWithRetry(() => import("./pages/admin/ScalingEnginePage"));
const ContentOpportunitiesPage = lazyWithRetry(() => import("./pages/admin/ContentOpportunitiesPage"));
const MomentumAccelerationDashboard = lazyWithRetry(() => import("./pages/admin/MomentumAccelerationDashboard"));
const BundlesPage = lazyWithRetry(() => import("./pages/admin/BundlesPage"));
const ClusterDominance = lazyWithRetry(() => import("./pages/admin/ClusterDominance"));
const AnalyticsTrafficDocs = lazyWithRetry(() => import("./pages/admin/AnalyticsTrafficDocs"));
const SlowFeederDogBowls = lazyWithRetry(() => import("./pages/SlowFeederDogBowls"));

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
                  <InternalTrafficChip />
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
                      <Route path="/slow-feeder-dog-bowls" element={<Suspense fallback={<RouteLoader />}><SlowFeederDogBowls /></Suspense>} />
                      
                      {/* Admin sub-routes */}
                      <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/admin/diagnostics" element={<Suspense fallback={<RouteLoader />}><DiagnosticsPage /></Suspense>} />
                      <Route path="/admin/seo-command-center" element={<Suspense fallback={<RouteLoader />}><SeoCommandCenterPage /></Suspense>} />
                      <Route path="/admin/revenue-scaling" element={<Suspense fallback={<RouteLoader />}><RevenueScalingPage /></Suspense>} />
                      <Route path="/admin/autonomous-seo" element={<Suspense fallback={<RouteLoader />}><AutonomousSeoPage /></Suspense>} />
                      <Route path="/admin/seo-war-room" element={<Suspense fallback={<RouteLoader />}><SeoWarRoomPage /></Suspense>} />
                      <Route path="/admin/competitive-intelligence" element={<Suspense fallback={<RouteLoader />}><CompetitiveIntelligencePage /></Suspense>} />
                      <Route path="/admin/authority-engine" element={<Suspense fallback={<RouteLoader />}><AuthorityEnginePage /></Suspense>} />
                      <Route path="/admin/internal-link-log" element={<Suspense fallback={<RouteLoader />}><InternalLinkLog /></Suspense>} />
                      <Route path="/admin/seo-dashboard" element={<Suspense fallback={<RouteLoader />}><AdminSeoDashboard /></Suspense>} />
                      <Route path="/admin/crawl-diagnostics" element={<Suspense fallback={<RouteLoader />}><CrawlDiagnosticsDashboard /></Suspense>} />
                      <Route path="/admin/crawl-health" element={<Suspense fallback={<RouteLoader />}><CrawlHealthDashboard /></Suspense>} />
                      <Route path="/admin/snippet-monitor" element={<Suspense fallback={<RouteLoader />}><SnippetMonitor /></Suspense>} />
                      <Route path="/admin/cluster-war" element={<Suspense fallback={<RouteLoader />}><ClusterWarDashboard /></Suspense>} />
                      <Route path="/admin/dog-beds-cluster" element={<Suspense fallback={<RouteLoader />}><DogBedsClusterDashboard /></Suspense>} />
                      <Route path="/admin/cat-litter-cluster" element={<Suspense fallback={<RouteLoader />}><CatLitterClusterDashboard /></Suspense>} />
                      <Route path="/admin/analytics-hub" element={<Suspense fallback={<RouteLoader />}><AnalyticsHub /></Suspense>} />
                      <Route path="/admin/guides" element={<Suspense fallback={<RouteLoader />}><GuidesDashboard /></Suspense>} />
                      <Route path="/admin/seo-intelligence" element={<Suspense fallback={<RouteLoader />}><SeoIntelligencePage /></Suspense>} />
                      <Route path="/admin/seo-monitor" element={<Suspense fallback={<RouteLoader />}><SeoMonitorPage /></Suspense>} />
                      <Route path="/admin/feed-gap-report" element={<Suspense fallback={<RouteLoader />}><FeedGapReportPage /></Suspense>} />
                      <Route path="/admin/feed-insights" element={<Suspense fallback={<RouteLoader />}><FeedInsightsPage /></Suspense>} />
                      <Route path="/admin/redirect-check" element={<Suspense fallback={<RouteLoader />}><RedirectCheckPage /></Suspense>} />
                      <Route path="/admin/security-credentials" element={<Suspense fallback={<RouteLoader />}><SecurityCredentialsDashboard /></Suspense>} />
                      <Route path="/admin/scaling-engine" element={<Suspense fallback={<RouteLoader />}><ScalingEnginePage /></Suspense>} />
                      <Route path="/admin/content-opportunities" element={<Suspense fallback={<RouteLoader />}><ContentOpportunitiesPage /></Suspense>} />
                      <Route path="/admin/momentum" element={<Suspense fallback={<RouteLoader />}><MomentumAccelerationDashboard /></Suspense>} />
                      <Route path="/admin/bundles" element={<Suspense fallback={<RouteLoader />}><BundlesPage /></Suspense>} />
                      <Route path="/admin/cluster-dominance" element={<Suspense fallback={<RouteLoader />}><ClusterDominance /></Suspense>} />
                      <Route path="/admin/analytics-traffic" element={<Suspense fallback={<RouteLoader />}><AnalyticsTrafficDocs /></Suspense>} />
                      
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
