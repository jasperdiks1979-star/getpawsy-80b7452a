import { useParams, Link } from 'react-router-dom';
import { ShoppingCart, Heart, Truck, Shield, ArrowLeft, Minus, Plus, Loader2, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageLightbox } from '@/components/ui/image-lightbox';

interface ProductVariant {
  vid: string;
  pid: string;
  variantNameEn: string;
  variantSku: string;
  variantImage?: string;
  variantKey: string;
  variantWeight: number;
  variantSellPrice: number;
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Fetch product from database
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch related products
  const { data: relatedProducts } = useQuery({
    queryKey: ['related-products', product?.category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('category', product?.category || '')
        .neq('id', id || '')
        .limit(4);
      
      if (error) throw error;
      return data;
    },
    enabled: !!product?.category,
  });

  // Parse variants from JSON
  const variants: ProductVariant[] = product?.variants && Array.isArray(product.variants) 
    ? (product.variants as unknown as ProductVariant[])
    : [];

  // Group variants - CJ uses variantKey as the display name
  const variantGroups = variants.reduce((groups, variant) => {
    // CJ format uses variantKey like "120 Soft Chews1 BOTTLE" or "Yellow Black"
    const displayName = variant.variantKey || variant.variantNameEn || 'Option';
    
    // Use a simple group name for all variants
    const groupName = 'Option';
    
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    
    // Avoid duplicates based on vid
    if (!groups[groupName].find(v => v.vid === variant.vid)) {
      groups[groupName].push(variant);
    }
    
    return groups;
  }, {} as Record<string, ProductVariant[]>);

  // Reset selected image when product changes
  useEffect(() => {
    setSelectedImage(0);
    setSelectedVariant(null);
  }, [id]);

  // Update selected image when variant is selected
  useEffect(() => {
    if (selectedVariant?.variantImage) {
      const images = product?.images && product.images.length > 0 
        ? product.images 
        : [product?.image_url || '/placeholder.svg'];
      const variantImageIndex = images.findIndex(img => img === selectedVariant.variantImage);
      if (variantImageIndex !== -1) {
        setSelectedImage(variantImageIndex);
      }
    }
  }, [selectedVariant, product]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Product not found</h1>
          <Link to="/products">
            <Button>Back to Products</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name + (selectedVariant ? ` - ${selectedVariant.variantNameEn}` : ''),
        price: Number(product.price),
        image: selectedVariant?.variantImage || product.image_url || '/placeholder.svg',
      });
    }
    toast.success(`${quantity}x ${product.name} added to cart!`);
  };

  const discount = product.compare_at_price
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : null;

  // Flatten images array (handle nested arrays from database) and filter valid URLs
  const rawImages = product.images && product.images.length > 0 
    ? product.images.flat().filter((img): img is string => 
        typeof img === 'string' && 
        img.startsWith('http') && 
        !img.includes('undefined')
      )
    : [];
  
  // Use image_url as fallback if no valid images
  const images = rawImages.length > 0 
    ? rawImages 
    : (product.image_url ? [product.image_url] : ['/placeholder.svg']);

  // Check if description contains HTML
  const descriptionHasHtml = product.description?.includes('<') && product.description?.includes('>');

  const inStock = product.stock !== null && product.stock > 0;

  const handlePrevImage = () => {
    setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1);
  };

  const handleNextImage = () => {
    setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
  };

  return (
    <Layout>
      <div className="container px-4 md:px-6 py-8">
        {/* Breadcrumb */}
        <Link
          to="/products"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Images */}
          <div className="space-y-4">
            {/* Main Image with Navigation */}
            <div 
              className="relative aspect-square rounded-xl overflow-hidden bg-muted group cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={images[selectedImage]}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              
              {/* Zoom indicator */}
              <div className="absolute top-3 right-3 bg-black/60 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="w-5 h-5" />
              </div>
              
              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrevImage();
                    }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextImage();
                    }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                  
                  {/* Image Counter */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
                    {selectedImage + 1} / {images.length}
                  </div>
                </>
              )}
            </div>
            
            {/* Thumbnail Carousel */}
            {images.length > 1 && (
              <div className="relative">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(idx)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        selectedImage === idx 
                          ? 'border-primary ring-2 ring-primary/20' 
                          : 'border-transparent hover:border-muted-foreground/30'
                      }`}
                    >
                      <img 
                        src={img} 
                        alt={`Product image ${idx + 1}`} 
                        className="w-full h-full object-cover" 
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              {product.category && (
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  {product.category}
                </p>
              )}
              <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
            </div>

            {/* Price */}
            {(() => {
              const displayPrice = selectedVariant?.variantSellPrice 
                ? Number(selectedVariant.variantSellPrice) 
                : Number(product.price);
              const originalPrice = product.compare_at_price 
                ? Number(product.compare_at_price) 
                : (selectedVariant?.variantSellPrice ? Number(product.price) : null);
              const currentDiscount = originalPrice 
                ? Math.round((1 - displayPrice / originalPrice) * 100) 
                : null;
              
              return (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-3xl font-bold text-primary">
                    ${displayPrice.toFixed(2)}
                  </span>
                  {originalPrice && originalPrice > displayPrice && (
                    <>
                      <span className="text-xl text-muted-foreground line-through">
                        ${originalPrice.toFixed(2)}
                      </span>
                      {currentDiscount && currentDiscount > 0 && (
                        <Badge variant="destructive">Save {currentDiscount}%</Badge>
                      )}
                    </>
                  )}
                  {selectedVariant && (
                    <Badge variant="outline" className="ml-2">
                      {selectedVariant.variantKey}
                    </Badge>
                  )}
                </div>
              );
            })()}

            {/* Short Description */}
            {product.description && !descriptionHasHtml && (
              <p className="text-muted-foreground">{product.description}</p>
            )}
            {product.description && descriptionHasHtml && (
              <p className="text-muted-foreground line-clamp-3">
                {product.description.replace(/<[^>]*>/g, '').substring(0, 200)}...
              </p>
            )}

            {/* Variants */}
            {variants.length > 0 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Kies een optie: {selectedVariant ? (selectedVariant.variantKey || 'Geselecteerd') : 'Selecteer'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((variant) => {
                      const isSelected = selectedVariant?.vid === variant.vid;
                      const displayValue = variant.variantKey || variant.variantNameEn || 'Optie';
                      
                      return (
                        <button
                          key={variant.vid}
                          onClick={() => setSelectedVariant(isSelected ? null : variant)}
                          className={`flex items-center px-4 py-2 rounded-lg border-2 transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          {variant.variantImage && (
                            <img 
                              src={variant.variantImage} 
                              alt={displayValue}
                              className="w-8 h-8 rounded object-cover mr-2"
                            />
                          )}
                          <span className="text-sm font-medium">{displayValue}</span>
                          {variant.variantSellPrice && variant.variantSellPrice !== Number(product.price) && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ${Number(variant.variantSellPrice).toFixed(2)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Stock */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">
                {inStock ? `In Stock (${product.stock})` : 'Out of Stock'}
              </span>
            </div>

            {/* Shipping Time */}
            {product.shipping_time && (
              <p className="text-sm text-muted-foreground">
                {product.shipping_time === 'Free Shipping' 
                  ? '🚚 Free Shipping included' 
                  : `Estimated delivery: ${product.shipping_time}`}
              </p>
            )}

            {/* Quantity & Add to Cart */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center border rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button
                size="lg"
                className="flex-1 gap-2"
                onClick={handleAddToCart}
                disabled={!inStock}
              >
                <ShoppingCart className="w-5 h-5" />
                Add to Cart
              </Button>

              <Button 
                variant="outline" 
                size="lg"
                onClick={() => toast.info('Added to wishlist!')}
              >
                <Heart className="w-5 h-5" />
              </Button>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Free Shipping</p>
                  <p className="text-xs text-muted-foreground">Included in price</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">30-Day Returns</p>
                  <p className="text-xs text-muted-foreground">Hassle-free</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-12">
          <Tabs defaultValue="description">
            <TabsList>
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="shipping">Shipping</TabsTrigger>
              {variants.length > 0 && (
                <TabsTrigger value="variants">Variants ({variants.length})</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="description" className="mt-4">
              {descriptionHasHtml ? (
                <div 
                  className="prose prose-sm max-w-none text-muted-foreground [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_li]:my-1 [&_img]:rounded-lg [&_img]:my-4"
                  dangerouslySetInnerHTML={{ __html: product.description || '' }}
                />
              ) : (
                <p className="text-muted-foreground">
                  {product.description || 'No description available.'}
                </p>
              )}
            </TabsContent>
            <TabsContent value="shipping" className="mt-4">
              <div className="space-y-3 text-muted-foreground">
                <p>🇺🇸 Ships from our US warehouse</p>
                <p>📦 Standard shipping: 5-7 business days</p>
                <p>🚀 Express shipping: 2-3 business days</p>
                <p>✨ Free shipping included in price</p>
              </div>
            </TabsContent>
            {variants.length > 0 && (
              <TabsContent value="variants" className="mt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {variants.map((variant) => (
                    <button
                      key={variant.vid}
                      onClick={() => {
                        setSelectedVariant(variant);
                        if (variant.variantImage) {
                          const idx = images.findIndex(img => img === variant.variantImage);
                          if (idx !== -1) setSelectedImage(idx);
                        }
                      }}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        selectedVariant?.vid === variant.vid
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {variant.variantImage && (
                        <img 
                          src={variant.variantImage} 
                          alt={variant.variantNameEn}
                          className="w-full aspect-square rounded object-cover mb-2"
                        />
                      )}
                      <p className="text-sm font-medium line-clamp-2">
                        {variant.variantNameEn}
                      </p>
                    </button>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-6">You May Also Like</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image Lightbox */}
      <ImageLightbox
        images={images}
        initialIndex={selectedImage}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        alt={product.name}
      />
    </Layout>
  );
};

export default ProductDetail;