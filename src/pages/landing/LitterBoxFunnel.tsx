import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { computeAvailability } from '@/lib/availability';
import { trackViewItem } from '@/lib/analytics';
import { ShoppingCart, Truck, RotateCcw, ShieldCheck, Check, Star, Clock, Sparkles, Heart } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const PRODUCT_ID = '128e0207-8a94-4d71-b428-5b7f5002528f';

const BUNDLES = [
  { qty: 1, label: 'Single', discount: 0, tag: '' },
  { qty: 2, label: 'Double Pack', discount: 10, tag: 'Most Popular' },
  { qty: 3, label: 'Family Pack', discount: 15, tag: 'Best Value' },
] as const;

const LitterBoxFunnel = () => {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [selectedBundle, setSelectedBundle] = useState(1);

  const { data: product, isLoading } = useQuery({
    queryKey: ['funnel-product', PRODUCT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('id', PRODUCT_ID)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const price = product?.price ?? 268.99;
  const compareAt = product?.compare_at_price ?? 345.99;
  const availability = useMemo(() => {
    if (!product) return { isInStock: false, reason: 'loading' };
    return computeAvailability(product);
  }, [product]);

  useEffect(() => {
    if (product) trackViewItem(product.id, product.name, price, product.category || '');
  }, [product, price]);

  const bundle = BUNDLES[selectedBundle];
  const bundlePrice = price * bundle.qty * (1 - bundle.discount / 100);
  const bundleSavings = price * bundle.qty - bundlePrice;

  const handleAddToCart = () => {
    if (!product) return;
    for (let i = 0; i < bundle.qty; i++) {
      addItem({
        id: product.id,
        slug: (product as any).slug ?? undefined,
        name: product.name,
        price: bundle.discount > 0 ? Math.round((price * (1 - bundle.discount / 100)) * 100) / 100 : price,
        image: product.image_url || '',
      });
    }
    toast.success(`${bundle.qty}x added to cart!`);
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4">
        <p className="text-muted-foreground">Product not found</p>
        <Button asChild><Link to="/">Back to Store</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Self-Cleaning Cat Litter Box | GetPawsy</title>
        <meta name="description" content="Make cat care easier with our automatic self-cleaning litter box. App-controlled, odor-free, and designed for busy pet owners. Free shipping." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Minimal header */}
      <header className="border-b border-border/40 py-3 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-lg font-display font-bold text-foreground">GetPawsy</Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> Secure Checkout</span>
            <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-primary" /> Free Shipping</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-12">

        {/* HERO */}
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted/30 border border-border/40">
            <OptimizedImage
              src={product.image_url || ''}
              alt={product.name}
              className="w-full h-full object-contain p-4"
            />
          </div>
          <div className="space-y-4">
            <p className="text-sm font-medium text-primary uppercase tracking-wide">Bestseller</p>
            <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground leading-tight">
              Make Cat Care Easier in Seconds
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              The smart, automatic litter box that cleans itself — so you never have to scoop again. App-controlled, odor-sealed, and designed for busy pet owners.
            </p>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">${price.toFixed(2)}</span>
              {compareAt > price && (
                <span className="text-lg text-muted-foreground line-through">${Number(compareAt).toFixed(2)}</span>
              )}
            </div>
            <Button
              size="lg"
              className="w-full h-14 text-base font-bold rounded-xl bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white shadow-lg"
              onClick={handleAddToCart}
              disabled={!availability.isInStock}
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              Get Yours Now
            </Button>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">✔ Secure Checkout</span>
              <span className="flex items-center gap-1.5">✔ 30-Day Returns</span>
              <span className="flex items-center gap-1.5">✔ Fast Shipping</span>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="text-center max-w-2xl mx-auto space-y-4 py-6 border-t border-border/30">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
            Tired of Scooping the Litter Box Every Day?
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Daily scooping is messy, smelly, and time-consuming. If you have multiple cats, it gets even worse.
            Traditional litter boxes track waste around your home and create odors that are hard to control —
            no matter how often you clean.
          </p>
        </section>

        {/* SOLUTION */}
        <section className="text-center max-w-2xl mx-auto space-y-4 pb-6">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
            The Smart Solution: It Cleans Itself
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Our self-cleaning litter box uses automatic rake technology and a sealed waste compartment
            to handle cleanup for you. Control it from your phone, monitor usage, and enjoy a fresher home
            — without lifting a finger.
          </p>
        </section>

        {/* BENEFITS */}
        <section className="py-8 border-y border-border/30">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
            Why Pet Owners Love It
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              { icon: Clock, text: 'Saves 15+ minutes of daily scooping' },
              { icon: Sparkles, text: 'Odor-sealed design keeps your home fresh' },
              { icon: Check, text: 'App-controlled — monitor from anywhere' },
              { icon: Heart, text: 'Safe sensors protect your cat' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/40">
                <Icon className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="text-center py-6">
          <div className="flex justify-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-6 h-6 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <h2 className="text-lg font-display font-bold text-foreground mb-2">Loved by Pet Owners</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Thousands of cat owners have simplified their daily routine with this self-cleaning litter box.
          </p>
        </section>

        {/* HOW IT WORKS */}
        <section className="py-8 border-y border-border/30">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-8">
            How It Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { step: '1', title: 'Set It Up', desc: 'Place, fill with litter, and connect to the app' },
              { step: '2', title: 'It Cleans Itself', desc: 'Automatic cleaning cycle after each use' },
              { step: '3', title: 'Enjoy a Fresh Home', desc: 'No scooping, no odor, no hassle' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {step}
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* BUNDLE OFFER */}
        <section className="py-8">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
            Choose Your Package
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {BUNDLES.map((b, i) => {
              const total = price * b.qty * (1 - b.discount / 100);
              const savings = price * b.qty - total;
              const isSelected = selectedBundle === i;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedBundle(i)}
                  className={`relative p-5 rounded-xl border-2 text-center transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {b.tag && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-0.5 rounded-full">
                      {b.tag}
                    </span>
                  )}
                  <p className="font-bold text-foreground text-lg">{b.label}</p>
                  <p className="text-sm text-muted-foreground">{b.qty}x Litter Box</p>
                  <p className="text-2xl font-bold text-primary mt-2">${total.toFixed(2)}</p>
                  {b.discount > 0 && (
                    <p className="text-xs text-green-600 font-medium mt-1">
                      Save ${savings.toFixed(2)} ({b.discount}% off)
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="text-center py-8 border-t border-border/30">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-3">
            Ready to Stop Scooping?
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Free shipping on orders over $35. 30-day return policy. Secure checkout.
          </p>
          <Button
            size="lg"
            className="min-w-[260px] h-14 text-base font-bold rounded-xl bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white shadow-lg"
            onClick={handleAddToCart}
            disabled={!availability.isInStock}
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            Get Yours Now — ${bundlePrice.toFixed(2)}
          </Button>
          {bundleSavings > 0 && (
            <p className="text-sm text-green-600 font-medium mt-2">
              You save ${bundleSavings.toFixed(2)} with the {bundle.label}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground mt-4">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> Secure Checkout</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="w-4 h-4 text-primary" /> 30-Day Returns</span>
            <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-primary" /> 5–10 Day US Delivery</span>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-8 border-t border-border/30 max-w-2xl mx-auto">
          <h2 className="text-lg font-display font-bold text-foreground text-center mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {[
              { q: 'How long does shipping take?', a: 'Orders typically arrive within 5–10 business days to anywhere in the US.' },
              { q: 'Can I return it?', a: 'Yes — we offer a 30-day return policy on all products. Contact us at info@getpawsy.pet to start a return.' },
              { q: 'Does it work with all litter types?', a: 'It works best with clumping litter. The automatic rake system requires clumping litter to function properly.' },
              { q: 'Is it safe for my cat?', a: 'Yes — built-in sensors detect your cat and pause the cleaning cycle until your pet exits safely.' },
            ].map(({ q, a }, i) => (
              <details key={i} className="group border border-border/40 rounded-xl">
                <summary className="cursor-pointer p-4 text-sm font-medium text-foreground list-none flex items-center justify-between">
                  {q}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="px-4 pb-4 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-border/40 py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link to="/shipping" className="hover:text-foreground">Shipping Policy</Link>
          <Link to="/returns" className="hover:text-foreground">Returns Policy</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms & Conditions</Link>
          <Link to="/contact" className="hover:text-foreground">Contact Us</Link>
        </div>
        <p className="text-center text-xs text-muted-foreground/60 mt-3">
          © {new Date().getFullYear()} GetPawsy — info@getpawsy.pet
        </p>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] safe-area-bottom">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{product.name}</p>
            <span className="text-lg font-bold text-primary">${bundlePrice.toFixed(2)}</span>
          </div>
          <Button
            className="flex-1 h-12 rounded-xl font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white"
            onClick={handleAddToCart}
            disabled={!availability.isInStock}
          >
            Get Yours Now
          </Button>
        </div>
      </div>
      <div className="h-20 md:hidden" />
    </div>
  );
};

export default LitterBoxFunnel;
