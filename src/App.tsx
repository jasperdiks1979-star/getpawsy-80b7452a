import { lazy, Suspense, Component, ReactNode, useState, useEffect } from "react";
// ⚡ Toaster/Sonner deferred — not needed for first paint
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })));
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { CartAnimationProvider } from "@/contexts/CartAnimationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { HostnameGuard } from "@/components/seo/HostnameGuard";
// Marketing/tracking components — lazy-loaded, not needed for first paint
// LiveCheckoutWidget removed from global render — admin-only, was causing bundle leakage
const SafePinterestTag = lazy(() => import("@/components/tracking/SafePinterestTag").then(m => ({ default: m.SafePinterestTag })));
const SafeGlobalVisitorTracker = lazy(() => import("@/components/tracking/SafeGlobalVisitorTracker").then(m => ({ default: m.SafeGlobalVisitorTracker })));
// RecentPurchaseNotification removed — fake geo-based purchase popups risk Google misrepresentation flags
const InternalTrafficChip = lazy(() => import("@/components/tracking/InternalTrafficChip").then(m => ({ default: m.InternalTrafficChip })));
import { MarketingErrorBoundary } from "@/components/error/MarketingErrorBoundary";
// Admin guard + layout: lazy-loaded to keep admin code out of storefront bundle
const LazyAdminShell = lazy(() =>
  Promise.all([
    import("@/components/auth/AdminRouteGuard"),
    import("@/components/admin/AdminLayout"),
  ]).then(([guardMod, layoutMod]) => ({
    default: () => (
      <guardMod.AdminRouteGuard>
        <layoutMod.AdminLayout />
      </guardMod.AdminRouteGuard>
    ),
  }))
);
// ⚡ Loader2, AlertCircle, Button: only used in error/loading fallbacks — NOT on critical path
// Moved to inline HTML to eliminate ~20KB (Radix Slot + Lucide icons) from main chunk parse
// Defer non-critical initializers — don't block first paint
const setupGlobalErrorHandler = () => import("@/lib/error-reporter").then(m => m.setupGlobalErrorHandler());
const initDataHealer = () => import("@/lib/data-healer").then(m => m.initDataHealer());
const initLegacyLinkGuard = () => import("@/lib/legacy-link-guard").then(m => m.initLegacyLinkGuard());
const initLegacyFetchGuard = () => import("@/lib/legacy-link-guard").then(m => m.initLegacyFetchGuard());
import { AppErrorBoundary } from "@/components/error/AppErrorBoundary";

// Web Vitals panel — lazy, dev/preview only, tree-shaken in prod
const WebVitalsPanel = !import.meta.env.PROD && import.meta.env.VITE_VITALS_PANEL !== 'false'
  ? lazy(() => import("@/components/dev/WebVitalsPanel"))
  : null;

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

// ⚡ STRUCTURAL FIX: Index is now lazy-loaded — moves ~2000 lines (Index + Layout + Navbar + Footer)
// out of the main chunk. Static HTML shell in index.html covers the visual gap.

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
      // Non-blocking: show banner + attempt to render children
      return (
        <>
          <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-50 border-b border-amber-300 px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-amber-800" style={{ fontFamily: 'system-ui, sans-serif' }}>
            <span>⚠️ This page had a temporary issue.</span>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => this.setState({ hasError: false, error: null })} className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium">Try Again</button>
              <button onClick={() => { window.location.href = '/'; }} className="px-3 py-1 rounded-md border border-border text-xs font-medium">Home</button>
            </div>
          </div>
          {this.props.children}
        </>
      );
    }
    return this.props.children;
  }
}

/** Fallback component shown when chunk loading fails even after reload */
const ChunkLoadError = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Page failed to load</h2>
    <p style={{ color: '#666', marginBottom: '1rem', maxWidth: '24rem' }}>
      This usually resolves with a fresh reload. If it persists, clear your browser cache.
    </p>
    <button
      onClick={() => { sessionStorage.clear(); window.location.replace(window.location.pathname); }}
      style={{ padding: '0.5rem 1.5rem', background: '#111', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
    >
      Reload page
    </button>
  </div>
);

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
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(r => r.unregister()));
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
        } catch (swErr) {
          console.error('[LazyLoad] SW cleanup failed:', swErr);
        }
        window.location.href = window.location.pathname + '?cb=' + Date.now();
        return new Promise(() => {});
      }
      
      // Second failure after reload — show recovery UI instead of blank screen
      console.error('[LazyLoad] Chunk still unavailable after reload, showing recovery UI');
      return { default: ChunkLoadError };
    }
  });
};

// ⚡ STRUCTURAL FIX: Index now lazy — moves Index+Layout+Navbar+Footer out of main chunk
const Index = lazyWithRetry(() => import("./pages/Index"));
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
const HelpCenter = lazyWithRetry(() => import("./pages/HelpCenter"));
const TrackOrder = lazyWithRetry(() => import("./pages/TrackOrder"));
const BestsellerDetail = lazyWithRetry(() => import("./pages/BestsellerDetail"));
const Bestsellers = lazyWithRetry(() => import("./pages/Bestsellers"));
const LiveMap = lazyWithRetry(() => import("./pages/LiveMap"));
const Blog = lazyWithRetry(() => import("./pages/Blog"));
const BlogPost = lazyWithRetry(() => import("./pages/BlogPost"));
const FounderMode = lazyWithRetry(() => import("./pages/FounderMode"));
const DogHub = lazyWithRetry(() => import("./pages/DogHub"));
const CatHub = lazyWithRetry(() => import("./pages/CatHub"));
const DogTrainingTravelPillar = lazyWithRetry(() => import("./pages/landing/DogTrainingTravelPillar"));
const CatTrainingTravelPillar = lazyWithRetry(() => import("./pages/landing/CatTrainingTravelPillar"));
const DogTraining = lazyWithRetry(() => import("./pages/silo/DogTraining"));
const DogTravel = lazyWithRetry(() => import("./pages/silo/DogTravel"));
const CatTraining = lazyWithRetry(() => import("./pages/silo/CatTraining"));
const CatTravel = lazyWithRetry(() => import("./pages/silo/CatTravel"));

/** Redirect legacy /collection/:slug to /collections/:slug with 301-equivalent */
function CollectionRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/collections/${slug || ''}`} replace />;
}

// Admin sub-pages (all lazy-loaded, admin-only)
const DiagnosticsPage = lazyWithRetry(() => import("./pages/admin/DiagnosticsPage"));
const SeoCommandCenterPage = lazyWithRetry(() => import("./pages/admin/SeoCommandCenterPage"));
const RevenueScalingPage = lazyWithRetry(() => import("./pages/admin/RevenueScalingPage"));
const CRODashboardPage = lazyWithRetry(() => import("./pages/admin/CRODashboardPage"));
const AutonomousSeoPage = lazyWithRetry(() => import("./pages/admin/AutonomousSeoPage"));
const AutonomousSeoEnginePage = lazyWithRetry(() => import("./pages/admin/AutonomousSeoEnginePage"));
const SeoWarRoomPage = lazyWithRetry(() => import("./pages/admin/SeoWarRoomPage"));
const CompetitiveIntelligencePage = lazyWithRetry(() => import("./pages/admin/CompetitiveIntelligencePage"));
const AuthorityEnginePage = lazyWithRetry(() => import("./pages/admin/AuthorityEnginePage"));
const InternalLinkLog = lazyWithRetry(() => import("./pages/admin/InternalLinkLog"));
const SeoAccelerationPage = lazyWithRetry(() => import("./pages/admin/SeoAccelerationPage"));
const ProgressDashboard = lazyWithRetry(() => import("./pages/admin/ProgressDashboard"));
const AdminSeoDashboard = lazyWithRetry(() => import("./pages/admin/AdminSeoDashboard"));
const CrawlDiagnosticsDashboard = lazyWithRetry(() => import("./pages/admin/CrawlDiagnosticsDashboard"));
const CrawlHealthDashboard = lazyWithRetry(() => import("./pages/admin/CrawlHealthDashboard"));
const SnippetMonitor = lazyWithRetry(() => import("./pages/admin/SnippetMonitor"));
const ClusterWarDashboard = lazyWithRetry(() => import("./pages/admin/ClusterWarDashboard"));
const DogBedsClusterDashboard = lazyWithRetry(() => import("./pages/admin/DogBedsClusterDashboard"));
const CatLitterClusterDashboard = lazyWithRetry(() => import("./pages/admin/CatLitterClusterDashboard"));
const AnalyticsHub = lazyWithRetry(() => import("./pages/admin/AnalyticsHub"));
const GuidesDashboard = lazyWithRetry(() => import("./pages/admin/GuidesDashboard"));
const GuideGeneratorPage = lazyWithRetry(() => import("./pages/admin/GuideGeneratorPage"));
const ComparisonGeneratorPage = lazyWithRetry(() => import("./pages/admin/ComparisonGeneratorPage"));
const BacklinkGrowthPage = lazyWithRetry(() => import("./pages/admin/BacklinkGrowthPage"));
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
const GrowthIntelligencePage = lazyWithRetry(() => import("./pages/admin/GrowthIntelligencePage"));
const BacklinkEnginePage = lazyWithRetry(() => import("./pages/admin/BacklinkEnginePage"));
const AdminResourcesPage = lazyWithRetry(() => import("./pages/admin/AdminResourcesPage"));
const IndexingDiagnosticsPage = lazyWithRetry(() => import("./pages/admin/IndexingDiagnosticsPage"));
const CatCondoGrowthDashboard = lazyWithRetry(() => import("./pages/admin/CatCondoGrowthDashboard"));
const SeoAgentAutonomous = lazyWithRetry(() => import("./pages/admin/SeoAgentAutonomous"));
const PerfAuditPage = lazyWithRetry(() => import("./pages/admin/PerfAuditPage"));
const PerfDebugPage = lazyWithRetry(() => import("./pages/admin/PerfDebugPage"));
const EdgeDiagnosticsPage = lazyWithRetry(() => import("./pages/admin/EdgeDiagnosticsPage"));
const SeoConsolePage = lazyWithRetry(() => import("./pages/admin/SeoConsole"));
const SitemapPingPage = lazyWithRetry(() => import("./pages/admin/SitemapPingPage"));
const MerchantFixChecklist = lazyWithRetry(() => import("./pages/MerchantFixChecklist"));
const MerchantIntegrationPage = lazyWithRetry(() => import("./pages/admin/MerchantIntegrationPage"));
const MerchantSettingsPage = lazyWithRetry(() => import("./pages/admin/MerchantSettingsPage"));
const MerchantReadinessPage = lazyWithRetry(() => import("./pages/admin/MerchantReadinessPage"));
const MerchantHealthPage = lazyWithRetry(() => import("./pages/admin/MerchantHealthPage"));
const MerchantOAuthCallback = lazyWithRetry(() => import("./pages/MerchantOAuthCallback"));
const ShoppingOptimizerPage = lazyWithRetry(() => import("./pages/admin/ShoppingOptimizerPage"));
const ShopHub = lazyWithRetry(() => import("./pages/ShopHub"));
const RecentProducts = lazyWithRetry(() => import("./pages/RecentProducts"));
const TrendingProducts = lazyWithRetry(() => import("./pages/TrendingProducts"));

// Diagnostics pages (hidden, noindex)
const HeadersDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/HeadersDiagnostics"));
const PerformanceDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/PerformanceDiagnostics"));
const GscChecklist = lazyWithRetry(() => import("./pages/diagnostics/GscChecklist"));
const SeoHostDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/SeoHostDiagnostics"));
const SitemapHealthDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/SitemapHealthDiagnostics"));
const CrawlBudgetDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/CrawlBudgetDiagnostics"));
const IndexControlDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/IndexControlDiagnostics"));
const LinkEquityDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/LinkEquityDiagnostics"));
const SerpWarDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/SerpWarDiagnostics"));
const Top3BoostDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/Top3BoostDiagnostics"));
const Top3LockdownDiagnostics = lazyWithRetry(() => import("./pages/diagnostics/Top3LockdownDiagnostics"));
const RevenueWarMachine = lazyWithRetry(() => import("./pages/diagnostics/RevenueWarMachine"));
const NicheMonopoly = lazyWithRetry(() => import("./pages/diagnostics/NicheMonopoly"));
const AutoExpansion = lazyWithRetry(() => import("./pages/diagnostics/AutoExpansion"));
const MarketTakeover = lazyWithRetry(() => import("./pages/diagnostics/MarketTakeover"));
const DomainHealthPage = lazyWithRetry(() => import("./pages/admin/DomainHealthPage"));
const Gsc4xxTriagePage = lazyWithRetry(() => import("./pages/admin/Gsc4xxTriagePage"));
const StructuredDataPage = lazyWithRetry(() => import("./pages/admin/StructuredDataPage"));
const SeoAgentControlCenter = lazyWithRetry(() => import("./pages/admin/SeoAgentControlCenter"));
const CommerceIntelligencePage = lazyWithRetry(() => import("./pages/admin/CommerceIntelligencePage"));
const AdminDashboardOverview = lazyWithRetry(() => import("./pages/admin/AdminDashboardOverview"));
const SlowFeederDogBowls = lazyWithRetry(() => import("./pages/SlowFeederDogBowls"));
const SeoCollection = lazyWithRetry(() => import("./pages/SeoCollection"));
const OrthopedicDogBeds = lazyWithRetry(() => import("./pages/collections/OrthopedicDogBeds"));
const CatTreesForLargeCats = lazyWithRetry(() => import("./pages/collections/CatTreesForLargeCats"));
const DogCarTravelSafety = lazyWithRetry(() => import("./pages/collections/DogCarTravelSafety"));
const DogTrainingBehaviorTools = lazyWithRetry(() => import("./pages/collections/DogTrainingBehaviorTools"));
const TrainingClusterArticle = lazyWithRetry(() => import("./pages/collections/cluster/TrainingClusterArticle"));
const LockdownClusterArticle = lazyWithRetry(() => import("./pages/collections/cluster/LockdownClusterArticle"));
const ClusterRevenueEngine = lazyWithRetry(() => import("./pages/admin/ClusterRevenueEngine"));
const OrthopedicLargeDogs = lazyWithRetry(() => import("./pages/collections/sub-intent/OrthopedicLargeDogs"));
const WaterproofOrthopedicBed = lazyWithRetry(() => import("./pages/collections/sub-intent/WaterproofOrthopedicBed"));
const MemoryFoamDogBeds = lazyWithRetry(() => import("./pages/collections/sub-intent/MemoryFoamDogBeds"));
const OrthopedicClusterArticle = lazyWithRetry(() => import("./pages/collections/cluster/OrthopedicClusterArticle"));
const CatTreeMaineCoon = lazyWithRetry(() => import("./pages/collections/sub-intent/CatTreeMaineCoon"));
const HeavyDutyCatTree = lazyWithRetry(() => import("./pages/collections/sub-intent/HeavyDutyCatTree"));
const LargeCatCondo = lazyWithRetry(() => import("./pages/collections/sub-intent/LargeCatCondo"));
const DogCarSeatSmallDogs = lazyWithRetry(() => import("./pages/collections/sub-intent/DogCarSeatSmallDogs"));
const DogBoosterSeat = lazyWithRetry(() => import("./pages/collections/sub-intent/DogBoosterSeat"));
const DogCarHarness = lazyWithRetry(() => import("./pages/collections/sub-intent/DogCarHarness"));
const PetCareGuides = lazyWithRetry(() => import("./pages/PetCareGuides"));
const GuidesIndex = lazyWithRetry(() => import("./pages/GuidesIndex"));
const GuidePage = lazyWithRetry(() => import("./pages/GuidePage"));
const CatCondoVsCatTree2026 = lazyWithRetry(() => import("./pages/guides/CatCondoVsCatTree2026"));
const BestSelfCleaningLitterBox2026 = lazyWithRetry(() => import("./pages/guides/BestSelfCleaningLitterBox2026"));
const IndoorCatFurnitureGuide = lazyWithRetry(() => import("./pages/guides/IndoorCatFurnitureGuide"));
const GrowthVerification = lazyWithRetry(() => import("./pages/GrowthVerification"));
const Healthz = lazyWithRetry(() => import("./pages/Healthz"));
const ComplianceEvidence = lazyWithRetry(() => import("./pages/ComplianceEvidence"));
const WhyTrustOurReviews = lazyWithRetry(() => import("./pages/WhyTrustOurReviews"));
const AboutTheAuthor = lazyWithRetry(() => import("./pages/AboutTheAuthor"));
const HowWeTestProducts = lazyWithRetry(() => import("./pages/HowWeTestProducts"));
const EditorialGuidelines = lazyWithRetry(() => import("./pages/EditorialGuidelines"));
const AffiliateDisclosure = lazyWithRetry(() => import("./pages/AffiliateDisclosure"));
const DogBedSizeChart = lazyWithRetry(() => import("./pages/DogBedSizeChart"));
const IndoorCatCareResource = lazyWithRetry(() => import("./pages/IndoorCatCareResource"));
const TrainingLandingPage = lazyWithRetry(() => import("./pages/landing/TrainingLandingPage"));

// Generic SEO pages — wrapper components that pass namespace prop
// Generic SEO pages — lazy-loaded wrapper components
const DogPillarPage = lazyWithRetry(() => import('./pages/seo/SeoPageWrappers').then(m => ({ default: m.DogPillarPage })));
const CatPillarPage = lazyWithRetry(() => import('./pages/seo/SeoPageWrappers').then(m => ({ default: m.CatPillarPage })));
const DogIntentPage = lazyWithRetry(() => import('./pages/seo/SeoPageWrappers').then(m => ({ default: m.DogIntentPage })));
const CatIntentPage = lazyWithRetry(() => import('./pages/seo/SeoPageWrappers').then(m => ({ default: m.CatIntentPage })));

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
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Page took too long to load</h2>
          <p className="text-muted-foreground text-sm mb-4">This might be a temporary issue. Please try reloading.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Reload</button>
            <button onClick={() => { window.location.href = '/'; }} className="px-4 py-2 rounded-md border border-border text-sm font-medium">Go Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
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
                {/* ⚡ Toaster/Sonner deferred — lazy-loaded, not needed for first paint */}
                <Suspense fallback={null}><Toaster /></Suspense>
                <Suspense fallback={null}><Sonner /></Suspense>
                <BrowserRouter>
                  {/* LiveCheckoutWidget removed — admin-only widget, was leaking into storefront bundle */}
                  <ScrollToTop />
                  <HostnameGuard />
                  <MarketingErrorBoundary>
                    <Suspense fallback={null}>
                      <SafePinterestTag />
                      <SafeGlobalVisitorTracker />
                    </Suspense>
                  </MarketingErrorBoundary>
                  <Suspense fallback={null}><InternalTrafficChip /></Suspense>
                  <RouteErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Suspense fallback={null}><Index /></Suspense>} />
                      <Route path="/healthz" element={<Suspense fallback={null}><Healthz /></Suspense>} />
                      <Route path="/compliance" element={<Suspense fallback={null}><ComplianceEvidence /></Suspense>} />
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
                      {/* Alternate policy URLs — redirect to canonical routes */}
                      <Route path="/shipping-policy" element={<Navigate to="/shipping" replace />} />
                      <Route path="/refund-policy" element={<Navigate to="/returns" replace />} />
                      <Route path="/returns-policy" element={<Navigate to="/returns" replace />} />
                      <Route path="/return-policy" element={<Navigate to="/returns" replace />} />
                      <Route path="/policies/returns" element={<Navigate to="/returns" replace />} />
                      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
                      <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
                      <Route path="/faq" element={<Suspense fallback={<RouteLoader />}><FAQ /></Suspense>} />
                      <Route path="/help" element={<Suspense fallback={<RouteLoader />}><HelpCenter /></Suspense>} />
                      <Route path="/api/merchant-oauth-callback" element={<Suspense fallback={<RouteLoader />}><MerchantOAuthCallback /></Suspense>} />
                      <Route path="/track" element={<Suspense fallback={<RouteLoader />}><TrackOrder /></Suspense>} />
                      <Route path="/bestsellers" element={<Suspense fallback={<RouteLoader />}><Bestsellers /></Suspense>} />
                      <Route path="/bestseller/:slug" element={<Suspense fallback={<RouteLoader />}><BestsellerDetail /></Suspense>} />
                      <Route path="/live-map" element={<Suspense fallback={<RouteLoader />}><LiveMap /></Suspense>} />
                      <Route path="/blog" element={<Suspense fallback={<RouteLoader />}><Blog /></Suspense>} />
                      <Route path="/blog/:slug" element={<Suspense fallback={<RouteLoader />}><BlogPost /></Suspense>} />
                      <Route path="/founder-mode" element={<Suspense fallback={<RouteLoader />}><FounderMode /></Suspense>} />
                      <Route path="/slow-feeder-dog-bowls" element={<Suspense fallback={<RouteLoader />}><SlowFeederDogBowls /></Suspense>} />
                      <Route path="/landing/:slug" element={<Suspense fallback={<RouteLoader />}><TrainingLandingPage /></Suspense>} />
                      <Route path="/why-trust-our-reviews" element={<Suspense fallback={<RouteLoader />}><WhyTrustOurReviews /></Suspense>} />
                      <Route path="/about-the-author" element={<Suspense fallback={<RouteLoader />}><AboutTheAuthor /></Suspense>} />
                      <Route path="/how-we-test-products" element={<Suspense fallback={<RouteLoader />}><HowWeTestProducts /></Suspense>} />
                      <Route path="/editorial-guidelines" element={<Suspense fallback={<RouteLoader />}><EditorialGuidelines /></Suspense>} />
                      <Route path="/affiliate-disclosure" element={<Suspense fallback={<RouteLoader />}><AffiliateDisclosure /></Suspense>} />
                      <Route path="/resources/dog-bed-size-chart" element={<Suspense fallback={<RouteLoader />}><DogBedSizeChart /></Suspense>} />
                      <Route path="/resources/indoor-cat-care" element={<Suspense fallback={<RouteLoader />}><IndoorCatCareResource /></Suspense>} />
                      
                      {/* Guide pages */}
                      <Route path="/pet-care-guides" element={<Suspense fallback={<RouteLoader />}><PetCareGuides /></Suspense>} />
                      <Route path="/guides" element={<Suspense fallback={<RouteLoader />}><GuidesIndex /></Suspense>} />
                      <Route path="/guides/cat-condo-vs-cat-tree-2026" element={<Suspense fallback={<RouteLoader />}><CatCondoVsCatTree2026 /></Suspense>} />
                      <Route path="/best-self-cleaning-litter-box-2026" element={<Suspense fallback={<RouteLoader />}><BestSelfCleaningLitterBox2026 /></Suspense>} />
                      <Route path="/indoor-cat-furniture" element={<Suspense fallback={<RouteLoader />}><IndoorCatFurnitureGuide /></Suspense>} />
                      <Route path="/guides/:slug" element={<Suspense fallback={<RouteLoader />}><GuidePage /></Suspense>} />
                      {/* Lockdown cluster articles — generic JSON-driven renderer */}
                      <Route path="/guides/cluster/:slug" element={<Suspense fallback={<RouteLoader />}><LockdownClusterArticle /></Suspense>} />
                      
                      {/* ═══ DOG & CAT HUB PAGES ═══ */}
                      <Route path="/dog" element={<Suspense fallback={<RouteLoader />}><DogHub /></Suspense>} />
                      <Route path="/cat" element={<Suspense fallback={<RouteLoader />}><CatHub /></Suspense>} />
                      <Route path="/dog/training" element={<Suspense fallback={<RouteLoader />}><DogTraining /></Suspense>} />
                      <Route path="/dog/travel" element={<Suspense fallback={<RouteLoader />}><DogTravel /></Suspense>} />
                      <Route path="/cat/training" element={<Suspense fallback={<RouteLoader />}><CatTraining /></Suspense>} />
                      <Route path="/cat/travel" element={<Suspense fallback={<RouteLoader />}><CatTravel /></Suspense>} />
                      <Route path="/dog/best-dog-training-and-travel-gear-2026" element={<Suspense fallback={<RouteLoader />}><DogTrainingTravelPillar /></Suspense>} />
                      <Route path="/cat/best-cat-training-and-travel-gear-2026" element={<Suspense fallback={<RouteLoader />}><CatTrainingTravelPillar /></Suspense>} />
                      {/* ═══ NAMESPACED SEO CLUSTER ROUTES ═══ */}
                      {/* Dog pillars — dedicated components for existing pages */}
                      <Route path="/dog/orthopedic-dog-beds" element={<Suspense fallback={<RouteLoader />}><OrthopedicDogBeds /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/best-for-large-dogs" element={<Suspense fallback={<RouteLoader />}><OrthopedicLargeDogs /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/waterproof" element={<Suspense fallback={<RouteLoader />}><WaterproofOrthopedicBed /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/memory-foam" element={<Suspense fallback={<RouteLoader />}><MemoryFoamDogBeds /></Suspense>} />
                      {/* New orthopedic cluster articles — content-first authority */}
                      <Route path="/dog/orthopedic-dog-beds/memory-foam-under-100" element={<Suspense fallback={<RouteLoader />}><OrthopedicClusterArticle /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/signs-dog-needs-orthopedic-bed" element={<Suspense fallback={<RouteLoader />}><OrthopedicClusterArticle /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/memory-foam-vs-egg-crate" element={<Suspense fallback={<RouteLoader />}><OrthopedicClusterArticle /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/cooling" element={<Suspense fallback={<RouteLoader />}><OrthopedicClusterArticle /></Suspense>} />
                      <Route path="/dog/orthopedic-dog-beds/for-senior-dogs" element={<Suspense fallback={<RouteLoader />}><OrthopedicClusterArticle /></Suspense>} />
                      {/* Legacy orthopedic intents */}
                      <Route path="/dog/orthopedic-dog-beds/washable-covers" element={<Suspense fallback={<RouteLoader />}><DogIntentPage /></Suspense>} />
                      {/* Dog car travel safety — dedicated + new intents */}
                      <Route path="/dog/dog-car-travel-safety" element={<Suspense fallback={<RouteLoader />}><DogCarTravelSafety /></Suspense>} />
                      {/* Dog training & behavior — hub + cluster articles */}
                      <Route path="/dog/dog-training-behavior-tools" element={<Suspense fallback={<RouteLoader />}><DogTrainingBehaviorTools /></Suspense>} />
                      <Route path="/dog/dog-training/front-clip-vs-back-clip-harness" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/best-harness-large-dogs" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/how-to-stop-pulling-without-choking" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/harness-sizing-guide" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/harness-vs-collar" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/15ft-vs-30ft-training-leash" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/how-to-train-recall" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/common-recall-mistakes" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/off-leash-training-safely" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      {/* Keyword hijack articles */}
                      <Route path="/dog/dog-training/anti-pull-harness-big-dogs" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/no-pull-harness-vs-head-halter" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/no-pull-harness-small-dogs" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/puppy-training-leash-guide" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-training/stop-pulling-on-leash" element={<Suspense fallback={<RouteLoader />}><TrainingClusterArticle /></Suspense>} />
                      <Route path="/dog/dog-car-travel-safety/car-seats" element={<Suspense fallback={<RouteLoader />}><DogCarSeatSmallDogs /></Suspense>} />
                      <Route path="/dog/dog-car-travel-safety/booster-seats" element={<Suspense fallback={<RouteLoader />}><DogBoosterSeat /></Suspense>} />
                      <Route path="/dog/dog-car-travel-safety/harness-safety" element={<Suspense fallback={<RouteLoader />}><DogCarHarness /></Suspense>} />
                      <Route path="/dog/dog-car-travel-safety/crash-tested-seat-belts" element={<Suspense fallback={<RouteLoader />}><DogIntentPage /></Suspense>} />
                      <Route path="/dog/dog-car-travel-safety/back-seat-hammocks" element={<Suspense fallback={<RouteLoader />}><DogIntentPage /></Suspense>} />
                      <Route path="/dog/dog-car-travel-safety/anxious-dog-road-trips" element={<Suspense fallback={<RouteLoader />}><DogIntentPage /></Suspense>} />
                      {/* Cat pillars — dedicated + new intents */}
                      <Route path="/cat/cat-trees-for-large-cats" element={<Suspense fallback={<RouteLoader />}><CatTreesForLargeCats /></Suspense>} />
                      <Route path="/cat/cat-trees-for-large-cats/for-maine-coon" element={<Suspense fallback={<RouteLoader />}><CatTreeMaineCoon /></Suspense>} />
                      <Route path="/cat/cat-trees-for-large-cats/heavy-duty" element={<Suspense fallback={<RouteLoader />}><HeavyDutyCatTree /></Suspense>} />
                      <Route path="/cat/cat-trees-for-large-cats/large-cat-condos" element={<Suspense fallback={<RouteLoader />}><LargeCatCondo /></Suspense>} />
                      <Route path="/cat/cat-trees-for-large-cats/for-multiple-cats" element={<Suspense fallback={<RouteLoader />}><CatIntentPage /></Suspense>} />
                      <Route path="/cat/cat-trees-for-large-cats/tall-vs-wide" element={<Suspense fallback={<RouteLoader />}><CatIntentPage /></Suspense>} />
                      <Route path="/cat/cat-trees-for-large-cats/apartments-small-spaces" element={<Suspense fallback={<RouteLoader />}><CatIntentPage /></Suspense>} />
                      {/* Generic namespace catch-all for future pillars/intents — validates via allowlist */}
                      <Route path="/dog/:pillarSlug" element={<Suspense fallback={<RouteLoader />}><DogPillarPage /></Suspense>} />
                      <Route path="/dog/:pillarSlug/:intentSlug" element={<Suspense fallback={<RouteLoader />}><DogIntentPage /></Suspense>} />
                      <Route path="/cat/:pillarSlug" element={<Suspense fallback={<RouteLoader />}><CatPillarPage /></Suspense>} />
                      <Route path="/cat/:pillarSlug/:intentSlug" element={<Suspense fallback={<RouteLoader />}><CatIntentPage /></Suspense>} />
                      {/* ═══ LEGACY CLUSTER REDIRECTS (301-equivalent) ═══ */}
                      <Route path="/orthopedic-dog-beds" element={<Navigate to="/dog/orthopedic-dog-beds" replace />} />
                      <Route path="/cat-trees-for-large-cats" element={<Navigate to="/cat/cat-trees-for-large-cats" replace />} />
                      <Route path="/dog-car-travel-safety" element={<Navigate to="/dog/dog-car-travel-safety" replace />} />
                      <Route path="/collections/orthopedic-dog-beds" element={<Navigate to="/dog/orthopedic-dog-beds" replace />} />
                      <Route path="/collections/cat-trees-for-large-cats" element={<Navigate to="/cat/cat-trees-for-large-cats" replace />} />
                      <Route path="/collections/dog-car-travel-safety" element={<Navigate to="/dog/dog-car-travel-safety" replace />} />
                      <Route path="/collections/best-orthopedic-dog-bed-large-dogs" element={<Navigate to="/dog/orthopedic-dog-beds/best-for-large-dogs" replace />} />
                      <Route path="/collections/waterproof-orthopedic-dog-bed" element={<Navigate to="/dog/orthopedic-dog-beds/waterproof" replace />} />
                      <Route path="/collections/memory-foam-dog-beds" element={<Navigate to="/dog/orthopedic-dog-beds/memory-foam" replace />} />
                      <Route path="/collections/cat-tree-for-maine-coon" element={<Navigate to="/cat/cat-trees-for-large-cats/for-maine-coon" replace />} />
                      <Route path="/collections/heavy-duty-cat-tree" element={<Navigate to="/cat/cat-trees-for-large-cats/heavy-duty" replace />} />
                      <Route path="/collections/cat-condos-for-large-cats" element={<Navigate to="/cat/cat-trees-for-large-cats/large-cat-condos" replace />} />
                      <Route path="/collections/dog-car-seats" element={<Navigate to="/dog/dog-car-travel-safety/car-seats" replace />} />
                      <Route path="/collections/dog-booster-seat" element={<Navigate to="/dog/dog-car-travel-safety/booster-seats" replace />} />
                      <Route path="/collections/dog-car-harness" element={<Navigate to="/dog/dog-car-travel-safety/harness-safety" replace />} />

                      {/* SEO Collection pages — /collections/:slug */}
                      <Route path="/collections/:slug" element={<Suspense fallback={<RouteLoader />}><SeoCollection /></Suspense>} />
                      
                      {/* Legacy /collection/:slug → redirect to /collections/:slug */}
                      <Route path="/collection/:slug" element={<CollectionRedirect />} />
                      
                      {/* Growth verification diagnostics */}
                      <Route path="/__ops/growth-verification" element={<Suspense fallback={<RouteLoader />}><GrowthVerification /></Suspense>} />
                      
                      {/* Performance debug guide — hidden, no-index */}
                      <Route path="/debug/perf" element={<Suspense fallback={<RouteLoader />}><PerfDebugPage /></Suspense>} />
                      
                      {/* Merchant Center fix checklist — admin only, noindex */}
                      <Route path="/merchant-fix-checklist" element={<Suspense fallback={<RouteLoader />}><MerchantFixChecklist /></Suspense>} />
                      
                      {/* Diagnostics pages — hidden, noindex */}
                      <Route path="/diagnostics/headers" element={<Suspense fallback={<RouteLoader />}><HeadersDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/performance" element={<Suspense fallback={<RouteLoader />}><PerformanceDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/gsc" element={<Suspense fallback={<RouteLoader />}><GscChecklist /></Suspense>} />
                      <Route path="/diagnostics/seo-hosts" element={<Suspense fallback={<RouteLoader />}><SeoHostDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/sitemap-health" element={<Suspense fallback={<RouteLoader />}><SitemapHealthDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/crawl-budget" element={<Suspense fallback={<RouteLoader />}><CrawlBudgetDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/index-control" element={<Suspense fallback={<RouteLoader />}><IndexControlDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/link-equity" element={<Suspense fallback={<RouteLoader />}><LinkEquityDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/serp-war" element={<Suspense fallback={<RouteLoader />}><SerpWarDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/top3-boost" element={<Suspense fallback={<RouteLoader />}><Top3BoostDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/top3-lockdown" element={<Suspense fallback={<RouteLoader />}><Top3LockdownDiagnostics /></Suspense>} />
                      <Route path="/diagnostics/revenue-war-machine" element={<Suspense fallback={<RouteLoader />}><RevenueWarMachine /></Suspense>} />
                      <Route path="/diagnostics/niche-monopoly" element={<Suspense fallback={<RouteLoader />}><NicheMonopoly /></Suspense>} />
                      <Route path="/diagnostics/auto-expansion" element={<Suspense fallback={<RouteLoader />}><AutoExpansion /></Suspense>} />
                      <Route path="/diagnostics/market-takeover" element={<Suspense fallback={<RouteLoader />}><MarketTakeover /></Suspense>} />
                      
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
                      <Route path="/shop" element={<Suspense fallback={<RouteLoader />}><ShopHub /></Suspense>} />
                      <Route path="/recent-products" element={<Suspense fallback={<RouteLoader />}><RecentProducts /></Suspense>} />
                      <Route path="/trending-pet-products" element={<Suspense fallback={<RouteLoader />}><TrendingProducts /></Suspense>} />
                      {/* Admin sub-routes */}
                      {/* Admin nested routes with layout + sidebar */}
                      <Route path="/admin" element={<Suspense fallback={<RouteLoader />}><LazyAdminShell /></Suspense>}>
                        <Route index element={<Suspense fallback={<RouteLoader />}><AdminDashboardOverview /></Suspense>} />
                        <Route path="diagnostics" element={<Suspense fallback={<RouteLoader />}><DiagnosticsPage /></Suspense>} />
                        <Route path="seo-command-center" element={<Suspense fallback={<RouteLoader />}><SeoCommandCenterPage /></Suspense>} />
                        <Route path="revenue-scaling" element={<Suspense fallback={<RouteLoader />}><RevenueScalingPage /></Suspense>} />
                        <Route path="cro-dashboard" element={<Suspense fallback={<RouteLoader />}><CRODashboardPage /></Suspense>} />
                        <Route path="autonomous-seo" element={<Suspense fallback={<RouteLoader />}><AutonomousSeoPage /></Suspense>} />
                        <Route path="seo-war-room" element={<Suspense fallback={<RouteLoader />}><SeoWarRoomPage /></Suspense>} />
                        <Route path="competitive-intelligence" element={<Suspense fallback={<RouteLoader />}><CompetitiveIntelligencePage /></Suspense>} />
                        <Route path="authority-engine" element={<Suspense fallback={<RouteLoader />}><AuthorityEnginePage /></Suspense>} />
                        <Route path="internal-link-log" element={<Suspense fallback={<RouteLoader />}><InternalLinkLog /></Suspense>} />
                        <Route path="seo-dashboard" element={<Suspense fallback={<RouteLoader />}><AdminSeoDashboard /></Suspense>} />
                        <Route path="crawl-diagnostics" element={<Suspense fallback={<RouteLoader />}><CrawlDiagnosticsDashboard /></Suspense>} />
                        <Route path="crawl-health" element={<Suspense fallback={<RouteLoader />}><CrawlHealthDashboard /></Suspense>} />
                        <Route path="snippet-monitor" element={<Suspense fallback={<RouteLoader />}><SnippetMonitor /></Suspense>} />
                        <Route path="cluster-war" element={<Suspense fallback={<RouteLoader />}><ClusterWarDashboard /></Suspense>} />
                        <Route path="dog-beds-cluster" element={<Suspense fallback={<RouteLoader />}><DogBedsClusterDashboard /></Suspense>} />
                        <Route path="cat-litter-cluster" element={<Suspense fallback={<RouteLoader />}><CatLitterClusterDashboard /></Suspense>} />
                        <Route path="analytics-hub" element={<Suspense fallback={<RouteLoader />}><AnalyticsHub /></Suspense>} />
                        <Route path="guides" element={<Suspense fallback={<RouteLoader />}><GuidesDashboard /></Suspense>} />
                        <Route path="guide-generator" element={<Suspense fallback={<RouteLoader />}><GuideGeneratorPage /></Suspense>} />
                        <Route path="comparison-generator" element={<Suspense fallback={<RouteLoader />}><ComparisonGeneratorPage /></Suspense>} />
                        <Route path="seo-intelligence" element={<Suspense fallback={<RouteLoader />}><SeoIntelligencePage /></Suspense>} />
                        <Route path="seo-monitor" element={<Suspense fallback={<RouteLoader />}><SeoMonitorPage /></Suspense>} />
                        <Route path="feed-gap-report" element={<Suspense fallback={<RouteLoader />}><FeedGapReportPage /></Suspense>} />
                        <Route path="feed-insights" element={<Suspense fallback={<RouteLoader />}><FeedInsightsPage /></Suspense>} />
                        <Route path="redirect-check" element={<Suspense fallback={<RouteLoader />}><RedirectCheckPage /></Suspense>} />
                        <Route path="security-credentials" element={<Suspense fallback={<RouteLoader />}><SecurityCredentialsDashboard /></Suspense>} />
                        <Route path="scaling-engine" element={<Suspense fallback={<RouteLoader />}><ScalingEnginePage /></Suspense>} />
                        <Route path="content-opportunities" element={<Suspense fallback={<RouteLoader />}><ContentOpportunitiesPage /></Suspense>} />
                        <Route path="momentum" element={<Suspense fallback={<RouteLoader />}><MomentumAccelerationDashboard /></Suspense>} />
                        <Route path="bundles" element={<Suspense fallback={<RouteLoader />}><BundlesPage /></Suspense>} />
                        <Route path="cluster-dominance" element={<Suspense fallback={<RouteLoader />}><ClusterDominance /></Suspense>} />
                        <Route path="analytics-traffic" element={<Suspense fallback={<RouteLoader />}><AnalyticsTrafficDocs /></Suspense>} />
                        <Route path="reports" element={<Suspense fallback={<RouteLoader />}><AdminReportsPage /></Suspense>} />
                        <Route path="growth-execution" element={<Suspense fallback={<RouteLoader />}><GrowthExecutionPage /></Suspense>} />
                        <Route path="growth-intelligence" element={<Suspense fallback={<RouteLoader />}><GrowthIntelligencePage /></Suspense>} />
                        <Route path="backlink-engine" element={<Suspense fallback={<RouteLoader />}><BacklinkEnginePage /></Suspense>} />
                        <Route path="resources" element={<Suspense fallback={<RouteLoader />}><AdminResourcesPage /></Suspense>} />
                        <Route path="indexing-diagnostics" element={<Suspense fallback={<RouteLoader />}><IndexingDiagnosticsPage /></Suspense>} />
                        <Route path="perf-audit" element={<Suspense fallback={<RouteLoader />}><PerfAuditPage /></Suspense>} />
                        <Route path="edge-diagnostics" element={<Suspense fallback={<RouteLoader />}><EdgeDiagnosticsPage /></Suspense>} />
                        <Route path="sitemap-ping" element={<Suspense fallback={<RouteLoader />}><SitemapPingPage /></Suspense>} />
                        <Route path="domain-health" element={<Suspense fallback={<RouteLoader />}><DomainHealthPage /></Suspense>} />
                        <Route path="gsc-4xx" element={<Suspense fallback={<RouteLoader />}><Gsc4xxTriagePage /></Suspense>} />
                        <Route path="structured-data" element={<Suspense fallback={<RouteLoader />}><StructuredDataPage /></Suspense>} />
                        <Route path="seo-structured-data" element={<Suspense fallback={<RouteLoader />}><StructuredDataPage /></Suspense>} />
                        <Route path="perf" element={<Suspense fallback={<RouteLoader />}><PerfAuditPage /></Suspense>} />
                        <Route path="seo-agent" element={<Suspense fallback={<RouteLoader />}><SeoAgentControlCenter /></Suspense>} />
                        <Route path="commerce-intelligence" element={<Suspense fallback={<RouteLoader />}><CommerceIntelligencePage /></Suspense>} />
                        <Route path="cluster-revenue-engine" element={<Suspense fallback={<RouteLoader />}><ClusterRevenueEngine /></Suspense>} />
                        <Route path="cat-condo-growth" element={<Suspense fallback={<RouteLoader />}><CatCondoGrowthDashboard /></Suspense>} />
                        <Route path="seo-agent-auto" element={<Suspense fallback={<RouteLoader />}><SeoAgentAutonomous /></Suspense>} />
                        <Route path="seo-acceleration" element={<Suspense fallback={<RouteLoader />}><SeoAccelerationPage /></Suspense>} />
                        <Route path="progress" element={<Suspense fallback={<RouteLoader />}><ProgressDashboard /></Suspense>} />
                        <Route path="seo-engine" element={<Suspense fallback={<RouteLoader />}><AutonomousSeoEnginePage /></Suspense>} />
                        <Route path="seo-console" element={<Suspense fallback={<RouteLoader />}><SeoConsolePage /></Suspense>} />
                        <Route path="integrations/merchant" element={<Suspense fallback={<RouteLoader />}><MerchantIntegrationPage /></Suspense>} />
                        <Route path="integrations/merchant/settings" element={<Suspense fallback={<RouteLoader />}><MerchantSettingsPage /></Suspense>} />
                        <Route path="integrations/merchant/readiness" element={<Suspense fallback={<RouteLoader />}><MerchantReadinessPage /></Suspense>} />
                        <Route path="integrations/merchant/health" element={<Suspense fallback={<RouteLoader />}><MerchantHealthPage /></Suspense>} />
                        <Route path="shopping-optimizer" element={<Suspense fallback={<RouteLoader />}><ShoppingOptimizerPage /></Suspense>} />
                      </Route>
                      
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
    {WebVitalsPanel && (
      <Suspense fallback={null}><WebVitalsPanel /></Suspense>
    )}
    </AppErrorBoundary>
  );
};

export default App;
