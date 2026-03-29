import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { computeAvailability } from '@/lib/availability';
import { trackViewItem } from '@/lib/analytics';
import { ShoppingCart, Truck, RotateCcw, ShieldCheck, Check, ArrowRight } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { ProductSchema } from '@/components/seo/ProductSchema';
import { motion } from 'framer-motion';

/**
 * PinterestLandingPage — A distraction-free, conversion-focused landing page
 * for Pinterest traffic. Minimal navigation, strong CTA focus, fast LCP.
 * Route: /pin/:slug
 */
const PinterestLandingPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [imageLoaded, setImageLoaded] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ['pinterest-landing', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const sellingPrice = product?.price ?? 0;
  const compareAtPrice = product?.compare_at_price ?? null;
  const availability = useMemo(() => {
    if (!product) return { isInStock: false, reason: 'No product' };
    return computeAvailability(product);
  }, [product]);

  useEffect(() => {
    if (product) {
      trackViewItem(product.id, product.name, sellingPrice, product.category || '');
    }
  }, [product, sellingPrice]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      id: product.id,
      name: product.name,
      price: sellingPrice,
      image: product.image_url || '',
    });
    toast.success('Added to cart!');
  };

  const handleBuyNow = () => {
    handleAddToCart();
    navigate('/checkout');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Product Not Found</h1>
        <p className="text-muted-foreground mb-4">This product may no longer be available.</p>
        <Button onClick={() => navigate('/products')}>Browse All Products</Button>
      </div>
    );
  }

  const hasDiscount = compareAtPrice && compareAtPrice > sellingPrice;
  const discountPct = hasDiscount ? Math.round((1 - sellingPrice / compareAtPrice!) * 100) : 0;

  return (
    <>
      <Helmet>
        <title>{product.name} | GetPawsy</title>
        <meta name="description" content={product.meta_description || product.description?.substring(0, 155) || ''} />
        <link rel="canonical" href={`https://getpawsy.pet/product/${product.slug}`} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      <ProductSchema product={product} />

      {/* Minimal header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold text-primary">GetPawsy</Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Truck className="w-3.5 h-3.5 text-primary" />
            <span>Free US Shipping $35+</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          {/* Product image */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: imageLoaded ? 1 : 0.3 }}
            className="relative aspect-square rounded-2xl overflow-hidden bg-muted"
          >
            {hasDiscount && (
              <div className="absolute top-3 left-3 z-10 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold">
                Save {discountPct}%
              </div>
            )}
            <OptimizedImage
              src={product.image_url || ''}
              alt={product.name}
              className="w-full h-full object-cover"
              onLoad={() => setImageLoaded(true)}
              priority
            />
          </motion.div>

          {/* Product info + CTA */}
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground leading-tight mb-3">
              {product.name}
            </h1>

            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl font-bold text-primary">${sellingPrice.toFixed(2)}</span>
              {hasDiscount && (
                <span className="text-lg text-muted-foreground line-through">${compareAtPrice!.toFixed(2)}</span>
              )}
            </div>

            <div className="space-y-2 mb-6">
              {['Saves you time every day', 'Designed for real pet owners', 'Premium quality materials', 'Easy to set up and use'].map(b => (
                <div key={b} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3 mb-5">
              <Button onClick={handleBuyNow} disabled={!availability.isInStock} className="w-full h-14 text-base font-semibold rounded-xl" size="lg">
                <ShoppingCart className="w-5 h-5 mr-2" />
                Buy Now — Free US Shipping
              </Button>
              <Button onClick={handleAddToCart} disabled={!availability.isInStock} variant="outline" className="w-full h-12 rounded-xl">
                Add to Cart
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Truck, label: '5–10 Day\nUS Delivery' },
                { icon: RotateCcw, label: '30-Day\nReturn Policy' },
                { icon: ShieldCheck, label: 'Secure\nCheckout' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 text-center p-3 bg-muted/50 rounded-xl">
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="text-[11px] text-muted-foreground whitespace-pre-line leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Why choose section */}
        <section className="mt-12 mb-8">
          <h2 className="text-xl font-display font-bold text-foreground mb-4">Why Pet Owners Choose This</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: 'Saves Time', desc: 'Spend less time on pet maintenance and more time enjoying your pet.' },
              { title: 'Solves Real Problems', desc: 'Designed to address the everyday challenges pet owners face.' },
              { title: 'Built to Last', desc: 'Premium materials that withstand daily use from active pets.' },
            ].map(item => (
              <div key={item.title} className="p-5 bg-card rounded-xl border border-border">
                <h3 className="font-semibold text-foreground mb-1.5">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {product.description && (
          <section className="mb-8">
            <h2 className="text-xl font-display font-bold text-foreground mb-3">Product Details</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
          </section>
        )}

        {/* Final CTA */}
        <section className="bg-gradient-to-br from-primary/5 to-secondary/10 rounded-2xl p-6 md:p-8 text-center mb-8">
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Ready to Make Life Easier?</h2>
          <p className="text-muted-foreground text-sm mb-5 max-w-md mx-auto">
            Join pet owners who upgraded their routine with GetPawsy products.
          </p>
          <Button onClick={handleBuyNow} disabled={!availability.isInStock} size="lg" className="px-8 rounded-xl text-base font-semibold">
            Buy Now — Free US Shipping
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </section>

        <div className="text-center mb-12">
          <Link to={`/product/${product.slug}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            View full product details <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} GetPawsy — Smart Pet Products for Modern Pet Owners</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/shipping" className="hover:text-foreground">Shipping</Link>
          <Link to="/returns" className="hover:text-foreground">Returns</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/95 backdrop-blur-sm border-t border-border p-3">
        <Button onClick={handleBuyNow} disabled={!availability.isInStock} className="w-full h-12 rounded-xl text-sm font-semibold">
          <ShoppingCart className="w-4 h-4 mr-2" />
          Buy Now — ${sellingPrice.toFixed(2)}
        </Button>
      </div>
    </>
  );
};

export default PinterestLandingPage;
