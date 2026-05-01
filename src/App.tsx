import { lazy, Suspense, Component, ReactNode, useState, useEffect } from "react";
// ⚡ Toaster/Sonner deferred — not needed for first paint
const Toaster = lazy(() => import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })));
// ⚡ TooltipProvider lazy-loaded — Radix tooltip is never needed for first paint
const TooltipProvider = lazy(() => import("@/components/ui/tooltip").then((m) => ({ default: m.TooltipProvider })));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams, useLocation } from "react-router-dom";

import { resolveUtm, appendUtmToPath } from "@/lib/utmNormalizer";
import { logUtmCheckpoint } from "@/lib/utmDebugLog";

// Redirect /lp/:slug → /products/:slug (preserves UTM params from Pinterest pins)
const LpRedirect = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  // Resolve through the central normalizer so session-cached UTMs survive
  // even if the inbound /lp link was stripped of its query string.
  const utm = resolveUtm({ search: searchParams });
  const to = appendUtmToPath(`/products/${slug}`, utm, `?${searchParams.toString()}`);
  logUtmCheckpoint('redirect', { from: 'lp', to });
  return <Navigate to={to} replace />;
};
import { CartProvider } from "@/contexts/CartContext";
import { CartAnimationProvider } from "@/contexts/CartAnimationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { HostnameGuard } from "@/components/seo/HostnameGuard";
import { RobotsMetaPolicy } from "@/components/seo/RobotsMetaPolicy";
// Marketing/tracking components — lazy-loaded, not needed for first paint
// LiveCheckoutWidget removed from global render — admin-only, was causing bundle leakage
const SafePinterestTag = lazy(() =>
  import("@/components/tracking/SafePinterestTag").then((m) => ({ default: m.SafePinterestTag })),
);
const SafeGlobalVisitorTracker = lazy(() =>
  import("@/components/tracking/SafeGlobalVisitorTracker").then((m) => ({ default: m.SafeGlobalVisitorTracker })),
);
// RecentPurchaseNotification removed — fake geo-based purchase popups risk Google misrepresentation flags
const InternalTrafficChip = lazy(() =>
  import("@/components/tracking/InternalTrafficChip").then((m) => ({ default: m.InternalTrafficChip })),
);
import { MarketingErrorBoundary } from "@/components/error/MarketingErrorBoundary";
// Admin guard + layout: lazy-loaded to keep admin code out of storefront bundle
const LazyAdminShell = lazy(() =>
  Promise.all([import("@/components/auth/AdminRouteGuard"), import("@/components/admin/AdminLayout")]).then(
    ([guardMod, layoutMod]) => ({
      default: () => (
        <guardMod.AdminRouteGuard>
          <layoutMod.AdminLayout />
        </guardMod.AdminRouteGuard>
      ),
    }),
  ),
);
// ⚡ Loader2, AlertCircle, Button: only used in error/loading fallbacks — NOT on critical path
// Moved to inline HTML to eliminate ~20KB (Radix Slot + Lucide icons) from main chunk parse
// Defer non-critical initializers — don't block first paint
const setupGlobalErrorHandler = () => import("@/lib/error-reporter").then((m) => m.setupGlobalErrorHandler());
const initDataHealer = () => import("@/lib/data-healer").then((m) => m.initDataHealer());
const initLegacyLinkGuard = () => import("@/lib/legacy-link-guard").then((m) => m.initLegacyLinkGuard());
const initLegacyFetchGuard = () => import("@/lib/legacy-link-guard").then((m) => m.initLegacyFetchGuard());
import { AppErrorBoundary } from "@/components/error/AppErrorBoundary";

// Web Vitals panel — lazy, dev/preview only, tree-shaken in prod
const WebVitalsPanel =
  !import.meta.env.PROD && import.meta.env.VITE_VITALS_PANEL !== "false"
    ? lazy(() => import("@/components/dev/WebVitalsPanel"))
    : null;

// Production-safe initialization — deferred to not block first paint
if (typeof window !== "undefined") {
  requestAnimationFrame(() => {
    setupGlobalErrorHandler().catch(() => {});
    initDataHealer().catch(() => {});
    initLegacyLinkGuard().catch(() => {});
    initLegacyFetchGuard().catch(() => {});
    import("@/lib/founder-mode").then((m) => m.consumeFounderKeyFromUrl()).catch(() => {});
    import("@/lib/traffic").then((m) => m.consumeInternalParamFromUrl()).catch(() => {});
    import("@/lib/analytics").then((m) => m.initAnalyticsUserProperties()).catch(() => {});
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
    const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    console.error("[RouteErrorBoundary] Caught error:", {
      message: error.message,
      name: error.name,
      route,
      stack: error.stack?.substring(0, 500),
    });
    console.error("[RouteErrorBoundary] Component stack:", errorInfo.componentStack?.substring(0, 800));
    import("@/lib/error-reporter").then(({ reportError, isReact310Error, reportReact310Error }) => {
      if (isReact310Error(error)) {
        reportReact310Error(error, "RouteErrorBoundary", {
          componentStack: errorInfo.componentStack?.substring(0, 1000),
          route,
        });
      } else {
        reportError(error, "RouteErrorBoundary", {
          componentStack: errorInfo.componentStack?.substring(0, 1000),
          route,
        });
      }
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: "60vh", padding: "2rem",
            textAlign: "center", fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#666", marginBottom: "1rem", maxWidth: "24rem", fontSize: "0.875rem" }}>
            This usually resolves with a quick refresh.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => { sessionStorage.clear(); window.location.reload(); }}
              style={{
                padding: "8px 20px", background: "#111", color: "#fff",
                border: "none", borderRadius: "6px", cursor: "pointer",
                fontSize: "13px", fontWeight: 500,
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = "/"; }}
              style={{
                padding: "8px 20px", border: "1px solid #d1d5db", background: "#fff",
                color: "#333", borderRadius: "6px", cursor: "pointer",
                fontSize: "13px", fontWeight: 500,
              }}
            >
              Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Fallback component shown when chunk loading fails even after reload */
const ChunkLoadError = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      padding: "2rem",
      textAlign: "center",
      fontFamily: "system-ui, sans-serif",
    }}
  >
    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Page failed to load</h2>
    <p style={{ color: "#666", marginBottom: "1rem", maxWidth: "24rem" }}>
      This usually resolves with a fresh reload. If it persists, clear your browser cache.
    </p>
    <button
      onClick={() => {
        sessionStorage.clear();
        window.location.replace(window.location.pathname);
      }}
      style={{
        padding: "0.5rem 1.5rem",
        background: "#111",
        color: "#fff",
        border: "none",
        borderRadius: "0.375rem",
        cursor: "pointer",
        fontSize: "0.875rem",
      }}
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
      console.error("[LazyLoad] Import failed, attempting recovery:", error);

      // Chunk load failure = likely stale SW cache after deployment
      // Unregister SW, clear caches, and force reload ONCE
      const reloadKey = "chunk-reload-" + window.location.pathname;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((r) => r.unregister()));
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch (swErr) {
          console.error("[LazyLoad] SW cleanup failed:", swErr);
        }
        window.location.href = window.location.pathname + "?cb=" + Date.now();
        return new Promise(() => {});
      }

      // Second failure after reload — show recovery UI instead of blank screen
      console.error("[LazyLoad] Chunk still unavailable after reload, showing recovery UI");
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
const LinkInBio = lazyWithRetry(() => import("./pages/LinkInBio"));
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
const HtmlSitemap = lazyWithRetry(() => import("./pages/HtmlSitemap"));

/** Redirect legacy /collection/:slug to /collections/:slug with 301-equivalent */
function CollectionRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/collections/${slug || ""}`} replace />;
}

/**
 * Redirect legacy /product/:slug (singular) to canonical /products/:slug (plural).
 * CRITICAL: must preserve `?search` (UTMs) and `#hash` so TikTok ad
 * attribution (utm_campaign=hookN) survives the redirect — otherwise the
 * PDP loads with no UTMs and the TikTok Ads Performance dashboard
 * undercounts every hook to 0 PDP visits.
 *
 * Plural is canonical per the project URL standard. Eliminating the redirect
 * hop on the canonical TikTok deep-link path (/products/:slug) shaves ~150ms
 * off cold mobile loads and prevents analytics splitting between the two
 * surfaces.
 */
function ProductRouteRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  // Re-resolve UTMs through the central normalizer so attribution survives
  // even if a deep-link client stripped query params on the way in.
  const utm = resolveUtm({ search: location.search });
  logUtmCheckpoint('redirect', { from: '/product', slug });
  return (
    <Navigate
      to={appendUtmToPath(`/products/${slug || ""}`, utm, location.search, location.hash)}
      replace
    />
  );
}

/** Redirect /bestseller/:slug to canonical /product/:slug, preserving query/hash. */
function BestsellerSlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const utm = resolveUtm({ search: location.search });
  logUtmCheckpoint('redirect', { from: '/bestseller', slug });
  return (
    <Navigate
      to={appendUtmToPath(`/products/${slug || ""}`, utm, location.search, location.hash)}
      replace
    />
  );
}

// Admin sub-pages (all lazy-loaded, admin-only)
const DiagnosticsPage = lazyWithRetry(() => import("./pages/admin/DiagnosticsPage"));
const TikTokConfigPage = lazyWithRetry(() => import("./pages/admin/TikTokConfigPage"));
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
const JobsQueuePage = lazyWithRetry(() => import("./pages/admin/JobsQueuePage"));
const EdgeFunctionsHealthPage = lazyWithRetry(() => import("./pages/admin/EdgeFunctionsHealthPage"));
const AdminSeoDashboard = lazyWithRetry(() => import("./pages/admin/AdminSeoDashboard"));
const CrawlDiagnosticsDashboard = lazyWithRetry(() => import("./pages/admin/CrawlDiagnosticsDashboard"));
const CrawlHealthDashboard = lazyWithRetry(() => import("./pages/admin/CrawlHealthDashboard"));
const SnippetMonitor = lazyWithRetry(() => import("./pages/admin/SnippetMonitor"));
const ClusterWarDashboard = lazyWithRetry(() => import("./pages/admin/ClusterWarDashboard"));
const DogBedsClusterDashboard = lazyWithRetry(() => import("./pages/admin/DogBedsClusterDashboard"));
const CatLitterClusterDashboard = lazyWithRetry(() => import("./pages/admin/CatLitterClusterDashboard"));
const AnalyticsHub = lazyWithRetry(() => import("./pages/admin/AnalyticsHub"));
const HeroCtaAnalyticsPage = lazyWithRetry(() => import("./pages/admin/HeroCtaAnalyticsPage"));
const CtaCopyPerformancePage = lazyWithRetry(() => import("./pages/admin/CtaCopyPerformancePage"));
const StockRefreshMonitorPage = lazyWithRetry(() => import("./pages/admin/StockRefreshMonitorPage"));
const GuidesDashboard = lazyWithRetry(() => import("./pages/admin/GuidesDashboard"));
const GuideGeneratorPage = lazyWithRetry(() => import("./pages/admin/GuideGeneratorPage"));
const ComparisonGeneratorPage = lazyWithRetry(() => import("./pages/admin/ComparisonGeneratorPage"));
const BacklinkGrowthPage = lazyWithRetry(() => import("./pages/admin/BacklinkGrowthPage"));
const InternalLinkAuthorityPage = lazyWithRetry(() => import("./pages/admin/InternalLinkAuthorityPage"));
const ProductSeoPage = lazyWithRetry(() => import("./pages/admin/ProductSeoPage"));
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
const WinnersBoostDashboard = lazyWithRetry(() => import("./pages/admin/WinnersBoostDashboard"));
const ProfitSystemDashboard = lazyWithRetry(() => import("./pages/admin/ProfitSystemDashboard"));
const ClusterDominance = lazyWithRetry(() => import("./pages/admin/ClusterDominance"));
const AnalyticsTrafficDocs = lazyWithRetry(() => import("./pages/admin/AnalyticsTrafficDocs"));
const AdminReportsPage = lazyWithRetry(() => import("./pages/admin/AdminReportsPage"));
const GrowthExecutionPage = lazyWithRetry(() => import("./pages/admin/GrowthExecutionPage"));
const GrowthIntelligencePage = lazyWithRetry(() => import("./pages/admin/GrowthIntelligencePage"));
const BacklinkEnginePage = lazyWithRetry(() => import("./pages/admin/BacklinkEnginePage"));
const AdminResourcesPage = lazyWithRetry(() => import("./pages/admin/AdminResourcesPage"));
const IndexingDiagnosticsPage = lazyWithRetry(() => import("./pages/admin/IndexingDiagnosticsPage"));
const BotRenderSeoDashboard = lazyWithRetry(() => import("./pages/admin/BotRenderSeoDashboard"));
const RenderTraceDashboard = lazyWithRetry(() => import("./pages/admin/RenderTraceDashboard"));
const RenderTraceSlugDetail = lazyWithRetry(() => import("./pages/admin/RenderTraceSlugDetail"));
const CrawlerSampleRatePage = lazyWithRetry(() => import("./pages/admin/CrawlerSampleRatePage"));
const CrawlerSamplingDecisionsPage = lazyWithRetry(() => import("./pages/admin/CrawlerSamplingDecisionsPage"));
const CatCondoGrowthDashboard = lazyWithRetry(() => import("./pages/admin/CatCondoGrowthDashboard"));
const SeoAgentAutonomous = lazyWithRetry(() => import("./pages/admin/SeoAgentAutonomous"));
const PerfAuditPage = lazyWithRetry(() => import("./pages/admin/PerfAuditPage"));
const PerfDebugPage = lazyWithRetry(() => import("./pages/admin/PerfDebugPage"));
const EdgeDiagnosticsPage = lazyWithRetry(() => import("./pages/admin/EdgeDiagnosticsPage"));
const SeoConsolePage = lazyWithRetry(() => import("./pages/admin/SeoConsole"));
const SitemapPingPage = lazyWithRetry(() => import("./pages/admin/SitemapPingPage"));
const GscUrlInspectionHelper = lazyWithRetry(() => import("./pages/admin/GscUrlInspectionHelper"));
const MerchantFixChecklist = lazyWithRetry(() => import("./pages/MerchantFixChecklist"));
const MerchantIntegrationPage = lazyWithRetry(() => import("./pages/admin/MerchantIntegrationPage"));
const MerchantReviewChecklistPage = lazyWithRetry(() => import("./pages/admin/MerchantReviewChecklistPage"));
const MerchantSettingsPage = lazyWithRetry(() => import("./pages/admin/MerchantSettingsPage"));
const JobRetryPoliciesPage = lazyWithRetry(() => import("./pages/admin/JobRetryPoliciesPage"));
const JobRetryMetricsPage = lazyWithRetry(() => import("./pages/admin/JobRetryMetricsPage"));
const ApplePayDomainPage = lazyWithRetry(() => import("./pages/admin/ApplePayDomainPage"));
const MerchantReadinessPage = lazyWithRetry(() => import("./pages/admin/MerchantReadinessPage"));
const MerchantHealthPage = lazyWithRetry(() => import("./pages/admin/MerchantHealthPage"));
const PageChangelogManager = lazyWithRetry(() => import("./pages/admin/PageChangelogManager"));
const MerchantOAuthCallback = lazyWithRetry(() => import("./pages/MerchantOAuthCallback"));
const TikTokOAuthCallback = lazyWithRetry(() => import("./pages/TikTokOAuthCallback"));
const ShoppingOptimizerPage = lazyWithRetry(() => import("./pages/admin/ShoppingOptimizerPage"));
const ProductOptimizerPage = lazyWithRetry(() => import("./pages/admin/ProductOptimizerPage"));
const ImageCompliancePage = lazyWithRetry(() => import("./pages/admin/ImageCompliancePage"));
const CornerstoneEnginePage = lazyWithRetry(() => import("./pages/admin/CornerstoneEnginePage"));
const WinningProductFinder = lazyWithRetry(() => import("./pages/admin/WinningProductFinder"));
const MerchantComplianceReport = lazyWithRetry(() => import("./pages/admin/MerchantComplianceReport"));
const MerchantSafePage = lazyWithRetry(() => import("./pages/admin/MerchantSafePage"));
const PinterestTrafficMachinePage = lazyWithRetry(() => import("./pages/admin/PinterestTrafficMachinePage"));
const PinterestScaleModePage = lazyWithRetry(() => import("./pages/admin/PinterestScaleModePage"));
const PinterestAutomationPage = lazyWithRetry(() => import("./pages/admin/PinterestAutomationPage"));
const TikTokAutomationPage = lazyWithRetry(() => import("./pages/admin/TikTokAutomationPage"));
const TikTokAdsPerformancePage = lazyWithRetry(() => import("./pages/admin/TikTokAdsPerformancePage"));
const TikTokFunnelDebugPage = lazyWithRetry(() => import("./pages/admin/TikTokFunnelDebugPage"));
const TikTokRealtimeFunnelPage = lazyWithRetry(() => import("./pages/admin/TikTokRealtimeFunnelPage"));
const UtmValidationLogPage = lazyWithRetry(() => import("./pages/admin/UtmValidationLogPage"));
const TrackingAnomaliesPage = lazyWithRetry(() => import("./pages/admin/TrackingAnomaliesPage"));
const TikTokExcludedSessionsPage = lazyWithRetry(() => import("./pages/admin/TikTokExcludedSessionsPage"));
const TikTokFunnelReportPage = lazyWithRetry(() => import("./pages/admin/TikTokFunnelReportPage"));
const TikTokCtaCtrPage = lazyWithRetry(() => import("./pages/admin/TikTokCtaCtrPage"));
const PlacementOverviewPage = lazyWithRetry(() => import("./pages/admin/PlacementOverviewPage"));
const TikTokSessionDecisionLogPage = lazyWithRetry(() => import("./pages/admin/TikTokSessionDecisionLogPage"));
const TikTokConfigChecklistPage = lazyWithRetry(() => import("./pages/admin/TikTokConfigChecklistPage"));
const TikTokTestUsersPage = lazyWithRetry(() => import("./pages/admin/TikTokTestUsersPage"));
const TikTokStatusPage = lazyWithRetry(() => import("./pages/admin/TikTokStatusPage"));
const DeepLinkInspectorPage = lazyWithRetry(() => import("./pages/admin/DeepLinkInspectorPage"));
const ShopHub = lazyWithRetry(() => import("./pages/ShopHub"));
const RecentProducts = lazyWithRetry(() => import("./pages/RecentProducts"));
const TrendingProducts = lazyWithRetry(() => import("./pages/TrendingProducts"));

// SEO Traffic Machine pages
const BestCatLitterBox2026 = lazyWithRetry(() => import("./pages/seo/BestCatLitterBox2026"));
const BestDogCarSeatSafety = lazyWithRetry(() => import("./pages/seo/BestDogCarSeatSafety"));
const BestInteractiveCatToys = lazyWithRetry(() => import("./pages/seo/BestInteractiveCatToys"));
const BestDogAnxietySolutions = lazyWithRetry(() => import("./pages/seo/BestDogAnxietySolutions"));
// SEO Cluster sub-pages
const BestCatLitterBoxReddit = lazyWithRetry(() => import("./pages/seo/BestCatLitterBoxReddit"));
const BestLitterBoxForSmell = lazyWithRetry(() => import("./pages/seo/BestLitterBoxForSmell"));
const BestLitterBoxLargeCats = lazyWithRetry(() => import("./pages/seo/BestLitterBoxLargeCats"));
const BestLitterBoxesApartments = lazyWithRetry(() => import("./pages/seo/BestLitterBoxesApartments"));

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
const PinterestLandingPage = lazyWithRetry(() => import("./pages/landing/PinterestLandingPage"));
const CatLitterBoxLanding = lazyWithRetry(() => import("./pages/landing/CatLitterBoxLanding"));
const SelfCleaningLitterBoxLanding = lazyWithRetry(() => import("./pages/landing/SelfCleaningLitterBoxLanding"));
const LitterBoxFunnel = lazyWithRetry(() => import("./pages/landing/LitterBoxFunnel"));

// Generic SEO pages — lazy-loaded wrapper components
const DogPillarPage = lazyWithRetry(() =>
  import("./pages/seo/SeoPageWrappers").then((m) => ({ default: m.DogPillarPage })),
);
const CatPillarPage = lazyWithRetry(() =>
  import("./pages/seo/SeoPageWrappers").then((m) => ({ default: m.CatPillarPage })),
);
const DogIntentPage = lazyWithRetry(() =>
  import("./pages/seo/SeoPageWrappers").then((m) => ({ default: m.DogIntentPage })),
);
const CatIntentPage = lazyWithRetry(() =>
  import("./pages/seo/SeoPageWrappers").then((m) => ({ default: m.CatIntentPage })),
);

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
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Reload
            </button>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium"
            >
              Go Home
            </button>
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
        <Suspense fallback={null}>
          <TooltipProvider>
            <AuthProvider>
              <CartProvider>
                <CartAnimationProvider>
                  <WishlistProvider>
                    {/* ⚡ Toaster/Sonner deferred — lazy-loaded, not needed for first paint */}
                    <Suspense fallback={null}>
                      <Toaster />
                    </Suspense>
                    <Suspense fallback={null}>
                      <Sonner />
                    </Suspense>
                    <BrowserRouter>
                      {/* LiveCheckoutWidget removed — admin-only widget, was leaking into storefront bundle */}
                      <ScrollToTop />
                      <HostnameGuard />
                      <RobotsMetaPolicy />
                      <MarketingErrorBoundary>
                        <Suspense fallback={null}>
                          <SafePinterestTag />
                          <SafeGlobalVisitorTracker />
                        </Suspense>
                      </MarketingErrorBoundary>
                      <Suspense fallback={null}>
                        <InternalTrafficChip />
                      </Suspense>
                      <RouteErrorBoundary>
                        <Routes>
                          <Route
                            path="/"
                            element={
                              <Suspense fallback={null}>
                                <Index />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/healthz"
                            element={
                              <Suspense fallback={null}>
                                <Healthz />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/compliance"
                            element={
                              <Suspense fallback={null}>
                                <ComplianceEvidence />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/products"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Products />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/products/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <ProductDetail />
                              </Suspense>
                            }
                          />
                          {/* Legacy singular path → 302 to canonical plural, preserving UTMs */}
                          <Route path="/product/:slug" element={<ProductRouteRedirect />} />
                          <Route
                            path="/cart"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Cart />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/checkout"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Checkout />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/payment-success"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PaymentSuccess />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/dashboard"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Admin />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/auth"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Auth />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/wishlist"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Wishlist />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/profile"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Profile />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/orders"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Orders />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/install"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Install />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/about"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <About />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/go"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <LinkInBio />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/privacy"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PrivacyPolicy />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/terms"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <TermsOfService />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/returns"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <ReturnPolicy />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/cookies"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <CookiePolicy />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/contact"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Contact />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/shipping"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Shipping />
                              </Suspense>
                            }
                          />
                          {/* Alternate policy URLs — redirect to canonical routes */}
                          <Route path="/shipping-policy" element={<Navigate to="/shipping" replace />} />
                          <Route path="/refund-policy" element={<Navigate to="/returns" replace />} />
                          <Route path="/returns-policy" element={<Navigate to="/returns" replace />} />
                          <Route path="/return-policy" element={<Navigate to="/returns" replace />} />
                          <Route path="/policies/returns" element={<Navigate to="/returns" replace />} />
                          <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
                          <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
                          <Route
                            path="/faq"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <FAQ />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/help"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <HelpCenter />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/api/merchant-oauth-callback"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <MerchantOAuthCallback />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/auth/tiktok/callback"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <TikTokOAuthCallback />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/track"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <TrackOrder />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/bestsellers"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Bestsellers />
                              </Suspense>
                            }
                          />
                          {/* /bestseller/:slug → redirect to /product/:slug for canonical URL consolidation */}
                          <Route
                            path="/bestseller/:slug"
                            element={<BestsellerSlugRedirect />}
                          />
                          <Route
                            path="/live-map"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <LiveMap />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/blog"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Blog />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/blog/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BlogPost />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/founder-mode"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <FounderMode />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/slow-feeder-dog-bowls"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <SlowFeederDogBowls />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/landing/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <TrainingLandingPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/pin/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PinterestLandingPage />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/lp/cat-litter-box"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <CatLitterBoxLanding />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/offer/litter-box"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <LitterBoxFunnel />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/lp/self-cleaning-litter-box"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <SelfCleaningLitterBoxLanding />
                              </Suspense>
                            }
                          />
                          {/* Catch-all: redirect any /lp/:slug to /products/:slug for Pinterest pins */}
                          <Route
                            path="/lp/:slug"
                            element={<LpRedirect />}
                          />
                          <Route
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <WhyTrustOurReviews />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/about-the-author"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <AboutTheAuthor />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/how-we-test-products"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <HowWeTestProducts />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/editorial-guidelines"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <EditorialGuidelines />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/affiliate-disclosure"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <AffiliateDisclosure />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/resources/dog-bed-size-chart"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <DogBedSizeChart />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/resources/indoor-cat-care"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <IndoorCatCareResource />
                              </Suspense>
                            }
                          />

                          {/* Guide pages */}
                          <Route
                            path="/pet-care-guides"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PetCareGuides />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/guides"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <GuidesIndex />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/guides/cat-condo-vs-cat-tree-2026"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <CatCondoVsCatTree2026 />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-self-cleaning-litter-box-2026"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestSelfCleaningLitterBox2026 />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-cat-litter-box-2026"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestCatLitterBox2026 />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-dog-car-seat-safety"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestDogCarSeatSafety />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-interactive-cat-toys"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestInteractiveCatToys />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-dog-anxiety-solutions"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestDogAnxietySolutions />
                              </Suspense>
                            }
                          />
                          {/* Cluster sub-pages */}
                          <Route
                            path="/best-cat-litter-box-reddit"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestCatLitterBoxReddit />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-litter-box-for-smell"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestLitterBoxForSmell />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-litter-box-large-cats"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestLitterBoxLargeCats />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/best-litter-boxes-apartments-2026"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <BestLitterBoxesApartments />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/indoor-cat-furniture"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <IndoorCatFurnitureGuide />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/guides/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <GuidePage />
                              </Suspense>
                            }
                          />
                          {/* Lockdown cluster articles — generic JSON-driven renderer */}
                          <Route
                            path="/guides/cluster/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <LockdownClusterArticle />
                              </Suspense>
                            }
                          />

                          {/* ═══ /dog/* and /cat/* → redirect ALL to /collections ═══ */}
                          <Route path="/dog" element={<Navigate to="/collections/dog" replace />} />
                          <Route path="/cat" element={<Navigate to="/collections/cat" replace />} />
                          <Route path="/dog/training" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/dog/travel" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/cat/training" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/cat/travel" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/dog/*" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/cat/*" element={<Navigate to="/collections/all" replace />} />
                          {/* ═══ LEGACY CLUSTER REDIRECTS (301-equivalent) ═══ */}
                          {/* ═══ LEGACY CLUSTER REDIRECTS → all go to /collections/* ═══ */}
                          <Route path="/orthopedic-dog-beds" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/cat-trees-for-large-cats" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/dog-car-travel-safety" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/orthopedic-dog-beds" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/cat-trees-for-large-cats" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-car-travel-safety" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/best-orthopedic-dog-bed-large-dogs" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/waterproof-orthopedic-dog-bed" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/memory-foam-dog-beds" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/cat-tree-for-maine-coon" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/heavy-duty-cat-tree" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/cat-condos-for-large-cats" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-car-seats" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-booster-seat" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-car-harness" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-potty-training" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-leash-control" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-anti-bark" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/puppy-training-essentials" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-training-accessories" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/no-pull-dog-harness" element={<Navigate to="/collections/dog-collars-leashes" replace />} />
                          <Route path="/collections/long-training-leashes" element={<Navigate to="/collections/dog-collars-leashes" replace />} />
                          <Route path="/collections/dog-training-clickers" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-treat-pouches" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/dog-training-kits" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/puppy-training-tools" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/recall-training-gear" element={<Navigate to="/collections/all" replace />} />
                          <Route path="/collections/pet-grooming-tools" element={<Navigate to="/collections/dog-grooming" replace />} />
                          <Route path="/collections/dog-car-travel-safety-seats" element={<Navigate to="/collections/all" replace />} />

                          {/* SEO Collection pages — /collections/:slug */}
                          <Route
                            path="/collections/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <SeoCollection />
                              </Suspense>
                            }
                          />

                          {/* Legacy /collection/:slug → redirect to /collections/:slug */}
                          <Route path="/collection/:slug" element={<CollectionRedirect />} />

                          {/* Growth verification diagnostics */}
                          <Route
                            path="/__ops/growth-verification"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <GrowthVerification />
                              </Suspense>
                            }
                          />

                          {/* Performance debug guide — hidden, no-index */}
                          <Route
                            path="/debug/perf"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PerfDebugPage />
                              </Suspense>
                            }
                          />

                          {/* Merchant Center fix checklist — admin only, noindex */}
                          <Route
                            path="/merchant-fix-checklist"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <MerchantFixChecklist />
                              </Suspense>
                            }
                          />

                          {/* Diagnostics pages — hidden, noindex */}
                          <Route
                            path="/diagnostics/headers"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <HeadersDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/performance"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PerformanceDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/gsc"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <GscChecklist />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/seo-hosts"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <SeoHostDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/sitemap-health"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <SitemapHealthDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/crawl-budget"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <CrawlBudgetDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/index-control"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <IndexControlDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/link-equity"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <LinkEquityDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/serp-war"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <SerpWarDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/top3-boost"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Top3BoostDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/top3-lockdown"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <Top3LockdownDiagnostics />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/revenue-war-machine"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <RevenueWarMachine />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/niche-monopoly"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <NicheMonopoly />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/auto-expansion"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <AutoExpansion />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/diagnostics/market-takeover"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <MarketTakeover />
                              </Suspense>
                            }
                          />

                          {/* Parent category routes */}
                          <Route path="/dogs" element={<Navigate to="/collections/dog" replace />} />
                          <Route path="/cats" element={<Navigate to="/collections/cat" replace />} />

                          {/* Category navigation routes — redirect to /collections/ */}
                          <Route
                            path="/dogs/dog-beds"
                            element={<Navigate to="/collections/dog-beds" replace />}
                          />
                          <Route path="/dogs/dog-toys" element={<Navigate to="/collections/dogs" replace />} />
                          <Route path="/dogs/chew-toys" element={<Navigate to="/collections/dogs" replace />} />
                          <Route path="/dogs/dog-collars-leashes" element={<Navigate to="/collections/dogs" replace />} />
                          <Route path="/dogs/dog-carriers" element={<Navigate to="/collections/dog-travel-accessories" replace />} />
                          <Route path="/dogs/dog-grooming" element={<Navigate to="/collections/dogs" replace />} />
                          <Route path="/cats/cat-toys" element={<Navigate to="/collections/cats" replace />} />
                          <Route path="/cats/cat-litter" element={<Navigate to="/collections/cat-litter-boxes" replace />} />
                          <Route path="/cats/litter-boxes" element={<Navigate to="/collections/cat-litter-boxes" replace />} />
                          <Route path="/cats/cat-trees" element={<Navigate to="/collections/cat-trees-and-condos" replace />} />
                          <Route path="/collections/cat-trees" element={<Navigate to="/collections/cat-trees-and-condos" replace />} />
                          <Route path="/cats/cat-carriers" element={<Navigate to="/collections/cats" replace />} />
                          <Route path="/cats/automatic-feeders" element={<Navigate to="/collections/cats" replace />} />
                          <Route path="/category/:slug" element={<Navigate to="/products" replace />} />
                          <Route
                            path="/shop"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <ShopHub />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/site-map"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <HtmlSitemap />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/recent-products"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <RecentProducts />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/trending-pet-products"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <TrendingProducts />
                              </Suspense>
                            }
                          />
                          {/* Admin sub-routes */}
                          {/* Admin nested routes with layout + sidebar */}
                          <Route
                            path="/admin"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <LazyAdminShell />
                              </Suspense>
                            }
                          >
                            <Route
                              index
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AdminDashboardOverview />
                                </Suspense>
                              }
                            />
                            <Route
                              path="diagnostics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DiagnosticsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-config"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokConfigPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-command-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-scaling"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueScalingPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cro-dashboard"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CRODashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="autonomous-seo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AutonomousSeoPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-war-room"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoWarRoomPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="competitive-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CompetitiveIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="authority-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AuthorityEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="internal-link-log"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <InternalLinkLog />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-dashboard"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AdminSeoDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="crawl-diagnostics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CrawlDiagnosticsDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="crawl-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CrawlHealthDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="snippet-monitor"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SnippetMonitor />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cluster-war"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ClusterWarDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="dog-beds-cluster"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DogBedsClusterDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cat-litter-cluster"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CatLitterClusterDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="analytics-hub"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AnalyticsHub />
                                </Suspense>
                              }
                            />
                            <Route
                              path="hero-cta-analytics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <HeroCtaAnalyticsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cta-copy-performance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CtaCopyPerformancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="stock-refresh-monitor"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <StockRefreshMonitorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="guides"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GuidesDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="guide-generator"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GuideGeneratorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="comparison-generator"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ComparisonGeneratorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-monitor"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoMonitorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="feed-gap-report"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FeedGapReportPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="feed-insights"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FeedInsightsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="redirect-check"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RedirectCheckPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="security-credentials"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SecurityCredentialsDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="scaling-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ScalingEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="content-opportunities"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ContentOpportunitiesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="momentum"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MomentumAccelerationDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="bundles"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BundlesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="winners-boost"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <WinnersBoostDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="profit-system"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProfitSystemDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cluster-dominance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ClusterDominance />
                                </Suspense>
                              }
                            />
                            <Route
                              path="analytics-traffic"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AnalyticsTrafficDocs />
                                </Suspense>
                              }
                            />
                            <Route
                              path="reports"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AdminReportsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-execution"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthExecutionPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="backlink-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BacklinkEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="backlink-growth"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BacklinkGrowthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="internal-link-authority"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <InternalLinkAuthorityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-seo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductSeoPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="resources"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AdminResourcesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="indexing-diagnostics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <IndexingDiagnosticsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="bot-render-seo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BotRenderSeoDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="render-trace"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RenderTraceDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="render-trace/slug/:slug"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RenderTraceSlugDetail />
                                </Suspense>
                              }
                            />
                            <Route
                              path="crawler-sample-rate"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CrawlerSampleRatePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="crawler-sampling-decisions"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CrawlerSamplingDecisionsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="perf-audit"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PerfAuditPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="edge-diagnostics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EdgeDiagnosticsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="sitemap-ping"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SitemapPingPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="gsc-url-helper"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GscUrlInspectionHelper />
                                </Suspense>
                              }
                            />
                            <Route
                              path="domain-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DomainHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="gsc-4xx"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <Gsc4xxTriagePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="structured-data"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <StructuredDataPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-structured-data"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <StructuredDataPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="perf"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PerfAuditPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-agent"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoAgentControlCenter />
                                </Suspense>
                              }
                            />
                            <Route
                              path="commerce-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CommerceIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cluster-revenue-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ClusterRevenueEngine />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cat-condo-growth"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CatCondoGrowthDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-agent-auto"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoAgentAutonomous />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-acceleration"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoAccelerationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="progress"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProgressDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="jobs"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <JobsQueuePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="edge-functions-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EdgeFunctionsHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AutonomousSeoEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="seo-console"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SeoConsolePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="integrations/merchant"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantIntegrationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="integrations/merchant/review-checklist"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantReviewChecklistPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="integrations/merchant/settings"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantSettingsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="job-retry-policies"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <JobRetryPoliciesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="job-retry-metrics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <JobRetryMetricsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="integrations/merchant/readiness"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantReadinessPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="integrations/merchant/health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="page-changelog"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PageChangelogManager />
                                </Suspense>
                              }
                            />
                            <Route
                              path="integrations/stripe/apple-pay"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ApplePayDomainPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="shopping-optimizer"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ShoppingOptimizerPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-optimizer"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductOptimizerPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="image-compliance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ImageCompliancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cornerstone-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CornerstoneEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="merchant-compliance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantComplianceReport />
                                </Suspense>
                              }
                            />
                            <Route
                              path="merchant-safe"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MerchantSafePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="winning-products"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <WinningProductFinder />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-traffic"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestTrafficMachinePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-scale"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestScaleModePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-automation"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestAutomationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-automation"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokAutomationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-ads-performance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokAdsPerformancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-funnel-debug"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokFunnelDebugPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-excluded-sessions"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokExcludedSessionsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-session-decision-log"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokSessionDecisionLogPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-funnel-report"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokFunnelReportPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-realtime-funnel"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokRealtimeFunnelPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="utm-validation-log"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <UtmValidationLogPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tracking-anomalies"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TrackingAnomaliesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-cta-ctr"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokCtaCtrPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="placement-overview"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PlacementOverviewPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-config-checklist"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokConfigChecklistPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-test-users"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokTestUsersPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="deep-link-inspector"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DeepLinkInspectorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-status"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokStatusPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="test"
                              element={<div style={{padding:40,fontSize:24,fontWeight:'bold'}}>ADMIN ROUTE WORKS</div>}
                            />
                          </Route>

                          <Route
                            path="*"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <NotFound />
                              </Suspense>
                            }
                          />
                        </Routes>
                      </RouteErrorBoundary>
                    </BrowserRouter>
                  </WishlistProvider>
                </CartAnimationProvider>
              </CartProvider>
            </AuthProvider>
          </TooltipProvider>
        </Suspense>
      </QueryClientProvider>
      {WebVitalsPanel && (
        <Suspense fallback={null}>
          <WebVitalsPanel />
        </Suspense>
      )}
    </AppErrorBoundary>
  );
};

export default App;
