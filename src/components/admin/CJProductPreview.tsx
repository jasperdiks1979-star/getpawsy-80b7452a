import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { calculateSellingPrice } from "@/lib/pricing";
import { 
  Package, 
  Loader2, 
  ImageIcon, 
  Boxes, 
  DollarSign, 
  Weight, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from "lucide-react";

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

interface CJVariant {
  vid: string;
  variantNameEn: string;
  variantSku: string;
  variantImage?: string;
  variantWeight: number;
  variantSellPrice: number;
  inventories?: Array<{
    countryCode: string;
    totalInventory: number;
  }>;
}

interface ProductDetails {
  pid: string;
  productNameEn: string;
  productSku: string;
  productImage: string;
  productImageSet?: string[];
  productWeight: number;
  categoryName: string;
  sellPrice: number;
  description?: string;
  variants?: CJVariant[];
}

interface CJProductPreviewProps {
  product: CJProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (product: CJProduct) => void;
  isImporting?: boolean;
}

export function CJProductPreview({ 
  product, 
  open, 
  onOpenChange, 
  onImport,
  isImporting = false 
}: CJProductPreviewProps) {
  const { invokeFunction } = useAuthenticatedFetch();
  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [totalStock, setTotalStock] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Fetch full product details when dialog opens
  useEffect(() => {
    if (open && product) {
      fetchProductDetails(product.pid);
    } else {
      // Reset state when dialog closes
      setDetails(null);
      setAllImages([]);
      setTotalStock(0);
      setCurrentImageIndex(0);
      setError(null);
    }
  }, [open, product?.pid]);

  const fetchProductDetails = async (productId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await invokeFunction<{
        result: boolean;
        data?: ProductDetails;
        message?: string;
      }>("cj-dropshipping", {
        body: {
          action: "get-product-details",
          productId: productId,
          countryCode: "US"
        }
      });

      if (fetchError) {
        throw new Error(fetchError.message || "Failed to fetch product details");
      }

      if (!data?.result || !data.data) {
        throw new Error(data?.message || "Product details not available");
      }

      const productDetails = data.data;
      setDetails(productDetails);

      // Collect all images
      const images: string[] = [];
      
      // Parse productImageSet
      if (productDetails.productImageSet) {
        const imageSet = Array.isArray(productDetails.productImageSet) 
          ? productDetails.productImageSet 
          : typeof productDetails.productImageSet === 'string'
            ? JSON.parse(productDetails.productImageSet)
            : [];
        
        for (const img of imageSet) {
          if (img && typeof img === 'string' && img.startsWith('http') && !images.includes(img)) {
            images.push(img);
          }
        }
      }

      // Add main image if not already included
      if (productDetails.productImage && !images.includes(productDetails.productImage)) {
        images.unshift(productDetails.productImage);
      }

      // Add variant images
      if (productDetails.variants) {
        for (const variant of productDetails.variants) {
          if (variant.variantImage && !images.includes(variant.variantImage)) {
            images.push(variant.variantImage);
          }
        }
      }

      setAllImages(images);

      // Calculate total stock from variants
      let stock = 0;
      if (productDetails.variants) {
        for (const variant of productDetails.variants) {
          if (variant.inventories) {
            for (const inv of variant.inventories) {
              if (inv.countryCode === 'US') {
                stock += inv.totalInventory || 0;
              }
            }
          }
        }
      }
      setTotalStock(stock);

    } catch (err) {
      console.error("Error fetching product details:", err);
      setError(err instanceof Error ? err.message : "Failed to load product details");
    } finally {
      setIsLoading(false);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  if (!product) return null;

  // Calculate pricing
  const parsedSellPrice = typeof product.sellPrice === 'string' 
    ? parseFloat(String(product.sellPrice).split('-')[0]) 
    : Number(product.sellPrice);
  const costPrice = isNaN(parsedSellPrice) ? 0 : parsedSellPrice;
  const weightStr = String(product.productWeight || '200');
  const parsedWeight = weightStr.includes('-') 
    ? parseFloat(weightStr.split('-')[0]) || 200 
    : parseFloat(weightStr) || 200;
  const weight = parsedWeight <= 0 ? 200 : parsedWeight;
  const pricing = calculateSellingPrice(costPrice, weight);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg font-semibold line-clamp-2 pr-8">
            {product.productNameEn}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)]">
          <div className="p-6 pt-4 space-y-6">
            {/* Image Gallery */}
            <div className="relative">
              <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
                {isLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : allImages.length > 0 ? (
                  <img 
                    src={allImages[currentImageIndex]} 
                    alt={product.productNameEn}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img 
                    src={product.productImage} 
                    alt={product.productNameEn}
                    className="w-full h-full object-contain"
                  />
                )}
                
                {/* Image navigation */}
                {allImages.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100"
                      onClick={nextImage}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                      {currentImageIndex + 1} / {allImages.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnail strip */}
              {allImages.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                  {allImages.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                        index === currentImageIndex 
                          ? 'border-primary ring-2 ring-primary/20' 
                          : 'border-transparent hover:border-muted-foreground/30'
                      }`}
                    >
                      <img 
                        src={img} 
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Inkoopprijs
                </div>
                <div className="text-lg font-semibold">${pricing.totalCost.toFixed(2)}</div>
              </div>
              <div className="bg-primary/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-primary text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Verkoopprijs
                </div>
                <div className="text-lg font-bold text-primary">${pricing.sellingPrice.toFixed(2)}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Weight className="w-4 h-4" />
                  Gewicht
                </div>
                <div className="text-lg font-semibold">{weight}g</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Boxes className="w-4 h-4" />
                  Voorraad (US)
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-semibold ${
                    totalStock > 100 ? 'text-green-600' : 
                    totalStock > 0 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {isLoading ? '...' : totalStock}
                  </span>
                  {!isLoading && (
                    totalStock > 100 ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
                    totalStock > 0 ? <AlertTriangle className="w-4 h-4 text-yellow-600" /> :
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{product.categoryName}</Badge>
              <Badge variant="outline">SKU: {product.productSku}</Badge>
              <Badge variant="outline">{pricing.multiplier.toFixed(1)}x markup</Badge>
              <Badge variant="default" className="bg-green-600">Free Shipping</Badge>
              {allImages.length > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  {allImages.length} afbeeldingen
                </Badge>
              )}
            </div>

            {/* Description */}
            {(details?.description || product.description) && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Beschrijving
                </h3>
                <div 
                  className="text-sm text-muted-foreground prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: details?.description || product.description || '' 
                  }}
                />
              </div>
            )}

            {/* Variants */}
            {details?.variants && details.variants.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Boxes className="w-4 h-4" />
                  Varianten ({details.variants.length})
                </h3>
                <div className="grid gap-2 max-h-60 overflow-y-auto">
                  {details.variants.map((variant) => {
                    const variantStock = variant.inventories?.find(i => i.countryCode === 'US')?.totalInventory || 0;
                    const variantPricing = calculateSellingPrice(
                      Number(variant.variantSellPrice) || costPrice,
                      Number(variant.variantWeight) || weight
                    );
                    
                    return (
                      <div 
                        key={variant.vid}
                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {variant.variantImage && (
                          <img 
                            src={variant.variantImage}
                            alt={variant.variantNameEn}
                            className="w-12 h-12 object-cover rounded-md flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {variant.variantNameEn}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            SKU: {variant.variantSku}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-semibold text-primary">
                            ${variantPricing.sellingPrice.toFixed(2)}
                          </div>
                          <div className={`text-xs ${
                            variantStock > 50 ? 'text-green-600' : 
                            variantStock > 0 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {variantStock} in voorraad
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 inline-block mr-2" />
                {error}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer with import button */}
        <div className="border-t p-4 bg-background flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {totalStock > 0 ? (
              <span className="text-green-600 font-medium">✓ Op voorraad in US warehouse</span>
            ) : isLoading ? (
              <span>Voorraad controleren...</span>
            ) : (
              <span className="text-yellow-600">⚠ Voorraad onbekend of 0</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Sluiten
            </Button>
            <Button 
              onClick={() => onImport(product)}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Importeren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
