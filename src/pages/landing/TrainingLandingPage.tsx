import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Truck, ShieldCheck, Lock, RotateCcw, Star, Check, X, ArrowRight,
  ChevronDown, Package, Heart, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { useCart } from '@/contexts/CartContext';
import { useUTMTracking } from '@/hooks/useUTMTracking';
import { trackEvent } from '@/lib/analytics';
import { getLandingBySlug, type LandingPageData } from '@/data/training-landing-pages';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
import { useEffect } from 'react';

const BASE = 'https://getpawsy.pet';

export default function TrainingLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const utmParams = useUTMTracking();
  const data = getLandingBySlug(slug || '');

  // Track landing page view with UTM
  useEffect(() => {
    if (data) {
      trackEvent('landing_page_view', {
        page: `landing_${data.slug}`,
        ad_angle: data.adAngle,
        ...utmParams,
      });
    }
  }, [data?.slug]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Page Not Found</h1>
          <Link to="/collections/all" className="text-primary underline">← Browse Training Gear</Link>
        </div>
      </div>
    );
  }

  const handleAddToCart = (product: typeof data.primaryProduct) => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
    });
    trackEvent('landing_add_to_cart', {
      page: `landing_${data.slug}`,
      product_id: product.id,
      product_name: product.shortName,
      price: product.price,
      ad_angle: data.adAngle,
      ...utmParams,
    });
  };

  const handleBundleAdd = () => {
    if (!data.bundle) return;
    data.bundle.items.forEach(item => {
      addItem({
        id: item.id,
        name: item.name,
        price: Math.round(item.price * (1 - data.bundle!.discount / 100) * 100) / 100,
        image: item.image,
      });
    });
    trackEvent('landing_bundle_add', {
      page: `landing_${data.slug}`,
      bundle_items: data.bundle.items.length,
      discount: data.bundle.discount,
      ...utmParams,
    });
  };

  const bundleTotal = data.bundle
    ? data.bundle.items.reduce((s, i) => s + i.price, 0)
    : 0;
  const bundleDiscounted = Math.round(bundleTotal * (1 - (data.bundle?.discount || 0) / 100) * 100) / 100;

  return (
    <>
      <Helmet>
        <title>{data.metaTitle}</title>
        <meta name="description" content={data.metaDescription} />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`${BASE}/landing/${data.slug}`} />
      </Helmet>

      {/* Minimal header — no full nav */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center justify-between py-3">
          <Link to="/" className="text-lg font-display font-bold text-foreground">GetPawsy</Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:flex items-center gap-1"><Truck className="w-3 h-3 text-primary" /> Free Shipping on Orders $35+</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-primary" /> 30-Day Return Policy</span>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="bg-foreground text-primary-foreground">
        <div className="container py-12 md:py-20 max-w-3xl text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-display font-bold leading-tight mb-4"
          >
            {data.headline}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-primary-foreground/80 mb-8"
          >
            {data.subheadline}
          </motion.p>
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6"
            onClick={() => document.getElementById('product-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            {data.ctaText} <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-xs text-primary-foreground/50 mt-3">{data.ctaSubtext}</p>
        </div>
      </section>

      {/* ─── SOCIAL PROOF BAR ─── */}
      <section className="border-b border-border bg-primary/5">
        <div className="container py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
            {data.socialProof.map((sp, i) => (
              <div key={i} className="text-center">
                <div className="text-xl md:text-2xl font-bold text-primary">{sp.stat}</div>
                <div className="text-xs text-muted-foreground">{sp.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PAIN POINTS ─── */}
      <section className="container py-12 md:py-16 max-w-2xl">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Does This Sound Like You?</h2>
        <div className="space-y-3">
          {data.painPoints.map((p, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-foreground">{p}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA 1 ─── */}
      <section className="bg-primary/5 border-y border-primary/10 py-8">
        <div className="container text-center">
          <Button
            size="lg"
            onClick={() => document.getElementById('product-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            {data.ctaText} <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* ─── BEFORE / AFTER ─── */}
      <section className="container py-12 md:py-16 max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">The Transformation</h2>
        <div className="space-y-4">
          {data.beforeAfter.map((ba, i) => (
            <div key={i} className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10">
                <div className="flex items-center gap-2 mb-2">
                  <X className="w-4 h-4 text-destructive" />
                  <span className="text-xs font-semibold text-destructive uppercase">Before</span>
                </div>
                <p className="text-sm text-foreground">{ba.before}</p>
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase">After</span>
                </div>
                <p className="text-sm text-foreground">{ba.after}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── BENEFITS ─── */}
      <section className="bg-muted/30 py-12 md:py-16">
        <div className="container max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">What Makes This Different</h2>
          <div className="space-y-3">
            {data.benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3 p-3">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRODUCT SECTION ─── */}
      <section id="product-section" className="container py-12 md:py-16 max-w-3xl">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* Product image */}
          <div className="rounded-2xl overflow-hidden border border-border bg-muted/10">
            <img
              src={data.primaryProduct.image}
              alt={data.primaryProduct.name}
              className="w-full h-auto object-contain aspect-square"
              loading="lazy"
            />
          </div>

          {/* Product details */}
          <div>
            <Badge className="mb-3 bg-primary text-primary-foreground">⭐ Trainer Recommended</Badge>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-2">{data.primaryProduct.name}</h2>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex">
                {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 fill-primary text-primary" />)}
              </div>
              <span className="text-xs text-muted-foreground">(127 reviews)</span>
            </div>
            <div className="text-2xl font-bold text-foreground mb-4">${data.primaryProduct.price.toFixed(2)}</div>

            {/* Benefits above CTA */}
            <div className="space-y-1.5 mb-4">
              {data.benefits.slice(0, 3).map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>

            <Button
              size="lg"
              className="w-full text-lg py-6 mb-3"
              onClick={() => handleAddToCart(data.primaryProduct)}
            >
              {data.ctaText}
            </Button>

            {/* Trust microcopy */}
            <div className="space-y-1.5 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Truck className="w-3.5 h-3.5 text-primary" /><span>Free shipping on eligible orders over $35 • 5–10 Day Delivery</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RotateCcw className="w-3.5 h-3.5 text-primary" /><span>30-Day Return Policy</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5 text-primary" /><span>Secure Encrypted Checkout</span>
              </div>
            </div>
            <PaymentBadges showLabel={false} variant="dark" className="gap-1.5" />
          </div>
        </div>

        {/* ─── BUNDLE UPSELL ─── */}
        {data.bundle && (
          <div className="mt-8 p-6 bg-primary/5 rounded-2xl border-2 border-primary/20">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">{data.bundle.headline}</h3>
              <Badge className="bg-primary text-primary-foreground ml-auto">Save {data.bundle.discount}%</Badge>
            </div>
            <div className="flex items-center gap-4 mb-4">
              {data.bundle.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <img src={item.image} alt={item.shortName} className="w-16 h-16 rounded-lg object-cover border border-border" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.shortName}</p>
                    <p className="text-xs text-muted-foreground">${item.price.toFixed(2)}</p>
                  </div>
                  {i < data.bundle!.items.length - 1 && <span className="text-muted-foreground text-lg">+</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm line-through text-muted-foreground">${bundleTotal.toFixed(2)}</span>
                <span className="text-xl font-bold text-primary ml-2">${bundleDiscounted.toFixed(2)}</span>
              </div>
              <Button onClick={handleBundleAdd} variant="default">
                Add Bundle to Cart
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ─── REVIEWS ─── */}
      <section className="bg-muted/30 py-12 md:py-16">
        <div className="container max-w-2xl">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">What Dog Owners Say</h2>
          <div className="space-y-4">
            {data.reviews.map((r, i) => (
              <div key={i} className="p-5 bg-background rounded-xl border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex">{Array.from({ length: r.stars }).map((_, j) => <Star key={j} className="w-3.5 h-3.5 fill-primary text-primary" />)}</div>
                  {r.verified && <Badge variant="secondary" className="text-[10px]">✓ Verified Purchase</Badge>}
                </div>
                <p className="text-sm text-foreground mb-2 leading-relaxed">"{r.text}"</p>
                <p className="text-xs text-muted-foreground">— {r.name}, {r.location}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA 2 ─── */}
      <section className="bg-primary/5 border-y border-primary/10 py-10">
        <div className="container text-center max-w-xl">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-3">Ready to Transform Your Walks?</h2>
          <p className="text-muted-foreground mb-6">Join thousands of dog owners who've already made the switch.</p>
          <Button
            size="lg"
            className="text-lg px-8 py-6"
            onClick={() => document.getElementById('product-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            {data.ctaText} <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="container max-w-2xl py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Frequently Asked Questions</h2>
        <Accordion type="multiple" className="space-y-2">
          {data.faq.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-left text-sm font-medium">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ─── TRUST BAR FOOTER ─── */}
      <section className="border-t border-border bg-muted/30">
        <div className="container py-6">
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-primary" /> Estimated Delivery: 5–10 Business Days</div>
            <div className="flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5 text-primary" /> 30-Day Return Policy</div>
            <div className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-primary" /> Secure Encrypted Checkout</div>
            <div className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> Easy Returns</div>
          </div>
        </div>
      </section>

      {/* ─── MINIMAL FOOTER ─── */}
      <footer className="bg-foreground text-primary-foreground/60 py-6">
        <div className="container text-center text-xs">
          <p>© {new Date().getFullYear()} GetPawsy. All rights reserved.</p>
          <div className="flex justify-center gap-4 mt-2">
            <Link to="/shipping" className="hover:text-primary-foreground">Shipping</Link>
            <Link to="/returns" className="hover:text-primary-foreground">Returns</Link>
            <Link to="/privacy" className="hover:text-primary-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-primary-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
