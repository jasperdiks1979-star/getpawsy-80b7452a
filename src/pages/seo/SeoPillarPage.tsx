/**
 * SeoPillarPage — Generic data-driven pillar page.
 * Resolves pillar config from seo-route-config allowlist.
 * Renders: Hero, intent grid, product grid, FAQ, internal links.
 */
import { useParams, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductCard } from '@/components/products/ProductCard';
import { ClusterAuthorBox } from '@/components/seo/ClusterAuthorBox';
import { PillarInternalLinks } from '@/components/seo/PillarInternalLinks';
import {
  findPillar,
  pillarCanonical,
  type SeoNamespace,
  type SeoPillar,
} from '@/lib/seo-route-config';
import { SITE_URL } from '@/lib/constants';

interface Props {
  namespace: SeoNamespace;
}

export default function SeoPillarPage({ namespace }: Props) {
  const { pillarSlug } = useParams<{ pillarSlug: string }>();

  const pillar = pillarSlug ? findPillar(namespace, pillarSlug) : undefined;

  // If pillar not in allowlist → 404
  if (!pillar) {
    // Lazy-load NotFound to avoid circular imports
    return <Navigate to="/404-not-found" replace />;
  }

  return <PillarContent pillar={pillar} namespace={namespace} />;
}

function PillarContent({ pillar, namespace }: { pillar: SeoPillar; namespace: SeoNamespace }) {
  const canonical = pillarCanonical(namespace, pillar.slug);

  // Fetch products for grid
  const { data: products } = useQuery({
    queryKey: ['seo-pillar-products', pillar.slug],
    queryFn: async () => {
      const keywords = [pillar.primaryKeyword, ...pillar.secondaryKeywords.slice(0, 3)];
      const orFilter = keywords.map(kw => `name.ilike.%${kw.split(' ').join('%')}%`).join(',');
      const { data } = await supabase
        .from('products' as any)
        .select('id,name,slug,price,compare_at_price,images,rating,review_count,status,category')
        .or(orFilter)
        .eq('status', 'active')
        .order('review_count', { ascending: false })
        .limit(8);
      return (data as any[]) || [];
    },
  });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pillar.faq.map(f => ({
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
      { '@type': 'ListItem', position: 3, name: pillar.h1, item: canonical },
    ],
  };

  return (
    <Layout>
      <Helmet>
        <title>{pillar.title}</title>
        <meta name="description" content={pillar.intro.substring(0, 160)} /><meta property="og:title" content={pillar.title} />
        <meta property="og:description" content={pillar.intro.substring(0, 160)} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{pillar.h1}</span>
        </nav>

        {/* Hero */}
        <section className="mb-12">
          <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">{pillar.h1}</h1>
          <p className="text-lg text-muted-foreground max-w-3xl mb-6 leading-relaxed">{pillar.intro}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-primary" /> Free shipping $35+</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> Quality checked</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="w-4 h-4 text-primary" /> 30-day return policy</span>
          </div>
        </section>

        {/* Intent Cards — "Explore Topics" */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold mb-6">Explore Topics</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {pillar.intents.map(intent => (
              <Link
                key={intent.slug}
                to={`/${namespace}/${pillar.slug}/${intent.slug}`}
                className="group bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all"
              >
                <h3 className="font-semibold text-base mb-2 group-hover:text-primary transition-colors">{intent.h1}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">{intent.intro.substring(0, 120)}...</p>
                <span className="inline-flex items-center gap-1 text-sm text-primary mt-3 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Read guide <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Product Grid */}
        {products && products.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold mb-2">Shop the Best Picks</h2>
            <p className="text-sm text-muted-foreground mb-6">Expert-curated products in this category</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.slice(0, 8).map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
            {pillar.productsCollectionSlug && (
              <div className="mt-6 text-center">
                <Link to={`/collections/${pillar.productsCollectionSlug}`}>
                  <Button variant="outline" className="gap-2">View Full Collection <ArrowRight className="w-4 h-4" /></Button>
                </Link>
              </div>
            )}
          </section>
        )}

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {pillar.faq.map(f => (
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

        {/* Author Box */}
        <section className="mb-12">
          <ClusterAuthorBox />
        </section>

        {/* Internal Links */}
        <PillarInternalLinks pillar={pillar} namespace={namespace} />
      </div>
    </Layout>
  );
}
