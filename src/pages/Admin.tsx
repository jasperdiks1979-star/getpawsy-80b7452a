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
import { Search, Plus, Package, RefreshCw, Check, Loader2, ShieldAlert, PawPrint, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RateLimitTimer } from "@/components/RateLimitTimer";

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
  const [priceMultiplier, setPriceMultiplier] = useState("2.5");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogKeyword, setCatalogKeyword] = useState("pet");
  const [isRateLimited, setIsRateLimited] = useState(false);
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
      
      return response.data?.list || [];
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
      
      return {
        products: response.data?.list || [],
        total: response.data?.total || 0,
        originalTotal: response.data?.originalTotal || response.data?.total || 0,
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't auto-retry on rate limit errors
    refetchOnWindowFocus: false, // Prevent refetch on window focus
  });

  // Import products mutation - fetches full details including all images, variants, and stock
  const importMutation = useMutation({
    mutationFn: async (products: CJProduct[]) => {
      const multiplier = parseFloat(priceMultiplier);
      const productIds = products.map(p => p.pid);
      
      // Show loading toast
      toast.loading("Fetching full product details from CJ...", { id: "import-loading" });
      
      // Fetch full product details (all images, variants, stock) from CJ
      const { data: fullDetailsResponse, error: detailsError } = await supabase.functions.invoke("cj-dropshipping", {
        body: {
          action: "get-products-for-import",
          productIds: productIds,
        },
      });

      if (detailsError) {
        toast.dismiss("import-loading");
        throw detailsError;
      }

      toast.dismiss("import-loading");
      
      // Map full details to database format
      const productsToInsert = products.map((p) => {
        // Find full details for this product
        const fullDetail = fullDetailsResponse?.find((d: { pid: string; success: boolean; data?: { description?: string }; images?: string[]; variants?: unknown; totalStock?: number }) => d.pid === p.pid && d.success);
        
        // Get all images
        const images = fullDetail?.images || [p.productImage];
        
        // Get stock from full details or default
        const stock = fullDetail?.totalStock ?? 100;
        
        // Get description from full details
        const description = fullDetail?.data?.description || p.description || "";
        
        // Get variants data
        const variants = fullDetail?.variants || null;

        return {
          cj_product_id: p.pid,
          name: p.productNameEn,
          description: description,
          category: selectedCategory === "auto" ? p.categoryName : (selectedCategory || p.categoryName),
          image_url: p.productImage,
          images: images, // Store all images
          price: Math.round(Number(p.sellPrice) * multiplier * 100) / 100,
          cost_price: Number(p.sellPrice) || 0,
          compare_at_price: Math.round(Number(p.sellPrice) * multiplier * 1.3 * 100) / 100,
          sku: p.productSku,
          weight: p.productWeight,
          stock: stock, // Real stock from CJ
          variants: variants, // Store variant data
          is_active: true,
          supplier_name: "CJ Dropshipping",
        };
      });

      const { data, error } = await supabase
        .from("products")
        .upsert(productsToInsert, { 
          onConflict: "cj_product_id",
          ignoreDuplicates: false 
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data?.length || 0} products imported with full details!`);
      setSelectedProducts(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
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
    importMutation.mutate(productsToImport);
  };

  const isAlreadyImported = (pid: string) => {
    return existingProducts?.some((p) => p.cj_product_id === pid);
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
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="catalog" className="flex items-center gap-2">
              <PawPrint className="w-4 h-4" />
              Pet Catalog (US)
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Search
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              My Products
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
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pet">All Pets</SelectItem>
                          <SelectItem value="dog">Dogs</SelectItem>
                          <SelectItem value="cat">Cats</SelectItem>
                          <SelectItem value="pet toy">Pet Toys</SelectItem>
                          <SelectItem value="pet bed">Pet Beds</SelectItem>
                          <SelectItem value="pet collar">Collars & Leashes</SelectItem>
                          <SelectItem value="pet bowl">Bowls & Feeders</SelectItem>
                          <SelectItem value="pet grooming">Grooming</SelectItem>
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
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Profit Margin
                    </label>
                    <Select value={priceMultiplier} onValueChange={setPriceMultiplier}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1.5">1.5x</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                        <SelectItem value="2.5">2.5x</SelectItem>
                        <SelectItem value="3">3x</SelectItem>
                        <SelectItem value="4">4x</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <Button variant="outline" size="sm" onClick={selectAllCatalog}>
                        Select All
                      </Button>
                      <Button variant="outline" size="sm" onClick={deselectAll}>
                        Deselect
                      </Button>
                      <Button 
                        onClick={handleCatalogImport} 
                        disabled={selectedProducts.size === 0 || importMutation.isPending}
                      >
                        {importMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4 mr-2" />
                        )}
                        Import ({selectedProducts.size})
                      </Button>
                    </div>
                  </div>
                )}

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
                        const isImported = isAlreadyImported(product.pid);
                        const costPrice = Number(product.sellPrice) || 0;
                        const retailPrice = costPrice * parseFloat(priceMultiplier);

                        return (
                          <Card
                            key={product.pid}
                            className={`cursor-pointer transition-all ${
                              isSelected
                                ? "ring-2 ring-primary bg-primary/5"
                                : isImported
                                ? "opacity-60"
                                : "hover:shadow-lg"
                            }`}
                            onClick={() => !isImported && toggleProduct(product.pid)}
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
                                {isImported && (
                                  <Badge className="absolute top-2 left-2" variant="secondary">
                                    Already imported
                                  </Badge>
                                )}
                                <Badge className="absolute bottom-2 left-2" variant="default">
                                  <PawPrint className="w-3 h-3 mr-1" />
                                  US Ship
                                </Badge>
                              </div>
                              <h3 className="font-medium text-sm line-clamp-2 mb-2">
                                {product.productNameEn}
                              </h3>
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <span className="text-muted-foreground">Cost: </span>
                                  <span className="font-medium">${costPrice.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Retail: </span>
                                  <span className="font-bold text-primary">
                                    ${retailPrice.toFixed(2)}
                                  </span>
                                </div>
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
                        disabled={petCatalogProducts.length < 50 || isCatalogLoading}
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
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">
                          Profit Margin
                        </label>
                        <Select value={priceMultiplier} onValueChange={setPriceMultiplier}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1.5">1.5x</SelectItem>
                            <SelectItem value="2">2x</SelectItem>
                            <SelectItem value="2.5">2.5x</SelectItem>
                            <SelectItem value="3">3x</SelectItem>
                            <SelectItem value="4">4x</SelectItem>
                          </SelectContent>
                        </Select>
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
                      >
                        {importMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4 mr-2" />
                        )}
                        Import ({selectedProducts.size})
                      </Button>
                    </div>
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
                    const isImported = isAlreadyImported(product.pid);
                    const costPrice = Number(product.sellPrice) || 0;
                    const retailPrice = costPrice * parseFloat(priceMultiplier);

                    return (
                      <Card
                        key={product.pid}
                        className={`cursor-pointer transition-all ${
                          isSelected
                            ? "ring-2 ring-primary bg-primary/5"
                            : isImported
                            ? "opacity-60"
                            : "hover:shadow-lg"
                        }`}
                        onClick={() => !isImported && toggleProduct(product.pid)}
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
                            {isImported && (
                              <Badge className="absolute top-2 left-2" variant="secondary">
                                Already imported
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-medium text-sm line-clamp-2 mb-2">
                            {product.productNameEn}
                          </h3>
                          <div className="flex justify-between items-center text-sm">
                            <div>
                              <span className="text-muted-foreground">Cost: </span>
                              <span className="font-medium">${costPrice.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Retail: </span>
                              <span className="font-bold text-primary">
                                ${retailPrice.toFixed(2)}
                              </span>
                            </div>
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
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Store Products ({existingProducts?.length || 0})
              </h2>
              {existingProducts && existingProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {existingProducts.map((product) => (
                    <Card key={product.id}>
                      <CardContent className="p-4">
                        <img
                          src={product.image_url || "/placeholder.svg"}
                          alt={product.name}
                          className="w-full h-40 object-cover rounded-lg mb-3"
                        />
                        <h3 className="font-medium text-sm line-clamp-2 mb-2">
                          {product.name}
                        </h3>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-primary">
                            ${Number(product.price).toFixed(2)}
                          </span>
                          <Badge variant={product.is_active ? "default" : "secondary"}>
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
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
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
