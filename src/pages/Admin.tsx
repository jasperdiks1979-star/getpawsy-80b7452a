import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Plus, Package, RefreshCw, Check, Loader2, ShieldAlert, PawPrint, ChevronLeft, ChevronRight, CloudDownload, Clock, Pencil, AlertTriangle, Mail, FolderTree } from "lucide-react";
import { ProductEditDialog } from "@/components/admin/ProductEditDialog";
import { NewsletterSubscribers } from "@/components/admin/NewsletterSubscribers";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogKeyword, setCatalogKeyword] = useState("all");
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [editProduct, setEditProduct] = useState<Tables<"products"> | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; status: string; startTime?: number } | null>(null);
  const [batchWarningOpen, setBatchWarningOpen] = useState(false);
  const [pendingImportProducts, setPendingImportProducts] = useState<CJProduct[]>([]);
  const queryClient = useQueryClient();

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

  // Fetch existing products from database
  const { data: existingProducts } = useQuery({
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

  // Search CJ products
  const { data: cjProducts, isLoading: isSearching, refetch: searchProducts } = useQuery({
    queryKey: ["cj-search", searchTerm],
    queryFn: async (): Promise<CJProduct[]> => {
      if (!searchTerm) return [];
      
      const { data, error } = await supabase.functions.invoke("cj-dropshipping", {
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
      
      // Filter out already imported products
      const allProducts = response.data?.list || [];
      const importedIds = new Set(existingProducts?.map(p => p.cj_product_id) || []);
      return allProducts.filter((p: CJProduct) => !importedIds.has(p.pid));
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
    queryKey: ["pet-catalog", catalogPage, catalogKeyword],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("cj-dropshipping", {
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
      
      // Filter out already imported products
      const allProducts = response.data?.list || [];
      const importedIds = new Set(existingProducts?.map(p => p.cj_product_id) || []);
      const filteredProducts = allProducts.filter((p: CJProduct) => !importedIds.has(p.pid));
      
      return {
        products: filteredProducts,
        total: filteredProducts.length,
        originalTotal: response.data?.total || 0,
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't auto-retry on rate limit errors
    refetchOnWindowFocus: false, // Prevent refetch on window focus
  });

  // Generate SEO text for a product
  const generateSeoForProduct = async (productName: string, category: string) => {
    const { data, error } = await supabase.functions.invoke("generate-seo-text", {
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
      const { data: fullDetailsResponse, error: detailsError } = await supabase.functions.invoke("cj-dropshipping", {
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
          status: `Processing ${i + 1}/${total}: ${p.productNameEn.substring(0, 40)}...`,
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
        
        // Get variants data
        const variants = fullDetail?.variants || null;
        
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
          variants: variants,
          is_active: true,
          supplier_name: "CJ Dropshipping",
          shipping_time: "Free Shipping",
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

  // Stock sync mutation
  const syncStockMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cj-dropshipping", {
        body: {
          action: "sync-stock",
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Stock synced! ${data?.synced || 0} products updated.`);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (error) => {
      toast.error(`Stock sync failed: ${error.message}`);
    },
  });

  // Refresh all products - fetch missing images and data from CJ in batches
  const refreshAllProductsMutation = useMutation({
    mutationFn: async () => {
      // Get all products that have CJ product IDs
      const productsWithCJ = existingProducts?.filter(p => p.cj_product_id) || [];
      
      if (productsWithCJ.length === 0) {
        throw new Error("No CJ products to refresh");
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
        const { data: fullDetailsResponse, error: detailsError } = await supabase.functions.invoke("cj-dropshipping", {
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
            status: `Updating: ${product.name.substring(0, 30)}...` 
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
          
          console.log(`Updating ${product.name}: ${flatImages.length} images, ${fullDetail.variants?.length || 0} variants`);

          // Update product with new images and variants
          const { error: updateError } = await supabase
            .from("products")
            .update({
              images: flatImages,
              variants: fullDetail.variants || product.variants,
              stock: fullDetail.totalStock ?? product.stock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", product.id);

          if (updateError) {
            console.error(`Failed to update ${product.name}:`, updateError);
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
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
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
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              CJ Dropshipping Product Import
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            <Package className="w-4 h-4 mr-2" />
            {existingProducts?.length || 0} products
          </Badge>
        </div>

        <Tabs defaultValue="catalog" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="catalog" className="flex items-center gap-2">
              <PawPrint className="w-4 h-4" />
              <span className="hidden sm:inline">Pet Catalog</span>
              <span className="sm:hidden">Catalog</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
              <span className="sm:hidden">Zoek</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">My Products</span>
              <span className="sm:hidden">Products</span>
            </TabsTrigger>
            <TabsTrigger value="newsletter" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Nieuwsbrief</span>
              <span className="sm:hidden">Mail</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <FolderTree className="w-4 h-4" />
              <span className="hidden sm:inline">Categorieën</span>
              <span className="sm:hidden">Cat.</span>
            </TabsTrigger>
          </TabsList>

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
                      Search within pets
                    </label>
                    <div className="flex gap-2">
                      <Select value={catalogKeyword} onValueChange={(v) => {
                        setCatalogKeyword(v);
                        setCatalogPage(1);
                      }}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Pet Products</SelectItem>
                          <SelectItem value="Pet Toys">🎾 Pet Toys</SelectItem>
                          <SelectItem value="Pet Beds & Furniture">🛏️ Beds & Furniture</SelectItem>
                          <SelectItem value="Pet Food & Treats">🍖 Food & Treats</SelectItem>
                          <SelectItem value="Pet Collars & Leashes">🦮 Collars & Leashes</SelectItem>
                          <SelectItem value="Pet Clothing">👕 Pet Clothing</SelectItem>
                          <SelectItem value="Pet Grooming">✂️ Grooming</SelectItem>
                          <SelectItem value="Pet Carriers">🎒 Carriers & Travel</SelectItem>
                          <SelectItem value="Cat Supplies">🐱 Cat Supplies</SelectItem>
                          <SelectItem value="Dog Supplies">🐕 Dog Supplies</SelectItem>
                          <SelectItem value="Small Pet Supplies">🐹 Small Pets</SelectItem>
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

                {petCatalogProducts.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center justify-between mb-4 pb-4 border-b">
                    <div className="text-sm text-muted-foreground">
                      Showing {petCatalogProducts.length} pet products
                      {petCatalogData?.originalTotal && petCatalogData.originalTotal !== petCatalogData.total && (
                        <span> (filtered from {petCatalogData.originalTotal})</span>
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
                            className={`cursor-pointer transition-all ${
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
                        className={`cursor-pointer transition-all ${
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

          {/* My Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Store Products ({existingProducts?.length || 0})
                </h2>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Auto-sync daily at 05:00 NL time
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => refreshAllProductsMutation.mutate()}
                    disabled={refreshAllProductsMutation.isPending}
                  >
                    {refreshAllProductsMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Refresh All Images & Data
                  </Button>
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
                </div>
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
              {existingProducts && existingProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {existingProducts.map((product) => (
                    <Card key={product.id} className="group">
                      <CardContent className="p-4">
                        <div className="relative">
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
                          {/* Edit button overlay */}
                          <Button
                            variant="secondary"
                            size="sm"
                            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setEditProduct(product);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
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
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      No products yet. Use the Pet Catalog or Search to import products.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Newsletter Tab */}
          <TabsContent value="newsletter">
            <NewsletterSubscribers />
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <CategoryManager />
          </TabsContent>
        </Tabs>

        {/* Product Edit Dialog */}
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
      </div>
    </Layout>
  );
};

export default Admin;
