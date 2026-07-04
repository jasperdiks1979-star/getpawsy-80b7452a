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
const PinterestDynamicLanding = lazyWithRetry(() => import("./pages/landing/PinterestDynamicLanding"));
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

/** Redirect /bestseller/:slug to canonical /products/:slug, preserving query/hash. */
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
const TikTokPixelVerifyPage = lazyWithRetry(() => import("./pages/admin/TikTokPixelVerifyPage"));
const TikTokServerEventsPage = lazyWithRetry(() => import("./pages/admin/TikTokServerEventsPage"));
const CheckoutFunnelEventsPage = lazyWithRetry(() => import("./pages/admin/CheckoutFunnelEventsPage"));
const FunnelHealthPage = lazyWithRetry(() => import("./pages/admin/FunnelHealthCenter"));
const ProductionValidationPage = lazyWithRetry(() => import("./pages/admin/ProductionValidationPage"));
const ProductionSafetyCertificationPage = lazyWithRetry(() => import("./pages/admin/ProductionSafetyCertificationPage"));
const LiveEventsPage = lazyWithRetry(() => import("./pages/admin/LiveEventsPage"));
const AtcAnalyticsPanelPage = lazyWithRetry(() => import("./pages/admin/AtcAnalyticsPanel"));
const BotThresholdReportPage = lazyWithRetry(() => import("./pages/admin/BotThresholdReport"));
const CleanKpiDashboardPage = lazyWithRetry(() => import("./pages/admin/CleanKpiDashboard"));
const DegradedEventsPage = lazyWithRetry(() => import("./pages/admin/DegradedEventsPage"));
const FunnelDashboardPage = lazyWithRetry(() => import("./pages/admin/FunnelDashboard"));
const ProductStockAuditPage = lazyWithRetry(() => import("./pages/admin/ProductStockAuditPage"));
const ProductsPerformancePage = lazyWithRetry(() => import("./pages/admin/ProductsPerformance"));
const TrafficPerformancePage = lazyWithRetry(() => import("./pages/admin/TrafficPerformance"));
const TrackingHealthPage = lazyWithRetry(() => import("./pages/admin/TrackingHealth"));
const TikTokCredentialsStatusPage = lazyWithRetry(() => import("./pages/admin/TikTokCredentialsStatusPage"));
const ConversionDashboardPage = lazyWithRetry(() => import("./pages/admin/ConversionDashboardPage"));
const TestPaymentPage = lazyWithRetry(() => import("./pages/admin/TestPaymentPage"));
const SmsAlertsPage = lazyWithRetry(() => import("./pages/admin/SmsAlertsPage"));
const PinterestHealthPage = lazyWithRetry(() => import("./pages/admin/PinterestHealthPage"));
const PreWaveLivePage = lazyWithRetry(() => import("./pages/admin/PreWaveLivePage"));
const FirstSaleAcceleratorPage = lazyWithRetry(() => import("./pages/admin/FirstSaleAcceleratorPage"));
const ConversionIntelligencePage = lazyWithRetry(() => import("./pages/admin/ConversionIntelligencePage"));
const ConversionWarRoomPage = lazyWithRetry(() => import("./pages/admin/ConversionWarRoomPage"));
const ConversionCommanderPage = lazyWithRetry(() => import("./pages/admin/ConversionCommanderPage"));
const PdpAtcDrilldownPage = lazyWithRetry(() => import("./pages/admin/PdpAtcDrilldownPage"));
const GenesisPrcPage = lazyWithRetry(() => import("./pages/admin/GenesisPrcPage"));
const PinterestTrafficForensicsPage = lazyWithRetry(() => import("./pages/admin/PinterestTrafficForensicsPage"));
const PinterestDistributionPage = lazyWithRetry(() => import("./pages/admin/PinterestDistributionPage"));
const PinterestRevenueControlPage = lazyWithRetry(() => import("./pages/admin/PinterestRevenueControlPage"));
const ProductWinnerDiscoveryPage = lazyWithRetry(() => import("./pages/admin/ProductWinnerDiscoveryPage"));
const PinterestScalingPage = lazyWithRetry(() => import("./pages/admin/PinterestScalingPage"));
const RevenueCommandCenterPage = lazyWithRetry(() => import("./pages/admin/RevenueCommandCenterPage"));
const RevenueRecoveryPage = lazyWithRetry(() => import("./pages/admin/RevenueRecoveryPage"));
const TrafficCommandCenter = lazyWithRetry(() => import("./pages/admin/TrafficCommandCenter"));
const AdminPaymentsPage = lazyWithRetry(() => import("./pages/admin/AdminPaymentsPage"));
const WebhookHealthPage = lazyWithRetry(() => import("./pages/admin/WebhookHealthPage"));
const AdminSmokeTestEventsPage = lazyWithRetry(() => import("./pages/admin/AdminSmokeTestEventsPage"));
const SeoCommandCenterPage = lazyWithRetry(() => import("./pages/admin/SeoCommandCenterPage"));
const RevenueScalingPage = lazyWithRetry(() => import("./pages/admin/RevenueScalingPage"));
const CRODashboardPage = lazyWithRetry(() => import("./pages/admin/CRODashboardPage"));
const CroCommandCenterPage = lazyWithRetry(() => import("./pages/admin/CroCommandCenterPage"));
const AnalyticsHealthPage = lazyWithRetry(() => import("./pages/admin/AnalyticsHealthPage"));
const AttributionComparePage = lazyWithRetry(() => import("./pages/admin/AttributionComparePage"));
const VisitorTimelinePage = lazyWithRetry(() => import("./pages/admin/VisitorTimelinePage"));
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
const AiRevenuePage = lazyWithRetry(() => import("./pages/admin/AiRevenuePage"));
const AiCreativesPage = lazyWithRetry(() => import("./pages/admin/AiCreativesPage"));
const AiSeoPage = lazyWithRetry(() => import("./pages/admin/AiSeoPage"));
const AiExecutivePage = lazyWithRetry(() => import("./pages/admin/AiExecutivePage"));
const HeroProductsPage = lazyWithRetry(() => import("./pages/admin/HeroProductsPage"));
const MomentumAccelerationDashboard = lazyWithRetry(() => import("./pages/admin/MomentumAccelerationDashboard"));
const BundlesPage = lazyWithRetry(() => import("./pages/admin/BundlesPage"));
const WinnersBoostDashboard = lazyWithRetry(() => import("./pages/admin/WinnersBoostDashboard"));
const ProfitSystemDashboard = lazyWithRetry(() => import("./pages/admin/ProfitSystemDashboard"));
const ProfitEnginePage = lazyWithRetry(() => import("./pages/admin/ProfitEnginePage"));
const PdpConversionDashboardPage = lazyWithRetry(() => import("./pages/admin/PdpConversionDashboardPage"));
const CinematicHealthPage = lazyWithRetry(() => import("./pages/admin/CinematicHealthPage"));
const ProfitEngineTrendsPage = lazyWithRetry(() => import("./pages/admin/ProfitEngineTrendsPage"));
const HomepageAiPage = lazyWithRetry(() => import("./pages/admin/HomepageAiPage"));
const ClusterDominance = lazyWithRetry(() => import("./pages/admin/ClusterDominance"));
const AnalyticsTrafficDocs = lazyWithRetry(() => import("./pages/admin/AnalyticsTrafficDocs"));
const AdminReportsPage = lazyWithRetry(() => import("./pages/admin/AdminReportsPage"));
const GenesisVaultPage = lazyWithRetry(() => import("./pages/admin/GenesisVaultPage"));
const EvidenceVaultPage = lazyWithRetry(() => import("./pages/admin/EvidenceVaultPage"));
const FinancialEvidenceVaultPage = lazyWithRetry(() => import("./pages/admin/FinancialEvidenceVaultPage"));
const CFOChatPage = lazyWithRetry(() => import("./pages/admin/CFOChatPage"));
const CFOReportLibraryPage = lazyWithRetry(() => import("./pages/admin/CFOReportLibraryPage"));
const GenesisWarRoomV1Page = lazyWithRetry(() => import("./pages/admin/GenesisWarRoomV1Page"));
const GenesisOmegaPage = lazyWithRetry(() => import("./pages/admin/GenesisOmegaPage"));
const GenesisOmegaArchitectPage = lazyWithRetry(() => import("./pages/admin/GenesisOmegaArchitectPage"));
const GenesisGenomePage = lazyWithRetry(() => import("./pages/admin/GenesisGenomePage"));
const GenesisOmegaTruthPage = lazyWithRetry(() => import("./pages/admin/GenesisOmegaTruthPage"));
const GenesisBoardroomPage = lazyWithRetry(() => import("./pages/admin/GenesisBoardroomPage"));
const GenesisBoardroomV5Page = lazyWithRetry(() => import("./pages/admin/GenesisBoardroomV5Page"));
const GenesisDigitalCompanyPage = lazyWithRetry(() => import("./pages/admin/GenesisDigitalCompanyPage"));
const GenesisPerpetualCompanyPage = lazyWithRetry(() => import("./pages/admin/GenesisPerpetualCompanyPage"));
const GenesisEnterpriseTwinPage = lazyWithRetry(() => import("./pages/admin/GenesisEnterpriseTwinPage"));
const FinanceIntelligencePage = lazyWithRetry(() => import("./pages/admin/FinanceIntelligencePage"));
const FinancialHealthPage = lazyWithRetry(() => import("./pages/admin/FinancialHealthPage"));
const CEOCommandCenterPage = lazyWithRetry(() => import("./pages/admin/CEOCommandCenterPage"));
const AccountantPortalPage = lazyWithRetry(() => import("./pages/admin/AccountantPortalPage"));
const GrowthExecutionPage = lazyWithRetry(() => import("./pages/admin/GrowthExecutionPage"));
const GrowthIntelligencePage = lazyWithRetry(() => import("./pages/admin/GrowthIntelligencePage"));
const GrowthCommandPage = lazyWithRetry(() => import("./pages/admin/GrowthCommandPage"));
const GrowthCommandCenterPage = lazyWithRetry(() => import("./pages/admin/GrowthCommandCenterPage"));
const TrafficIntelligencePage = lazyWithRetry(() => import("./pages/admin/TrafficIntelligencePage"));
const ProductIntelligenceV3Page = lazyWithRetry(() => import("./pages/admin/ProductIntelligenceV3Page"));
const PinterestGrowthV3Page = lazyWithRetry(() => import("./pages/admin/PinterestGrowthPage"));
const MediaIntelligencePage = lazyWithRetry(() => import("./pages/admin/MediaIntelligencePage"));
const CreativeCommandPage = lazyWithRetry(() => import("./pages/admin/CreativeCommandPage"));
const CreativeIntelligencePage = lazyWithRetry(() => import("./pages/admin/CreativeIntelligencePage"));
const AiCreditIntelligencePage = lazyWithRetry(() => import("./pages/admin/AiCreditIntelligencePage"));
const RevenueScorecardV13Page = lazyWithRetry(() => import("./pages/admin/RevenueScorecardV13Page"));
const SalesReadinessPage = lazyWithRetry(() => import("./pages/admin/SalesReadinessPage"));
const BusinessHealthIndexPage = lazyWithRetry(() => import("./pages/admin/BusinessHealthIndexPage"));
const MissionControlPage = lazyWithRetry(() => import("./pages/admin/MissionControlPage"));
const ExecutiveWarRoomPage = lazyWithRetry(() => import("./pages/admin/ExecutiveWarRoomPage"));
const DecisionOutcomesPage = lazyWithRetry(() => import("./pages/admin/DecisionOutcomesPage"));
const RevenueWarRoomPage = lazyWithRetry(() => import("./pages/admin/RevenueWarRoomPage"));
const UsTrafficCampaignPage = lazyWithRetry(() => import("./pages/admin/UsTrafficCampaignPage"));
const RevenueAttributionCenterPage = lazyWithRetry(() => import("./pages/admin/RevenueAttributionCenterPage"));
const CustomerJourneyCenterPage = lazyWithRetry(() => import("./pages/admin/CustomerJourneyCenterPage"));
const RecoveryCenterPage = lazyWithRetry(() => import("./pages/admin/RecoveryCenterPage"));
const EvidenceExplorerPage = lazyWithRetry(() => import("./pages/admin/EvidenceExplorerPage"));
const PcieV2RevenueIntelligencePage = lazyWithRetry(() => import("./pages/admin/PcieV2RevenueIntelligencePage"));
const AutonomousGrowthPage = lazyWithRetry(() => import("./pages/admin/AutonomousGrowthPage"));
const AutonomousCommercePage = lazyWithRetry(() => import("./pages/admin/AutonomousCommercePage"));
const CommanderPage = lazyWithRetry(() => import("./pages/admin/CommanderPage"));
const CommanderFoundationPage = lazyWithRetry(() => import("./pages/admin/CommanderFoundationPage"));
const MarketIntelligencePage = lazyWithRetry(() => import("./pages/admin/MarketIntelligencePage"));
const MarketIntelligenceChangelogPage = lazyWithRetry(() => import("./pages/admin/MarketIntelligenceChangelogPage"));
const PinterestMarketIntelligencePage = lazyWithRetry(() => import("./pages/admin/PinterestMarketIntelligencePage"));
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
const CinematicAdsPage = lazyWithRetry(() => import("./pages/admin/CinematicAdsPage"));
const CinematicRunwayPage = lazyWithRetry(() => import("./pages/admin/CinematicRunwayPage"));
const CinematicAdsControlCenterPage = lazyWithRetry(() => import("./pages/admin/CinematicAdsControlCenterPage"));
const CinematicV3QaPage = lazyWithRetry(() => import("./pages/admin/CinematicV3QaPage"));
const CinematicV3DispatcherPage = lazyWithRetry(() => import("./pages/admin/CinematicV3DispatcherPage"));
const CanonicalHealthPage = lazyWithRetry(() => import("./pages/admin/CanonicalHealthPage"));
const AnalyticsTruthPage = lazyWithRetry(() => import("./pages/admin/AnalyticsTruthPage"));
const CinematicV3RepairPage = lazyWithRetry(() => import("./pages/admin/CinematicV3RepairPage"));
const CinematicV4ReviewPage = lazyWithRetry(() => import("./pages/admin/CinematicV4Review"));
const CinematicAdQaSummaryPage = lazyWithRetry(() => import("./pages/admin/CinematicAdQaSummaryPage"));
const CinematicAdsDashboardPage = lazyWithRetry(() => import("./pages/admin/CinematicAdsDashboardPage"));
const CinematicAdPreviewPage = lazyWithRetry(() => import("./pages/admin/CinematicAdPreviewPage"));
const CinematicOneJobVerifyPage = lazyWithRetry(() => import("./pages/admin/CinematicOneJobVerifyPage"));
const CinematicQueueHealthPage = lazyWithRetry(() => import("./pages/admin/CinematicQueueHealthPage"));
const PinterestRecoveryStatusPage = lazyWithRetry(() => import("./pages/admin/PinterestRecoveryStatusPage"));
const PinterestCreditProtectionPage = lazyWithRetry(() => import("./pages/admin/PinterestCreditProtectionPage"));
const AiGatewayCreditsPage = lazyWithRetry(() => import("./pages/admin/AiGatewayCreditsPage"));
const AiTraceExplorerPage = lazyWithRetry(() => import("./pages/admin/AiTraceExplorerPage"));
const PinterestAdStudio = lazyWithRetry(() => import("./pages/admin/PinterestAdStudio"));
const AdminE2eVerify = lazyWithRetry(() => import("./pages/admin/AdminE2eVerify"));
const VisitorWorldMapProPage = lazyWithRetry(() => import("./pages/admin/VisitorWorldMapProPage"));
const StripeTestCheckoutPage = lazyWithRetry(() => import("./pages/admin/StripeTestCheckoutPage"));
const CjInventorySync = lazyWithRetry(() => import("./pages/admin/CjInventorySync"));
const CjVideoDiagnostic = lazyWithRetry(() => import("./pages/admin/CjVideoDiagnostic"));
const CjSyncReport = lazyWithRetry(() => import("./pages/admin/CjSyncReport"));
const CjHealthCheck = lazyWithRetry(() => import("./pages/admin/CjHealthCheck"));
const RenderBudgetDashboard = lazyWithRetry(() => import("./pages/admin/RenderBudgetDashboard"));
const CinematicPerformanceMetricsPage = lazyWithRetry(() => import("./pages/admin/CinematicPerformanceMetricsPage"));
const CinematicMotionForensicsPage = lazyWithRetry(() => import("./pages/admin/CinematicMotionForensicsPage"));
const PinterestCleanupPage = lazyWithRetry(() => import("./pages/admin/PinterestCleanupPage"));
const PinterestQualityPage = lazyWithRetry(() => import("./pages/admin/PinterestQualityPage"));
const LifestyleEngineV3Page = lazyWithRetry(() => import("./pages/admin/LifestyleEngineV3Page"));
const ProductIntelligencePage = lazyWithRetry(() => import("./pages/admin/ProductIntelligencePage"));
const FeedIssuesQueuePage = lazyWithRetry(() => import("./pages/admin/FeedIssuesQueuePage"));
const ScoreCalibrationPage = lazyWithRetry(() => import("./pages/admin/ScoreCalibrationPage"));
const RevenuePriorityReportPage = lazyWithRetry(() => import("./pages/admin/RevenuePriorityReportPage"));
const RevenuePriorityRemediationPage = lazyWithRetry(() => import("./pages/admin/RevenuePriorityRemediationPage"));
const DeployStatusPage = lazyWithRetry(() => import("./pages/admin/DeployStatusPage"));
const GuardianDashboardPage = lazyWithRetry(() => import("./pages/admin/GuardianDashboardPage"));
const SelfHealingPage = lazyWithRetry(() => import("./pages/admin/SelfHealingPage"));
const FounderReviewPage = lazyWithRetry(() => import("./pages/admin/FounderReviewPage"));
const PinterestRecoveryDashboard = lazyWithRetry(() => import("./pages/admin/PinterestRecoveryDashboard"));
const CreativeIntelligenceLayerPage = lazyWithRetry(() => import("./pages/admin/CreativeIntelligenceLayerPage"));
const EvolutionEnginePage = lazyWithRetry(() => import("./pages/admin/EvolutionEnginePage"));
const EvolutionEnginePhase2Page = lazyWithRetry(() => import("./pages/admin/EvolutionEnginePhase2Page"));
const CommandCenter2Page = lazyWithRetry(() => import("./pages/admin/CommandCenter2Page"));
const PinterestPinSourceAuditPage = lazyWithRetry(() => import("./pages/admin/PinterestPinSourceAuditPage"));
const PinterestVideoDestinationAudit = lazyWithRetry(() => import("./pages/admin/PinterestVideoDestinationAudit"));
const ContentProductAudit = lazyWithRetry(() => import("./pages/admin/ContentProductAudit"));
const CinematicV3Library = lazyWithRetry(() => import("./pages/admin/CinematicV3Library"));
const CinematicV3QualityAudit = lazyWithRetry(() => import("./pages/admin/CinematicV3QualityAudit"));
const CinematicV4Jobs = lazyWithRetry(() => import("./pages/admin/CinematicV4Jobs"));
const CinematicV4QualityGate = lazyWithRetry(() => import("./pages/admin/CinematicV4QualityGate"));
const PinterestStockStatusPage = lazyWithRetry(() => import("./pages/admin/PinterestStockStatusPage"));
const GitHubSyncStatusPage = lazyWithRetry(() => import("./pages/admin/GitHubSyncStatusPage"));
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
const PinterestCommerceIntelPage = lazyWithRetry(() => import("./pages/admin/PinterestCommerceIntelPage"));
const PinterestAutoPilotPage = lazyWithRetry(() => import("./pages/admin/PinterestAutoPilotPage"));
const PinterestAutopilotDailyPage = lazyWithRetry(() => import("./pages/admin/PinterestAutopilotDailyPage"));
const PinterestPinStatusPage = lazyWithRetry(() => import("./pages/admin/PinterestPinStatusPage"));
const PinQueueBreakdownPage = lazyWithRetry(() => import("./pages/admin/PinQueueBreakdownPage"));
const MediaQualityDashboard = lazyWithRetry(() => import("./pages/admin/MediaQualityDashboard"));
const PinterestUrlRecoveryPage = lazyWithRetry(() => import("./pages/admin/PinterestUrlRecoveryPage"));
const PinterestRedirectMapPage = lazyWithRetry(() => import("./pages/admin/PinterestRedirectMapPage"));
const PinterestPinPerformancePage = lazyWithRetry(() => import("./pages/admin/PinterestPinPerformancePage"));
const PinterestPinAttributionPage = lazyWithRetry(() => import("./pages/admin/PinterestPinAttributionPage"));
const PinterestProductConversionPage = lazyWithRetry(() => import("./pages/admin/PinterestProductConversionPage"));
const PinterestGrowthPage = lazyWithRetry(() => import("./pages/admin/PinterestGrowthPage"));
const ExecutionCenterPage = lazyWithRetry(() => import("./pages/admin/ExecutionCenterPage"));
const GrowthCommanderPage = lazyWithRetry(() => import("./pages/admin/GrowthCommanderPage"));
const SalesCommanderPage = lazyWithRetry(() => import("./pages/admin/SalesCommanderPage"));
const AiCeoPage = lazyWithRetry(() => import("./pages/admin/AiCeoPage"));
const GrowthOrchestratorPage = lazyWithRetry(() => import("./pages/admin/GrowthOrchestratorPage"));
const GrowthLabPage = lazyWithRetry(() => import("./pages/admin/GrowthLabPage"));
const OrganicIntelligencePage = lazyWithRetry(() => import("./pages/admin/OrganicIntelligencePage"));
const OrganicIntelligenceEnginePage = lazyWithRetry(() => import("./pages/admin/OrganicIntelligenceEnginePage"));
const OrganicDominationPage = lazyWithRetry(() => import("./pages/admin/OrganicDominationPage"));
const OrganicFirstPage = lazyWithRetry(() => import("./pages/admin/OrganicFirstPage"));
const OrganicConfidenceConfigPage = lazyWithRetry(() => import("./pages/admin/OrganicConfidenceConfigPage"));
const PinterestBrainPage = lazyWithRetry(() => import("./pages/admin/PinterestBrainPage"));
const PinterestSpyPage = lazyWithRetry(() => import("./pages/admin/PinterestSpyPage"));
const PminPage = lazyWithRetry(() => import("./pages/admin/PminPage"));
const RevenueBrainPage = lazyWithRetry(() => import("./pages/admin/RevenueBrainPage"));
const ArieCommandCenterPage = lazyWithRetry(() => import("./pages/admin/ArieCommandCenterPage"));
const GrowthDirectorPage = lazyWithRetry(() => import("./pages/admin/GrowthDirectorPage"));
const MetaIntelligencePage = lazyWithRetry(() => import("./pages/admin/MetaIntelligencePage"));
const GovernancePage = lazyWithRetry(() => import("./pages/admin/GovernancePage"));
const AosCommandCenterPage = lazyWithRetry(() => import("./pages/admin/AosCommandCenterPage"));
const BusinessDnaPage = lazyWithRetry(() => import("./pages/admin/BusinessDnaPage"));
const CustomerPsychologyPage = lazyWithRetry(() => import("./pages/admin/CustomerPsychologyPage"));
const PinterestIntelligencePage = lazyWithRetry(() => import("./pages/admin/PinterestIntelligencePage"));
const CreativeDnaPage = lazyWithRetry(() => import("./pages/admin/CreativeDnaPage"));
const AnalyticsDnaPage = lazyWithRetry(() => import("./pages/admin/AnalyticsDnaPage"));
const ProductIntelligenceDnaPage = lazyWithRetry(() => import("./pages/admin/ProductIntelligenceDnaPage"));
const MarketIntelligenceDnaPage = lazyWithRetry(() => import("./pages/admin/MarketIntelligenceDnaPage"));
const KnowledgeGraphPage = lazyWithRetry(() => import("./pages/admin/KnowledgeGraphPage"));
const ExecutiveDecisionPage = lazyWithRetry(() => import("./pages/admin/ExecutiveDecisionPage"));
const ExperimentationPage = lazyWithRetry(() => import("./pages/admin/ExperimentationPage"));
const RevenueOptimizationPage = lazyWithRetry(() => import("./pages/admin/RevenueOptimizationPage"));
const StrategicPlanningPage = lazyWithRetry(() => import("./pages/admin/StrategicPlanningPage"));
const AiCompanyOsPage = lazyWithRetry(() => import("./pages/admin/AiCompanyOsPage"));
const ArchitecturePage = lazyWithRetry(() => import("./pages/admin/ArchitecturePage"));
const ProductionExcellencePage = lazyWithRetry(() => import("./pages/admin/ProductionExcellencePage"));
const ConversionIntegrityPage = lazyWithRetry(() => import("./pages/admin/ConversionIntegrityPage"));
const ConversionRealityPage = lazyWithRetry(() => import("./pages/admin/ConversionRealityPage"));
const CanonicalAnalyticsPage = lazyWithRetry(() => import("./pages/admin/CanonicalAnalyticsPage"));
const PieEnginePage = lazyWithRetry(() => import("./pages/admin/PieEnginePage"));
const EvolutionIntelligencePage = lazyWithRetry(() => import("./pages/admin/EvolutionIntelligencePage"));
const RevenueReportPage = lazyWithRetry(() => import("./pages/admin/RevenueReportPage"));
const PinterestIntegrityPage = lazyWithRetry(() => import("./pages/admin/PinterestIntegrityPage"));
const VisualProductIntegrityPage = lazyWithRetry(() => import("./pages/admin/VisualProductIntegrityPage"));
const ProductIdentityGraphPage = lazyWithRetry(() => import("./pages/admin/ProductIdentityGraphPage"));
const PinterestWarmupPage = lazyWithRetry(() => import("./pages/admin/PinterestWarmupPage"));
const PinterestVideoQueuePage = lazyWithRetry(() => import("./pages/admin/PinterestVideoQueuePage"));
const PinterestVideoAutopilotDashboard = lazyWithRetry(() => import("./pages/admin/PinterestVideoAutopilotDashboard"));
const PinterestVideoLogsPage = lazyWithRetry(() => import("./pages/admin/PinterestVideoLogsPage"));
const PinterestPatternsPage = lazyWithRetry(() => import("./pages/admin/PinterestPatternsPage"));
const PinterestIntelligence = lazyWithRetry(() => import("./pages/admin/PinterestIntelligence"));
const PinterestControlCenterPage = lazyWithRetry(() => import("./pages/admin/PinterestControlCenterPage"));
const PqifV4Page = lazyWithRetry(() => import("./pages/admin/PqifV4Page"));
const PinterestCreativeIntelV2Page = lazyWithRetry(() => import("./pages/admin/PinterestCreativeIntelV2Page"));
const PinterestGrowthEnginePage = lazyWithRetry(() => import("./pages/admin/PinterestGrowthEnginePage"));
const PinterestGenericNichePage = lazyWithRetry(() => import("./pages/admin/PinterestGenericNichePage"));
const PinterestNicheCoveragePage = lazyWithRetry(() => import("./pages/admin/PinterestNicheCoveragePage"));
const ProductDiversityPage = lazyWithRetry(() => import("./pages/admin/ProductDiversityPage"));
const PinterestNicheRulesPage = lazyWithRetry(() => import("./pages/admin/PinterestNicheRulesPage"));
const RejectedSpamEventsPage = lazyWithRetry(() => import("./pages/admin/RejectedSpamEventsPage"));
const BotTrafficDrilldownPage = lazyWithRetry(() => import("./pages/admin/BotTrafficDrilldownPage"));
const PinterestBackdropPreviewPage = lazyWithRetry(() => import("./pages/admin/PinterestBackdropPreviewPage"));
const PinterestHealth = lazyWithRetry(() => import("./pages/admin/PinterestHealth"));
const PinterestEnterpriseControlCenter = lazyWithRetry(() => import("./pages/admin/PinterestEnterpriseControlCenter"));
const PinterestGrowthAI = lazyWithRetry(() => import("./pages/admin/PinterestGrowthAIPage"));
const PinterestRevenueAi = lazyWithRetry(() => import("./pages/admin/PinterestRevenueAiPage"));
const PinterestRevenueEngine = lazyWithRetry(() => import("./pages/admin/PinterestRevenueEngine"));
const RevenueAiPage = lazyWithRetry(() => import("./pages/admin/RevenueAiPage"));
const PinterestLivePinRepair = lazyWithRetry(() => import("./pages/admin/PinterestLivePinRepair"));
const PinterestConversionMonitor = lazyWithRetry(() => import("./pages/admin/PinterestConversionMonitor"));
const PinterestCleanup = lazyWithRetry(() => import("./pages/admin/PinterestCleanup"));
const PinterestRevenueEngineV2 = lazyWithRetry(() => import("./pages/admin/PinterestRevenueEngineV2"));
const PinterestRevenueV4 = lazyWithRetry(() => import("./pages/admin/PinterestRevenueV4"));
const PinterestProfitCenter = lazyWithRetry(() => import("./pages/admin/PinterestProfitCenter"));
const PinterestProducts = lazyWithRetry(() => import("./pages/admin/PinterestProducts"));
const PinterestSchedulerPage = lazyWithRetry(() => import("./pages/admin/PinterestSchedulerPage"));
const PinterestPinQueuePage = lazyWithRetry(() => import("./pages/admin/PinterestPinQueuePage"));
const PinterestCostDashboard = lazyWithRetry(() => import("./pages/admin/PinterestCostDashboard"));
const PinterestLiveCyclePage = lazyWithRetry(() => import("./pages/admin/PinterestLiveCyclePage"));
const PinterestOpsDashboardPage = lazyWithRetry(() => import("./pages/admin/PinterestOpsDashboardPage"));
const PinterestCommandCenterPage = lazyWithRetry(() => import("./pages/admin/PinterestCommandCenterPage"));
const PinterestCapiHealthPage = lazyWithRetry(() => import("./pages/admin/PinterestCapiHealthPage"));
const PinterestTrendsPage = lazyWithRetry(() => import("./pages/admin/PinterestTrendsPage"));
const PinterestRevenuePage = lazyWithRetry(() => import("./pages/admin/PinterestRevenuePage"));
const PinterestAttributionHealthPage = lazyWithRetry(() => import("./pages/admin/PinterestAttributionHealthPage"));
const RevenueCommandCenter = lazyWithRetry(() => import("./pages/admin/RevenueCommandCenter"));
const RenderForensicsPage = lazyWithRetry(() => import("./pages/admin/RenderForensicsPage"));
const WorkerRecoveryPage = lazyWithRetry(() => import("./pages/admin/WorkerRecoveryPage"));
const TikTokAutomationPage = lazyWithRetry(() => import("./pages/admin/TikTokAutomationPage"));
const TikTokAdsPerformancePage = lazyWithRetry(() => import("./pages/admin/TikTokAdsPerformancePage"));
const TikTokFunnelDebugPage = lazyWithRetry(() => import("./pages/admin/TikTokFunnelDebugPage"));
const TikTokRealtimeFunnelPage = lazyWithRetry(() => import("./pages/admin/TikTokRealtimeFunnelPage"));
const UtmValidationLogPage = lazyWithRetry(() => import("./pages/admin/UtmValidationLogPage"));
const TrackingAnomaliesPage = lazyWithRetry(() => import("./pages/admin/TrackingAnomaliesPage"));
const UtmConversionEventsPage = lazyWithRetry(() => import("./pages/admin/UtmConversionEventsPage"));
const TrackingAlertsHistoryPage = lazyWithRetry(() => import("./pages/admin/TrackingAlertsHistoryPage"));
const MonitoringRunsPage = lazyWithRetry(() => import("./pages/admin/MonitoringRunsPage"));
const EventsLivePage = lazyWithRetry(() => import("./pages/admin/EventsLivePage"));
const FunnelBySourcePage = lazyWithRetry(() => import("./pages/admin/FunnelBySourcePage"));
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
const BestDogToysLander = lazyWithRetry(() => import("./pages/seo/BestCategoryLander").then(m => ({ default: m.BestDogToysLander })));
const BestCatTreesLander = lazyWithRetry(() => import("./pages/seo/BestCategoryLander").then(m => ({ default: m.BestCatTreesLander })));
const BestCatLitterBoxesLander = lazyWithRetry(() => import("./pages/seo/BestCategoryLander").then(m => ({ default: m.BestCatLitterBoxesLander })));
const BestDogBedsLander = lazyWithRetry(() => import("./pages/seo/BestCategoryLander").then(m => ({ default: m.BestDogBedsLander })));
const BestDogCollarsLander = lazyWithRetry(() => import("./pages/seo/BestCategoryLander").then(m => ({ default: m.BestDogCollarsLander })));
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
const PinterestTagHealth = lazyWithRetry(() => import("./pages/PinterestTagHealth"));
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
  useEffect(() => {
    import("@/lib/pinterestTracker").then((m) => m.bootstrapPinterestSession()).catch(() => {});
  }, []);
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
                            path="/pinterest-tag-health"
                            element={
                              <Suspense fallback={null}>
                                <PinterestTagHealth />
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
                            path="/admin/e2e-verify"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <AdminE2eVerify />
                              </Suspense>
                            }
                          />
                          <Route
                            path="/admin/stripe-test-checkout"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <StripeTestCheckoutPage />
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
                            path="/go/:slug"
                            element={
                              <Suspense fallback={<RouteLoader />}>
                                <PinterestDynamicLanding />
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
                          {/* /bestseller/:slug → redirect to /products/:slug for canonical URL consolidation */}
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
                            path="/best-dog-toys"
                            element={<Suspense fallback={<RouteLoader />}><BestDogToysLander /></Suspense>}
                          />
                          <Route
                            path="/best-cat-trees"
                            element={<Suspense fallback={<RouteLoader />}><BestCatTreesLander /></Suspense>}
                          />
                          <Route
                            path="/best-cat-litter-boxes"
                            element={<Suspense fallback={<RouteLoader />}><BestCatLitterBoxesLander /></Suspense>}
                          />
                          <Route
                            path="/best-dog-beds"
                            element={<Suspense fallback={<RouteLoader />}><BestDogBedsLander /></Suspense>}
                          />
                          <Route
                            path="/best-dog-collars"
                            element={<Suspense fallback={<RouteLoader />}><BestDogCollarsLander /></Suspense>}
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
                          <Route path="/collections" element={<Navigate to="/collections/all" replace />} />
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
                              path="test-payment"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TestPaymentPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="sms-alerts"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SmsAlertsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pre-wave-live"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PreWaveLivePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="first-sale"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FirstSaleAcceleratorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="conversion-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ConversionIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="conversion-war-room"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ConversionWarRoomPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="conversion-commander"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ConversionCommanderPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pdp-atc-drilldown"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PdpAtcDrilldownPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="genesis-prc"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisPrcPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-revenue-control"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRevenueControlPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="winner-discovery"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductWinnerDiscoveryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-scaling"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestScalingPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-command-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="arie"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ArieCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-director"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthDirectorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="meta-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MetaIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="governance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GovernancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="aos"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AosCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="business-dna"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BusinessDnaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="customer-psychology"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CustomerPsychologyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="creative-dna"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CreativeDnaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="analytics-dna"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AnalyticsDnaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductIntelligenceDnaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="market-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MarketIntelligenceDnaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="knowledge-graph"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <KnowledgeGraphPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="executive"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ExecutiveDecisionPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="experiments"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ExperimentationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-optimization"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueOptimizationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="strategy"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <StrategicPlanningPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="company"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiCompanyOsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="architecture"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ArchitecturePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="production"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductionExcellencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="conversion-integrity"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ConversionIntegrityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="conversion-reality"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ConversionRealityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="canonical-analytics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CanonicalAnalyticsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-recovery"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueRecoveryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="traffic-command-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TrafficCommandCenter />
                                </Suspense>
                              }
                            />
                            <Route
                              path="payments"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AdminPaymentsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="webhook-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <WebhookHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="smoke-test-events"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AdminSmokeTestEventsPage />
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
                              path="cro-command-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CroCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="analytics-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AnalyticsHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="attribution-compare"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AttributionComparePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="visitor-timeline"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <VisitorTimelinePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="visitor-timeline/:sessionId"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <VisitorTimelinePage />
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
                              path="ai-revenue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiRevenuePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-creatives"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiCreativesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-seo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiSeoPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-executive"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiExecutivePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="hero-products"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <HeroProductsPage />
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
                              path="profit-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProfitEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pdp-conversion"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PdpConversionDashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="render-forensics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RenderForensicsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="worker"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <WorkerRecoveryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="profit-engine/trends"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProfitEngineTrendsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="homepage-ai"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <HomepageAiPage />
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
                              path="vault"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisVaultPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="evidence-vault"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EvidenceVaultPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="vault-v14"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FinancialEvidenceVaultPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cfo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CFOChatPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cfo-reports"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CFOReportLibraryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="war-room-v1"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisWarRoomV1Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="omega"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisOmegaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="omega-architect"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisOmegaArchitectPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="genome"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisGenomePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="omega-truth"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisOmegaTruthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="boardroom"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisBoardroomPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="boardroom-v5"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisBoardroomV5Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="digital-company"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisDigitalCompanyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="perpetual-company"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisPerpetualCompanyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="enterprise-twin"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GenesisEnterpriseTwinPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="finance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FinanceIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="financial-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FinancialHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ceo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CEOCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="accountant"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AccountantPortalPage />
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
                              path="growth-command"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthCommandPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-command-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="traffic-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TrafficIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-intelligence-v3"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductIntelligenceV3Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-growth-v3"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestGrowthV3Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="media-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MediaIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="creative-command"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CreativeCommandPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="creative-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CreativeIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-credit-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiCreditIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-scorecard-v13"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueScorecardV13Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="sales-readiness"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SalesReadinessPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="business-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BusinessHealthIndexPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="mission-control"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MissionControlPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="evidence-explorer"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EvidenceExplorerPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="executive-war-room"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ExecutiveWarRoomPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="decision-outcomes"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DecisionOutcomesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-war-room"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueWarRoomPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="us-traffic-campaign"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <UsTrafficCampaignPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-attribution-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueAttributionCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="customer-journey-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CustomerJourneyCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="recovery-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RecoveryCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pcie-v2-revenue-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PcieV2RevenueIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="autonomous-growth"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AutonomousGrowthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="autonomous-commerce"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AutonomousCommercePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="commander"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CommanderPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="commander-foundation"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CommanderFoundationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="market-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MarketIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="market-intelligence/changelog"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MarketIntelligenceChangelogPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-market-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestMarketIntelligencePage />
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
                              path="cinematic-ads"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdsControlCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-ad-studio"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestAdStudio />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cj-inventory"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CjInventorySync />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cj-inventory-sync"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CjInventorySync />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cj-video-diagnostic"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CjVideoDiagnostic />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cj-health-check"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CjHealthCheck />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cj-sync-report"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CjSyncReport />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cj-sync"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CjSyncReport />
                                </Suspense>
                              }
                            />
                            <Route
                              path="render-budget"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RenderBudgetDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/:jobId/qa"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdQaSummaryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/legacy"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v3"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV3QaPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v3-dispatcher"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV3DispatcherPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="canonical-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CanonicalHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="analytics-truth"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AnalyticsTruthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v4-review"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV4ReviewPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v3-repair"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV3RepairPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-runway"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicRunwayPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/dashboard"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdsDashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/preview/:jobId"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdPreviewPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/one-job-verify"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicOneJobVerifyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/queue-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicQueueHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-ads/motion-forensics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicMotionForensicsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-recovery"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRecoveryStatusPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-credit-protection"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCreditProtectionPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-gateway-credits"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiGatewayCreditsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-trace-explorer"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiTraceExplorerPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-performance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicPerformanceMetricsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-cleanup"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCleanupPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-quality"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestQualityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="lifestyle-engine-v3"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <LifestyleEngineV3Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="feed-issues-queue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FeedIssuesQueuePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="score-calibration"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ScoreCalibrationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-priority-report"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenuePriorityReportPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-priority-remediation"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenuePriorityRemediationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="deploy-status"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DeployStatusPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="guardian"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GuardianDashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="self-healing"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SelfHealingPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="founder-review"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FounderReviewPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-recovery"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRecoveryDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="creative-intelligence-layer"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CreativeIntelligenceLayerPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="evolution-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EvolutionEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="evolution-engine-phase2"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EvolutionEnginePhase2Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="command-center-2"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CommandCenter2Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-pin-source-audit"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestPinSourceAuditPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-video-destination-audit"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestVideoDestinationAudit />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-traffic-forensics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestTrafficForensicsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-distribution"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestDistributionPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="content-product-audit"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ContentProductAudit />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v3-library"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV3Library />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v3-quality-audit"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV3QualityAudit />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v4-jobs"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV4Jobs />
                                </Suspense>
                              }
                            />
                            <Route
                              path="cinematic-v4-quality-gate"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicV4QualityGate />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-stock-status"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestStockStatusPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="github-sync"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GitHubSyncStatusPage />
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
                              path="pinterest-commerce-intel"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCommerceIntelPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-autopilot"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestAutoPilotPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-autopilot-daily"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestAutopilotDailyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-pin-status"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestPinStatusPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pin-queue-breakdown"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinQueueBreakdownPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="media-quality"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MediaQualityDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-url-recovery"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestUrlRecoveryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-redirect-map"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRedirectMapPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-pin-performance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestPinPerformancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-pin-attribution"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestPinAttributionPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-product-conversion"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestProductConversionPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-growth"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestGrowthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="execution-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ExecutionCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-commander"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthCommanderPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="sales-commander"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <SalesCommanderPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="ai-ceo"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AiCeoPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-orchestrator"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthOrchestratorPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="growth-lab"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <GrowthLabPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="organic-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <OrganicIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="organic-intelligence-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <OrganicIntelligenceEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="organic-domination"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <OrganicDominationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="organic-first"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <OrganicFirstPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="organic-confidence-config"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <OrganicConfidenceConfigPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-brain"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestBrainPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-spy"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestSpyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pmin"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PminPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-brain"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueBrainPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pie"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PieEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="evolution-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EvolutionIntelligencePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-report"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueReportPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-integrity"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestIntegrityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="visual-product-integrity"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <VisualProductIntegrityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-identity-graph"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductIdentityGraphPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-warmup"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestWarmupPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-video-queue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestVideoQueuePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-video-autopilot"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestVideoAutopilotDashboard />
                                </Suspense>
                              }
                            />
                            {/* Alias: /admin/pinterest/video-queue */}
                            <Route
                              path="pinterest/video-queue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestVideoQueuePage />
                                </Suspense>
                              }
                            />
                            {/* Alias: /admin/cinematic → control center */}
                            <Route
                              path="cinematic"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdsControlCenterPage />
                                </Suspense>
                              }
                            />
                            {/* Alias: /admin/cinematic/preview/:jobId */}
                            <Route
                              path="cinematic/preview/:jobId"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CinematicAdPreviewPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-video-logs"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestVideoLogsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-patterns"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestPatternsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-intelligence"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestIntelligence />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-control-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestControlCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pqif-v4"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PqifV4Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-creative-intel-v2"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCreativeIntelV2Page />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-growth-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestGrowthEnginePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-generic-niche"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestGenericNichePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-niche-coverage"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestNicheCoveragePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-diversity"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductDiversityPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-niche-rules"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestNicheRulesPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="rejected-spam-events"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RejectedSpamEventsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="bot-traffic"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BotTrafficDrilldownPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-backdrop-preview"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestBackdropPreviewPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestHealth />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-enterprise-control-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestEnterpriseControlCenter />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-growth-ai"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestGrowthAI />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-revenue-ai"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRevenueAi />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-revenue-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRevenueEngine />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-revenue-engine-v2"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRevenueEngineV2 />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-revenue-v4"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRevenueV4 />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-profit-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestProfitCenter />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-ai"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueAiPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-live-pin-repair"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestLivePinRepair />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-conversion-monitor"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestConversionMonitor />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-cleanup"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCleanup />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-products"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestProducts />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-scheduler"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestSchedulerPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-pin-queue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestPinQueuePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-cost"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCostDashboard />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-live-cycle"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestLiveCyclePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-ops"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestOpsDashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-command-center"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCommandCenterPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-capi"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestCapiHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-trends"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestTrendsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-revenue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestRevenuePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="pinterest-attribution-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <PinterestAttributionHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueCommandCenter />
                                </Suspense>
                              }
                            />
                            <Route
                              path="revenue-engine"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <RevenueCommandCenter />
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
                              path="utm-conversion-events"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <UtmConversionEventsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tracking-alerts-history"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TrackingAlertsHistoryPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="monitoring-runs"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <MonitoringRunsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="events-live"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <EventsLivePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="funnel-by-source"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FunnelBySourcePage />
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
                              path="tiktok-pixel-verify"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokPixelVerifyPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-server-events"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokServerEventsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tiktok-credentials-status"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TikTokCredentialsStatusPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="checkout-funnel"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CheckoutFunnelEventsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="funnel-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FunnelHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="production-validation"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductionValidationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="production-safety"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductionSafetyCertificationPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="live-events"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <LiveEventsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="atc-analytics"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <AtcAnalyticsPanelPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="bot-threshold"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <BotThresholdReportPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="clean-kpi"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <CleanKpiDashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="degraded-events"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <DegradedEventsPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="funnel"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <FunnelDashboardPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="product-stock-audit"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductStockAuditPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="products-performance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ProductsPerformancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="traffic-performance"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TrafficPerformancePage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="tracking-health"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <TrackingHealthPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="conversion-dashboard"
                              element={
                                <Suspense fallback={<RouteLoader />}>
                                  <ConversionDashboardPage />
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
