/**
 * SeoIntentPage — Generic data-driven sub-intent page.
 * Resolves intent config from seo-route-config allowlist.
 * Renders: Hero, quick answer, product grid, FAQ, internal links.
 */
import { useParams, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle, Lightbulb } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductCard } from '@/components/products/ProductCard';
import { ClusterAuthorBox } from '@/components/seo/ClusterAuthorBox';
import { IntentInternalLinks } from '@/components/seo/IntentInternalLinks';
import {
  findPillar,
  findIntent,
  intentCanonical,
  type SeoNamespace,
  type SeoIntent,
  type SeoPillar,
} from '@/lib/seo-route-config';
import { SITE_URL } from '@/lib/constants';

interface Props {
  namespace: SeoNamespace;
}

export default function SeoIntentPage({ namespace }: Props) {
  const { pillarSlug, intentSlug } = useParams<{ pillarSlug: string; intentSlug: string }>();

  const pillar = pillarSlug ? findPillar(namespace, pillarSlug) : undefined;
  const intent = pillar && intentSlug ? findIntent(namespace, pillarSlug!, intentSlug) : undefined;

  if (!pillar || !intent) {
    return <Navigate to="/404-not-found" replace />;
  }

  return <IntentContent pillar={pillar} intent={intent} namespace={namespace} />;
}

function IntentContent({ pillar, intent, namespace }: { pillar: SeoPillar; intent: SeoIntent; namespace: SeoNamespace }) {
  const canonical = intentCanonical(namespace, pillar.slug, intent.slug);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['seo-intent-products', intent.slug],
    queryFn: async () => {
      const keywords = [intent.primaryKeyword, ...intent.secondaryKeywords.slice(0, 2)];
      const orFilter = keywords.map(kw => `name.ilike.%${kw.split(' ').join('%')}%`).join(',');
      const { data } = await supabase
        .from('products' as any)
        .select('id,name,slug,price,compare_at_price,images,rating,review_count,status,category')
        .or(orFilter)
        .eq('status', 'active')
        .order('review_count', { ascending: false })
        .limit(4);
      return (data as any[]) || [];
    },
  });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: intent.faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: namespace === 'dog' ? 'Dogs' : 'Cats', item: `${SITE_URL}/${namespace}` },
      { '@type': 'ListItem', position: 3, name: pillar.h1, item: `${SITE_URL}/${namespace}/${pillar.slug}` },
      { '@type': 'ListItem', position: 4, name: intent.h1, item: canonical },
    ],
  };

  return (
    <Layout>
      <Helmet>
        <title>{intent.title}</title>
        <meta name="description" content={intent.intro.substring(0, 160)} /><meta property="og:title" content={intent.title} />
        <meta property="og:description" content={intent.intro.substring(0, 160)} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <Link to={`/${namespace}/${pillar.slug}`} className="hover:text-foreground">{pillar.h1}</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{intent.h1}</span>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">{intent.h1}</h1>
          <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed mb-6">{intent.intro}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {intent.secondaryKeywords.slice(0, 4).map(kw => (
              <span key={kw} className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-primary" /> {kw}
              </span>
            ))}
          </div>
        </section>

        {/* Quick Answer Box */}
        {intent.faq.length > 0 && (
          <section className="mb-10 bg-primary/5 border border-primary/20 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-sm mb-1">Quick Answer: {intent.faq[0].q}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{intent.faq[0].a}</p>
              </div>
            </div>
          </section>
        )}

        {/* Back-to-pillar */}
        <div className="mb-10 bg-muted/30 border rounded-xl p-4 text-sm">
          <span className="text-muted-foreground">Part of our </span>
          <Link to={`/${namespace}/${pillar.slug}`} className="text-primary font-semibold hover:underline">{pillar.h1}</Link>
          <span className="text-muted-foreground"> authority hub.</span>
        </div>

        {/* Product Grid */}
        {products && products.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-display font-bold mb-4">Top Picks</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {/* How to Choose Guide */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-bold mb-4">How to Choose</h2>
          <div className="text-sm text-muted-foreground leading-relaxed max-w-3xl space-y-3">
            <p>When shopping for products related to <strong>{intent.primaryKeyword}</strong>, focus on quality materials, verified reviews, and your pet's specific needs.</p>
            <p>Consider factors like your pet's size, age, and any special health requirements. Our curated selections above represent the best options we've tested and reviewed.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-bold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {intent.faq.map(f => (
              <details key={f.q} className="group bg-card border rounded-xl">
                <summary className="cursor-pointer p-4 font-medium text-sm flex items-center justify-between">
                  {f.q}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Author */}
        <section className="mb-12">
          <ClusterAuthorBox />
        </section>

        {/* Internal Links */}
        <IntentInternalLinks pillar={pillar} intent={intent} namespace={namespace} />
      </div>
    </Layout>
  );
}
