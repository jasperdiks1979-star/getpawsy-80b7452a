import { lazy, Suspense, Component, ReactNode, useState, useEffect } from "react";
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
// Marketing/tracking components — lazy-loaded, not needed for first paint
const LiveCheckoutWidget = lazy(() => import("@/components/admin/LiveCheckoutWidget").then(m => ({ default: m.LiveCheckoutWidget })));
const SafePinterestTag = lazy(() => import("@/components/tracking/SafePinterestTag").then(m => ({ default: m.SafePinterestTag })));
const SafeGlobalVisitorTracker = lazy(() => import("@/components/tracking/SafeGlobalVisitorTracker").then(m => ({ default: m.SafeGlobalVisitorTracker })));
const RecentPurchaseNotification = lazy(() => import("@/components/social-proof/RecentPurchaseNotification").then(m => ({ default: m.RecentPurchaseNotification })));
const InternalTrafficChip = lazy(() => import("@/components/tracking/InternalTrafficChip").then(m => ({ default: m.InternalTrafficChip })));
import { MarketingErrorBoundary } from "@/components/error/MarketingErrorBoundary";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
// Defer non-critical initializers — don't block first paint
const setupGlobalErrorHandler = () => import("@/lib/error-reporter").then(m => m.setupGlobalErrorHandler());
const initDataHealer = () => import("@/lib/data-healer").then(m => m.initDataHealer());
const initLegacyLinkGuard = () => import("@/lib/legacy-link-guard").then(m => m.initLegacyLinkGuard());
const initLegacyFetchGuard = () => import("@/lib/legacy-link-guard").then(m => m.initLegacyFetchGuard());
import { AppErrorBoundary } from "@/components/error/AppErrorBoundary";

// Production-safe initialization — deferred to not block first paint
if (typeof window !== 'undefined') {
  requestAnimationFrame(() => {
    setupGlobalErrorHandler().catch(() => {});
    initDataHealer().catch(() => {});
    initLegacyLinkGuard().catch(() => {});
    initLegacyFetchGuard().catch(() => {});
    import('@/lib/founder-mode').then(m => m.consumeFounderKeyFromUrl()).catch(() => {});
    import('@/lib/traffic').then(m => m.consumeInternalParamFromUrl()).catch(() => {});
    import('@/lib/analytics').then(m => m.initAnalyticsUserProperties()).catch(() => {});
  });
}

// Critical routes - only Index is eagerly loaded for homepage LCP
import Index from "./pages/Index";

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
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm mb-4">This page couldn't load. Try refreshing or go back home.</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => this.setState({ hasError: false, error: null })}>Try Again</Button>
              <Button variant="outline" onClick={() => { window.location.href = '/'; }}>Go Home</Button>
            </div>
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
        // Force hard reload with cache-bust to get fresh assets
        window.location.href = window.location.pathname + '?cb=' + Date.now();
        // Return a never-resolving promise to prevent React from rendering an error
        return new Promise(() => {});
      }
      
      throw error;
    }
  });
};

// Products & NotFound — lazy for homepage LCP (not needed on first paint)
const Products = lazyWithRetry(() => import("./pages/Products"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
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
const AdminReportsPage = lazyWithRetry(() => import("./pages/admin/AdminReportsPage"));
const GrowthExecutionPage = lazyWithRetry(() => import("./pages/admin/GrowthExecutionPage"));
const BacklinkEnginePage = lazyWithRetry(() => import("./pages/admin/BacklinkEnginePage"));
const AdminResourcesPage = lazyWithRetry(() => import("./pages/admin/AdminResourcesPage"));
const IndexingDiagnosticsPage = lazyWithRetry(() => import("./pages/admin/IndexingDiagnosticsPage"));
const PerfAuditPage = lazyWithRetry(() => import("./pages/admin/PerfAuditPage"));
const EdgeDiagnosticsPage = lazyWithRetry(() => import("./pages/admin/EdgeDiagnosticsPage"));
const DomainHealthPage = lazyWithRetry(() => import("./pages/admin/DomainHealthPage"));
const Gsc4xxTriagePage = lazyWithRetry(() => import("./pages/admin/Gsc4xxTriagePage"));
const StructuredDataPage = lazyWithRetry(() => import("./pages/admin/StructuredDataPage"));
const SeoAgentControlCenter = lazyWithRetry(() => import("./pages/admin/SeoAgentControlCenter"));
const CommerceIntelligencePage = lazyWithRetry(() => import("./pages/admin/CommerceIntelligencePage"));
const SlowFeederDogBowls = lazyWithRetry(() => import("./pages/SlowFeederDogBowls"));
const SeoCollection = lazyWithRetry(() => import("./pages/SeoCollection"));
const GuidesIndex = lazyWithRetry(() => import("./pages/GuidesIndex"));
const GuidePage = lazyWithRetry(() => import("./pages/GuidePage"));
const GrowthVerification = lazyWithRetry(() => import("./pages/GrowthVerification"));

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

const RouteLoader = () => {
  const [showError, setShowError] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowError(true), 12_000);
    return () => clearTimeout(t);
  }, []);

  if (showError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
        <div className="max-w-md">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Page took too long to load</h2>
          <p className="text-muted-foreground text-sm mb-4">This might be a temporary issue. Please try reloading.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="outline" onClick={() => { window.location.href = '/'; }}>Go Home</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
};

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
                  <Suspense fallback={null}><LiveCheckoutWidget /></Suspense>
                  <ScrollToTop />
                  <MarketingErrorBoundary>
                    <Suspense fallback={null}>
                      <SafePinterestTag />
                      <SafeGlobalVisitorTracker />
                      <RecentPurchaseNotification />
                    </Suspense>
                  </MarketingErrorBoundary>
                  <Suspense fallback={null}><InternalTrafficChip /></Suspense>
                  <RouteErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/products" element={<Suspense fallback={<RouteLoader />}><Products /></Suspense>} />
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
                      
                      {/* Guide pages */}
                      <Route path="/guides" element={<Suspense fallback={<RouteLoader />}><GuidesIndex /></Suspense>} />
                      <Route path="/guides/:slug" element={<Suspense fallback={<RouteLoader />}><GuidePage /></Suspense>} />
                      
                      {/* SEO Collection pages — /collections/:slug */}
                      <Route path="/collections/:slug" element={<Suspense fallback={<RouteLoader />}><SeoCollection /></Suspense>} />
                      
                      {/* Legacy collection alias */}
                      <Route path="/collection/:slug" element={<Suspense fallback={<RouteLoader />}><SeoCollection /></Suspense>} />
                      
                      {/* Growth verification diagnostics */}
                      <Route path="/__ops/growth-verification" element={<Suspense fallback={<RouteLoader />}><GrowthVerification /></Suspense>} />
                      
                      {/* Parent category routes */}
                      <Route path="/dogs" element={<Navigate to="/products?category=dogs" replace />} />
                      <Route path="/cats" element={<Navigate to="/products?category=cats" replace />} />
                      
                      {/* Category navigation routes — redirect to /products?category= */}
                      <Route path="/dogs/dog-beds" element={<Navigate to="/products?category=dog-beds" replace />} />
                      <Route path="/dogs/dog-toys" element={<Navigate to="/products?category=dog-toys" replace />} />
                      <Route path="/dogs/chew-toys" element={<Navigate to="/products?category=dog-toys" replace />} />
                      <Route path="/dogs/dog-collars-leashes" element={<Navigate to="/products?category=dog-collars-leashes" replace />} />
                      <Route path="/dogs/dog-carriers" element={<Navigate to="/products?category=dog-carriers" replace />} />
                      <Route path="/dogs/dog-grooming" element={<Navigate to="/products?category=dog-grooming" replace />} />
                      <Route path="/cats/cat-toys" element={<Navigate to="/products?category=cat-toys" replace />} />
                      <Route path="/cats/cat-litter" element={<Navigate to="/products?category=cat-litter-boxes" replace />} />
                      <Route path="/cats/litter-boxes" element={<Navigate to="/products?category=cat-litter-boxes" replace />} />
                      <Route path="/cats/cat-trees" element={<Navigate to="/products?category=cat-trees-and-condos" replace />} />
                      <Route path="/cats/cat-carriers" element={<Navigate to="/products?category=cat-carriers" replace />} />
                      <Route path="/cats/automatic-feeders" element={<Navigate to="/products?category=automatic-cat-feeders" replace />} />
                      <Route path="/category/:slug" element={<Navigate to="/products" replace />} />
                      <Route path="/shop" element={<Navigate to="/products" replace />} />
                      {/* Admin sub-routes */}
                      <Route path="/admin" element={<Navigate to="/admin/growth-execution" replace />} />
                      <Route path="/admin/diagnostics" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><DiagnosticsPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-command-center" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SeoCommandCenterPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/revenue-scaling" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><RevenueScalingPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/autonomous-seo" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AutonomousSeoPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-war-room" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SeoWarRoomPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/competitive-intelligence" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><CompetitiveIntelligencePage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/authority-engine" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AuthorityEnginePage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/internal-link-log" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><InternalLinkLog /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-dashboard" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AdminSeoDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/crawl-diagnostics" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><CrawlDiagnosticsDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/crawl-health" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><CrawlHealthDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/snippet-monitor" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SnippetMonitor /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/cluster-war" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><ClusterWarDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/dog-beds-cluster" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><DogBedsClusterDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/cat-litter-cluster" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><CatLitterClusterDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/analytics-hub" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AnalyticsHub /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/guides" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><GuidesDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-intelligence" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SeoIntelligencePage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-monitor" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SeoMonitorPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/feed-gap-report" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><FeedGapReportPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/feed-insights" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><FeedInsightsPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/redirect-check" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><RedirectCheckPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/security-credentials" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SecurityCredentialsDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/scaling-engine" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><ScalingEnginePage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/content-opportunities" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><ContentOpportunitiesPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/momentum" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><MomentumAccelerationDashboard /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/bundles" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><BundlesPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/cluster-dominance" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><ClusterDominance /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/analytics-traffic" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AnalyticsTrafficDocs /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/reports" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AdminReportsPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/growth-execution" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><GrowthExecutionPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/backlink-engine" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><BacklinkEnginePage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/resources" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><AdminResourcesPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/indexing-diagnostics" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><IndexingDiagnosticsPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/perf-audit" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><PerfAuditPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/edge-diagnostics" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><EdgeDiagnosticsPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/domain-health" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><DomainHealthPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/gsc-4xx" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><Gsc4xxTriagePage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/structured-data" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><StructuredDataPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-structured-data" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><StructuredDataPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/perf" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><PerfAuditPage /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/seo-agent" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><SeoAgentControlCenter /></Suspense></AdminRouteGuard>} />
                      <Route path="/admin/commerce-intelligence" element={<AdminRouteGuard><Suspense fallback={<RouteLoader />}><CommerceIntelligencePage /></Suspense></AdminRouteGuard>} />
                      
                      <Route path="*" element={<Suspense fallback={<RouteLoader />}><NotFound /></Suspense>} />
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
