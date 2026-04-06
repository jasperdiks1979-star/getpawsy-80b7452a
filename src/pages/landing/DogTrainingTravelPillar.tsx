import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { FadeInView } from '@/components/ui/FadeInView';

const ProductCard = lazy(() => import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard })));

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best Dog Training & Travel Gear 2026 – Expert Buyer Guide',
  description: 'Complete 2026 buyer guide for dog training harnesses, car travel safety, leashes, and enrichment gear. Shipping to the US.',
  author: { '@type': 'Organization', name: 'GetPawsy' },
  publisher: { '@type': 'Organization', name: 'GetPawsy', url: 'https://getpawsy.pet' },
  datePublished: '2026-02-01',
  dateModified: '2026-02-28',
  mainEntityOfPage: 'https://getpawsy.pet/collections/dogs',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is the best no-pull harness for large dogs?',
      acceptedAnswer: { '@type': 'Answer', text: 'Front-clip harnesses with padded chest plates work best for large dogs that pull. Look for adjustable straps and reinforced stitching rated for 50+ lbs.' },
    },
    {
      '@type': 'Question',
      name: 'Are dog car seats safe?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes, crash-tested dog car seats significantly reduce injury risk during travel. Look for seats with steel-frame construction and tether attachment points.' },
    },
    {
      '@type': 'Question',
      name: 'How do I train my dog to stop pulling on the leash?',
      acceptedAnswer: { '@type': 'Answer', text: 'Use a front-clip harness combined with positive reinforcement. Stop walking when the dog pulls and reward loose-leash behavior. Consistency is key — most dogs improve within 2–4 weeks.' },
    },
    {
      '@type': 'Question',
      name: 'What leash length is best for training?',
      acceptedAnswer: { '@type': 'Answer', text: 'A 6-foot leash is standard for obedience training. For recall training, use a 15–30 foot long line in open spaces. Avoid retractable leashes for training purposes.' },
    },
    {
      '@type': 'Question',
      name: 'Do dogs need a special harness for car travel?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes. A crash-tested car harness that connects to the seatbelt system is safer than a regular walking harness. Look for Center for Pet Safety (CPS) certification.' },
    },
  ],
};

const DogTrainingTravelPillar = () => {
  const { data: products } = useQuery({
    queryKey: ['dog-pillar-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', ['Dog Training', 'Dog Carriers', 'Dog Collars & Leashes'])
        .order('price', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []).map(p => safeProduct(p)).filter((p): p is SafeProduct => p !== null);
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Layout>
      <Helmet>
        <title>Best Dog Training & Travel Gear 2026 – Expert Buyer Guide | GetPawsy</title>
        <meta name="description" content="2026 expert guide to the best dog training harnesses, car seats, leashes & travel gear. Tested picks with US 5–10 day shipping. 30-day return policy." /><meta name="robots" content="index, follow" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <article className="py-12 md:py-16">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <FadeInView>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">2026 Buyer Guide</p>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground leading-tight mb-6">
              Best Dog Training & Travel Gear 2026
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-3xl">
              Whether you're training a new puppy or preparing your dog for road trips, having the right gear makes all the difference. This guide covers the best harnesses, leashes, car seats, and travel accessories — all available with US 5–10 day shipping.
            </p>
          </FadeInView>

          {/* Section: Training Essentials */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-4">Training Essentials: Harnesses & Leashes</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The foundation of effective dog training starts with the right equipment. A no-pull harness redirects your dog's momentum without choking or causing discomfort, making it the preferred choice among professional trainers.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For leash training, a standard 6-foot leash provides the best control for obedience work. When progressing to recall training, a 15–30 foot long line gives your dog room to practice in open areas while maintaining a safety connection. Avoid retractable leashes for training — they teach dogs that pulling extends their range.
            </p>
            <h3 className="text-xl font-display font-semibold mb-3">What to look for in a training harness</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-6">
              <li>Front-clip attachment point for pull redirection</li>
              <li>Padded chest and belly straps to prevent chafing</li>
              <li>Adjustable at 4+ points for a custom fit</li>
              <li>Reflective stitching for visibility during evening walks</li>
              <li>Weight-rated for your dog's size (small, medium, large, XL)</li>
            </ul>
          </section>

          {/* Inline Product Grid */}
          {products && products.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold mb-6">Top Dog Training & Travel Picks</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <Suspense fallback={null}>
                  {products.slice(0, 8).map(product => (
                    <ProductCard key={product.id} product={product as any} />
                  ))}
                </Suspense>
              </div>
            </section>
          )}

          {/* Section: Travel Safety */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-4">Car Travel Safety</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              An unrestrained 60-pound dog in a 35 mph crash generates approximately 2,700 pounds of force — enough to injure both the dog and passengers. Proper restraint isn't optional; it's a safety necessity.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Crash-tested car harnesses attach to your vehicle's seatbelt system and distribute impact forces across your dog's chest. For smaller dogs, booster seats provide elevation and containment. For larger vehicles, back seat hammocks protect upholstery while giving dogs a defined travel space.
            </p>
            <h3 className="text-xl font-display font-semibold mb-3">Car travel checklist</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-6">
              <li>Crash-tested harness or car seat (look for CPS certification)</li>
              <li>Non-spill water bowl for hydration on long drives</li>
              <li>Seat cover or hammock to protect vehicle interior</li>
              <li>Calming treats or toys for anxious travelers</li>
              <li>Emergency ID tag with your phone number</li>
            </ul>
          </section>

          {/* More products */}
          {products && products.length > 8 && (
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold mb-6">More Dog Training & Travel Products</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <Suspense fallback={null}>
                  {products.slice(8, 20).map(product => (
                    <ProductCard key={product.id} product={product as any} />
                  ))}
                </Suspense>
              </div>
            </section>
          )}

          {/* Section: Shipping & Returns */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-4">Shipping & Returns</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All dog training and travel products ship directly to customers with 5–10 business day estimated delivery. Free shipping on orders over $35. Every purchase is covered by our 30-day return policy — items must be unused and in original condition.
            </p>
          </section>

          {/* FAQ Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-6">Frequently Asked Questions</h2>
            <div className="space-y-6">
              {faqJsonLd.mainEntity.map((faq, i) => (
                <div key={i} className="border-b border-border/40 pb-4">
                  <h3 className="font-semibold text-foreground mb-2">{faq.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.acceptedAnswer.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Silo Internal Links — dog silo only */}
          <section>
            <h2 className="text-2xl font-display font-bold mb-4">Explore Dog Guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link to="/collections/dog" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Dog Training Essentials →</h3>
                <p className="text-sm text-muted-foreground">No-pull harnesses, leashes & behavior tools</p>
              </Link>
              <Link to="/collections/dog" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Dog Travel Safety Gear →</h3>
                <p className="text-sm text-muted-foreground">Car seats, travel harnesses & carriers</p>
              </Link>
              <Link to="/collections/all" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Training & Behavior Tools →</h3>
                <p className="text-sm text-muted-foreground">Complete collection of training gear</p>
              </Link>
              <Link to="/collections/all" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Car Travel Safety →</h3>
                <p className="text-sm text-muted-foreground">Car seats, harnesses & safety gear</p>
              </Link>
              <Link to="/collections/all" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Orthopedic Dog Beds →</h3>
                <p className="text-sm text-muted-foreground">Memory foam beds for all breeds</p>
              </Link>
              <Link to="/collections/dog" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">All Dog Products →</h3>
                <p className="text-sm text-muted-foreground">Browse the full dog collection</p>
              </Link>
            </div>
          </section>
        </div>
      </article>
    </Layout>
  );
};

export default DogTrainingTravelPillar;
