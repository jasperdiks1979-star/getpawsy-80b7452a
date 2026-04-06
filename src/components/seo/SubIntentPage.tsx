/**
 * Reusable sub-intent landing page shell for cluster subpages.
 * Provides consistent structure: Hero, EEAT content, product grid, FAQ, author, related links.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { CheckCircle, Truck, Shield, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductCard } from '@/components/products/ProductCard';
import { ClusterAuthorBox } from './ClusterAuthorBox';
import { RelatedClusterArticles } from './RelatedClusterArticles';

interface ContentBlock { heading: string; body: string; }
interface FAQItem { question: string; answer: string; }
interface RelatedArticle { slug: string; title: string; desc: string; }

export interface SubIntentPageProps {
  canonical: string;
  title: string;
  metaDesc: string;
  h1: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  trustBadges: string[];
  breadcrumbs: { label: string; href?: string }[];
  contentBlocks: ContentBlock[];
  productQuery: string; // ilike query for products
  faq: FAQItem[];
  relatedArticles: RelatedArticle[];
  crossLinks: { label: string; href: string }[];
  pillarLink: { label: string; href: string };
}

export function SubIntentPage(props: SubIntentPageProps) {
  const { data: products } = useQuery<any[]>({
    queryKey: ['sub-intent-products', props.canonical],
    queryFn: async () => {
      const { data } = await supabase
        .from('products' as any)
        .select('id,name,slug,price,compare_at_price,images,rating,review_count,status,category')
        .or(props.productQuery)
        .eq('status', 'active')
        .order('review_count', { ascending: false })
        .limit(4);
      return (data as any[]) || [];
    },
  });

  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: props.faq.map(f => ({
      '@type': 'Question', name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: props.breadcrumbs.map((b, i) => ({
      '@type': 'ListItem', position: i + 1, name: b.label,
      ...(b.href ? { item: `https://getpawsy.pet${b.href}` } : {}),
    })),
  };

  return (
    <Layout>
      <Helmet>
        <title>{props.title}</title>
        <meta name="description" content={props.metaDesc} />
        {/* canonical managed by HostnameGuard — do not duplicate */}
        <meta property="og:title" content={props.title} />
        <meta property="og:description" content={props.metaDesc} />
        <meta property="og:url" content={props.canonical} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          {props.breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {b.href ? (
                <Link to={b.href} className="hover:text-foreground">{b.label}</Link>
              ) : (
                <span className="text-foreground font-medium">{b.label}</span>
              )}
            </span>
          ))}
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-3">{props.h1}</h1>
          <p className="text-lg text-muted-foreground max-w-3xl mb-5">{props.subtitle}</p>
          <Link to={props.ctaLink}>
            <Button size="lg" className="gap-2">{props.ctaText} <ArrowRight className="w-4 h-4" /></Button>
          </Link>
          <div className="flex flex-wrap gap-4 text-sm mt-4">
            {props.trustBadges.map(b => (
              <span key={b} className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-primary" /> {b}</span>
            ))}
          </div>
        </section>

        {/* Content Blocks */}
        {props.contentBlocks.map((block, i) => (
          <section key={i} className="mb-10">
            <h2 className="text-xl md:text-2xl font-display font-bold mb-3">{block.heading}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-w-3xl">{block.body}</div>
          </section>
        ))}

        {/* Back-to-pillar */}
        <div className="mb-10 bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm">
          <span className="text-muted-foreground">Part of our </span>
          <Link to={props.pillarLink.href} className="text-primary font-semibold hover:underline">{props.pillarLink.label}</Link>
          <span className="text-muted-foreground"> authority hub.</span>
        </div>

        {/* Products */}
        {products && products.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-display font-bold mb-4">Top Picks</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-bold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {props.faq.map(f => (
              <details key={f.question} className="group bg-card border rounded-xl">
                <summary className="cursor-pointer p-4 font-medium text-sm flex items-center justify-between">
                  {f.question}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{f.answer}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Author */}
        <section className="mb-12">
          <ClusterAuthorBox />
        </section>

        {/* Related Articles */}
        <RelatedClusterArticles
          articles={props.relatedArticles}
          crossLinks={props.crossLinks}
        />
      </div>
    </Layout>
  );
}
