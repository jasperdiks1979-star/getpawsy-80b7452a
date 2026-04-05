import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ShoppingBag, Shield, Truck, RotateCcw, Headphones, CheckCircle,
  XCircle, ChevronRight, Star, Award, Brain, Wind,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { StarRating } from '@/components/ui/star-rating';
import { LowStockBadge } from '@/components/products/LowStockBadge';
import { VolumeDiscountSelector } from '@/components/products/VolumeDiscountSelector';
import { FAQSchema } from '@/components/seo/FAQSchema';
import { StickyCTA } from '@/components/guides/StickyCTA';
import { useCart } from '@/contexts/CartContext';
import { useCartAnimation } from '@/contexts/CartAnimationContext';
import { trackAddToCart } from '@/lib/analytics';
import { safePrice } from '@/lib/safe-render';
import { FREE_SHIPPING_THRESHOLD, DELIVERY_TIME_STANDARD, RETURN_WINDOW_DAYS } from '@/lib/shipping-constants';
import { SITE_URL } from '@/lib/constants';
import { toast } from 'sonner';

const PAGE_URL = `${SITE_URL}/slow-feeder-dog-bowls`;

const PAGE_FAQS = [
  {
    question: 'Do slow feeder bowls really reduce bloating?',
    answer: 'Yes. Slow feeder bowls reduce the amount of air swallowed during meals by slowing down eating pace. Veterinarians frequently recommend them for breeds prone to bloat and gastric dilation.',
  },
  {
    question: 'Is this safe for large breeds?',
    answer: 'Absolutely. Our slow feeder bowls come in multiple sizes including large and extra-large options designed for breeds over 60 lbs. The anti-slip base keeps the bowl stable during meals.',
  },
  {
    question: 'How long does US shipping take?',
    answer: `Standard US shipping takes ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} ship free.`,
  },
  {
    question: 'Is it dishwasher safe?',
    answer: 'Yes. Our slow feeder bowls are made from BPA-free materials and are top-rack dishwasher safe for easy cleaning after every meal.',
  },
  {
    question: 'What size should I choose?',
    answer: 'Small breeds (under 25 lbs): Small bowl. Medium breeds (25–60 lbs): Medium bowl. Large and giant breeds (60+ lbs): Large or extra-large bowl.',
  },
  {
    question: 'Does this help overweight dogs?',
    answer: 'Slow feeder bowls help overweight dogs by extending meal duration, which gives the brain time to register fullness signals. This naturally reduces overeating without restricting portions.',
  },
  {
    question: 'What if my dog refuses to use it?',
    answer: 'Most dogs adapt within 1–3 meals. Start by placing a few treats in the channels to encourage exploration. If your dog struggles, try a design with wider channels before moving to more complex patterns.',
  },
  {
    question: 'What is your return policy?',
    answer: `We offer a ${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original condition. Contact us to start a return.`,
  },
];

export default function SlowFeederDogBowls() {
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();
  const [bundleQty, setBundleQty] = useState(1);
  const [bundleDiscount, setBundleDiscount] = useState(0);

  // Auto-select 2-pack on desktop, single on mobile
  useEffect(() => {
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop) {
      setBundleQty(2);
      setBundleDiscount(10);
    }
  }, []);

  const { data: products } = useQuery({
    queryKey: ['slow-feeder-landing-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, price, compare_at_price, image_url, stock, category')
        .eq('category', 'Dog Bowls & Feeders')
        .eq('is_active', true)
        .gt('stock', 0)
        .order('price', { ascending: false }) // Premium SKUs first
        .limit(3);
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });

  const featuredProduct = products?.[0];

  const handleAddToCart = (product: NonNullable<typeof products>[number], quantity: number, e: React.MouseEvent) => {
    e.preventDefault();
    const effectivePrice = Number(product.price) * (1 - bundleDiscount / 100);
    triggerAddToCart(
      product.image_url || '/placeholder.svg',
      e.currentTarget as HTMLElement,
    );
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: effectivePrice,
        image: product.image_url || '/placeholder.svg',
      });
    }
    trackAddToCart(product.id, product.name, effectivePrice * quantity, quantity);
    toast.success(`Added ${quantity > 1 ? `${quantity}x ` : ''}to cart!`);
  };

  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Best Slow Feeder Dog Bowls 2026 | Vet Recommended | GetPawsy',
    description: 'Reduce bloating, vomiting & choking with premium slow feeder dog bowls. Dishwasher safe. Free shipping on eligible orders over $35.',
    url: PAGE_URL,
    publisher: {
      '@type': 'Organization',
      name: 'GetPawsy',
      url: SITE_URL,
    },
  }), []);

  return (
    <>
      <Helmet>
        <title>Best Slow Feeder Dog Bowls (2026) | GetPawsy</title>
        <meta name="description" content="Reduce bloating and choking with premium slow feeder dog bowls. Vet-recommended, dishwasher safe. Shop trusted picks at GetPawsy." />
        <link rel="canonical" href={PAGE_URL} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <FAQSchema faqs={PAGE_FAQS} pageUrl={PAGE_URL} />

      <main className="min-h-screen bg-background">
        {/* ======= HERO SECTION ======= */}
        <section className="relative bg-gradient-to-b from-primary/5 via-background to-background py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <Badge variant="secondary" className="mb-4 text-xs font-medium tracking-wider uppercase">
              Vet-Recommended
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-4">
              Stop Dangerous Fast Eating — Protect Your Dog Today
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-4">
              Clinically designed slow feeder bowls that reduce bloating, vomiting and choking risk.
            </p>

            {/* Demand indicator — factual, non-deceptive */}
            <p className="text-sm text-muted-foreground mb-8">
              High demand in the US — limited restock arriving weekly.
            </p>

            <ul className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 text-sm md:text-base text-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                Slows eating up to 10x
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                Dishwasher safe & BPA free
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                Free shipping on eligible orders over ${FREE_SHIPPING_THRESHOLD}
              </li>
            </ul>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="rounded-full px-8 gap-2 text-base">
                <a href="#products">
                  <ShoppingBag className="w-5 h-5" />
                  Protect My Dog Now
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-8 gap-2 text-base">
                <a href="#how-it-works">
                  See How It Works
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* ======= PROBLEM → AGITATE → SOLVE ======= */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-3">
              Fast Eating Can Be Dangerous
            </h2>
            <p className="text-center text-muted-foreground mb-8 text-sm max-w-xl mx-auto">
              You wouldn't let your child inhale food — your dog deserves the same care.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
              {[
                { icon: XCircle, title: 'Bloating (GDV)', desc: 'Excess air intake can cause life-threatening gastric dilation — especially in deep-chested breeds.' },
                { icon: XCircle, title: 'Vomiting', desc: 'Undigested food comes back up within minutes of eating, creating discomfort and mess.' },
                { icon: XCircle, title: 'Choking Risk', desc: 'Large unchewed pieces of kibble can obstruct airways, creating emergency situations.' },
                { icon: XCircle, title: 'Weight Gain', desc: 'Fast eaters miss satiety signals and consistently overeat, leading to obesity.' },
              ].map((item) => (
                <div key={item.title} className="bg-card border border-border rounded-xl p-5 flex gap-3">
                  <item.icon className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mid-page CTA */}
            <div className="text-center">
              <Button asChild size="lg" className="rounded-full px-8 gap-2">
                <a href="#products">
                  <ShoppingBag className="w-5 h-5" />
                  Start Slowing Your Dog's Eating Today
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* ======= AUTHORITY SECTION ======= */}
        <section id="how-it-works" className="py-16 scroll-mt-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-3">
              Why Vets Recommend Slow Feeders
            </h2>
            <p className="text-center text-muted-foreground mb-10 text-sm max-w-xl mx-auto">
              The science behind structured maze design and healthier eating habits.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: Wind,
                  title: 'Reduced Air Intake',
                  desc: 'Slower eating means less air swallowed per bite, significantly reducing bloat risk.',
                },
                {
                  icon: Award,
                  title: 'Controlled Pace',
                  desc: 'Raised ridges and channels force dogs to eat around obstacles, extending meals from 30 seconds to 10+ minutes.',
                },
                {
                  icon: Brain,
                  title: 'Mental Stimulation',
                  desc: 'Navigating the maze pattern provides cognitive enrichment, turning mealtime into a rewarding puzzle.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-card border border-border rounded-xl p-6 text-center">
                  <item.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold text-foreground text-sm mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ======= COMPARISON TABLE ======= */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-8">
              Cheap Plastic Bowl vs. GetPawsy Slow Feeder
            </h2>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-4 text-left font-medium text-muted-foreground">Feature</th>
                    <th className="p-4 text-left font-medium text-destructive/80">Cheap Bowl</th>
                    <th className="p-4 text-left font-medium text-primary">GetPawsy</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Stability', 'Slides on floor', 'Anti-slip base'],
                    ['Build Quality', 'Thin material', 'Thick durable build'],
                    ['Digestion Help', 'No digestion benefit', 'Slows eating up to 10x'],
                    ['Safety', 'Unknown BPA status', 'BPA-free certified'],
                    ['Cleaning', 'Hard to clean', 'Dishwasher safe'],
                    ['Sourcing', 'Generic imports', 'Quality controlled'],
                  ].map(([feature, cheap, pawsy], i) => (
                    <tr key={feature} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="p-4 font-medium text-foreground">{feature}</td>
                      <td className="p-4 text-muted-foreground">{cheap}</td>
                      <td className="p-4 text-foreground font-medium">{pawsy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ======= FEATURED PREMIUM PRODUCT ======= */}
        {featuredProduct && (
          <section className="py-16">
            <div className="container mx-auto px-4 max-w-3xl">
              <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden md:flex">
                <Link to={featuredProduct.slug ? `/product/${featuredProduct.slug}` : `/product/${featuredProduct.id}`} className="block md:w-1/2 relative aspect-square overflow-hidden bg-muted">
                  <OptimizedImage
                    src={featuredProduct.image_url || '/placeholder.svg'}
                    alt={`${featuredProduct.name} | GetPawsy`}
                    aspectRatio="square"
                    priority
                  />
                  <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    Top Pick
                  </Badge>
                </Link>
                <div className="p-6 md:p-8 md:w-1/2 flex flex-col justify-center">
                  <h2 className="font-display text-xl md:text-2xl font-bold text-foreground mb-2">
                    {featuredProduct.name}
                  </h2>
                  <StarRating rating={4.8} reviewCount={0} size="sm" className="mb-4" />

                  <ul className="space-y-2 mb-5 text-sm text-foreground">
                    {['Vet recommended', 'Anti-slip base', 'Dishwasher safe', 'BPA free', 'Designed for US pet owners'].map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold text-primary">${safePrice(featuredProduct.price)}</span>
                    {featuredProduct.compare_at_price && (
                      <span className="text-base text-muted-foreground line-through">${safePrice(featuredProduct.compare_at_price)}</span>
                    )}
                  </div>

                  <LowStockBadge stock={featuredProduct.stock} className="mb-4" />

                  {/* Bundle selector */}
                  <div className="mb-5">
                    <VolumeDiscountSelector
                      basePrice={Number(featuredProduct.price)}
                      onQuantityChange={(qty, discount) => {
                        setBundleQty(qty);
                        setBundleDiscount(discount);
                      }}
                      selectedQuantity={bundleQty}
                    />
                  </div>

                  <Button
                    size="lg"
                    className="w-full gap-2 rounded-full text-base"
                    onClick={(e) => handleAddToCart(featuredProduct, bundleQty, e)}
                  >
                    <ShoppingBag className="w-5 h-5" />
                    {bundleQty > 1 ? `Add ${bundleQty}-Pack to Cart` : 'Protect My Dog Now'}
                  </Button>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
                    <Truck className="w-3 h-3 flex-shrink-0" />
                    <span>Free shipping on eligible orders over ${FREE_SHIPPING_THRESHOLD} • {DELIVERY_TIME_STANDARD}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ======= MORE PRODUCTS ======= */}
        <section id="products" className="py-16 bg-muted/30 scroll-mt-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-2">
              More Slow Feeder Dog Bowls
            </h2>
            <p className="text-center text-muted-foreground mb-10 text-sm">
              Shipping to customers in the United States • {DELIVERY_TIME_STANDARD}
            </p>

            {products && products.length > 1 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.slice(1).map((product) => {
                  const discount = product.compare_at_price
                    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
                    : null;
                  const productUrl = product.slug ? `/product/${product.slug}` : `/product/${product.id}`;

                  return (
                    <div key={product.id} className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
                      <Link to={productUrl} className="block relative aspect-square overflow-hidden bg-muted">
                        <OptimizedImage
                          src={product.image_url || '/placeholder.svg'}
                          alt={`${product.name} | GetPawsy`}
                          aspectRatio="square"
                          priority
                        />
                        {discount && discount > 0 && (
                          <Badge className="absolute top-3 left-3 bg-destructive text-destructive-foreground">
                            -{discount}%
                          </Badge>
                        )}
                      </Link>
                      <div className="p-5 flex flex-col flex-1">
                        <Link to={productUrl}>
                          <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 mb-2 hover:text-primary transition-colors">
                            {product.name}
                          </h3>
                        </Link>

                        <StarRating rating={4.5} reviewCount={0} size="sm" className="mb-2" />

                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg font-bold text-primary">${safePrice(product.price)}</span>
                          {product.compare_at_price && (
                            <span className="text-sm text-muted-foreground line-through">${safePrice(product.compare_at_price)}</span>
                          )}
                        </div>

                        <LowStockBadge stock={product.stock} className="mb-2" />

                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                          <Truck className="w-3 h-3 flex-shrink-0" />
                          <span>Free shipping over ${FREE_SHIPPING_THRESHOLD}</span>
                        </div>

                        <div className="mt-auto">
                          <Button
                            className="w-full gap-2 rounded-full"
                            onClick={(e) => handleAddToCart(product, 1, e)}
                          >
                            <ShoppingBag className="w-4 h-4" />
                            Add to Cart
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading products…</p>
              </div>
            )}

            <div className="text-center mt-8">
              <Button asChild variant="outline" className="rounded-full gap-2">
                <Link to="/collections/best-slow-feeder-dog-bowls">
                  View All Dog Bowls & Feeders
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ======= FAQ SECTION ======= */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-10">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {PAGE_FAQS.map((faq) => (
                <details key={faq.question} className="group bg-card border border-border rounded-xl">
                  <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                    <h3 className="font-medium text-foreground text-sm pr-4">{faq.question}</h3>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-5 pb-5">
                    <p className="text-sm text-muted-foreground">{faq.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ======= FINAL CTA ======= */}
        <section className="py-12 bg-primary/5">
          <div className="container mx-auto px-4 max-w-xl text-center">
            <h2 className="font-display text-xl md:text-2xl font-bold text-foreground mb-3">
              Ready to Protect Your Dog?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Premium quality. Fair price. {RETURN_WINDOW_DAYS}-day return policy.
            </p>
            <Button asChild size="lg" className="rounded-full px-8 gap-2 text-base">
              <a href="#products">
                <ShoppingBag className="w-5 h-5" />
                Protect My Dog Now
              </a>
            </Button>
          </div>
        </section>

        {/* ======= TRUST SECTION ======= */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { icon: RotateCcw, title: `${RETURN_WINDOW_DAYS}-Day Returns`, desc: '30-day return policy' },
                { icon: Shield, title: 'Secure Checkout', desc: 'Encrypted payment' },
                { icon: Headphones, title: 'Dedicated Support', desc: 'We respond within 24h' },
                { icon: Truck, title: 'Free Shipping', desc: `Orders over $${FREE_SHIPPING_THRESHOLD}` },
                { icon: CheckCircle, title: 'Real Inventory', desc: 'Live stock tracking' },
              ].map((badge) => (
                <div key={badge.title} className="text-center p-4">
                  <badge.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-foreground">{badge.title}</h3>
                  <p className="text-xs text-muted-foreground">{badge.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Sticky mobile CTA */}
      <StickyCTA categorySlug="Dog+Bowls+%26+Feeders" categoryLabel="Slow Feeders" />
    </>
  );
}
