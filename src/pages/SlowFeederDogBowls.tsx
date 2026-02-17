import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingBag, Shield, Truck, RotateCcw, Headphones, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { StarRating } from '@/components/ui/star-rating';
import { LowStockBadge } from '@/components/products/LowStockBadge';
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
    question: 'Do slow feeder dog bowls really work?',
    answer: 'Yes. Slow feeder bowls use raised ridges and maze patterns to force dogs to eat around obstacles, slowing meal times significantly. Most dogs take 5–10 times longer to finish a meal compared to a regular bowl.',
  },
  {
    question: 'How long does US shipping take?',
    answer: `Standard US shipping takes ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} ship free.`,
  },
  {
    question: 'Is a slow feeder bowl safe for puppies?',
    answer: 'Slow feeder bowls are safe for puppies over 8 weeks old. Choose a size-appropriate bowl with wider channels so young dogs can access food without frustration.',
  },
  {
    question: 'Are slow feeder bowls dishwasher safe?',
    answer: 'Most of our slow feeder bowls are made from BPA-free materials and are top-rack dishwasher safe. Check the product description for specific care instructions.',
  },
  {
    question: 'What size slow feeder bowl should I choose?',
    answer: 'Small breeds (under 25 lbs) do well with small bowls. Medium breeds (25–60 lbs) need a medium bowl. Large and giant breeds (60+ lbs) should use a large or extra-large bowl for comfortable eating.',
  },
  {
    question: 'Does a slow feeder bowl reduce bloating in dogs?',
    answer: 'Slowing down eating reduces the amount of air swallowed during meals, which is a primary cause of bloating and gastric discomfort. Veterinarians frequently recommend slow feeders for breeds prone to bloat.',
  },
];

export default function SlowFeederDogBowls() {
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();

  // Fetch top 3 bowls from Dog Bowls & Feeders category, in-stock
  const { data: products } = useQuery({
    queryKey: ['slow-feeder-landing-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, price, compare_at_price, image_url, stock, category')
        .eq('category', 'Dog Bowls & Feeders')
        .eq('is_active', true)
        .gt('stock', 0)
        .order('stock', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });

  const handleAddToCart = (product: NonNullable<typeof products>[number], e: React.MouseEvent) => {
    e.preventDefault();
    triggerAddToCart(
      product.image_url || '/placeholder.svg',
      e.currentTarget as HTMLElement,
    );
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    trackAddToCart(product.id, product.name, Number(product.price), 1);
    toast.success('Added to cart!');
  };

  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Best Slow Feeder Dog Bowls 2026 | Reduce Bloating & Vomiting',
    description: 'Shop vet-approved slow feeder dog bowls that slow eating up to 10x. Reduce vomiting & bloating. Free US shipping over $35.',
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
        <title>Best Slow Feeder Dog Bowls 2026 | Reduce Bloating & Vomiting</title>
        <meta name="description" content="Shop vet-approved slow feeder dog bowls that slow eating up to 10x. Reduce vomiting & bloating. Free US shipping over $35." />
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
              Stop Fast Eating in 7 Days or Less
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Vet-recommended slow feeder bowls that reduce bloating, vomiting and choking.
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
                Free US shipping over ${FREE_SHIPPING_THRESHOLD}
              </li>
            </ul>

            <Button asChild size="lg" className="rounded-full px-8 gap-2 text-base">
              <a href="#products">
                <ShoppingBag className="w-5 h-5" />
                Shop Slow Feeders
              </a>
            </Button>
          </div>
        </section>

        {/* ======= PROBLEM → AGITATE → SOLVE ======= */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-8">
              Why Fast Eating Is Dangerous for Dogs
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
              {[
                { icon: XCircle, title: 'Vomiting', desc: 'Undigested food comes back up within minutes of eating.' },
                { icon: XCircle, title: 'Bloating (GDV)', desc: 'Excess air intake can cause life-threatening gastric dilation.' },
                { icon: XCircle, title: 'Weight Gain', desc: 'Fast eaters miss satiety signals and overeat consistently.' },
                { icon: XCircle, title: 'Choking Risk', desc: 'Large unchewed pieces of kibble can obstruct airways.' },
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

            <div className="bg-card border border-primary/20 rounded-xl p-6 text-center">
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                The Simple Fix: Structured Maze Design
              </h3>
              <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                Slow feeder bowls use raised ridges and channels that turn mealtime into a gentle puzzle.
                Dogs eat naturally around the obstacles — no stress, no training required.
              </p>
            </div>
          </div>
        </section>

        {/* ======= COMPARISON TABLE ======= */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-8">
              Regular Bowl vs. Slow Feeder Bowl
            </h2>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-4 text-left font-medium text-muted-foreground">Feature</th>
                    <th className="p-4 text-left font-medium text-destructive/80">Regular Bowl</th>
                    <th className="p-4 text-left font-medium text-primary">Slow Feeder</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Eating Speed', 'Fast gulping', 'Controlled pace'],
                    ['Digestion', 'Vomiting risk', 'Better digestion'],
                    ['Mental Stimulation', 'No stimulation', 'Mental enrichment'],
                    ['Bloat Prevention', 'Higher risk', 'Reduced air intake'],
                    ['Meal Duration', '30 seconds', '5–15 minutes'],
                  ].map(([feature, regular, slow], i) => (
                    <tr key={feature} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="p-4 font-medium text-foreground">{feature}</td>
                      <td className="p-4 text-muted-foreground">{regular}</td>
                      <td className="p-4 text-foreground font-medium">{slow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ======= PRODUCT BLOCK ======= */}
        <section id="products" className="py-16 bg-muted/30 scroll-mt-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground text-center mb-2">
              Our Top Slow Feeder Dog Bowls
            </h2>
            <p className="text-center text-muted-foreground mb-10 text-sm">
              Ships from US fulfillment centers • {DELIVERY_TIME_STANDARD}
            </p>

            {products && products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products.map((product) => {
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
                          <span>Ships from US fulfillment centers</span>
                        </div>

                        <div className="mt-auto">
                          <Button
                            className="w-full gap-2 rounded-full"
                            onClick={(e) => handleAddToCart(product, e)}
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
                <Link to="/products?category=Dog+Bowls+%26+Feeders">
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

        {/* ======= TRUST SECTION ======= */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: RotateCcw, title: `${RETURN_WINDOW_DAYS}-Day Returns`, desc: 'Satisfaction guaranteed' },
                { icon: Shield, title: 'Secure Checkout', desc: 'Encrypted payment' },
                { icon: Headphones, title: 'US-Based Support', desc: 'We respond within 24h' },
                { icon: Truck, title: 'Free Shipping', desc: `Orders over $${FREE_SHIPPING_THRESHOLD}` },
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
