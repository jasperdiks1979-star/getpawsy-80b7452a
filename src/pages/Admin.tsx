import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { Helmet } from 'react-helmet-async';
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Plus, Package, RefreshCw, Check, Loader2, ShieldAlert, PawPrint, ChevronLeft, ChevronRight, CloudDownload, Clock, Pencil, AlertTriangle, Mail, FolderTree, Trash2, Ban, ShoppingCart, BarChart3, MessageSquare, Euro, Sparkles, Globe, Eye, CheckSquare, Square, Power, PowerOff, Bookmark, BookmarkCheck, GitCompare, ChevronDown, Link, FileText, Bell, Send, Target, Magnet, Wrench, History, Copy, Truck, Upload, Star, LineChart, Zap, TrendingUp, Brain, Stethoscope } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

// Brand glyphs (lucide doesn't ship TikTok/Pinterest icons).
const TikTokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M16.5 3a5.5 5.5 0 0 0 5.5 5.5v3a8.5 8.5 0 0 1-5-1.6v6.6a6.5 6.5 0 1 1-6.5-6.5c.34 0 .68.03 1 .08v3.1a3.5 3.5 0 1 0 2.5 3.32V3h2.5z"/>
  </svg>
);
const PinterestIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 2a10 10 0 0 0-3.64 19.31c-.09-.78-.17-1.98.04-2.83.18-.74 1.16-4.7 1.16-4.7s-.3-.6-.3-1.48c0-1.39.8-2.42 1.81-2.42.85 0 1.27.64 1.27 1.41 0 .86-.55 2.15-.83 3.34-.24 1 .5 1.82 1.49 1.82 1.78 0 3.15-1.88 3.15-4.59 0-2.4-1.73-4.08-4.19-4.08-2.85 0-4.53 2.14-4.53 4.36 0 .86.33 1.79.74 2.29.08.1.09.19.07.29l-.27 1.1c-.04.18-.14.22-.33.13-1.21-.56-1.96-2.32-1.96-3.74 0-3.04 2.21-5.84 6.37-5.84 3.34 0 5.94 2.38 5.94 5.57 0 3.32-2.1 6-5.01 6-.98 0-1.9-.51-2.21-1.11l-.6 2.3c-.22.84-.81 1.89-1.2 2.53A10 10 0 1 0 12 2z"/>
  </svg>
);

const TIKTOK_SHORTCUTS: { to: string; label: string }[] = [
  { to: '/admin/tiktok-automation', label: 'TikTok Automation' },
  { to: '/admin/tiktok-ads-performance', label: 'Ads Performance' },
  { to: '/admin/tiktok-realtime-funnel', label: 'Realtime Funnel' },
  { to: '/admin/tiktok-funnel-report', label: 'Funnel Report' },
  { to: '/admin/tiktok-funnel-debug', label: 'Funnel Debug' },
  { to: '/admin/tiktok-cta-ctr', label: 'CTA CTR' },
  { to: '/admin/tiktok-excluded-sessions', label: 'Excluded Sessions' },
  { to: '/admin/tiktok-session-decision-log', label: 'Session Decision Log' },
  { to: '/admin/tiktok-status', label: 'Status' },
  { to: '/admin/tiktok-config', label: 'Config' },
  { to: '/admin/tiktok-config-checklist', label: 'Config Checklist' },
  { to: '/admin/tiktok-credentials-status', label: 'Credentials Status' },
  { to: '/admin/tiktok-pixel-verify', label: 'Pixel Verify' },
  { to: '/admin/tiktok-server-events', label: 'Server Events' },
  { to: '/admin/tiktok-test-users', label: 'Test Users' },
];
const PINTEREST_SHORTCUTS: { to: string; label: string }[] = [
  // Core dashboards
  { to: '/admin/pinterest-autopilot', label: 'AutoPilot' },
  { to: '/admin/pinterest-automation', label: 'Automation' },
  { to: '/admin/pinterest-scale', label: 'Scale Mode' },
  { to: '/admin/pinterest-traffic', label: 'Traffic Machine' },
  { to: '/admin/pinterest-commerce-intel', label: 'Commerce Intel' },
  { to: '/admin/profit-engine', label: 'Profit Engine' },
  // Pin lifecycle
  { to: '/admin/pinterest-pin-status', label: 'Pin Status' },
  { to: '/admin/pinterest-video-queue', label: 'Video Queue' },
  { to: '/admin/pinterest-video-logs', label: 'Video Logs' },
  // Creative & niche
  { to: '/admin/pinterest-patterns', label: 'Patterns' },
  { to: '/admin/pinterest-generic-niche', label: 'Generic Niche' },
  { to: '/admin/pinterest-niche-coverage', label: 'Niche Coverage' },
  { to: '/admin/pinterest-niche-rules', label: 'Niche Rules' },
  { to: '/admin/pinterest-backdrop-preview', label: 'Backdrop Preview' },
];
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ProductEditDialog } from "@/components/admin/ProductEditDialog";
import { CJProductPreview } from "@/components/admin/CJProductPreview";
import { ProductCompareDialog } from "@/components/admin/ProductCompareDialog";
import { URLProductImport } from "@/components/admin/URLProductImport";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load ALL heavy admin tab components to improve initial load time
const AnalyticsDashboard = lazy(() => import("@/components/admin/AnalyticsDashboard").then(module => ({ default: module.AnalyticsDashboard })));
const SalesDashboard = lazy(() => import("@/components/admin/SalesDashboard").then(module => ({ default: module.SalesDashboard })));
const GoogleAdsGenerator = lazy(() => import("@/components/admin/GoogleAdsGenerator").then(module => ({ default: module.GoogleAdsGenerator })));
const VisitorWorldMap = lazy(() =>
  import("@/components/admin/VisitorWorldMap")
    .then((module) => {
      console.log("[VisitorWorldMap] chunk loaded successfully");
      return { default: module.VisitorWorldMap };
    })
    .catch((err) => {
      console.error("[VisitorWorldMap] chunk failed to load:", err);
      throw err;
    })
);
const NewsletterSubscribers = lazy(() => import("@/components/admin/NewsletterSubscribers").then(module => ({ default: module.NewsletterSubscribers })));
const CategoryManager = lazy(() => import("@/components/admin/CategoryManager").then(module => ({ default: module.CategoryManager })));
const CategoryOrderManager = lazy(() => import("@/components/admin/CategoryOrderManager").then(module => ({ default: module.CategoryOrderManager })));
const ProductRecategorizer = lazy(() => import("@/components/admin/ProductRecategorizer").then(module => ({ default: module.ProductRecategorizer })));
const OrdersManager = lazy(() => import("@/components/admin/OrdersManager").then(module => ({ default: module.OrdersManager })));
const ContactMessagesManager = lazy(() => import("@/components/admin/ContactMessagesManager").then(module => ({ default: module.ContactMessagesManager })));
const BestsellerManager = lazy(() => import("@/components/admin/BestsellerManager").then(module => ({ default: module.BestsellerManager })));
const BlogPostsManager = lazy(() => import("@/components/admin/BlogPostsManager").then(module => ({ default: module.BlogPostsManager })));
const AbandonedCartsManager = lazy(() => import("@/components/admin/AbandonedCartsManager").then(module => ({ default: module.AbandonedCartsManager })));
const StockNotificationsManager = lazy(() => import("@/components/admin/StockNotificationsManager").then(module => ({ default: module.StockNotificationsManager })));
const EmailCampaignManager = lazy(() => import("@/components/admin/EmailCampaignManager").then(module => ({ default: module.EmailCampaignManager })));
const RemarketingDashboard = lazy(() => import("@/components/admin/RemarketingDashboard").then(module => ({ default: module.RemarketingDashboard })));
const LeadMagnetAnalytics = lazy(() => import("@/components/admin/LeadMagnetAnalytics").then(module => ({ default: module.LeadMagnetAnalytics })));
const VariantDataValidator = lazy(() => import("@/components/admin/VariantDataValidator"));
const VariantFixLogs = lazy(() => import("@/components/admin/VariantFixLogs"));
const ErrorLogsManager = lazy(() => import("@/components/admin/ErrorLogsManager"));
const DuplicateProductsDetector = lazy(() => import("@/components/admin/DuplicateProductsDetector"));
const DisputeManager = lazy(() => import("@/components/admin/DisputeManager"));
const CJWebhookManager = lazy(() => import("@/components/admin/CJWebhookManager"));
const PackagingManager = lazy(() => import("@/components/admin/PackagingManager"));
const WarehouseShippingAudit = lazy(() => import("@/components/admin/WarehouseShippingAudit"));
const OosResyncAudit = lazy(() => import("@/components/admin/OosResyncAudit"));
const KeywordRankingTracker = lazy(() => import("@/components/admin/KeywordRankingTracker").then(module => ({ default: module.KeywordRankingTracker })));
const RunCenterCard = lazy(() => import("@/components/admin/RunCenterCard").then(module => ({ default: module.RunCenterCard })));
const RunAllControls = lazy(() => import("@/components/admin/RunAllControls").then(module => ({ default: module.RunAllControls })));
const SupplierImportManager = lazy(() => import("@/components/admin/SupplierImportManager").then(module => ({ default: module.SupplierImportManager })));
const ABTestDashboard = lazy(() => import("@/components/admin/ABTestDashboard"));
const GrowthAnalyticsDashboard = lazy(() => import("@/components/admin/GrowthAnalyticsDashboard"));
const ReviewModerationManager = lazy(() => import("@/components/admin/ReviewModerationManager").then(module => ({ default: module.ReviewModerationManager })));
const AdvancedVisitorStatsWidget = lazy(() => import("@/components/admin/widgets/AdvancedVisitorStatsWidget").then(module => ({ default: module.AdvancedVisitorStatsWidget })));
const PinterestTrafficWidget = lazy(() => import("@/components/admin/widgets/PinterestTrafficWidget").then(module => ({ default: module.PinterestTrafficWidget })));
const PinterestAdsWidget = lazy(() => import("@/components/admin/widgets/PinterestAdsWidget").then(module => ({ default: module.PinterestAdsWidget })));
const CompetitorGapWidget = lazy(() => import("@/components/admin/widgets/CompetitorGapWidget").then(module => ({ default: module.CompetitorGapWidget })));
const SerpCoverageWidget = lazy(() => import("@/components/admin/widgets/SerpCoverageWidget").then(module => ({ default: module.SerpCoverageWidget })));
const ZeroClickWidget = lazy(() => import("@/components/admin/widgets/ZeroClickWidget").then(module => ({ default: module.ZeroClickWidget })));
const StrategyAdaptationWidget = lazy(() => import("@/components/admin/widgets/StrategyAdaptationWidget").then(module => ({ default: module.StrategyAdaptationWidget })));
const CompetitorIntelWidget = lazy(() => import("@/components/admin/widgets/CompetitorIntelWidget").then(module => ({ default: module.CompetitorIntelWidget })));
const BacklinkHeatmapWidget = lazy(() => import("@/components/admin/widgets/BacklinkHeatmapWidget").then(module => ({ default: module.BacklinkHeatmapWidget })));
const RevenueOptimizerWidget = lazy(() => import("@/components/admin/widgets/RevenueOptimizerWidget").then(module => ({ default: module.RevenueOptimizerWidget })));
const MarketTakeoverWidget = lazy(() => import("@/components/admin/widgets/MarketTakeoverWidget").then(module => ({ default: module.MarketTakeoverWidget })));
const AutonomousGrowthDashboard = lazy(() => import("@/components/admin/widgets/AutonomousGrowthDashboard"));
const AGMStabilityDashboard = lazy(() => import("@/components/admin/widgets/AGMStabilityDashboard"));
const GuideVisibilityWidget = lazy(() => import("@/components/admin/widgets/GuideVisibilityWidget"));
import { TrafficReportDownload } from "@/components/admin/TrafficReportDownload";
import { AdminManualDownload } from "@/components/admin/AdminManualDownload";
import { ProductCsvExport } from "@/components/admin/ProductCsvExport";
import { MiniKPIWidget } from "@/components/admin/MiniKPIWidget";
import { MapLoadingFallback } from "@/components/admin/MapLoadingFallback";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TouchTooltip, TooltipProvider } from "@/components/ui/tooltip";
import { AuthErrorBoundary } from "@/components/auth/AuthErrorBoundary";
import { SectionErrorBoundary } from "@/components/ui/section-error-boundary";
import { SyncProgressIndicator, type SyncProgress } from "@/components/admin/SyncProgressIndicator";
import { useRetryWithBackoff } from "@/hooks/useRetryWithBackoff";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RateLimitTimer } from "@/components/RateLimitTimer";
import { calculateSellingPrice } from "@/lib/pricing";

// Maximum number of products that can be imported at once
const MAX_BATCH_SIZE = 15;

interface CJProduct {
  pid: string;
  productNameEn: string;
  productImage: string;
  productWeight: number;
  categoryName: string;
  sellPrice: number;
  productSku: string;
  description?: string;
}

interface CJResponse {
  result: boolean;
  code: number;
  data: {
    list: CJProduct[];
    total: number;
  };
}

const Admin = () => {
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const { invokeFunction } = useAuthenticatedFetch();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogKeyword, setCatalogKeyword] = useState("all");
  const [customSearchTerm, setCustomSearchTerm] = useState("");
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [editProduct, setEditProduct] = useState<Tables<"products"> | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; status: string; startTime?: number } | null>(null);
  const [batchWarningOpen, setBatchWarningOpen] = useState(false);
  const [pendingImportProducts, setPendingImportProducts] = useState<CJProduct[]>([]);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [myProductsSearch, setMyProductsSearch] = useState("");
  const [myProductsCategoryFilter, setMyProductsCategoryFilter] = useState<string>("all");
  const [myProductsStatusFilter, setMyProductsStatusFilter] = useState<string>("all");
  const [selectedMyProducts, setSelectedMyProducts] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<CJProduct | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(() => {
    const saved = localStorage.getItem('admin-preview-enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [compareProducts, setCompareProducts] = useState<CJProduct[]>([]);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [refreshMode, setRefreshMode] = useState<"all" | "new-only">("all");
  const [activeTab, setActiveTab] = useState("sales");
  const [syncStockProgress, setSyncStockProgress] = useState<SyncProgress | null>(null);

  // Prefetch the heavy Mapbox chunk + token while the admin is browsing other tabs,
  // so the visitor world map opens near-instantly.
  useEffect(() => {
    if (!isAdmin) return;
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window
        ? (window as any).requestIdleCallback(cb, { timeout: 3000 })
        : setTimeout(cb, 1500);
    idle(() => {
      // Warm the lazy chunk
      import("@/components/admin/VisitorWorldMap").catch(() => {});
      // Warm the mapbox token cache (response is cached by edge)
      supabase.functions.invoke("get-mapbox-token").catch(() => {});
    });
  }, [isAdmin]);
  const [fixPricesProgress, setFixPricesProgress] = useState<SyncProgress | null>(null);
  const queryClient = useQueryClient();
  
  // Retry hook for sync operations
  const { executeWithRetry } = useRetryWithBackoff({ maxRetries: 3, baseDelayMs: 2000 });

  // Save preview preference to localStorage
  useEffect(() => {
    localStorage.setItem('admin-preview-enabled', String(previewEnabled));
  }, [previewEnabled]);

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch blocked CJ products
  const { data: blockedProducts } = useQuery({
    queryKey: ["blocked-cj-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_cj_products")
        .select("cj_product_id");
      if (error) throw error;
      return new Set(data?.map(p => p.cj_product_id) || []);
    },
  });

  // Fetch bookmarked CJ products
  const { data: bookmarkedProducts, refetch: refetchBookmarks } = useQuery({
    queryKey: ["cj-bookmarks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cj_product_bookmarks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user && isAdmin,
  });

  // Memoize bookmarked CJ product IDs for efficient lookup
  const bookmarkedCjIds = useMemo(() => {
    return new Set(bookmarkedProducts?.map(p => p.cj_product_id) || []);
  }, [bookmarkedProducts]);

  // Fetch existing products from database
  const { data: existingProducts, isSuccess: existingProductsLoaded } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Memoize imported CJ product IDs for efficient filtering
  const importedCjIds = useMemo(() => {
    return new Set(existingProducts?.map(p => p.cj_product_id).filter(Boolean) || []);
  }, [existingProducts]);

  // Count products that need refresh (new products with ≤1 image)
  const newProductsCount = useMemo(() => {
    return existingProducts?.filter(p => {
      const imagesArray = Array.isArray(p.images) ? p.images : [];
      return p.cj_product_id && imagesArray.length <= 1;
    }).length || 0;
  }, [existingProducts]);

  // Search CJ products
  const { data: cjProducts, isLoading: isSearching, refetch: searchProducts } = useQuery({
    queryKey: ["cj-search", searchTerm, Array.from(importedCjIds)],
    queryFn: async (): Promise<CJProduct[]> => {
      if (!searchTerm) return [];
      
      const { data, error } = await invokeFunction<CJResponse>("cj-dropshipping", {
        body: {
          action: "search-products",
          keyword: searchTerm,
          pageSize: 50,
        },
      });

      if (error) throw error;
      
      const response = data as CJResponse;
      if (!response.result) {
        throw new Error(`CJ API error: ${response.code}`);
      }
      
      // Filter out already imported products and blocked products
      const allProducts = response.data?.list || [];
      return allProducts.filter((p: CJProduct) => !importedCjIds.has(p.pid) && !blockedProducts?.has(p.pid));
    },
    enabled: false,
  });

  // Pet Catalog Query
  const { 
    data: petCatalogData, 
    isLoading: isCatalogLoading, 
    refetch: refetchCatalog,
    isError: catalogError,
    error: catalogErrorData
  } = useQuery({
    queryKey: ["pet-catalog", catalogPage, catalogKeyword, Array.from(importedCjIds)],
    queryFn: async () => {
      const { data, error } = await invokeFunction<CJResponse & { error?: string; data: { originalTotal?: number; list: CJProduct[]; total: number } }>("cj-dropshipping", {
        body: {
          action: "pet-search",
          keyword: catalogKeyword,
          pageNum: catalogPage,
          pageSize: 50,
        },
      });

      if (error) throw error;
      
      // Check for rate limit error
      if (data?.error?.includes("rate limit")) {
        setIsRateLimited(true);
        throw new Error(data.error);
      }
      
      // Clear rate limit if successful
      setIsRateLimited(false);
      
      const response = data as CJResponse & { data: { originalTotal?: number } };
      if (!response.result) {
        // Check if error message indicates rate limit
        if (response.code === 1600200 || data?.error?.includes("rate limit")) {
          setIsRateLimited(true);
        }
        throw new Error(`CJ API error: ${response.code}`);
      }
      
      // Filter out already imported products and blocked products using memoized set
      const allProducts = response.data?.list || [];
      const filteredProducts = allProducts.filter((p: CJProduct) => !importedCjIds.has(p.pid) && !blockedProducts?.has(p.pid));
      
      return {
        products: filteredProducts,
        total: filteredProducts.length,
        originalTotal: response.data?.total || 0,
        hiddenCount: allProducts.length - filteredProducts.length,
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't auto-retry on rate limit errors
    refetchOnWindowFocus: false, // Prevent refetch on window focus
  });

  // Generate SEO text for a product
  const generateSeoForProduct = async (productName: string, category: string) => {
    const { data, error } = await invokeFunction<{ description?: string }>("generate-seo-text", {
      body: { productName, category },
    });
    if (error) throw error;
    return data?.description || "";
  };

  // Import products mutation - fetches full details including all images, variants, and stock
  // Uses dynamic pricing with shipping included and psychological price rounding
  // Now also generates SEO descriptions automatically with progress tracking
  const importMutation = useMutation({
    mutationFn: async (products: CJProduct[]) => {
      const productIds = products.map(p => p.pid);
      const total = products.length;
      
      // Track success/failure counts
      let successCount = 0;
      let seoSuccessCount = 0;
      let seoFailedCount = 0;
      const failedProducts: string[] = [];
      
      setImportProgress({ current: 0, total, status: "Fetching product details from CJ...", startTime: Date.now() });
      
      // Fetch full product details (all images, variants, stock) from CJ
      const { data: fullDetailsResponse, error: detailsError } = await invokeFunction<Array<{ pid: string; success: boolean; data?: { description?: string }; images?: string[]; variants?: unknown; totalStock?: number }>>("cj-dropshipping", {
        body: {
          action: "get-products-for-import",
          productIds: productIds,
        },
      });

      if (detailsError) {
        setImportProgress(null);
        throw detailsError;
      }

      const seoStartTime = Date.now();
      setImportProgress({ current: 0, total, status: "Generating SEO descriptions...", startTime: seoStartTime });
      
      // Process products sequentially to avoid rate limits and timeouts
      const productsToInsert = [];
      
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        
        setImportProgress(prev => ({ 
          current: i + 1, 
          total, 
          status: `Processing ${i + 1}/${total}: ${(p.productNameEn || 'Product').substring(0, 40)}...`,
          startTime: prev?.startTime || seoStartTime
        }));
        
        // Find full details for this product
        const fullDetail = fullDetailsResponse?.find((d: { pid: string; success: boolean; data?: { description?: string }; images?: string[]; variants?: unknown; totalStock?: number }) => d.pid === p.pid && d.success);
        
        // Deep flatten and deduplicate images - handles nested arrays
        const rawImages = fullDetail?.images || [p.productImage];
        const flattenDeep = (arr: unknown[]): string[] => {
          const result: string[] = [];
          for (const item of arr) {
            if (Array.isArray(item)) {
              result.push(...flattenDeep(item));
            } else if (typeof item === 'string' && item.startsWith('http')) {
              result.push(item);
            }
          }
          return result;
        };
        const images = [...new Set(flattenDeep(Array.isArray(rawImages) ? rawImages : [rawImages]))];
        
        // Get stock from full details or default
        const stock = fullDetail?.totalStock ?? 100;
        
        // Get description from full details (fallback for SEO generation)
        const originalDescription = fullDetail?.data?.description || p.description || "";
        
        // Generate SEO description
        let seoDescription = originalDescription;
        let seoGenerated = false;
        try {
          const category = selectedCategory === "auto" ? p.categoryName : (selectedCategory || p.categoryName);
          seoDescription = await generateSeoForProduct(p.productNameEn, category);
          seoGenerated = true;
          seoSuccessCount++;
        } catch (err) {
          console.error("SEO generation failed for", p.productNameEn, err);
          seoFailedCount++;
          // Keep original description if SEO generation fails
        }
        
        // Get realistic shipping time from CJ warehouse data
        let shippingTime = "5–10 business days"; // Default for US warehouse
        try {
          const shippingResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-warehouse-shipping`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'get-shipping-time', cjProductId: p.pid }),
            }
          );
          const shippingData = await shippingResponse.json();
          if (shippingData.success && shippingData.data?.recommendedShippingTime) {
            shippingTime = shippingData.data.recommendedShippingTime;
          }
        } catch (shippingErr) {
          console.error("Shipping time lookup failed for", p.productNameEn, shippingErr);
          // Keep default shipping time
        }
        
        // Get variants data and calculate selling prices for each variant
        const rawVariants = fullDetail?.variants || null;
        
        // Calculate price using dynamic pricing with shipping included
        // Parse sellPrice safely - it might be a range like "400-620"
        const parsedSellPrice = typeof p.sellPrice === 'string' 
          ? parseFloat(String(p.sellPrice).split('-')[0]) 
          : Number(p.sellPrice);
        const costPrice = isNaN(parsedSellPrice) ? 0 : parsedSellPrice;
        // Parse weight safely - handle ranges like "8500-9100"
        let parsedWeight: number;
        const weightStr = String(p.productWeight || '200');
        if (weightStr.includes('-')) {
          parsedWeight = parseFloat(weightStr.split('-')[0]) || 200;
        } else {
          parsedWeight = parseFloat(weightStr) || 200;
        }
        const weight = parsedWeight <= 0 ? 200 : parsedWeight;
        const pricing = calculateSellingPrice(costPrice, weight);

        // Process variants to calculate selling prices
        interface CJVariant {
          vid: string;
          pid: string;
          variantNameEn: string;
          variantSku: string;
          variantImage?: string;
          variantKey: string;
          variantWeight: number;
          variantSellPrice: number;
        }
        
        const processedVariants = rawVariants ? (rawVariants as CJVariant[]).map((variant: CJVariant) => {
          const variantCostPrice = Number(variant.variantSellPrice) || costPrice;
          const variantWeight = Number(variant.variantWeight) || weight;
          const variantPricing = calculateSellingPrice(variantCostPrice, variantWeight);
          
          return {
            ...variant,
            // Store original cost price for reference
            variantCostPrice: variantCostPrice,
            // Replace variantSellPrice with calculated selling price
            variantSellPrice: variantPricing.sellingPrice,
          };
        }) : null;

        productsToInsert.push({
          cj_product_id: p.pid,
          name: p.productNameEn,
          description: seoDescription,
          category: selectedCategory === "auto" ? p.categoryName : (selectedCategory || p.categoryName),
          image_url: p.productImage,
          images: images,
          price: pricing.sellingPrice,
          cost_price: pricing.totalCost,
          compare_at_price: pricing.compareAtPrice,
          sku: p.productSku,
          weight: weight,
          stock: stock,
          variants: processedVariants,
          is_active: true,
          supplier_name: "CJ Dropshipping",
          shipping_time: shippingTime,
        });
        
        // Small delay between SEO generations to avoid rate limiting
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      setImportProgress({ current: total, total, status: "Saving to database..." });

      const { data, error } = await supabase
        .from("products")
        .upsert(productsToInsert, { 
          onConflict: "cj_product_id",
          ignoreDuplicates: false 
        })
        .select();

      if (error) throw error;
      
      successCount = data?.length || 0;
      
      return { 
        products: data, 
        successCount, 
        seoSuccessCount, 
        seoFailedCount, 
        failedProducts,
        total 
      };
    },
    onSuccess: (result) => {
      setImportProgress(null);
      
      // Build detailed success message
      const details: string[] = [];
      details.push(`✅ ${result.successCount}/${result.total} products imported`);
      
      if (result.seoSuccessCount > 0) {
        details.push(`📝 ${result.seoSuccessCount} SEO descriptions generated`);
      }
      if (result.seoFailedCount > 0) {
        details.push(`⚠️ ${result.seoFailedCount} SEO generations failed (used original)`);
      }
      if (result.failedProducts.length > 0) {
        details.push(`❌ Failed: ${result.failedProducts.slice(0, 3).join(', ')}${result.failedProducts.length > 3 ? '...' : ''}`);
      }
      
      toast.success(
        <div className="space-y-1">
          <div className="font-semibold">Import Complete!</div>
          {details.map((detail, i) => (
            <div key={i} className="text-sm">{detail}</div>
          ))}
        </div>,
        { duration: 8000 }
      );
      
      setSelectedProducts(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      // Refetch catalog to update filtered list
      queryClient.invalidateQueries({ queryKey: ["pet-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["cj-search"] });
    },
    onError: (error) => {
      setImportProgress(null);
      toast.error(`Import failed: ${error.message}`);
    },
  });

  // Stock sync mutation with batch processing
  const syncStockMutation = useMutation({
    mutationFn: async () => {
      const estimatedTotal = existingProducts?.filter(p => p.cj_product_id).length || 0;
      
      // Set initial progress
      setSyncStockProgress({
        current: 0,
        total: estimatedTotal,
        status: 'syncing',
        currentItem: 'Verbinden met CJ Dropshipping...',
        synced: 0,
        errors: 0,
      });

      // First reset progress
      await invokeFunction("sync-stock", { body: { action: 'reset' } });

      let offset = 0;
      let hasMore = true;
      let totalSynced = 0;
      let totalErrors = 0;
      const allErrorMessages: string[] = [];

      // Process batches until done
      while (hasMore) {
        const { data, error } = await invokeFunction<{
          success: boolean;
          synced: number;
          errors: number;
          errorMessages?: string[];
          message: string;
          progress?: {
            current: number;
            total: number;
            status: string;
            hasMore: boolean;
          };
        }>("sync-stock", { body: { action: 'sync-batch', offset } });

        if (error) throw error;
        if (!data) throw new Error('No data returned from sync');

        totalSynced += data.synced || 0;
        totalErrors += data.errors || 0;
        if (data.errorMessages) {
          allErrorMessages.push(...data.errorMessages);
        }

        const progress = data.progress;
        hasMore = progress?.hasMore ?? false;
        offset = progress?.current ?? offset + 15;

        // Update UI progress
        setSyncStockProgress({
          current: progress?.current ?? offset,
          total: progress?.total ?? estimatedTotal,
          status: progress?.status === 'completed' ? 'completed' : 'syncing',
          currentItem: `Batch ${Math.ceil(offset / 15)} van ${Math.ceil((progress?.total ?? estimatedTotal) / 15)}...`,
          synced: totalSynced,
          errors: totalErrors,
        });

        // Small delay between batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return {
        success: totalErrors === 0,
        synced: totalSynced,
        errors: totalErrors,
        errorMessages: allErrorMessages,
        message: `Sync completed! ${totalSynced} products updated, ${totalErrors} errors.`,
      };
    },
    onMutate: () => {
      setSyncStockProgress({
        current: 0,
        total: existingProducts?.filter(p => p.cj_product_id).length || 0,
        status: 'syncing',
        currentItem: 'Starting...',
        synced: 0,
        errors: 0,
      });
    },
    onSuccess: (data) => {
      setSyncStockProgress({
        current: data?.synced || 0,
        total: data?.synced || 0,
        status: 'completed',
        synced: data?.synced || 0,
        errors: data?.errors || 0,
      });
      
      const hasErrors = (data?.errors || 0) > 0;
      if (hasErrors) {
        toast.warning(`Stock sync voltooid met ${data?.errors} fouten. ${data?.synced || 0} producten bijgewerkt.`);
      } else {
        toast.success(`Stock sync voltooid! ${data?.synced || 0} producten bijgewerkt.`);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      
      // Clear progress after 5 seconds
      setTimeout(() => setSyncStockProgress(null), 5000);
    },
    onError: (error) => {
      setSyncStockProgress(prev => prev ? {
        ...prev,
        status: 'error',
        currentItem: error.message,
      } : null);
      toast.error(`Stock sync mislukt: ${error.message}`);
      
      // Clear progress after 10 seconds on error
      setTimeout(() => setSyncStockProgress(null), 10000);
    },
  });

  // Fix variant prices mutation with retry logic
  const fixVariantPricesMutation = useMutation({
    mutationFn: async () => {
      // Set initial progress
      setFixPricesProgress({
        current: 0,
        total: existingProducts?.filter(p => p.variants && Array.isArray(p.variants) && p.variants.length > 0).length || 0,
        status: 'syncing',
        currentItem: 'Variant prijzen analyseren...',
        synced: 0,
        errors: 0,
      });

      // Execute with retry logic
      const result = await executeWithRetry(
        async () => {
          const { data, error } = await invokeFunction<{
            success: boolean;
            productsFixed: number;
            totalVariantsFixed: number;
            updatedProducts?: Array<{ id: string; name: string; variantCount: number }>;
            errors?: string[];
            message: string;
          }>("fix-variant-prices");

          if (error) throw error;
          return data;
        },
        {
          onRetry: (attempt, error, delayMs) => {
            setFixPricesProgress(prev => prev ? {
              ...prev,
              status: 'retrying',
              retryAttempt: attempt,
              maxRetries: 3,
              currentItem: `Retry ${attempt}/3: ${error.message.slice(0, 50)}...`,
            } : null);
            toast.warning(`Fix prices retry ${attempt}/3 na ${Math.round(delayMs / 1000)}s...`);
          },
          shouldRetry: (error) => {
            const msg = error.message.toLowerCase();
            return msg.includes('network') || msg.includes('timeout') || 
                   msg.includes('500') || msg.includes('503');
          },
        }
      );

      return result;
    },
    onMutate: () => {
      setFixPricesProgress({
        current: 0,
        total: existingProducts?.filter(p => p.variants && Array.isArray(p.variants) && p.variants.length > 0).length || 0,
        status: 'syncing',
        currentItem: 'Starting...',
        synced: 0,
        errors: 0,
      });
    },
    onSuccess: (data) => {
      setFixPricesProgress({
        current: data?.productsFixed || 0,
        total: data?.productsFixed || 0,
        status: 'completed',
        synced: data?.productsFixed || 0,
        errors: data?.errors?.length || 0,
      });
      
      const hasErrors = (data?.errors?.length || 0) > 0;
      if (hasErrors) {
        toast.warning(`Variant prijzen bijgewerkt met ${data?.errors?.length} fouten. ${data?.productsFixed || 0} producten, ${data?.totalVariantsFixed || 0} variants.`);
      } else {
        toast.success(`Variant prijzen bijgewerkt! ${data?.productsFixed || 0} producten, ${data?.totalVariantsFixed || 0} variants.`);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      
      // Clear progress after 5 seconds
      setTimeout(() => setFixPricesProgress(null), 5000);
    },
    onError: (error) => {
      setFixPricesProgress(prev => prev ? {
        ...prev,
        status: 'error',
        currentItem: error.message,
      } : null);
      toast.error(`Fix variant prices mislukt: ${error.message}`);
      
      // Clear progress after 10 seconds on error
      setTimeout(() => setFixPricesProgress(null), 10000);
    },
  });

  // Refresh all products - fetch missing images and data from CJ in batches
  // Supports "all" mode (all products) or "new-only" mode (products with missing/minimal images)
  const refreshAllProductsMutation = useMutation({
    mutationFn: async (mode: "all" | "new-only" = "all") => {
      // Get all products that have CJ product IDs
      let productsWithCJ = existingProducts?.filter(p => p.cj_product_id) || [];
      
      // If mode is "new-only", filter to only products with missing or minimal images
      if (mode === "new-only") {
        productsWithCJ = productsWithCJ.filter(p => {
          // Consider a product "new" if it has no images array, empty images, or only 1 image (the main one)
          const imagesArray = Array.isArray(p.images) ? p.images : [];
          return imagesArray.length <= 1;
        });
      }
      
      if (productsWithCJ.length === 0) {
        throw new Error(mode === "new-only" 
          ? "Geen nieuw geïmporteerde producten gevonden om bij te werken" 
          : "No CJ products to refresh");
      }

      const total = productsWithCJ.length;
      const BATCH_SIZE = 5; // Process 5 products at a time to avoid timeout
      let updated = 0;
      let errors = 0;

      setRefreshProgress({ current: 0, total, status: "Starting..." });

      // Process in batches
      for (let i = 0; i < productsWithCJ.length; i += BATCH_SIZE) {
        const batch = productsWithCJ.slice(i, i + BATCH_SIZE);
        const batchIds = batch.map(p => p.cj_product_id!);
        
        setRefreshProgress({ 
          current: i, 
          total, 
          status: `Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)}...` 
        });

        // Fetch full details for this batch from CJ
        const { data: fullDetailsResponse, error: detailsError } = await invokeFunction<Array<{ pid: string; success: boolean; images?: string[]; variants?: Array<unknown>; totalStock?: number }>>("cj-dropshipping", {
          body: {
            action: "get-products-for-import",
            productIds: batchIds,
          },
        });

        if (detailsError) {
          console.error(`Batch error:`, detailsError);
          errors += batch.length;
          continue;
        }

        // Update each product in this batch
        for (const product of batch) {
          const fullDetail = fullDetailsResponse?.find((d: { pid: string; success: boolean }) => 
            d.pid === product.cj_product_id && d.success
          );

          setRefreshProgress({ 
            current: updated + errors, 
            total, 
            status: `Updating: ${(product.name || 'Unknown product').substring(0, 30)}...` 
          });

          if (!fullDetail) {
            console.log(`No details found for ${product.name} (${product.cj_product_id})`);
            errors++;
            continue;
          }

          // Deep flatten and deduplicate images
          const rawImages = fullDetail.images || product.images || [];
          const flattenDeep = (arr: unknown[]): string[] => {
            const result: string[] = [];
            for (const item of arr) {
              if (Array.isArray(item)) {
                result.push(...flattenDeep(item));
              } else if (typeof item === 'string' && item.startsWith('http')) {
                result.push(item);
              }
            }
            return result;
          };
          const flatImages = [...new Set(flattenDeep(Array.isArray(rawImages) ? rawImages : [rawImages]))];
          
          console.log(`Updating ${product.name || 'Unknown'}: ${flatImages.length} images, ${fullDetail.variants?.length || 0} variants`);

          // Update product with new images and variants
          const { error: updateError } = await supabase
            .from("products")
            .update({
              images: flatImages,
              variants: (fullDetail.variants || product.variants) as unknown as null,
              stock: fullDetail.totalStock ?? product.stock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", product.id);

          if (updateError) {
            console.error(`Failed to update ${product.name || 'Unknown'}:`, updateError);
            errors++;
          } else {
            updated++;
          }
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setRefreshProgress(null);
      return { updated, errors, total };
    },
    onSuccess: (data) => {
      toast.success(`Refreshed ${data.updated}/${data.total} products! ${data.errors > 0 ? `(${data.errors} errors)` : ''}`);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (error) => {
      setRefreshProgress(null);
      toast.error(`Refresh failed: ${error.message}`);
    },
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);
      
      if (error) throw error;
      return productId;
    },
    onSuccess: () => {
      toast.success("Product succesvol verwijderd");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["pet-catalog"] });
      setDeleteDialogOpen(false);
      setDeleteProductId(null);
    },
    onError: (error) => {
      toast.error(`Verwijderen mislukt: ${error.message}`);
    },
  });

  // Bulk activate/deactivate products mutation
  const bulkToggleActiveMutation = useMutation({
    mutationFn: async ({ productIds, isActive }: { productIds: string[]; isActive: boolean }) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active: isActive })
        .in("id", productIds);
      
      if (error) throw error;
      return { count: productIds.length, isActive };
    },
    onSuccess: (data) => {
      toast.success(`${data.count} producten ${data.isActive ? 'geactiveerd' : 'gedeactiveerd'}`);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setSelectedMyProducts(new Set());
    },
    onError: (error) => {
      toast.error(`Bulk update mislukt: ${error.message}`);
    },
  });

  // Bulk delete products mutation
  const bulkDeleteProductsMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .in("id", productIds);
      
      if (error) throw error;
      return productIds.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} producten verwijderd`);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["pet-catalog"] });
      setSelectedMyProducts(new Set());
      setBulkDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Bulk verwijderen mislukt: ${error.message}`);
    },
  });

  // Block CJ product mutation
  const blockProductMutation = useMutation({
    mutationFn: async ({ cjProductId, productName }: { cjProductId: string; productName: string }) => {
      const { error } = await supabase
        .from("blocked_cj_products")
        .insert({ 
          cj_product_id: cjProductId, 
          product_name: productName,
          blocked_by: user?.id 
        });
      
      if (error) throw error;
      return cjProductId;
    },
    onSuccess: () => {
      toast.success("Product geblokkeerd en verborgen uit zoekresultaten");
      queryClient.invalidateQueries({ queryKey: ["blocked-cj-products"] });
      queryClient.invalidateQueries({ queryKey: ["pet-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["cj-search"] });
    },
    onError: (error) => {
      toast.error(`Blokkeren mislukt: ${error.message}`);
    },
  });

  // Bookmark CJ product mutation
  const bookmarkProductMutation = useMutation({
    mutationFn: async (product: CJProduct) => {
      const { error } = await supabase
        .from("cj_product_bookmarks")
        .insert({
          user_id: user?.id,
          cj_product_id: product.pid,
          product_name: product.productNameEn,
          product_image: product.productImage,
          sell_price: product.sellPrice,
          category_name: product.categoryName,
          product_weight: product.productWeight,
          product_sku: product.productSku,
        });
      
      if (error) throw error;
      return product.pid;
    },
    onSuccess: () => {
      toast.success("Product opgeslagen in bookmarks");
      queryClient.invalidateQueries({ queryKey: ["cj-bookmarks"] });
    },
    onError: (error) => {
      toast.error(`Bookmark mislukt: ${error.message}`);
    },
  });

  // Remove bookmark mutation
  const removeBookmarkMutation = useMutation({
    mutationFn: async (cjProductId: string) => {
      const { error } = await supabase
        .from("cj_product_bookmarks")
        .delete()
        .eq("cj_product_id", cjProductId)
        .eq("user_id", user?.id);
      
      if (error) throw error;
      return cjProductId;
    },
    onSuccess: () => {
      toast.success("Bookmark verwijderd");
      queryClient.invalidateQueries({ queryKey: ["cj-bookmarks"] });
    },
    onError: (error) => {
      toast.error(`Verwijderen mislukt: ${error.message}`);
    },
  });

  const handleToggleBookmark = (product: CJProduct) => {
    if (bookmarkedCjIds.has(product.pid)) {
      removeBookmarkMutation.mutate(product.pid);
    } else {
      bookmarkProductMutation.mutate(product);
    }
  };

  const handleToggleCompare = (product: CJProduct) => {
    setCompareProducts(prev => {
      const exists = prev.find(p => p.pid === product.pid);
      if (exists) {
        return prev.filter(p => p.pid !== product.pid);
      }
      if (prev.length >= 4) {
        toast.error("Je kunt maximaal 4 producten vergelijken");
        return prev;
      }
      return [...prev, product];
    });
  };

  const compareProductIds = useMemo(() => new Set(compareProducts.map(p => p.pid)), [compareProducts]);

  const handleBlockProduct = (cjProductId: string, productName: string) => {
    blockProductMutation.mutate({ cjProductId, productName });
  };

  const handleDeleteProduct = (productId: string) => {
    setDeleteProductId(productId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deleteProductId) {
      deleteProductMutation.mutate(deleteProductId);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      searchProducts();
    }
  };

  const toggleProduct = (pid: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(pid)) {
      newSelected.delete(pid);
    } else {
      newSelected.add(pid);
    }
    setSelectedProducts(newSelected);
  };

  const selectAll = () => {
    if (cjProducts) {
      setSelectedProducts(new Set(cjProducts.map((p) => p.pid)));
    }
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const handleImport = () => {
    if (!cjProducts) return;
    const productsToImport = cjProducts.filter((p) => selectedProducts.has(p.pid));
    if (productsToImport.length === 0) {
      toast.error("Please select products to import");
      return;
    }
    
    // Check if too many products selected
    if (productsToImport.length > MAX_BATCH_SIZE) {
      setPendingImportProducts(productsToImport);
      setBatchWarningOpen(true);
      return;
    }
    
    importMutation.mutate(productsToImport);
  };

  // Confirm batch import with first N products
  const handleConfirmBatchImport = (importAll: boolean = false) => {
    const productsToImport = importAll 
      ? pendingImportProducts 
      : pendingImportProducts.slice(0, MAX_BATCH_SIZE);
    importMutation.mutate(productsToImport);
    setBatchWarningOpen(false);
    setPendingImportProducts([]);
  };


  // Loading state
  if (authLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      </Layout>
    );
  }

  // Not logged in
  if (!user) {
    return null;
  }

  // Not admin
  if (!isAdmin) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You do not have permission to access this page. Admin access required.
          </p>
          <Button onClick={() => navigate('/')}>Go to Home</Button>
        </div>
      </Layout>
    );
  }

  const petCatalogProducts = petCatalogData?.products || [];

  // Catalog import handlers
  const handleCatalogImport = () => {
    const productsToImport = petCatalogProducts.filter((p: CJProduct) => selectedProducts.has(p.pid));
    if (productsToImport.length === 0) {
      toast.error("Please select products to import");
      return;
    }
    
    // Check if too many products selected
    if (productsToImport.length > MAX_BATCH_SIZE) {
      setPendingImportProducts(productsToImport);
      setBatchWarningOpen(true);
      return;
    }
    
    importMutation.mutate(productsToImport);
  };

  const selectAllCatalog = () => {
    setSelectedProducts(new Set(petCatalogProducts.map((p: CJProduct) => p.pid)));
  };

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              CJ Dropshipping Product Import
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MiniKPIWidget />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Package className="w-4 h-4 mr-2" />
              {existingProducts?.length || 0} products
            </Badge>
            <Suspense fallback={null}><RunAllControls /></Suspense>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TooltipProvider delayDuration={300}>
            <TabsList className="grid grid-cols-5 sm:grid-cols-7 lg:inline-flex gap-1 p-1 h-auto w-full lg:w-auto">
              <TouchTooltip content="Mijn winkelproducten beheren">
                <TabsTrigger value="products" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Products</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Bestellingen bekijken en beheren">
                <TabsTrigger value="orders" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Orders</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Achtergelaten winkelwagens">
                <TabsTrigger value="abandoned" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Abandoned</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Stock notificatie aanmeldingen">
                <TabsTrigger value="stock-notifications" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Bell className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Stock</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Nieuwsbrief abonnees">
                <TabsTrigger value="newsletter" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Mail</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Productcategorieën beheren">
                <TabsTrigger value="categories" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <FolderTree className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Cat.</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Website statistieken en analytics">
                <TabsTrigger value="analytics" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Stats</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Verkoop dashboard en omzet">
                <TabsTrigger value="sales" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Euro className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Sales</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="CJ Dropshipping catalogus">
                <TabsTrigger value="catalog" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <PawPrint className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">CJ</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Zoeken in CJ producten">
                <TabsTrigger value="search" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Zoek</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Contactberichten van klanten">
                <TabsTrigger value="messages" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Msg</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Google Ads generator">
                <TabsTrigger value="google-ads" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Ads</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Bestsellers beheren">
                <TabsTrigger value="bestsellers" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Best</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Bezoekersanalyse en statistieken">
                <TabsTrigger value="visitors" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Visitors</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Bezoekers wereldkaart">
                <TabsTrigger value="visitor-map" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Map</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Opgeslagen CJ producten">
                <TabsTrigger value="bookmarks" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Bookmark className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">{bookmarkedProducts?.length || 0}</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Importeer via URL">
                <TabsTrigger value="url-import" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Link className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">URL</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Blog posts beheren">
                <TabsTrigger value="blog" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Blog</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="E-mail campagnes versturen">
                <TabsTrigger value="campaigns" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Campagnes</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Remarketing statistieken bekijken">
                <TabsTrigger value="remarketing" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Remarketing</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Lead magnet conversie analytics">
                <TabsTrigger value="lead-magnets" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Magnet className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Leads</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Variant data validatie en fix tool">
                <TabsTrigger value="variant-validator" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Validator</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Logboek van variant fixes">
                <TabsTrigger value="variant-logs" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <History className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Fix Logs</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Frontend error logs">
                <TabsTrigger value="error-logs" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Error Logs</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Duplicaat producten detecteren">
                <TabsTrigger value="duplicates" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Duplicaten</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Klachten en terugbetalingen beheren">
                <TabsTrigger value="disputes" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Claims</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="CJ Webhook instellingen en logs">
                <TabsTrigger value="cj-webhooks" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Webhooks</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Branded packaging beheren">
                <TabsTrigger value="packaging" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Packaging</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="US Warehouse & USPS shipping audit">
                <TabsTrigger value="warehouse-audit" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Shipping</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Keyword rankings tracker (USA)">
                <TabsTrigger value="keywords" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Keywords</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="TopDawg & PetDropshipper CSV import">
                <TabsTrigger value="suppliers" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Suppliers</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="A/B Test Analytics & Rollout">
                <TabsTrigger value="ab-tests" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <GitCompare className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">A/B Tests</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Growth Analytics (AOV & Attach Rate)">
                <TabsTrigger value="growth" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Growth</span>
                </TabsTrigger>
              </TouchTooltip>


               {/* Internal Link Log */}
               <TouchTooltip content="Internal Link Injection Log & Health">
                 <button onClick={() => navigate('/admin/internal-link-log')} className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded transition-colors">
                   <Link className="w-3.5 h-3.5 shrink-0" />
                   <span className="hidden xs:inline">Links</span>
                 </button>
               </TouchTooltip>

               <TouchTooltip content="SEO Decision Engine - Monitoring & Alerts">
                 <button onClick={() => navigate('/admin/seo-dashboard')} className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded transition-colors">
                   <Zap className="w-3.5 h-3.5 shrink-0" />
                   <span className="hidden xs:inline">SEO Engine</span>
                 </button>
               </TouchTooltip>


              <TouchTooltip content="Guides SEO Dashboard & Rankings">
                <button onClick={() => navigate('/admin/guides')} className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded transition-colors">
                  <LineChart className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">SEO</span>
                </button>
              </TouchTooltip>
              <TouchTooltip content="Review moderatie">
                <TabsTrigger value="reviews" className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap">
                  <Star className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Reviews</span>
                </TabsTrigger>
              </TouchTooltip>
              <TouchTooltip content="Site Diagnostics & Export Bundle">
                <button onClick={() => navigate('/admin/diagnostics')} className="flex items-center gap-1 px-2 py-2 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded transition-colors">
                  <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Diagnostics</span>
                </button>
              </TouchTooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="TikTok shortcuts"
                    aria-label="TikTok shortcuts"
                    className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded transition-colors cursor-pointer"
                  >
                    <TikTokIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xs:inline">TikTok</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className="max-h-[70vh] overflow-y-auto w-60 z-50">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <TikTokIcon className="w-4 h-4" /> TikTok
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {TIKTOK_SHORTCUTS.map((s) => (
                    <DropdownMenuItem
                      key={s.to}
                      className="cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        navigate(s.to);
                      }}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Pinterest shortcuts"
                    aria-label="Pinterest shortcuts"
                    className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded transition-colors cursor-pointer"
                  >
                    <PinterestIcon className="w-3.5 h-3.5 shrink-0 text-[#E60023]" />
                    <span className="hidden xs:inline">Pinterest</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className="max-h-[70vh] overflow-y-auto w-60 z-50">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <PinterestIcon className="w-4 h-4 text-[#E60023]" /> Pinterest
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PINTEREST_SHORTCUTS.map((s) => (
                    <DropdownMenuItem
                      key={s.to}
                      className="cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        navigate(s.to);
                      }}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </TooltipProvider>
          <Suspense fallback={null}><RunCenterCard /></Suspense>
          <div className="flex flex-wrap gap-1 pb-1 -mt-4">
            <TouchTooltip content="SEO Command Center - Top 10 Assault & Gap Hunter">
              <button onClick={() => navigate('/admin/seo-command-center')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <Target className="w-3.5 h-3.5 shrink-0" />
                <span>SEO Command</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="12-Month Revenue Scaling Blueprint">
              <button onClick={() => navigate('/admin/revenue-scaling')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span>Revenue</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="Enterprise Autonomous SEO AI System">
              <button onClick={() => navigate('/admin/autonomous-seo')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <Brain className="w-3.5 h-3.5 shrink-0" />
                <span>Autonomous</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="Site Diagnostics & Export Bundle">
              <button onClick={() => navigate('/admin/diagnostics')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                <span>Diagnostics</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="Internal Reports & Documents">
              <button onClick={() => navigate('/admin/reports')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Reports</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="SEO Growth Engine V4">
              <button onClick={() => navigate('/admin/growth-execution')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span>Growth V4</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="Backlink Domination Engine">
              <button onClick={() => navigate('/admin/backlink-engine')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <Link className="w-3.5 h-3.5 shrink-0" />
                <span>Backlinks</span>
              </button>
            </TouchTooltip>
            <TouchTooltip content="Admin Resources & PDF Library">
              <button onClick={() => navigate('/admin/resources')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs whitespace-nowrap bg-muted hover:bg-muted-foreground/20 rounded-md transition-colors border border-border">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Resources</span>
              </button>
            </TouchTooltip>
          </div>

          {/* Sales Dashboard Tab */}
          <TabsContent value="sales" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Verkoop dashboard laden...</span>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mt-4">
                      {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <SalesDashboard onNavigateToTab={setActiveTab} />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Pet Catalog Tab */}
          <TabsContent value="catalog" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PawPrint className="w-5 h-5" />
                  Pet Products Catalog - US Warehouse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Rate Limit Timer */}
                <RateLimitTimer 
                  isRateLimited={isRateLimited || (catalogError && (catalogErrorData as Error)?.message?.includes("rate limit"))}
                  onRetry={() => refetchCatalog()}
                />

                <div className="flex flex-wrap gap-4 items-center mb-6">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Categorie
                    </label>
                    <div className="flex gap-2">
                      <Select value={catalogKeyword} onValueChange={(v) => {
                        setCatalogKeyword(v);
                        setCatalogPage(1);
                        setCustomSearchTerm(""); // Reset custom search when category changes
                      }}>
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px]">
                          {/* Alle producten */}
                          <SelectItem value="all">🐾 Alle Huisdierproducten</SelectItem>
                          
                          {/* Algemene categorieën */}
                          <SelectItem value="Pet Toys">🎾 Speelgoed</SelectItem>
                          <SelectItem value="Pet Beds & Furniture">🛏️ Bedden & Meubels</SelectItem>
                          <SelectItem value="Pet Food & Treats">🍖 Voer & Snacks</SelectItem>
                          <SelectItem value="Pet Collars & Leashes">🦮 Halsbanden & Riemen</SelectItem>
                          <SelectItem value="Pet Clothing">👕 Kleding</SelectItem>
                          <SelectItem value="Pet Grooming">✂️ Verzorging</SelectItem>
                          <SelectItem value="Pet Carriers">🎒 Reizen & Transport</SelectItem>
                          <SelectItem value="Pet Health">💊 Gezondheid</SelectItem>
                          <SelectItem value="Pet Training">🎓 Training</SelectItem>
                          <SelectItem value="Pet Accessories">🔌 Accessoires</SelectItem>
                          
                          {/* Honden */}
                          <SelectItem value="Dog Supplies">🐕 Honden - Algemeen</SelectItem>
                          <SelectItem value="Dog Toys">🐕 Honden - Speelgoed</SelectItem>
                          <SelectItem value="Dog Beds">🐕 Honden - Bedden</SelectItem>
                          <SelectItem value="Dog Collars">🐕 Honden - Halsbanden</SelectItem>
                          
                          {/* Katten */}
                          <SelectItem value="Cat Supplies">🐱 Katten - Algemeen</SelectItem>
                          <SelectItem value="Cat Trees">🐱 Katten - Krabpalen</SelectItem>
                          <SelectItem value="Cat Litter">🐱 Katten - Kattenbak</SelectItem>
                          <SelectItem value="Cat Toys">🐱 Katten - Speelgoed</SelectItem>
                          
                          {/* Vogels */}
                          <SelectItem value="Bird Supplies">🦜 Vogels - Algemeen</SelectItem>
                          <SelectItem value="Bird Cages">🦜 Vogels - Kooien</SelectItem>
                          <SelectItem value="Bird Toys">🦜 Vogels - Speelgoed</SelectItem>
                          <SelectItem value="Bird Feeders">🦜 Vogels - Voerbakken</SelectItem>
                          <SelectItem value="Bird Accessories">🦜 Vogels - Accessoires</SelectItem>
                          
                          {/* Vissen & Aquarium */}
                          <SelectItem value="Fish Supplies">🐠 Vissen - Algemeen</SelectItem>
                          <SelectItem value="Aquarium Equipment">🐠 Aquarium - Apparatuur</SelectItem>
                          <SelectItem value="Aquarium Decor">🐠 Aquarium - Decoratie</SelectItem>
                          <SelectItem value="Fish Food">🐠 Vissen - Voer</SelectItem>
                          
                          {/* Reptielen */}
                          <SelectItem value="Reptile Supplies">🦎 Reptielen - Algemeen</SelectItem>
                          <SelectItem value="Reptile Terrariums">🦎 Reptielen - Terrariums</SelectItem>
                          <SelectItem value="Reptile Heating">🦎 Reptielen - Verwarming</SelectItem>
                          <SelectItem value="Reptile Decor">🦎 Reptielen - Decoratie</SelectItem>
                          <SelectItem value="Reptile Food">🦎 Reptielen - Voer</SelectItem>
                          
                          {/* Kleine huisdieren */}
                          <SelectItem value="Small Pet Supplies">🐹 Kleine Huisdieren - Algemeen</SelectItem>
                          <SelectItem value="Small Pet Cages">🐹 Kleine Huisdieren - Kooien</SelectItem>
                          <SelectItem value="Small Pet Toys">🐹 Kleine Huisdieren - Speelgoed</SelectItem>
                          <SelectItem value="Small Pet Bedding">🐹 Kleine Huisdieren - Bodembedekking</SelectItem>
                          <SelectItem value="Small Pet Food">🐹 Kleine Huisdieren - Voer</SelectItem>
                          
                          {/* Paarden */}
                          <SelectItem value="Horse Supplies">🐴 Paarden - Algemeen</SelectItem>
                          <SelectItem value="Horse Tack">🐴 Paarden - Zadels & Tuig</SelectItem>
                          <SelectItem value="Horse Grooming">🐴 Paarden - Verzorging</SelectItem>
                          <SelectItem value="Horse Blankets">🐴 Paarden - Dekens</SelectItem>
                          <SelectItem value="Horse Boots">🐴 Paarden - Beenbeschermers</SelectItem>
                          <SelectItem value="Horse Treats">🐴 Paarden - Snacks</SelectItem>
                          
                          {/* Outdoor & Wildlife */}
                          <SelectItem value="Wildlife & Garden">🌿 Wilde dieren & Tuin</SelectItem>
                          <SelectItem value="Wild Bird Feeding">🌿 Tuinvogels - Voeren</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="outline" 
                        onClick={() => refetchCatalog()}
                        disabled={isCatalogLoading}
                      >
                        {isCatalogLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Custom Search Input */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm text-muted-foreground mb-1 block">
                      🔍 Vrij zoeken (bijv. "krabpaal", "halsband", "aquarium")
                    </label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Typ hier om te zoeken..."
                        value={customSearchTerm}
                        onChange={(e) => setCustomSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customSearchTerm.trim()) {
                            setCatalogKeyword(customSearchTerm.trim());
                            setCatalogPage(1);
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => {
                          if (customSearchTerm.trim()) {
                            setCatalogKeyword(customSearchTerm.trim());
                            setCatalogPage(1);
                          }
                        }}
                        disabled={!customSearchTerm.trim() || isCatalogLoading}
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tip: Zoek in het Engels voor betere resultaten (bijv. "scratching post", "cat tree", "leash")
                    </p>
                  </div>
                </div>
                
                {/* Active search indicator */}
                {catalogKeyword !== 'all' && !['Pet Toys', 'Pet Beds & Furniture', 'Pet Food & Treats', 'Pet Collars & Leashes', 'Pet Clothing', 'Pet Grooming', 'Pet Carriers', 'Cat Supplies', 'Dog Supplies', 'Small Pet Supplies', 'Pet Health', 'Pet Training', 'Pet Accessories'].includes(catalogKeyword) && (
                  <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center justify-between">
                    <span className="text-sm">
                      Zoeken naar: <strong>"{catalogKeyword}"</strong>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCatalogKeyword('all');
                        setCustomSearchTerm('');
                        setCatalogPage(1);
                      }}
                    >
                      ✕ Wis zoekopdracht
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 items-center mb-4">
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Prijsberekening
                    </label>
                    <Badge variant="outline" className="text-xs">
                      Dynamische prijzen + Gratis verzending inbegrepen
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">
                      Product Preview
                    </label>
                    <Switch 
                      checked={previewEnabled} 
                      onCheckedChange={setPreviewEnabled}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Shop Categorie
                    </label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Auto-detect" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {petCatalogProducts.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center justify-between mb-4 pb-4 border-b">
                    <div className="text-sm text-muted-foreground">
                      Showing {petCatalogProducts.length} pet products
                      {petCatalogData?.hiddenCount && petCatalogData.hiddenCount > 0 && (
                        <span className="ml-1 text-green-600">
                          ({petCatalogData.hiddenCount} already in your shop - hidden)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => {
                          // Select first batch of unselected products and import immediately
                          const unselectedProducts = petCatalogProducts.filter((p: CJProduct) => !selectedProducts.has(p.pid));
                          const toImport = unselectedProducts.slice(0, MAX_BATCH_SIZE);
                          if (toImport.length === 0) {
                            toast.error("Geen nieuwe producten om te importeren");
                            return;
                          }
                          importMutation.mutate(toImport);
                        }}
                        disabled={importMutation.isPending || petCatalogProducts.length === 0}
                      >
                        {importMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <CloudDownload className="w-4 h-4 mr-2" />
                        )}
                        Quick {MAX_BATCH_SIZE}
                      </Button>
                      <Button variant="outline" size="sm" onClick={selectAllCatalog}>
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAll}>
                        Deselect
                      </Button>
                      <Button 
                        onClick={handleCatalogImport} 
                        disabled={selectedProducts.size === 0 || importMutation.isPending}
                        variant={selectedProducts.size > MAX_BATCH_SIZE ? "destructive" : "default"}
                      >
                        {importMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : selectedProducts.size > MAX_BATCH_SIZE ? (
                          <AlertTriangle className="w-4 h-4 mr-2" />
                        ) : (
                          <Plus className="w-4 h-4 mr-2" />
                        )}
                        Import ({selectedProducts.size}{selectedProducts.size > MAX_BATCH_SIZE ? ` / max ${MAX_BATCH_SIZE}` : ''})
                      </Button>
                    </div>
                  </div>
                )}

                {/* Import Progress Indicator */}
                {importProgress && (() => {
                  const remaining = importProgress.total - importProgress.current;
                  const elapsed = importProgress.startTime ? Date.now() - importProgress.startTime : 0;
                  const avgTimePerProduct = importProgress.current > 0 ? elapsed / importProgress.current : 0;
                  const estimatedRemaining = avgTimePerProduct * remaining;
                  
                  // Format time remaining
                  const formatTime = (ms: number) => {
                    if (ms < 1000) return "< 1 sec";
                    const seconds = Math.ceil(ms / 1000);
                    if (seconds < 60) return `~${seconds} sec`;
                    const minutes = Math.floor(seconds / 60);
                    const remainingSecs = seconds % 60;
                    return remainingSecs > 0 ? `~${minutes} min ${remainingSecs} sec` : `~${minutes} min`;
                  };
                  
                  return (
                    <Card className="mb-4 border-primary/20 bg-primary/5">
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="font-medium flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Producten importeren...
                            </span>
                            <div className="text-right">
                              <span className="text-lg font-bold text-primary">
                                {importProgress.current}
                              </span>
                              <span className="text-muted-foreground"> / {importProgress.total}</span>
                            </div>
                          </div>
                          <Progress value={(importProgress.current / importProgress.total) * 100} className="h-3" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="flex-1 truncate mr-2">{importProgress.status}</span>
                            <div className="flex gap-3 shrink-0">
                              {importProgress.current > 0 && remaining > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(estimatedRemaining)}
                                </span>
                              )}
                              <span className="font-medium">
                                Nog {remaining} te gaan
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {isCatalogLoading ? (
                  <div className="py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading pet products from CJ Dropshipping...</p>
                  </div>
                ) : catalogError ? (
                  <div className="py-12 text-center">
                    <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">Failed to load catalog. Please try again.</p>
                    <Button onClick={() => refetchCatalog()}>Retry</Button>
                  </div>
                ) : petCatalogProducts.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {petCatalogProducts.map((product: CJProduct) => {
                        const isSelected = selectedProducts.has(product.pid);
                        // Parse sellPrice safely - it might be a range like "400-620"
                        const parsedSellPrice = typeof product.sellPrice === 'string' 
                          ? parseFloat(String(product.sellPrice).split('-')[0]) 
                          : Number(product.sellPrice);
                        const costPrice = isNaN(parsedSellPrice) ? 0 : parsedSellPrice;
                        // Parse weight safely - handle ranges like "8500-9100"
                        let parsedWeight: number;
                        const weightStr = String(product.productWeight || '200');
                        if (weightStr.includes('-')) {
                          parsedWeight = parseFloat(weightStr.split('-')[0]) || 200;
                        } else {
                          parsedWeight = parseFloat(weightStr) || 200;
                        }
                        const weight = parsedWeight <= 0 ? 200 : parsedWeight;
                        const pricing = calculateSellingPrice(costPrice, weight);

                        return (
                          <Card
                            key={product.pid}
                            className={`cursor-pointer transition-all group ${
                              isSelected
                                ? "ring-2 ring-primary bg-primary/5"
                                : "hover:shadow-lg"
                            }`}
                            onClick={() => toggleProduct(product.pid)}
                          >
                            <CardContent className="p-4">
                              <div className="relative">
                                <img
                                  src={product.productImage}
                                  alt={product.productNameEn}
                                  className="w-full h-40 object-cover rounded-lg mb-3"
                                />
                                {isSelected && (
                                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                    <Check className="w-4 h-4" />
                                  </div>
                                )}
                                {/* Block button */}
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-2 left-2 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBlockProduct(product.pid, product.productNameEn);
                                  }}
                                  title="Blokkeer dit product"
                                >
                                  <Ban className="w-3 h-3" />
                                </Button>
                                {/* Preview button */}
                                {previewEnabled && (
                                  <Button
                                    variant="secondary"
                                    size="icon"
                                    className="absolute top-2 left-11 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewProduct(product);
                                      setPreviewOpen(true);
                                    }}
                                    title="Bekijk details"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                )}
                                {/* Bookmark button */}
                                <Button
                                  variant={bookmarkedCjIds.has(product.pid) ? "default" : "secondary"}
                                  size="icon"
                                  className={`absolute top-2 ${previewEnabled ? 'left-20' : 'left-11'} w-7 h-7 ${bookmarkedCjIds.has(product.pid) ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleBookmark(product);
                                  }}
                                  title={bookmarkedCjIds.has(product.pid) ? "Verwijder bookmark" : "Sla op voor later"}
                                >
                                  {bookmarkedCjIds.has(product.pid) ? (
                                    <BookmarkCheck className="w-3 h-3" />
                                  ) : (
                                    <Bookmark className="w-3 h-3" />
                                  )}
                                </Button>
                                {/* Compare button */}
                                <Button
                                  variant={compareProductIds.has(product.pid) ? "default" : "secondary"}
                                  size="icon"
                                  className={`absolute top-2 ${previewEnabled ? 'left-[116px]' : 'left-20'} w-7 h-7 ${compareProductIds.has(product.pid) ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleCompare(product);
                                  }}
                                  title={compareProductIds.has(product.pid) ? "Verwijder uit vergelijking" : "Voeg toe aan vergelijking"}
                                >
                                  <GitCompare className="w-3 h-3" />
                                </Button>
                                <Badge className="absolute bottom-2 left-2" variant="default">
                                  <PawPrint className="w-3 h-3 mr-1" />
                                  Free Shipping
                                </Badge>
                              </div>
                              <h3 className="font-medium text-sm line-clamp-2 mb-2">
                                {product.productNameEn}
                              </h3>
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <span className="text-muted-foreground">Cost: </span>
                                  <span className="font-medium">${pricing.totalCost.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Retail: </span>
                                  <span className="font-bold text-primary">
                                    ${pricing.sellingPrice.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {pricing.multiplier.toFixed(1)}x markup
                              </div>
                              <Badge variant="outline" className="mt-2 text-xs">
                                {product.categoryName}
                              </Badge>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-center items-center gap-4 mt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCatalogPage(p => Math.max(1, p - 1))}
                        disabled={catalogPage === 1 || isCatalogLoading}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">Page {catalogPage}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCatalogPage(p => p + 1)}
                        disabled={(petCatalogData?.originalTotal || 0) <= catalogPage * 50 || isCatalogLoading}
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center">
                    <PawPrint className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      No pet products found. Try a different filter.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Search CJ Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
                  <Input
                    placeholder="Search products (e.g. 'pet toy', 'dog collar')..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 min-w-[250px]"
                  />
                  <Button type="submit" disabled={isSearching}>
                    {isSearching ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 mr-2" />
                    )}
                    Search
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Import Controls */}
            {cjProducts && cjProducts.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="text-sm text-muted-foreground mb-1 block">
                          Pricing
                        </label>
                        <Badge variant="outline" className="text-xs">
                          Dynamic pricing + Free Shipping included
                        </Badge>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">
                          Category
                        </label>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Auto-detect" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto-detect</SelectItem>
                            {categories?.map((cat) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAll}>
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAll}>
                        Deselect
                      </Button>
                      <Button 
                        onClick={handleImport} 
                        disabled={selectedProducts.size === 0 || importMutation.isPending}
                        variant={selectedProducts.size > MAX_BATCH_SIZE ? "destructive" : "default"}
                      >
                        {importMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : selectedProducts.size > MAX_BATCH_SIZE ? (
                          <AlertTriangle className="w-4 h-4 mr-2" />
                        ) : (
                          <Plus className="w-4 h-4 mr-2" />
                        )}
                        Import ({selectedProducts.size}{selectedProducts.size > MAX_BATCH_SIZE ? ` / max ${MAX_BATCH_SIZE}` : ''})
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Import Progress Indicator for Search */}
            {importProgress && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Importing Products...</span>
                      <span className="text-muted-foreground">
                        {importProgress.current} / {importProgress.total}
                      </span>
                    </div>
                    <Progress value={(importProgress.current / importProgress.total) * 100} />
                    <p className="text-xs text-muted-foreground">{importProgress.status}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CJ Products Grid */}
            {cjProducts && cjProducts.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">
                  CJ Dropshipping Results ({cjProducts.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {cjProducts.map((product) => {
                    const isSelected = selectedProducts.has(product.pid);
                    const costPrice = Number(product.sellPrice) || 0;
                    const pricing = calculateSellingPrice(costPrice, product.productWeight || 200);

                    return (
                      <Card
                        key={product.pid}
                        className={`cursor-pointer transition-all group ${
                          isSelected
                            ? "ring-2 ring-primary bg-primary/5"
                            : "hover:shadow-lg"
                        }`}
                        onClick={() => toggleProduct(product.pid)}
                      >
                        <CardContent className="p-4">
                          <div className="relative">
                            <img
                              src={product.productImage}
                              alt={product.productNameEn}
                              className="w-full h-40 object-cover rounded-lg mb-3"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="w-4 h-4" />
                              </div>
                            )}
                            {/* Block button */}
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 left-2 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBlockProduct(product.pid, product.productNameEn);
                              }}
                              title="Blokkeer dit product"
                            >
                              <Ban className="w-3 h-3" />
                            </Button>
                            {/* Preview button */}
                            {previewEnabled && (
                              <Button
                                variant="secondary"
                                size="icon"
                                className="absolute top-2 left-11 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewProduct(product);
                                  setPreviewOpen(true);
                                }}
                                title="Bekijk details"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                            {/* Bookmark button */}
                            <Button
                              variant={bookmarkedCjIds.has(product.pid) ? "default" : "secondary"}
                              size="icon"
                              className={`absolute top-2 ${previewEnabled ? 'left-20' : 'left-11'} w-7 h-7 ${bookmarkedCjIds.has(product.pid) ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleBookmark(product);
                              }}
                              title={bookmarkedCjIds.has(product.pid) ? "Verwijder bookmark" : "Sla op voor later"}
                            >
                              {bookmarkedCjIds.has(product.pid) ? (
                                <BookmarkCheck className="w-3 h-3" />
                              ) : (
                                <Bookmark className="w-3 h-3" />
                              )}
                            </Button>
                            {/* Compare button */}
                            <Button
                              variant={compareProductIds.has(product.pid) ? "default" : "secondary"}
                              size="icon"
                              className={`absolute top-2 ${previewEnabled ? 'left-[116px]' : 'left-20'} w-7 h-7 ${compareProductIds.has(product.pid) ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCompare(product);
                              }}
                              title={compareProductIds.has(product.pid) ? "Verwijder uit vergelijking" : "Voeg toe aan vergelijking"}
                            >
                              <GitCompare className="w-3 h-3" />
                            </Button>
                            <Badge className="absolute bottom-2 left-2" variant="default">
                              Free Shipping
                            </Badge>
                          </div>
                          <h3 className="font-medium text-sm line-clamp-2 mb-2">
                            {product.productNameEn}
                          </h3>
                          <div className="flex justify-between items-center text-sm">
                            <div>
                              <span className="text-muted-foreground">Cost: </span>
                              <span className="font-medium">${pricing.totalCost.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Retail: </span>
                              <span className="font-bold text-primary">
                                ${pricing.sellingPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {pricing.multiplier.toFixed(1)}x markup
                          </div>
                          <Badge variant="outline" className="mt-2 text-xs">
                            {product.categoryName}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <SectionErrorBoundary sectionName="Store Products">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Store Products ({existingProducts?.length || 0})
                </h2>
                <div className="flex flex-wrap gap-2 items-center">
                  <ProductCsvExport />
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Auto-sync daily at 05:00 NL time
                  </div>
                  <div className="flex">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="rounded-r-none border-r-0"
                      onClick={() => refreshAllProductsMutation.mutate(refreshMode)}
                      disabled={refreshAllProductsMutation.isPending}
                    >
                      {refreshAllProductsMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {refreshMode === "new-only" ? (
                        <>Refresh New Only {newProductsCount > 0 && <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{newProductsCount}</Badge>}</>
                      ) : (
                        "Refresh All"
                      )}
                    </Button>
                    <Select value={refreshMode} onValueChange={(value: "all" | "new-only") => setRefreshMode(value)}>
                      <SelectTrigger className="w-8 rounded-l-none border-l-0 px-1.5" disabled={refreshAllProductsMutation.isPending}>
                        <ChevronDown className="w-4 h-4" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="all">Alle producten bijwerken ({existingProducts?.filter(p => p.cj_product_id).length || 0})</SelectItem>
                        <SelectItem value="new-only">
                          Alleen nieuwe producten {newProductsCount > 0 && `(${newProductsCount})`}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => syncStockMutation.mutate()}
                    disabled={syncStockMutation.isPending}
                  >
                    {syncStockMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CloudDownload className="w-4 h-4 mr-2" />
                    )}
                    Sync Stock
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => fixVariantPricesMutation.mutate()}
                    disabled={fixVariantPricesMutation.isPending}
                    title="Fix variant selling prices for existing products"
                  >
                    {fixVariantPricesMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Fix Variant Prices
                  </Button>
                </div>
              </div>
              
              {/* Progress Indicators for Sync Operations */}
              {(syncStockProgress || fixPricesProgress) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {syncStockProgress && (
                    <SyncProgressIndicator 
                      progress={syncStockProgress} 
                      title="Stock Synchronisatie" 
                    />
                  )}
                  {fixPricesProgress && (
                    <SyncProgressIndicator 
                      progress={fixPricesProgress} 
                      title="Variant Prijzen Fix" 
                    />
                  )}
                </div>
              )}
              {/* Search and Filters for My Products */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Zoek in mijn producten..."
                    value={myProductsSearch}
                    onChange={(e) => setMyProductsSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={myProductsCategoryFilter} onValueChange={setMyProductsCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Alle categorieën" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle categorieën</SelectItem>
                    {(() => {
                      const productCategories = [...new Set(existingProducts?.map(p => p.category).filter(Boolean) || [])];
                      return productCategories.map((cat) => (
                        <SelectItem key={cat} value={cat!}>
                          {cat}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
                <Select value={myProductsStatusFilter} onValueChange={setMyProductsStatusFilter}>
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue placeholder="Alle status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle status</SelectItem>
                    <SelectItem value="active">Actief</SelectItem>
                    <SelectItem value="inactive">Inactief</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Refresh Progress Indicator */}
              {refreshProgress && (
                <Card className="mb-4 border-primary/20 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4 mb-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">Refreshing Products...</span>
                          <span className="text-muted-foreground">
                            {refreshProgress.current}/{refreshProgress.total} completed
                          </span>
                        </div>
                        <Progress 
                          value={(refreshProgress.current / refreshProgress.total) * 100} 
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {refreshProgress.status}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {(() => {
                const filteredProducts = existingProducts?.filter((product) => {
                  // Text search filter
                  if (myProductsSearch.trim()) {
                    const searchLower = myProductsSearch.toLowerCase();
                    const matchesSearch = 
                      product.name.toLowerCase().includes(searchLower) ||
                      product.category?.toLowerCase().includes(searchLower) ||
                      product.sku?.toLowerCase().includes(searchLower);
                    if (!matchesSearch) return false;
                  }
                  
                  // Category filter
                  if (myProductsCategoryFilter !== "all" && product.category !== myProductsCategoryFilter) {
                    return false;
                  }
                  
                  // Status filter
                  if (myProductsStatusFilter === "active" && !product.is_active) return false;
                  if (myProductsStatusFilter === "inactive" && product.is_active) return false;
                  
                  return true;
                }) || [];
                
                const hasActiveFilters = myProductsSearch || myProductsCategoryFilter !== "all" || myProductsStatusFilter !== "all";
                
                // Helper functions for bulk selection
                const toggleMyProduct = (productId: string) => {
                  const newSelected = new Set(selectedMyProducts);
                  if (newSelected.has(productId)) {
                    newSelected.delete(productId);
                  } else {
                    newSelected.add(productId);
                  }
                  setSelectedMyProducts(newSelected);
                };
                
                const selectAllFiltered = () => {
                  setSelectedMyProducts(new Set(filteredProducts.map(p => p.id)));
                };
                
                const deselectAllMyProducts = () => {
                  setSelectedMyProducts(new Set());
                };
                
                return filteredProducts.length > 0 ? (
                  <>
                    {/* Bulk Actions Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {selectedMyProducts.size > 0 
                            ? `${selectedMyProducts.size} geselecteerd` 
                            : `${filteredProducts.length} producten`}
                        </span>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={selectAllFiltered}
                          disabled={selectedMyProducts.size === filteredProducts.length}
                        >
                          <CheckSquare className="w-4 h-4 mr-1" />
                          Alles
                        </Button>
                        {selectedMyProducts.size > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={deselectAllMyProducts}
                          >
                            <Square className="w-4 h-4 mr-1" />
                            Deselecteer
                          </Button>
                        )}
                      </div>
                      
                      {selectedMyProducts.size > 0 && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => bulkToggleActiveMutation.mutate({ 
                              productIds: Array.from(selectedMyProducts), 
                              isActive: true 
                            })}
                            disabled={bulkToggleActiveMutation.isPending}
                          >
                            {bulkToggleActiveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Power className="w-4 h-4 mr-1" />
                            )}
                            Activeer
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => bulkToggleActiveMutation.mutate({ 
                              productIds: Array.from(selectedMyProducts), 
                              isActive: false 
                            })}
                            disabled={bulkToggleActiveMutation.isPending}
                          >
                            {bulkToggleActiveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <PowerOff className="w-4 h-4 mr-1" />
                            )}
                            Deactiveer
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setBulkDeleteDialogOpen(true)}
                            disabled={bulkDeleteProductsMutation.isPending}
                          >
                            {bulkDeleteProductsMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 mr-1" />
                            )}
                            Verwijder ({selectedMyProducts.size})
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {hasActiveFilters && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {filteredProducts.length} van {existingProducts?.length || 0} producten gevonden
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredProducts.map((product) => (
                    <Card 
                      key={product.id} 
                      className={`group cursor-pointer transition-all ${selectedMyProducts.has(product.id) ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => toggleMyProduct(product.id)}
                    >
                      <CardContent className="p-4">
                        <div className="relative">
                          {/* Selection checkbox */}
                          <div 
                            className="absolute top-2 left-2 z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox 
                              checked={selectedMyProducts.has(product.id)}
                              onCheckedChange={() => toggleMyProduct(product.id)}
                              className="bg-background"
                            />
                          </div>
                          <img
                            src={product.image_url || "/placeholder.svg"}
                            alt={product.name}
                            className="w-full h-40 object-cover rounded-lg mb-3"
                          />
                          {product.images && Array.isArray(product.images) && product.images.length > 1 && (
                            <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
                              {product.images.length} images
                            </Badge>
                          )}
                          {/* Action buttons overlay */}
                          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditProduct(product);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProduct(product.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <h3 className="font-medium text-sm line-clamp-2 mb-2">
                          {product.name}
                        </h3>
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-primary">
                            ${Number(product.price).toFixed(2)}
                          </span>
                          <Badge variant={product.is_active ? "default" : "secondary"}>
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>Stock: {product.stock ?? 0}</span>
                          {product.variants && (
                            <span>
                              {Array.isArray(product.variants) ? product.variants.length : 0} variants
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                    </div>
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        {myProductsSearch 
                          ? "Geen producten gevonden met deze zoekterm."
                          : "No products yet. Use the Pet Catalog or Search to import products."
                        }
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
            </SectionErrorBoundary>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Bestellingen laden...</span>
                    <div className="space-y-3 w-full mt-4">
                      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <OrdersManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Abandoned Carts Tab */}
          <TabsContent value="abandoned">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Achtergelaten winkelwagens laden...</span>
                    <div className="space-y-3 w-full mt-4">
                      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <AbandonedCartsManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Stock Notifications Tab */}
          <TabsContent value="stock-notifications">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Stock notificaties laden...</span>
                    <div className="space-y-3 w-full mt-4">
                      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <StockNotificationsManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Newsletter Tab */}
          <TabsContent value="newsletter">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Nieuwsbrief abonnees laden...</span>
                    <div className="space-y-3 w-full mt-4">
                      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <NewsletterSubscribers />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Categorieën laden...</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-4">
                      {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <div className="space-y-6">
                  <CategoryOrderManager />
                  <CategoryManager />
                  <ProductRecategorizer />
                </div>
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Analytics laden...</span>
                  </div>
                </Card>
              }>
                <AnalyticsDashboard isConfigured={true} />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Contact Messages Tab */}
          <TabsContent value="messages">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Berichten laden...</span>
                    <div className="space-y-3 w-full mt-4">
                      {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <ContactMessagesManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>


          {/* Google Ads Generator Tab */}
          <TabsContent value="google-ads">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Google Ads generator laden...</span>
                  </div>
                </Card>
              }>
                <GoogleAdsGenerator />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Bestsellers Management Tab */}
          <TabsContent value="bestsellers">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Bestsellers laden...</span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-4">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
                    </div>
                  </div>
                </Card>
              }>
                <BestsellerManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Visitors Analytics Tab */}
          <TabsContent value="visitors" className="space-y-6">
            <AuthErrorBoundary>
              {/* Download Buttons */}
              <div className="flex justify-end gap-3">
                <AdminManualDownload />
                <TrafficReportDownload />
              </div>

              {/* Pinterest Ads Performance - Full Width */}
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Pinterest Ads laden...</span>
                  </div>
                </Card>
              }>
                <PinterestAdsWidget />
              </Suspense>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pinterest Traffic Widget - 1 column */}
                <div className="lg:col-span-1">
                  <Suspense fallback={
                    <Card className="p-8">
                      <div className="flex items-center justify-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>Pinterest Traffic laden...</span>
                      </div>
                    </Card>
                  }>
                    <PinterestTrafficWidget />
                  </Suspense>
                </div>
                
                {/* Advanced Stats Widget - 2 columns */}
                <div className="lg:col-span-2">
                  <Suspense fallback={
                    <Card className="p-8">
                      <div className="flex items-center justify-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>Bezoekersanalyse laden...</span>
                      </div>
                    </Card>
                  }>
                    <AdvancedVisitorStatsWidget />
                  </Suspense>
                </div>
              </div>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Visitor World Map Tab */}
          <TabsContent value="visitor-map">
            <AuthErrorBoundary>
              <Suspense fallback={<MapLoadingFallback />}>
                <VisitorWorldMap />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* URL Import Tab */}
          <TabsContent value="url-import" className="space-y-6">
            <AuthErrorBoundary>
              <URLProductImport />
            </AuthErrorBoundary>
          </TabsContent>

          {/* Bookmarks Tab */}
          <TabsContent value="bookmarks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bookmark className="w-5 h-5" />
                  Opgeslagen CJ Producten ({bookmarkedProducts?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bookmarkedProducts && bookmarkedProducts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {bookmarkedProducts.map((bookmark) => {
                      const costPrice = Number(bookmark.sell_price) || 0;
                      const weight = Number(bookmark.product_weight) || 0;
                      const pricing = calculateSellingPrice(costPrice, weight);
                      const isImported = importedCjIds.has(bookmark.cj_product_id);

                      return (
                        <Card key={bookmark.id} className="group">
                          <CardContent className="p-4">
                            <div className="relative">
                              <img
                                src={bookmark.product_image || "/placeholder.svg"}
                                alt={bookmark.product_name}
                                className="w-full h-40 object-cover rounded-lg mb-3"
                              />
                              {isImported && (
                                <Badge className="absolute top-2 right-2" variant="secondary">
                                  <Check className="w-3 h-3 mr-1" />
                                  Imported
                                </Badge>
                              )}
                              {/* Remove bookmark button */}
                              <Button
                                variant="secondary"
                                size="icon"
                                className="absolute top-2 left-2 w-7 h-7"
                                onClick={() => removeBookmarkMutation.mutate(bookmark.cj_product_id)}
                                title="Verwijder bookmark"
                              >
                                <BookmarkCheck className="w-3 h-3" />
                              </Button>
                            </div>
                            <h3 className="font-medium text-sm line-clamp-2 mb-2">
                              {bookmark.product_name}
                            </h3>
                            <div className="flex justify-between items-center text-sm">
                              <div>
                                <span className="text-muted-foreground">Cost: </span>
                                <span className="font-medium">${pricing.totalCost.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Retail: </span>
                                <span className="font-bold text-primary">
                                  ${pricing.sellingPrice.toFixed(2)}
                                </span>
                              </div>
                            </div>
                            <Badge variant="outline" className="mt-2 text-xs">
                              {bookmark.category_name || "Uncategorized"}
                            </Badge>
                            {!isImported && (
                              <Button
                                className="w-full mt-3"
                                size="sm"
                                onClick={() => {
                                  // Convert bookmark to CJProduct format for import
                                  const product: CJProduct = {
                                    pid: bookmark.cj_product_id,
                                    productNameEn: bookmark.product_name,
                                    productImage: bookmark.product_image || "",
                                    productWeight: bookmark.product_weight || 0,
                                    categoryName: bookmark.category_name || "",
                                    sellPrice: bookmark.sell_price || 0,
                                    productSku: bookmark.product_sku || "",
                                  };
                                  importMutation.mutate([product]);
                                }}
                                disabled={importMutation.isPending}
                              >
                                {importMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Plus className="w-4 h-4 mr-2" />
                                )}
                                Import naar Shop
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Bookmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Nog geen opgeslagen producten. Gebruik het bookmark icoon bij CJ producten om ze hier op te slaan.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blog Posts Tab */}
          <TabsContent value="blog" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Blog posts laden...</span>
                  </div>
                </Card>
              }>
                <BlogPostsManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Email Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">E-mail campagnes laden...</span>
                  </div>
                </Card>
              }>
                <EmailCampaignManager onNavigateToSubscribers={() => setActiveTab("newsletter")} />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Remarketing Dashboard Tab */}
          <TabsContent value="remarketing" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Remarketing dashboard laden...</span>
                  </div>
                </Card>
              }>
                <RemarketingDashboard />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Lead Magnet Analytics Tab */}
          <TabsContent value="lead-magnets" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Lead magnet analytics laden...</span>
                  </div>
                </Card>
              }>
                <LeadMagnetAnalytics />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Variant Data Validator Tab */}
          <TabsContent value="variant-validator" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Variant validator laden...</span>
                  </div>
                </Card>
              }>
                <VariantDataValidator />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Variant Fix Logs Tab */}
          <TabsContent value="variant-logs" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Fix logboek laden...</span>
                  </div>
                </Card>
              }>
                <VariantFixLogs />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Error Logs Tab */}
          <TabsContent value="error-logs" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Error logs laden...</span>
                  </div>
                </Card>
              }>
                <ErrorLogsManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Duplicate Products Detection Tab */}
          <TabsContent value="duplicates" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Duplicaat detectie laden...</span>
                  </div>
                </Card>
              }>
                <DuplicateProductsDetector />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Disputes Tab */}
          <TabsContent value="disputes">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Claims laden...</span>
                  </div>
                </Card>
              }>
                <DisputeManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* CJ Webhooks Tab */}
          <TabsContent value="cj-webhooks">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Webhook instellingen laden...</span>
                  </div>
                </Card>
              }>
                <CJWebhookManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Packaging Tab */}
          <TabsContent value="packaging">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Packaging manager laden...</span>
                  </div>
                </Card>
              }>
                <PackagingManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Warehouse Shipping Audit Tab */}
          <TabsContent value="warehouse-audit">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Warehouse audit laden...</span>
                  </div>
                </Card>
              }>
                <WarehouseShippingAudit />
                <div className="mt-8">
                  <OosResyncAudit />
                </div>
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Keyword Rankings Tab */}
          <TabsContent value="keywords">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Keyword tracker laden...</span>
                  </div>
                </Card>
              }>
                <KeywordRankingTracker />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>


          {/* Supplier Import Tab */}
          <TabsContent value="suppliers">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Supplier import laden...</span>
                  </div>
                </Card>
              }>
                <SupplierImportManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* A/B Test Dashboard Tab */}
          <TabsContent value="ab-tests" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">A/B Test dashboard laden...</span>
                  </div>
                </Card>
              }>
                <ABTestDashboard />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>

          {/* Growth Analytics Tab */}
          <TabsContent value="growth" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Growth analytics laden...</span>
                  </div>
                </Card>
              }>
                <GrowthAnalyticsDashboard />
              </Suspense>
            </AuthErrorBoundary>

            {/* V7 SEO Intelligence Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <CompetitorGapWidget />
              </Suspense>
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <SerpCoverageWidget />
              </Suspense>
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <ZeroClickWidget />
              </Suspense>
               <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <StrategyAdaptationWidget />
              </Suspense>
            </div>
            {/* V8 Enterprise Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <CompetitorIntelWidget />
              </Suspense>
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <BacklinkHeatmapWidget />
              </Suspense>
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <RevenueOptimizerWidget />
              </Suspense>
              <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
                <MarketTakeoverWidget />
              </Suspense>
            </div>
            {/* AGM: Autonomous Growth Dashboard */}
            <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
              <AutonomousGrowthDashboard />
            </Suspense>
            {/* AGM: Stability & Index Hygiene */}
            <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
              <AGMStabilityDashboard />
            </Suspense>
            {/* Guide Visibility & Index Report */}
            <Suspense fallback={<Card className="p-6"><Skeleton className="h-48 w-full" /></Card>}>
              <GuideVisibilityWidget />
            </Suspense>
          </TabsContent>

          {/* Reviews Moderation Tab */}
          <TabsContent value="reviews" className="space-y-6">
            <AuthErrorBoundary>
              <Suspense fallback={
                <Card className="p-8">
                  <div className="flex items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">Reviews laden...</span>
                  </div>
                </Card>
              }>
                <ReviewModerationManager />
              </Suspense>
            </AuthErrorBoundary>
          </TabsContent>
        </Tabs>

        <ProductEditDialog
          product={editProduct}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />

        {/* Batch Import Warning Dialog */}
        <AlertDialog open={batchWarningOpen} onOpenChange={setBatchWarningOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Veel producten geselecteerd
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Je hebt <strong>{pendingImportProducts.length}</strong> producten geselecteerd. 
                  Het importeren van veel producten kan langer duren.
                </p>
                <p>
                  Wil je alle {pendingImportProducts.length} producten importeren, of alleen de eerste {MAX_BATCH_SIZE}?
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => {
                setBatchWarningOpen(false);
                setPendingImportProducts([]);
              }}>
                Annuleren
              </AlertDialogCancel>
              <Button variant="outline" onClick={() => handleConfirmBatchImport(false)}>
                Import eerste {MAX_BATCH_SIZE}
              </Button>
              <AlertDialogAction onClick={() => handleConfirmBatchImport(true)}>
                Import alle {pendingImportProducts.length}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Product Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-destructive" />
                Product verwijderen
              </AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je dit product wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteProductId(null);
              }}>
                Annuleren
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteProductMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Verwijderen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-destructive" />
                {selectedMyProducts.size} producten verwijderen
              </AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je {selectedMyProducts.size} producten wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBulkDeleteDialogOpen(false)}>
                Annuleren
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => bulkDeleteProductsMutation.mutate(Array.from(selectedMyProducts))}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {bulkDeleteProductsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Verwijder alles
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* CJ Product Preview Dialog */}
        <CJProductPreview
          product={previewProduct}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          onImport={(product) => {
            setPreviewOpen(false);
            importMutation.mutate([product]);
          }}
          isImporting={importMutation.isPending}
        />

        {/* Product Compare Dialog */}
        <ProductCompareDialog
          products={compareProducts}
          open={compareDialogOpen}
          onOpenChange={setCompareDialogOpen}
          onRemoveProduct={(pid) => setCompareProducts(prev => prev.filter(p => p.pid !== pid))}
          onClearAll={() => setCompareProducts([])}
          onImportAll={(products) => {
            importMutation.mutate(products);
            setCompareDialogOpen(false);
            setCompareProducts([]);
          }}
          isImporting={importMutation.isPending}
        />

        {/* Floating Compare Bar */}
        {compareProducts.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-lg px-4 py-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-primary" />
              <span className="font-medium">{compareProducts.length} producten</span>
            </div>
            <div className="flex -space-x-2">
              {compareProducts.slice(0, 4).map((p) => (
                <img
                  key={p.pid}
                  src={p.productImage}
                  alt={p.productNameEn}
                  className="w-10 h-10 rounded-full border-2 border-background object-cover"
                />
              ))}
            </div>
            <Button onClick={() => setCompareDialogOpen(true)}>
              Vergelijken
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCompareProducts([])}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default Admin;
