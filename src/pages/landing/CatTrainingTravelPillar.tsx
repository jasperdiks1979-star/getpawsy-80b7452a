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
  headline: 'Best Cat Training & Travel Gear 2026 – Expert Buyer Guide',
  description: 'Complete 2026 buyer guide for cat trees, carriers, enrichment toys, and scratching posts. Shipping to the US.',
  author: { '@type': 'Organization', name: 'GetPawsy' },
  publisher: { '@type': 'Organization', name: 'GetPawsy', url: 'https://getpawsy.pet' },
  datePublished: '2026-02-01',
  dateModified: '2026-02-28',
  mainEntityOfPage: 'https://getpawsy.pet/collections/cats',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is the best cat tree for large cats?',
      acceptedAnswer: { '@type': 'Answer', text: 'For large cats (15+ lbs), look for cat trees with wide platforms (18"+), thick sisal posts (4.5"+), and a heavy base (30+ lbs). Stability-tested trees for breeds like Maine Coons should support 50+ lbs total weight.' },
    },
    {
      '@type': 'Question',
      name: 'Are airline-approved cat carriers safe?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes, airline-approved carriers are designed to fit under airplane seats while providing ventilation and security. Look for carriers with mesh windows on at least 3 sides and a leash attachment inside.' },
    },
    {
      '@type': 'Question',
      name: 'How do I train an indoor cat to use a scratching post?',
      acceptedAnswer: { '@type': 'Answer', text: 'Place the scratching post near where your cat currently scratches. Use catnip spray to attract them. Reward scratching on the post with treats. Most cats prefer sisal rope posts positioned vertically at full stretch height.' },
    },
    {
      '@type': 'Question',
      name: 'What enrichment toys keep indoor cats active?',
      acceptedAnswer: { '@type': 'Answer', text: 'Interactive wand toys, puzzle feeders, crinkle tunnels, and catnip-infused toys stimulate hunting instincts. Rotate toys weekly to prevent boredom. 15–20 minutes of interactive play daily is recommended.' },
    },
    {
      '@type': 'Question',
      name: 'How do I reduce my cat\'s travel anxiety?',
      acceptedAnswer: { '@type': 'Answer', text: 'Start by leaving the carrier open at home with treats inside. Take short practice drives before vet visits. Use pheromone sprays in the carrier. A familiar blanket with your scent helps cats feel secure during travel.' },
    },
  ],
};

const CatTrainingTravelPillar = () => {
  const { data: products } = useQuery({
    queryKey: ['cat-pillar-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', ['Cat Trees & Condos', 'Cat Carriers', 'Cat Toys', 'Cat Scratching Posts', 'Cat Furniture'])
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
        <title>Best Cat Training & Travel Gear 2026 – Expert Buyer Guide | GetPawsy</title>
        <meta name="description" content="2026 expert guide to the best cat trees, carriers, enrichment toys & scratching posts. Tested picks with US 5–10 day shipping. 30-day return policy." /><meta name="robots" content="index, follow" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <article className="py-12 md:py-16">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <FadeInView>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">2026 Buyer Guide</p>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground leading-tight mb-6">
              Best Cat Training & Travel Gear 2026
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-3xl">
              Indoor cats need stimulation, enrichment, and safe travel solutions. This guide covers the best cat trees, carriers, scratching posts, and interactive toys — all available with US 5–10 day shipping.
            </p>
          </FadeInView>

          {/* Section: Enrichment & Training */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-4">Cat Enrichment & Training</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Indoor cats need environmental enrichment to prevent obesity, anxiety, and destructive behavior. A well-designed cat tree provides vertical territory — essential for a cat's sense of security. Combined with scratching posts and interactive toys, you create a complete enrichment environment.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Cat trees serve dual purposes: they satisfy the climbing instinct and provide elevated observation points that reduce territorial stress in multi-cat households. For large breeds like Maine Coons and Ragdolls, stability is critical — look for trees with wide bases and thick posts rated for 25+ lbs per platform.
            </p>
            <h3 className="text-xl font-display font-semibold mb-3">Key enrichment features</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-6">
              <li>Sisal-wrapped posts at full stretch height for natural scratching</li>
              <li>Multiple platforms at varying heights for climbing exercise</li>
              <li>Enclosed condos for hiding and napping</li>
              <li>Dangling toys for hunting simulation</li>
              <li>Stable base that doesn't wobble or tip during play</li>
            </ul>
          </section>

          {/* Inline Product Grid */}
          {products && products.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold mb-6">Top Cat Training & Travel Picks</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <Suspense fallback={null}>
                  {products.slice(0, 8).map(product => (
                    <ProductCard key={product.id} product={product as any} />
                  ))}
                </Suspense>
              </div>
            </section>
          )}

          {/* Section: Travel */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-4">Cat Travel Essentials</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Whether it's a vet visit or a cross-country move, the right carrier reduces stress for both you and your cat. Airline-approved carriers fit under most airplane seats and feature mesh ventilation panels for airflow and visibility.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For cats that experience travel anxiety, preparation is key. Start carrier training weeks before travel by leaving it open at home with familiar bedding inside. Short practice car rides help cats build tolerance gradually.
            </p>
            <h3 className="text-xl font-display font-semibold mb-3">Travel carrier checklist</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-6">
              <li>Top-loading and front-loading access for easy entry</li>
              <li>Mesh ventilation on 3+ sides</li>
              <li>Washable inner padding or removable liner</li>
              <li>Internal leash clip for added security</li>
              <li>Airline dimensions compliance (17" × 11" × 7.5" typical)</li>
            </ul>
          </section>

          {/* More products */}
          {products && products.length > 8 && (
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold mb-6">More Cat Products</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <Suspense fallback={null}>
                  {products.slice(8, 20).map(product => (
                    <ProductCard key={product.id} product={product as any} />
                  ))}
                </Suspense>
              </div>
            </section>
          )}

          {/* Shipping & Returns */}
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-4">Shipping & Returns</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All cat products ship with 5–10 business day estimated delivery to the United States. Free shipping on orders over $35. Every purchase is covered by our 30-day return policy — items must be unused and in original condition.
            </p>
          </section>

          {/* FAQ */}
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

          {/* Silo Internal Links — cat silo only */}
          <section>
            <h2 className="text-2xl font-display font-bold mb-4">Explore Cat Guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link to="/collections/cat" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Cat Enrichment & Training →</h3>
                <p className="text-sm text-muted-foreground">Cat trees, scratching posts & interactive toys</p>
              </Link>
              <Link to="/collections/cat" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Cat Travel Essentials →</h3>
                <p className="text-sm text-muted-foreground">Airline-approved carriers & travel gear</p>
              </Link>
              <Link to="/products" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Cat Trees for Large Cats →</h3>
                <p className="text-sm text-muted-foreground">Stability-tested for 25+ lbs</p>
              </Link>
              <Link to="/guides/best-cat-litter-box-2026" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Best Cat Litter Boxes 2026 →</h3>
                <p className="text-sm text-muted-foreground">12 tested picks for odor control</p>
              </Link>
              <Link to="/guides/best-cat-trees-large-cats-2026" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Best Cat Trees 2026 →</h3>
                <p className="text-sm text-muted-foreground">9 trees tested for stability</p>
              </Link>
              <Link to="/collections/cat" className="group bg-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">All Cat Products →</h3>
                <p className="text-sm text-muted-foreground">Browse the full cat collection</p>
              </Link>
            </div>
          </section>
        </div>
      </article>
    </Layout>
  );
};

export default CatTrainingTravelPillar;
