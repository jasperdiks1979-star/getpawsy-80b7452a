import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Shield, Truck, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/products/ProductCard";

const CANONICAL = 'https://getpawsy.pet/cat/cat-trees-for-large-cats';
const PAGE_TITLE = 'Best Cat Trees for Large Cats – Heavy Duty & Extra Tall (2026)';
const META_DESC = 'Find the best cat trees built for large cats, Maine Coons, and multi-cat homes. Sturdy, heavy-duty cat trees with wide platforms and thick posts. Free US shipping.';

const FAQ_DATA = [
  { question: 'What cat tree can hold a 25 lb cat?', answer: 'Look for cat trees with solid wood or engineered wood bases rated for 40+ lbs. Avoid pressed-board models. Heavy-duty cat trees designed for large breeds use reinforced platforms, wall-anchor systems, and thick sisal posts (4"+ diameter) to safely support cats weighing 20–30+ lbs without wobbling.' },
  { question: 'Are tall cat trees safe for large cats?', answer: 'Yes, if properly anchored. The safest tall cat trees for large cats include wall-mounting hardware, a wide weighted base (minimum 24" x 24"), and anti-tip straps. Floor-to-ceiling tension models provide the highest stability for 20+ lb cats.' },
  { question: 'What size cat tree for a Maine Coon?', answer: 'Maine Coons need cat trees with platforms at least 18" wide, perches rated for 25+ lbs, and condos with 12"+ diameter openings. Total height should be 60"+ to accommodate their climbing instincts. Standard cat trees marketed as "large" are often undersized for true Maine Coons.' },
  { question: 'How much should a heavy duty cat tree cost?', answer: 'Quality heavy-duty cat trees for large cats range from $80–$300. Under $80 typically means pressed board that won\'t support large cats long-term. The sweet spot is $120–$200 for solid construction with real wood and sisal that lasts 5+ years.' },
  { question: 'Do large cats need special cat trees?', answer: 'Yes. Standard cat trees are designed for cats under 12 lbs. Large breeds (Maine Coons, Ragdolls, Norwegian Forest Cats, British Shorthairs) require wider platforms, reinforced joints, thicker scratching posts, and heavier bases to prevent tipping during jumping.' },
  { question: 'What is the most sturdy cat tree?', answer: 'The sturdiest cat trees use solid wood frames (not pressed board), 4"+ diameter sisal posts, wide platforms with raised edges, and include wall-anchor hardware. Models with floor-to-ceiling tension poles are the most stable option for households with multiple large cats.' },
];

const COMPARISON_DATA = [
  { feature: 'Weight Capacity', heavy: '40–60+ lbs', standard: '15–25 lbs' },
  { feature: 'Post Diameter', heavy: '4"+ natural sisal', standard: '2–3" thin sisal' },
  { feature: 'Platform Width', heavy: '18"+ with raised edges', standard: '10–14" flat' },
  { feature: 'Base Construction', heavy: 'Solid/engineered wood', standard: 'Pressed particleboard' },
  { feature: 'Lifespan', heavy: '5–8 years', standard: '1–3 years' },
  { feature: 'Stability', heavy: 'Wall-anchor + weighted base', standard: 'Free-standing only' },
  { feature: 'Price Range', heavy: '$120–$300', standard: '$40–$100' },
  { feature: 'Best For', heavy: 'Maine Coons, Ragdolls, 15+ lb cats', standard: 'Kittens, small adult cats' },
];

export default function CatTreesForLargeCats() {
  const { data: products } = useQuery<any[]>({
    queryKey: ['cat-trees-large-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products' as any)
        .select('id,name,slug,price,compare_at_price,images,rating,review_count,status,category')
        .or('name.ilike.%cat tree%,name.ilike.%cat tower%,name.ilike.%cat condo%')
        .eq('status', 'active')
        .order('review_count', { ascending: false })
        .limit(8);
      return (data as any[]) || [];
    },
  });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_DATA.map(f => ({
      '@type': 'Question', name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://getpawsy.pet' },
      { '@type': 'ListItem', position: 2, name: 'Cat Trees for Large Cats', item: CANONICAL },
    ],
  };

  return (
    <Layout>
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={META_DESC} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={META_DESC} />
        <meta property="og:url" content={CANONICAL} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Cat Trees for Large Cats</span>
        </nav>

        {/* ─── HERO ─── */}
        <section className="mb-12">
          <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">
            Best Cat Trees for Large Cats — Heavy Duty & Extra Tall (2026 Guide)
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mb-6">
            Purpose-built cat trees engineered for Maine Coons, Ragdolls, and multi-cat households. Reinforced platforms, thick sisal posts, and anti-tip stability systems.
          </p>
          <div className="flex flex-wrap gap-4 mb-6">
            <Link to="/products?category=cat-trees-and-condos">
              <Button size="lg" className="gap-2">
                Shop Heavy Duty Cat Trees <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-primary" /> Rated for 25+ lb Cats</span>
            <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-primary" /> 3–7 Day US Shipping</span>
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-primary" /> 30-Day Satisfaction Guarantee</span>
          </div>
        </section>

        {/* ─── WHY LARGE CATS NEED SPECIAL TREES ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">Why Large Cats Need Specialized Cat Trees</h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            Standard cat trees are engineered for cats under 12 lbs. If you have a Maine Coon, Ragdoll, Norwegian Forest Cat, or British Shorthair, a standard tree will wobble, tip, and collapse — potentially injuring your cat and destroying your furniture.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">⚖️</span> Weight Distribution & Stability
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A 20-lb Maine Coon jumping onto a platform creates <strong>4x its body weight in impact force</strong> — roughly 80 lbs of dynamic load. Standard pressed-board cat trees are rated for 15–25 lbs of static weight, meaning they fail catastrophically under the dynamic forces of large cats jumping and climbing. Heavy-duty cat trees use solid wood frames and reinforced joints to handle 60+ lbs of dynamic load safely.
              </p>
            </div>
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">🐾</span> Platform Sizing for Large Breeds
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Maine Coons average 40 inches nose-to-tail. Standard cat tree platforms (10–14 inches wide) force large cats into uncomfortable positions and discourage use. Quality large-cat trees feature platforms <strong>18 inches or wider</strong> with raised edges to prevent rolling off during sleep. Condos should have 12"+ diameter openings — standard 9" openings are too tight for large breeds.
              </p>
            </div>
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">🌲</span> Scratching Post Quality
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Large cats need <strong>4-inch diameter sisal posts minimum</strong>. Standard 2–3 inch posts shred within weeks under heavy use. Natural sisal rope wrapped tightly around solid wood posts lasts 3–5x longer than thin sisal on cardboard tubes. The best heavy-duty cat trees use full-length sisal covering from base to platform.
              </p>
            </div>
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">🏠</span> Anti-Tip Systems
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For tall cat trees (60"+), a wide weighted base alone isn't sufficient for large cats. The safest designs include <strong>wall-anchor hardware</strong> and anti-tip straps. Floor-to-ceiling tension pole models provide the most stability for multi-cat households with large breeds. Always anchor tall cat trees — tipping injuries are preventable.
              </p>
            </div>
          </div>
        </section>

        {/* ─── BUYER INTENT BLOCKS ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Find the Right Cat Tree for Your Large Cat</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Extra Large Cat Trees',
                desc: 'XL cat trees with oversized platforms, wide condos, and reinforced bases designed specifically for cats over 15 lbs. Multiple levels provide vertical territory for large breeds that love to climb and survey their domain from the highest point.',
                link: '/collections/extra-large-cat-trees',
                linkText: 'Shop Extra Large Cat Trees →',
              },
              {
                title: 'Heavy Duty Cat Trees',
                desc: 'Built with solid wood frames, thick sisal posts, and anti-tip hardware. These cat trees are rated for 40+ lbs and designed to withstand aggressive play from large and active cats. Many include wall-anchor systems for maximum stability.',
                link: '/cat/cat-trees-for-large-cats/heavy-duty',
                linkText: 'Shop Heavy Duty Cat Trees →',
              },
              {
                title: 'Cat Trees for Maine Coons',
                desc: 'Purpose-designed for the largest domestic breed. Features include 18"+ platforms, 12"+ condo openings, reinforced hammocks rated for 25 lbs, and extra-tall scratching posts that accommodate a full stretch. Built to handle 20–30 lb cats comfortably.',
                link: '/cat/cat-trees-for-large-cats/for-maine-coon',
                linkText: 'Shop Maine Coon Cat Trees →',
              },
              {
                title: 'Cat Trees for Multiple Cats',
                desc: 'Multi-level designs with enough platforms, condos, and perches for 2–4 cats simultaneously. Wider bases and heavier construction prevent tipping when multiple large cats are climbing at once. Territory-conscious layouts reduce inter-cat conflict.',
                link: '/collections/best-cat-tree-for-multiple-cats',
                linkText: 'Shop Multi-Cat Trees →',
              },
            ].map(block => (
              <div key={block.title} className="bg-card border rounded-2xl p-6">
                <h3 className="font-semibold text-lg mb-3">{block.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{block.desc}</p>
                <Link to={block.link} className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1">
                  {block.linkText}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ─── COMPARISON TABLE ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Heavy Duty vs Standard Cat Tree Comparison</h2>
          <div className="overflow-x-auto border rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-semibold">Feature</th>
                  <th className="text-left p-3 font-semibold">Heavy Duty (Large Cats)</th>
                  <th className="text-left p-3 font-semibold">Standard</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_DATA.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-muted-foreground">{row.heavy}</td>
                    <td className="p-3 text-muted-foreground">{row.standard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── PRODUCTS ─── */}
        {products && products.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-display font-bold mb-6">Top Rated Cat Trees for Large Cats</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p: any) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* ─── FAQ ─── */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_DATA.map(faq => (
              <details key={faq.question} className="group bg-card border rounded-xl">
                <summary className="cursor-pointer p-4 font-medium text-sm flex items-center justify-between">
                  {faq.question}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.answer}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ─── INTERNAL LINKS ─── */}
        <section className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
          <h2 className="text-2xl font-display font-bold mb-2">Explore More Cat Furniture Guides</h2>
          <p className="text-muted-foreground text-sm mb-6">Expert articles to help you choose the best cat furniture for your home and breed.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { slug: 'best-cat-trees-small-apartments', title: 'Best Cat Trees for Small Apartments', desc: 'Space-saving solutions that still provide vertical territory.' },
              { slug: 'cat-condo-buying-guide', title: 'Cat Condo Buying Guide', desc: 'Materials, sizing, and features that matter most.' },
              { slug: 'best-cat-scratching-post', title: 'Best Cat Scratching Posts', desc: 'Sisal vs carpet vs cardboard — which lasts longest?' },
            ].map(guide => (
              <Link key={guide.slug} to={`/guides/${guide.slug}`} className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{guide.title}</h3>
                <p className="text-xs text-muted-foreground">{guide.desc}</p>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/dog/orthopedic-dog-beds" className="text-sm text-primary hover:underline font-medium">Orthopedic Dog Beds →</Link>
            <Link to="/dog/dog-car-travel-safety" className="text-sm text-primary hover:underline font-medium">Dog Car Travel Safety →</Link>
            <Link to="/cat/cat-trees-for-large-cats/large-cat-condos" className="text-sm text-primary hover:underline font-medium">Large Cat Condos →</Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
