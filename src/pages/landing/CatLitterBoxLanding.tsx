import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { computeAvailability } from '@/lib/availability';
import { trackViewItem } from '@/lib/analytics';
import { ShoppingCart, Truck, RotateCcw, ShieldCheck, Check, ArrowRight, Sparkles, Clock, Zap } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { ProductSchema } from '@/components/seo/ProductSchema';
import { motion } from 'framer-motion';

const LITTER_BOX_SLUG = '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat';

const BENEFITS = [
  { icon: Zap, text: 'No more daily scooping — fully automatic cleaning' },
  { icon: Sparkles, text: 'Built-in deodorizer keeps your home fresh' },
  { icon: ShieldCheck, text: 'Infrared sensors protect your cat during use' },
  { icon: Clock, text: 'Smart app lets you monitor from anywhere' },
];

const WHY_CHOOSE = [
  { title: 'Saves 30+ Minutes Weekly', desc: 'Automatic self-cleaning means no more bending over the litter box every day. More time with your cat, less time cleaning.' },
  { title: 'Odor-Free Living Space', desc: 'Advanced deodorizing system neutralizes smells at the source. Guests will never know you have a cat.' },
  { title: 'Safe for Multi-Cat Homes', desc: 'Infrared sensors detect when your cat enters. The 60L capacity handles multiple cats with ease.' },
];

const PAIN_POINTS = [
  { before: 'Scooping litter twice a day', after: 'Automatic cleaning after every use' },
  { before: 'Embarrassing litter box smell', after: 'Built-in deodorizer eliminates odor' },
  { before: 'Worrying about cat safety', after: 'Smart infrared sensors for protection' },
  { before: 'Guessing when to clean', after: 'App notifications keep you informed' },
];

const CatLitterBoxLanding = () => {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [imageLoaded, setImageLoaded] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ['lp-cat-litter-box'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('slug', LITTER_BOX_SLUG)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
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
    addItem({ id: product.id, name: product.name, price: sellingPrice, image: product.image_url || '' });
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
        <title>Stop Cleaning Your Cat's Litter Box Forever | GetPawsy</title>
        <meta name="description" content="The 60L Smart Automatic Cat Litter Box with app control, deodorizer, and infrared safety sensors. Perfect for multi-cat homes. Free US shipping." />
        <link rel="canonical" href={`https://getpawsy.pet/product/${LITTER_BOX_SLUG}`} />
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
        {/* Hero */}
        <section className="text-center mb-8">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight mb-3"
          >
            Stop Cleaning Your Cat's Litter Box Forever
          </motion.h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            The smart litter box that cleans itself, eliminates odor, and keeps your cats safe — so you never have to scoop again.
          </p>
        </section>

        {/* Product grid */}
        <div className="grid md:grid-cols-2 gap-6 md:gap-10 mb-12">
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

          <div className="flex flex-col justify-center">
            <div className="flex items-baseline gap-3 mb-5">
              <span className="text-3xl font-bold text-primary">${sellingPrice.toFixed(2)}</span>
              {hasDiscount && (
                <span className="text-lg text-muted-foreground line-through">${compareAtPrice!.toFixed(2)}</span>
              )}
            </div>

            <div className="space-y-3 mb-6">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 text-sm text-foreground">
                  <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* CTA #1 */}
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

        {/* Before/After pain points */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-foreground text-center mb-6">
            Your Life Before vs. After
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {PAIN_POINTS.map(({ before, after }) => (
              <div key={before} className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground line-through mb-1">{before}</p>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-primary shrink-0" /> {after}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why choose */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-foreground text-center mb-6">
            Why Cat Owners Choose This
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {WHY_CHOOSE.map(item => (
              <div key={item.title} className="p-5 bg-card rounded-xl border border-border">
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA #2 */}
        <section className="bg-gradient-to-br from-primary/5 to-secondary/10 rounded-2xl p-6 md:p-8 text-center mb-12">
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Ready to Stop Scooping?</h2>
          <p className="text-muted-foreground text-sm mb-5 max-w-md mx-auto">
            Join cat owners who reclaimed their time with the smart litter box.
          </p>
          <Button onClick={handleBuyNow} disabled={!availability.isInStock} size="lg" className="px-8 rounded-xl text-base font-semibold">
            Buy Now — Free US Shipping
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </section>

        {/* How it works */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-foreground text-center mb-6">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Set Up in Minutes', desc: 'Unbox, add litter, connect the app. Ready to go.' },
              { step: '2', title: 'Cat Uses It Normally', desc: 'Infrared sensors detect entry and exit. Cleaning starts automatically after use.' },
              { step: '3', title: 'Enjoy a Clean Home', desc: 'Waste is sealed away. Deodorizer keeps everything fresh. You just empty the bin weekly.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center p-5">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-3 font-bold text-lg">
                  {step}
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA #3 — Final */}
        <section className="bg-card border border-border rounded-2xl p-6 md:p-8 text-center mb-8">
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Take the First Step to a Cleaner Home</h2>
          <p className="text-muted-foreground text-sm mb-5 max-w-md mx-auto">
            Free US shipping on orders over $35. 30-day return policy. Secure checkout.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={handleBuyNow} disabled={!availability.isInStock} size="lg" className="px-8 rounded-xl text-base font-semibold">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Buy Now — ${sellingPrice.toFixed(2)}
            </Button>
            <Link to={`/product/${LITTER_BOX_SLUG}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              View full details <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
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

export default CatLitterBoxLanding;
