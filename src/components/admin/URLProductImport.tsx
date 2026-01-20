import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Link, 
  Plus, 
  Trash2, 
  Download, 
  Loader2, 
  Check, 
  X, 
  Package,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateSellingPrice } from "@/lib/pricing";

interface URLEntry {
  id: string;
  url: string;
  productId: string | null;
  status: "pending" | "loading" | "found" | "error" | "imported" | "exists";
  productData?: CJProductData;
  error?: string;
}

interface CJProductData {
  pid: string;
  productNameEn: string;
  productImage: string;
  productWeight: number;
  categoryName: string;
  sellPrice: number;
  productSku: string;
  description?: string;
  images?: string[];
  variants?: CJVariant[];
  totalStock?: number;
}

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

// Extract product ID from CJ Dropshipping URL
function extractProductId(url: string): string | null {
  // Supported URL formats:
  // 1: https://cjdropshipping.com/product/xxx-p-PRODUCTID.html
  // 2: https://www.cjdropshipping.com/product/some-product-name-p-00000000000000000000.html
  // 3: Direct product ID (just the ID itself, 18-30 alphanumeric chars)
  // 4: Mobile app shared URLs with pid parameter
  // 5: URLs with numeric product IDs (19-20 digit numbers)
  // 6: UUID format product IDs (e.g., 956CEFCE-0470-4BE9-86FE-7FFDDD0C82AA)
  
  // Clean the URL
  const cleanUrl = url.trim();
  
  // UUID regex pattern (with hyphens)
  const uuidPattern = /[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}/;
  
  // Check if it's already a UUID product ID
  if (uuidPattern.test(cleanUrl) && cleanUrl.length === 36) {
    return cleanUrl;
  }
  
  // Check if it's already a product ID (numeric, 16-25 digits)
  if (/^\d{16,25}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
  // Check if it's already a product ID (alphanumeric, 18-30 chars)
  if (/^[A-Za-z0-9]{18,30}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
  // Pattern for CJ product URLs - try multiple formats
  const patterns = [
    // UUID format in URL: -p-UUID.html (highest priority for this format)
    /-p-([A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})\.html/i,
    // p-UUID.html format
    /p-([A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})\.html/i,
    // UUID anywhere in URL
    /([A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})/,
    // -p-PRODUCTID.html format (numeric)
    /-p-(\d{16,25})\.html/i,
    // p-PRODUCTID.html format
    /p-(\d{16,25})\.html/i,
    // pid query parameter
    /pid=(\d{16,25})/i,
    // product_id query parameter
    /product_id=(\d{16,25})/i,
    // id query parameter
    /[?&]id=(\d{16,25})/i,
    // Alphanumeric product ID formats
    /-p-([A-Za-z0-9]{18,30})\.html/i,
    /p-([A-Za-z0-9]{18,30})\.html/i,
    /pid=([A-Za-z0-9]{18,30})/i,
    /product\/.*-([A-Za-z0-9]{18,30})\.html/i,
    // Numeric ID at the end before .html
    /-(\d{16,25})\.html/i,
    // Any long numeric string in the URL (fallback)
    /(\d{19,21})/,
    // Alphanumeric fallback
    /([A-Za-z0-9]{20,30})(?:\.html)?$/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

export function URLProductImport() {
  const { invokeFunction } = useAuthenticatedFetch();
  const queryClient = useQueryClient();
  
  const [urlEntries, setUrlEntries] = useState<URLEntry[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("auto");
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
  } | null>(null);

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

  // Fetch existing products to check for duplicates
  const { data: existingProducts } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("cj_product_id");
      if (error) throw error;
      return data;
    },
  });

  const importedCjIds = useMemo(() => {
    return new Set(existingProducts?.map(p => p.cj_product_id).filter(Boolean) || []);
  }, [existingProducts]);

  // Add URLs from bulk input
  const handleAddUrls = () => {
    const lines = bulkInput.split("\n").filter(line => line.trim());
    const newEntries: URLEntry[] = [];
    
    for (const line of lines) {
      const productId = extractProductId(line);
      
      // Check for duplicates in current list
      const exists = urlEntries.some(e => e.productId === productId || e.url === line.trim());
      if (exists) continue;
      
      // Check if already imported
      const alreadyImported = productId && importedCjIds.has(productId);
      
      newEntries.push({
        id: crypto.randomUUID(),
        url: line.trim(),
        productId,
        status: alreadyImported ? "exists" : (productId ? "pending" : "error"),
        error: productId ? (alreadyImported ? "Product al geïmporteerd" : undefined) : "Geen geldig product ID gevonden",
      });
    }
    
    setUrlEntries(prev => [...prev, ...newEntries]);
    setBulkInput("");
  };

  // Remove a single entry
  const removeEntry = (id: string) => {
    setUrlEntries(prev => prev.filter(e => e.id !== id));
  };

  // Clear all entries
  const clearAll = () => {
    setUrlEntries([]);
    setImportProgress(null);
  };

  // Fetch product details for all pending entries
  const fetchDetailsMutation = useMutation({
    mutationFn: async () => {
      const pendingEntries = urlEntries.filter(e => e.status === "pending" && e.productId);
      if (pendingEntries.length === 0) {
        throw new Error("Geen geldige producten om op te halen");
      }

      const productIds = pendingEntries.map(e => e.productId!);
      
      // Mark entries as loading
      setUrlEntries(prev => prev.map(e => 
        pendingEntries.find(p => p.id === e.id) 
          ? { ...e, status: "loading" as const } 
          : e
      ));

      const { data, error } = await invokeFunction<Array<{
        pid: string;
        success: boolean;
        data?: CJProductData;
        images?: string[];
        variants?: CJVariant[];
        totalStock?: number;
        error?: string;
      }>>("cj-dropshipping", {
        body: {
          action: "get-products-for-import",
          productIds,
        },
      });

      if (error) throw error;
      return data || [];
    },
    onSuccess: (results) => {
      setUrlEntries(prev => prev.map(entry => {
        if (entry.status !== "loading") return entry;
        
        const result = results.find(r => r.pid === entry.productId);
        if (!result) {
          return { ...entry, status: "error" as const, error: "Product niet gevonden in API response" };
        }
        
        if (!result.success) {
          return { ...entry, status: "error" as const, error: result.error || "Onbekende fout" };
        }
        
        return {
          ...entry,
          status: "found" as const,
          productData: {
            ...result.data!,
            images: result.images,
            variants: result.variants,
            totalStock: result.totalStock,
          },
        };
      }));
      
      toast.success("Productgegevens opgehaald");
    },
    onError: (error) => {
      setUrlEntries(prev => prev.map(e => 
        e.status === "loading" 
          ? { ...e, status: "error" as const, error: (error as Error).message } 
          : e
      ));
      toast.error(`Fout bij ophalen: ${(error as Error).message}`);
    },
  });

  // Generate SEO text for a product
  const generateSeoForProduct = async (productName: string, category: string) => {
    const { data, error } = await invokeFunction<{ description?: string }>("generate-seo-text", {
      body: { productName, category },
    });
    if (error) throw error;
    return data?.description || "";
  };

  // Import all found products
  const importMutation = useMutation({
    mutationFn: async () => {
      const productsToImport = urlEntries.filter(e => e.status === "found" && e.productData);
      if (productsToImport.length === 0) {
        throw new Error("Geen producten om te importeren");
      }

      const total = productsToImport.length;
      const imported: string[] = [];

      for (let i = 0; i < productsToImport.length; i++) {
        const entry = productsToImport[i];
        const p = entry.productData!;
        
        setImportProgress({
          current: i + 1,
          total,
          status: `Importeren ${i + 1}/${total}: ${p.productNameEn.substring(0, 40)}...`,
        });

        try {
          // Flatten and deduplicate images, filtering out empty/invalid URLs
          const rawImages = p.images || [p.productImage];
          const flattenDeep = (arr: unknown[]): string[] => {
            const result: string[] = [];
            for (const item of arr) {
              if (Array.isArray(item)) {
                result.push(...flattenDeep(item));
              } else if (typeof item === 'string' && item.trim() && item.startsWith('http') && !item.includes('undefined')) {
                result.push(item.trim());
              }
            }
            return result;
          };
          const allImages = [...new Set(flattenDeep(Array.isArray(rawImages) ? rawImages : [rawImages]))];
          
          // Ensure we have valid images, use productImage as fallback
          const validProductImage = p.productImage && p.productImage.trim() && p.productImage.startsWith('http') && !p.productImage.includes('undefined')
            ? p.productImage.trim()
            : null;
          
          // If productImage is valid and not in the array, add it to the front
          let images = allImages;
          if (validProductImage && !images.includes(validProductImage)) {
            images = [validProductImage, ...images];
          }
          
          // Use the first valid image as the main image_url
          const mainImageUrl = images.length > 0 ? images[0] : (validProductImage || '/placeholder.svg');
          
          const stock = p.totalStock ?? 100;

          // Generate SEO description
          const category = selectedCategory === "auto" ? p.categoryName : selectedCategory;
          let seoDescription = p.description || "";
          try {
            seoDescription = await generateSeoForProduct(p.productNameEn, category);
          } catch (err) {
            console.error("SEO generation failed for", p.productNameEn, err);
          }

          // Calculate pricing
          const parsedSellPrice = typeof p.sellPrice === 'string' 
            ? parseFloat(String(p.sellPrice).split('-')[0]) 
            : Number(p.sellPrice);
          const costPrice = isNaN(parsedSellPrice) ? 0 : parsedSellPrice;
          
          let parsedWeight: number;
          const weightStr = String(p.productWeight || '200');
          if (weightStr.includes('-')) {
            parsedWeight = parseFloat(weightStr.split('-')[0]) || 200;
          } else {
            parsedWeight = parseFloat(weightStr) || 200;
          }
          const weight = parsedWeight <= 0 ? 200 : parsedWeight;
          const pricing = calculateSellingPrice(costPrice, weight);

          // Process variants
          const processedVariants = p.variants ? p.variants.map((variant) => {
            const variantCostPrice = Number(variant.variantSellPrice) || costPrice;
            const variantWeight = Number(variant.variantWeight) || weight;
            const variantPricing = calculateSellingPrice(variantCostPrice, variantWeight);
            
            return {
              ...variant,
              variantCostPrice: variantCostPrice,
              variantSellPrice: variantPricing.sellingPrice,
            };
          }) : null;

          // Insert into database
          const { error: insertError } = await supabase
            .from("products")
            .insert({
              cj_product_id: p.pid,
              name: p.productNameEn,
              description: seoDescription,
              category: category,
              image_url: mainImageUrl,
              images: images,
              price: pricing.sellingPrice,
              cost_price: pricing.totalCost,
              compare_at_price: pricing.compareAtPrice,
              sku: p.productSku,
              weight: weight,
              stock: stock,
              variants: processedVariants,
              is_active: true,
              shipping_time: "7-15 werkdagen",
              supplier_name: "CJ Dropshipping",
            });

          if (insertError) throw insertError;
          
          imported.push(entry.id);
          
          // Mark as imported in state
          setUrlEntries(prev => prev.map(e => 
            e.id === entry.id ? { ...e, status: "imported" as const } : e
          ));
        } catch (err) {
          console.error("Import error for", p.productNameEn, err);
          setUrlEntries(prev => prev.map(e => 
            e.id === entry.id ? { ...e, status: "error" as const, error: (err as Error).message } : e
          ));
        }
      }

      return imported.length;
    },
    onSuccess: (count) => {
      setImportProgress(null);
      toast.success(`${count} producten succesvol geïmporteerd!`);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (error) => {
      setImportProgress(null);
      toast.error(`Import mislukt: ${(error as Error).message}`);
    },
  });

  const pendingCount = urlEntries.filter(e => e.status === "pending").length;
  const foundCount = urlEntries.filter(e => e.status === "found").length;
  const errorCount = urlEntries.filter(e => e.status === "error").length;
  const importedCount = urlEntries.filter(e => e.status === "imported").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Producten Importeren via URL
          </CardTitle>
          <CardDescription>
            Plak CJ Dropshipping product-URL's of product-ID's om producten direct te importeren.
            Eén URL/ID per regel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bulk input */}
          <div>
            <Textarea
              placeholder={`Plak hier je CJ Dropshipping URL's of product-ID's, één per regel:

https://cjdropshipping.com/product/pet-toy-p-123456789012345678.html
1234567890123456789012
https://www.cjdropshipping.com/product/...`}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          {/* Category selection */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1.5 block">Categorie voor import</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">🔄 Automatisch (van CJ)</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddUrls} disabled={!bulkInput.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              URL's Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* URL list */}
      {urlEntries.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Product Lijst ({urlEntries.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearAll}
                  disabled={fetchDetailsMutation.isPending || importMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Alles Wissen
                </Button>
              </div>
            </div>
            
            {/* Status badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {pendingCount > 0 && (
                <Badge variant="outline">{pendingCount} wachtend</Badge>
              )}
              {foundCount > 0 && (
                <Badge variant="default" className="bg-green-600">{foundCount} gevonden</Badge>
              )}
              {importedCount > 0 && (
                <Badge variant="default" className="bg-blue-600">{importedCount} geïmporteerd</Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="destructive">{errorCount} fouten</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            {importProgress && (
              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{importProgress.status}</span>
                  <span>{importProgress.current}/{importProgress.total}</span>
                </div>
                <Progress value={(importProgress.current / importProgress.total) * 100} />
              </div>
            )}

            {/* Product list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {urlEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    entry.status === "found" ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                    entry.status === "imported" ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
                    entry.status === "error" || entry.status === "exists" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                    entry.status === "loading" ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" :
                    "bg-muted/50"
                  }`}
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {entry.status === "pending" && <Package className="w-5 h-5 text-muted-foreground" />}
                    {entry.status === "loading" && <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />}
                    {entry.status === "found" && <Check className="w-5 h-5 text-green-600" />}
                    {entry.status === "imported" && <Check className="w-5 h-5 text-blue-600" />}
                    {(entry.status === "error" || entry.status === "exists") && <X className="w-5 h-5 text-red-600" />}
                  </div>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    {entry.productData ? (
                      <div className="flex items-center gap-3">
                        <img 
                          src={entry.productData.productImage} 
                          alt="" 
                          className="w-10 h-10 object-cover rounded"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{entry.productData.productNameEn}</p>
                          <p className="text-xs text-muted-foreground">
                            ${entry.productData.sellPrice} • {entry.productData.variants?.length || 0} varianten • {entry.productData.totalStock || 0} voorraad
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-mono truncate">{entry.productId || entry.url}</p>
                        {entry.error && (
                          <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" />
                            {entry.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <Badge 
                    variant={
                      entry.status === "found" ? "default" : 
                      entry.status === "imported" ? "default" :
                      entry.status === "error" || entry.status === "exists" ? "destructive" : 
                      "secondary"
                    }
                    className={
                      entry.status === "found" ? "bg-green-600" :
                      entry.status === "imported" ? "bg-blue-600" :
                      ""
                    }
                  >
                    {entry.status === "pending" && "Wachtend"}
                    {entry.status === "loading" && "Laden..."}
                    {entry.status === "found" && "Gevonden"}
                    {entry.status === "imported" && "Geïmporteerd"}
                    {entry.status === "error" && "Fout"}
                    {entry.status === "exists" && "Bestaat al"}
                  </Badge>

                  {/* Remove button */}
                  {entry.status !== "loading" && entry.status !== "imported" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEntry(entry.id)}
                      className="shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
              {pendingCount > 0 && (
                <Button
                  onClick={() => fetchDetailsMutation.mutate()}
                  disabled={fetchDetailsMutation.isPending || importMutation.isPending}
                >
                  {fetchDetailsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Productgegevens Ophalen ({pendingCount})
                </Button>
              )}
              
              {foundCount > 0 && (
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={fetchDetailsMutation.isPending || importMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Importeren ({foundCount})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
