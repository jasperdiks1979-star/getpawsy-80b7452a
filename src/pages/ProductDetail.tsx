import { useParams, Link } from 'react-router-dom';
import { ShoppingCart, Heart, Truck, Shield, ArrowLeft, Minus, Plus, Loader2, ChevronLeft, ChevronRight, ZoomIn, Package, RotateCcw, Award, Star, Clock, MessageSquare, Ruler, Weight, Box, Info } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ReviewsList } from '@/components/reviews/ReviewsList';

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
  const queryClient = useQueryClient();
  const { addItem } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { addToRecentlyViewed, getRecentlyViewedIds } = useRecentlyViewed();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = (imagesLength: number) => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      setSelectedImage(prev => prev === imagesLength - 1 ? 0 : prev + 1);
    }
    if (isRightSwipe) {
      setSelectedImage(prev => prev === 0 ? imagesLength - 1 : prev - 1);
    }
  };

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

  // Get recently viewed product IDs (excluding current product)
  const recentlyViewedIds = getRecentlyViewedIds(id);

  // Fetch recently viewed products
  const { data: recentlyViewedProducts } = useQuery({
    queryKey: ['recently-viewed-products', recentlyViewedIds],
    queryFn: async () => {
      if (recentlyViewedIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .in('id', recentlyViewedIds);
      
      if (error) throw error;
      
      // Sort by the order in recentlyViewedIds
      return data?.sort((a, b) => 
        recentlyViewedIds.indexOf(a.id) - recentlyViewedIds.indexOf(b.id)
      ) || [];
    },
    enabled: recentlyViewedIds.length > 0,
  });

  // Fetch product reviews
  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const handleReviewsRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product-reviews', id] });
  };

  // Parse variants from JSON
  const variants: ProductVariant[] = product?.variants && Array.isArray(product.variants) 
    ? (product.variants as unknown as ProductVariant[])
    : [];

  // Group variants - CJ uses variantKey as the display name
  const variantGroups = variants.reduce((groups, variant) => {
    const displayName = variant.variantKey || variant.variantNameEn || 'Option';
    const groupName = 'Option';
    
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    
    if (!groups[groupName].find(v => v.vid === variant.vid)) {
      groups[groupName].push(variant);
    }
    
    return groups;
  }, {} as Record<string, ProductVariant[]>);

  // Reset selected image when product changes and add to recently viewed
  useEffect(() => {
    setSelectedImage(0);
    setSelectedVariant(null);
    setImageLoaded(false);
    
    // Add current product to recently viewed
    if (id) {
      addToRecentlyViewed(id);
    }
  }, [id, addToRecentlyViewed]);

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

  // Auto-scroll thumbnail into view
  useEffect(() => {
    const thumbnail = thumbnailRefs.current[selectedImage];
    if (thumbnail) {
      thumbnail.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedImage]);

  // Reset image loaded state when image changes
  useEffect(() => {
    setImageLoaded(false);
  }, [selectedImage]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading product...</p>
          </motion.div>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Package className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-display font-bold mb-4">Product not found</h1>
            <p className="text-muted-foreground mb-6">This product doesn't exist or is no longer available.</p>
            <Link to="/products">
              <Button className="btn-organic">Browse All Products</Button>
            </Link>
          </motion.div>
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

  const handleWishlistToggle = () => {
    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
      toast.info('Removed from wishlist');
    } else {
      addToWishlist(product.id);
      toast.success('Added to wishlist!');
    }
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

  const inWishlist = isInWishlist(product.id);

  return (
    <Layout>
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-40 -left-40 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="container px-4 md:px-6 py-8">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Products</span>
          </Link>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
          {/* Image Gallery */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-4"
          >
            {/* Main Image */}
            <div 
              className="relative aspect-square w-full rounded-3xl overflow-hidden bg-gradient-to-br from-muted/50 to-muted group cursor-zoom-in shadow-soft"
              onClick={() => setLightboxOpen(true)}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={() => onTouchEnd(images.length)}
            >
              {/* Loading skeleton */}
              {!imageLoaded && (
                <div className="absolute inset-0 bg-muted animate-pulse" />
              )}
              
              <AnimatePresence mode="wait">
                <motion.img
                  key={selectedImage}
                  src={images[selectedImage]}
                  alt={product.name}
                  className="w-full h-full object-contain"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: imageLoaded ? 1 : 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  onLoad={() => setImageLoaded(true)}
                />
              </AnimatePresence>
              
              {/* Zoom indicator */}
              <motion.div 
                className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm text-foreground p-2.5 rounded-full shadow-soft"
                initial={{ opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <ZoomIn className="w-5 h-5" />
              </motion.div>

              {/* Discount badge */}
              {discount && discount > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute top-4 left-4"
                >
                  <Badge className="bg-accent text-accent-foreground font-semibold px-3 py-1.5 text-sm shadow-soft">
                    -{discount}%
                  </Badge>
                </motion.div>
              )}
              
              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full shadow-soft bg-background/90 backdrop-blur-sm hover:bg-background"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full shadow-soft bg-background/90 backdrop-blur-sm hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextImage();
                    }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                  
                  {/* Image Counter */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm text-foreground text-sm px-4 py-1.5 rounded-full shadow-soft font-medium">
                    {selectedImage + 1} / {images.length}
                  </div>
                </>
              )}
            </div>
            
            {/* Thumbnail Carousel */}
            {images.length > 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="relative flex items-center gap-3"
              >
                {/* Left Arrow */}
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0 h-10 w-10 rounded-full border-2"
                  onClick={handlePrevImage}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* Thumbnails */}
                <div 
                  className="flex-1 overflow-hidden relative touch-pan-x"
                >
                  {/* Fade edges */}
                  <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
                  
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {images.map((img, idx) => (
                      <motion.button
                        key={idx}
                        ref={(el) => { thumbnailRefs.current[idx] = el; }}
                        onClick={() => setSelectedImage(idx)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden transition-all snap-start ${
                          selectedImage === idx 
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-soft' 
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img 
                          src={img} 
                          alt={`Product image ${idx + 1}`} 
                          className="w-full h-full object-cover" 
                        />
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Right Arrow */}
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0 h-10 w-10 rounded-full border-2"
                  onClick={handleNextImage}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </motion.div>

          {/* Product Details */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-6"
          >
            {/* Category & Title */}
            <div>
              {product.category && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-primary font-medium uppercase tracking-wider mb-2"
                >
                  {product.category}
                </motion.p>
              )}
              <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground leading-tight">
                {product.name}
              </h1>
              
              {/* Rating placeholder */}
              <div className="flex items-center gap-2 mt-3">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < 4 ? 'text-warning fill-warning' : 'text-muted'}`} />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">(24 reviews)</span>
              </div>
            </div>

            {/* Price */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-muted/50 rounded-2xl p-5"
            >
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
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl md:text-4xl font-display font-bold text-primary">
                      ${displayPrice.toFixed(2)}
                    </span>
                    {originalPrice && originalPrice > displayPrice && (
                      <>
                        <span className="text-xl text-muted-foreground line-through">
                          ${originalPrice.toFixed(2)}
                        </span>
                        {currentDiscount && currentDiscount > 0 && (
                          <Badge className="bg-accent/20 text-accent-foreground border-accent/30">
                            Save {currentDiscount}%
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
              
              {/* Selected variant badge */}
              {selectedVariant && (
                <Badge variant="outline" className="mt-3">
                  {selectedVariant.variantKey}
                </Badge>
              )}
            </motion.div>

            {/* Short Description */}
            {product.description && (
              <div className="text-muted-foreground leading-relaxed">
                {descriptionHasHtml ? (
                  <p className="line-clamp-3">
                    {product.description.replace(/<[^>]*>/g, '').substring(0, 200)}...
                  </p>
                ) : (
                  <p>{product.description}</p>
                )}
              </div>
            )}

            {/* Variants */}
            {variants.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <label className="text-sm font-semibold text-foreground">
                  Choose an option: <span className="text-primary">{selectedVariant ? selectedVariant.variantKey : 'Select'}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {variants.map((variant) => {
                    const isSelected = selectedVariant?.vid === variant.vid;
                    const displayValue = variant.variantKey || variant.variantNameEn || 'Option';
                    
                    return (
                      <motion.button
                        key={variant.vid}
                        onClick={() => setSelectedVariant(isSelected ? null : variant)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center px-4 py-2.5 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-soft'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        {variant.variantImage && (
                          <img 
                            src={variant.variantImage} 
                            alt={displayValue}
                            className="w-8 h-8 rounded-lg object-cover mr-2"
                          />
                        )}
                        <span className="text-sm font-medium">{displayValue}</span>
                        {variant.variantSellPrice && variant.variantSellPrice !== Number(product.price) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ${Number(variant.variantSellPrice).toFixed(2)}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Stock Status */}
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${inStock ? 'bg-success animate-pulse' : 'bg-destructive'}`} />
              <span className="font-medium text-foreground">
                {inStock ? `In Stock (${product.stock} available)` : 'Out of Stock'}
              </span>
            </div>

            {/* Shipping Time */}
            {product.shipping_time && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="w-4 h-4" />
                <span className="text-sm">
                  {product.shipping_time === 'Free Shipping' 
                    ? 'Free shipping included' 
                    : `Delivery: ${product.shipping_time}`}
                </span>
              </div>
            )}

            {/* Quantity & Actions */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap items-center gap-4 pt-4"
            >
              {/* Quantity Selector */}
              <div className="flex items-center bg-muted/50 rounded-xl overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-none h-12 w-12 hover:bg-muted"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-12 text-center font-semibold text-lg">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-none h-12 w-12 hover:bg-muted"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Add to Cart */}
              <Button
                size="lg"
                className="flex-1 h-12 gap-2 btn-organic text-base font-semibold"
                onClick={handleAddToCart}
                disabled={!inStock}
              >
                <ShoppingCart className="w-5 h-5" />
                Add to Cart
              </Button>

              {/* Wishlist */}
              <Button 
                variant="outline" 
                size="lg"
                className={`h-12 w-12 rounded-xl border-2 ${inWishlist ? 'border-accent bg-accent/10 text-accent' : ''}`}
                onClick={handleWishlistToggle}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? 'fill-current' : ''}`} />
              </Button>
            </motion.div>

            {/* Trust Features */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="grid grid-cols-2 gap-4 pt-6 border-t border-border/50"
            >
              {[
                { icon: Truck, title: 'Free Shipping', subtitle: 'On all orders' },
                { icon: Shield, title: '30-Day Returns', subtitle: 'Not happy? Money back!' },
                { icon: RotateCcw, title: 'Easy Exchanges', subtitle: 'Free exchanges' },
                { icon: Award, title: 'Quality Guarantee', subtitle: '100% satisfied' },
              ].map((feature, idx) => (
                <motion.div 
                  key={feature.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + idx * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.subtitle}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Tabs Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-16"
        >
          <Tabs defaultValue="description" className="w-full">
            <TabsList className="w-full justify-start border-b border-border/50 bg-transparent p-0 h-auto flex-wrap">
              <TabsTrigger 
                value="description" 
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Description
              </TabsTrigger>
              <TabsTrigger 
                value="specifications"
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Specifications
              </TabsTrigger>
              <TabsTrigger 
                value="size-guide"
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Size Guide
              </TabsTrigger>
              <TabsTrigger 
                value="shipping"
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Shipping
              </TabsTrigger>
              {variants.length > 0 && (
                <TabsTrigger 
                  value="variants"
                  className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
                >
                  Options ({variants.length})
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="description" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                {descriptionHasHtml ? (
                  <div 
                    className="prose prose-sm max-w-none text-muted-foreground [&_h2]:text-lg [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_li]:my-1.5 [&_img]:rounded-xl [&_img]:my-4 [&_p]:leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: product.description || '' }}
                  />
                ) : (
                  <p className="text-muted-foreground leading-relaxed">
                    {product.description || 'No description available.'}
                  </p>
                )}
              </div>
            </TabsContent>
            
            {/* Specifications Tab */}
            <TabsContent value="specifications" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Product Specifications */}
                  <div className="space-y-4">
                    <h3 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
                      <Box className="w-5 h-5 text-primary" />
                      Product Details
                    </h3>
                    <div className="space-y-3">
                      {product.sku && (
                        <div className="flex justify-between items-center py-2 border-b border-border/50">
                          <span className="text-muted-foreground">SKU</span>
                          <span className="font-medium text-foreground">{product.sku}</span>
                        </div>
                      )}
                      {product.category && (
                        <div className="flex justify-between items-center py-2 border-b border-border/50">
                          <span className="text-muted-foreground">Category</span>
                          <span className="font-medium text-foreground">{product.category}</span>
                        </div>
                      )}
                      {product.weight && (
                        <div className="flex justify-between items-center py-2 border-b border-border/50">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Weight className="w-4 h-4" />
                            Weight
                          </span>
                          <span className="font-medium text-foreground">{Number(product.weight).toFixed(2)} lbs</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-2 border-b border-border/50">
                        <span className="text-muted-foreground">Availability</span>
                        <span className={`font-medium ${inStock ? 'text-success' : 'text-destructive'}`}>
                          {inStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </div>
                      {product.supplier_name && (
                        <div className="flex justify-between items-center py-2 border-b border-border/50">
                          <span className="text-muted-foreground">Supplier</span>
                          <span className="font-medium text-foreground">{product.supplier_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Features & Benefits */}
                  <div className="space-y-4">
                    <h3 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
                      <Info className="w-5 h-5 text-primary" />
                      Features & Benefits
                    </h3>
                    <ul className="space-y-3">
                      {[
                        'Premium quality materials',
                        'Safe for all pets',
                        'Easy to clean and maintain',
                        'Durable construction',
                        'Eco-friendly packaging',
                      ].map((feature, idx) => (
                        <motion.li 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 * idx }}
                          className="flex items-center gap-2 text-muted-foreground"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {feature}
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            {/* Size Guide Tab */}
            <TabsContent value="size-guide" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-foreground">
                    <Ruler className="w-5 h-5 text-primary" />
                    <h3 className="font-display font-semibold text-lg">Pet Size Guide</h3>
                  </div>
                  
                  <p className="text-muted-foreground">
                    Use this guide to find the perfect size for your pet. Measure your pet and compare with the chart below.
                  </p>
                  
                  {/* Size Chart Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Size</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Pet Weight</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Neck</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Chest</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Back Length</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { size: 'XS', weight: 'Up to 5 lbs', neck: '6-8"', chest: '10-12"', back: '8-10"' },
                          { size: 'S', weight: '5-10 lbs', neck: '8-10"', chest: '12-15"', back: '10-12"' },
                          { size: 'M', weight: '10-25 lbs', neck: '10-14"', chest: '15-20"', back: '12-16"' },
                          { size: 'L', weight: '25-50 lbs', neck: '14-18"', chest: '20-26"', back: '16-20"' },
                          { size: 'XL', weight: '50-80 lbs', neck: '18-22"', chest: '26-32"', back: '20-24"' },
                          { size: 'XXL', weight: '80+ lbs', neck: '22-26"', chest: '32-38"', back: '24-28"' },
                        ].map((row, idx) => (
                          <motion.tr 
                            key={row.size}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 * idx }}
                            className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 px-4 font-medium text-primary">{row.size}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.weight}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.neck}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.chest}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.back}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Measuring Tips */}
                  <div className="bg-secondary/30 rounded-xl p-4 mt-4">
                    <h4 className="font-semibold text-foreground mb-2">📏 How to Measure Your Pet</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li><strong>Neck:</strong> Measure around the base of the neck where the collar sits</li>
                      <li><strong>Chest:</strong> Measure the widest part of the chest, behind the front legs</li>
                      <li><strong>Back Length:</strong> Measure from the base of the neck to the base of the tail</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="shipping" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    { emoji: '🇺🇸', text: 'Ships from USA' },
                    { emoji: '📦', text: 'Standard shipping: 5-7 business days' },
                    { emoji: '🚀', text: 'Express shipping: 2-3 business days' },
                    { emoji: '✨', text: 'Free shipping on all orders' },
                  ].map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <span className="text-2xl">{item.emoji}</span>
                      <span>{item.text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            {variants.length > 0 && (
              <TabsContent value="variants" className="mt-6">
                <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {variants.map((variant) => (
                      <motion.button
                        key={variant.vid}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setSelectedVariant(variant);
                          if (variant.variantImage) {
                            const idx = images.findIndex(img => img === variant.variantImage);
                            if (idx !== -1) setSelectedImage(idx);
                          }
                        }}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${
                          selectedVariant?.vid === variant.vid
                            ? 'border-primary bg-primary/10 shadow-soft'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        {variant.variantImage && (
                          <img 
                            src={variant.variantImage} 
                            alt={variant.variantNameEn}
                            className="w-full aspect-square rounded-lg object-cover mb-3"
                          />
                        )}
                        <p className="text-sm font-medium line-clamp-2 text-foreground">
                          {variant.variantNameEn}
                        </p>
                        {variant.variantSellPrice && (
                          <p className="text-xs text-primary mt-1 font-semibold">
                            ${Number(variant.variantSellPrice).toFixed(2)}
                          </p>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </motion.div>

        {/* Reviews Section */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-16"
          id="reviews"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
                Customer Reviews
              </h2>
              <p className="text-sm text-muted-foreground">
                {reviews.length} review{reviews.length !== 1 ? 's' : ''} from our customers
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Review Form */}
            <div className="lg:col-span-1">
              <ReviewForm 
                productId={product.id} 
                onReviewSubmitted={handleReviewsRefresh} 
              />
            </div>

            {/* Reviews List */}
            <div className="lg:col-span-2">
              <ReviewsList 
                reviews={reviews} 
                onReviewDeleted={handleReviewsRefresh} 
              />
            </div>
          </div>
        </motion.section>

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <motion.section 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-20"
          >
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
                You May Also Like
              </h2>
              <p className="text-muted-foreground">Discover more great products</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((relatedProduct, idx) => (
                <motion.div
                  key={relatedProduct.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + idx * 0.1 }}
                >
                  <ProductCard product={relatedProduct} />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Recently Viewed Products */}
        {recentlyViewedProducts && recentlyViewedProducts.length > 0 && (
          <motion.section 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-16"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
              <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
                Recently Viewed
              </h2>
              <p className="text-sm text-muted-foreground">Products you viewed earlier</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {recentlyViewedProducts.slice(0, 4).map((recentProduct, idx) => (
                <motion.div
                  key={recentProduct.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + idx * 0.1 }}
                >
                  <ProductCard product={recentProduct} />
                </motion.div>
              ))}
            </div>
          </motion.section>
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
