import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Home, ChevronRight, ArrowRight, CheckCircle,
} from 'lucide-react';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { AuthorityAuthorBox } from '@/components/affiliate/AuthorityAuthorBox';
import { MedicalDisclaimer } from '@/components/affiliate/AffiliateDisclaimer';
import { getTrainingClusterBySlug } from '@/data/dog-training-cluster-data';

const BASE = 'https://getpawsy.pet';

export default function TrainingClusterArticle() {
  const location = useLocation();
  const slug = location.pathname.split('/').pop() || '';
  const data = getTrainingClusterBySlug(slug);

  // Fetch relevant products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['training-cluster-products', data?.productKeywords],
    queryFn: async () => {
      if (!data?.productKeywords?.length) return [];
      const { data: prods, error } = await supabase
        .from('products_public')
        .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .limit(200);
      if (error) return [];
      const kws = data.productKeywords;
      return (prods || [])
        .filter(p => {
          const n = p.name.toLowerCase();
          const c = (p.category || '').toLowerCase();
          if (c.includes('bird') || c.includes('cat toy') || c.includes('cat scratch')) return false;
          return kws.some(k => n.includes(k));
        })
        .sort((a, b) => ((b.stock ?? 0) > 0 ? 1 : 0) - ((a.stock ?? 0) > 0 ? 1 : 0))
        .slice(0, 8);
    },
    enabled: !!data,
  });

  if (!data) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
          <Link to="/collections/all" className="text-primary underline">← Back to Dog Training Hub</Link>
        </div>
      </Layout>
    );
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faq.map(f => ({
      '@type': 'Question', name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Dog Training', item: `${BASE}/dog/dog-training-behavior-tools` },
      { '@type': 'ListItem', position: 3, name: data.breadcrumbLabel, item: data.canonical },
    ],
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.title,
    description: data.metaDescription,
    url: data.canonical,
    author: { '@type': 'Organization', name: 'GetPawsy Pet Wellness Team', url: BASE },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: BASE },
    datePublished: '2026-02-23',
    dateModified: '2026-02-23',
  };

  return (
    <Layout>
      <Helmet>
        <title>{data.metaTitle}</title>
        <meta name="description" content={data.metaDescription} /><link rel="alternate" hrefLang="en" href={data.canonical} />
        <link rel="alternate" hrefLang="x-default" href={data.canonical} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content={data.metaTitle} />
        <meta property="og:description" content={data.metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={data.canonical} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      </Helmet>

      <div className="container max-w-4xl py-8 md:py-12">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/"><Home className="h-3.5 w-3.5" /></Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/collections/all">Dog Training</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{data.breadcrumbLabel}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Hero */}
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 leading-tight">{data.title}</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">{data.heroSubtitle}</p>
        </header>

        {/* Content Sections */}
        <div className="space-y-10">
          {data.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4">{section.heading}</h2>
              <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground">
                {section.content.split('\n\n').map((p, j) => (
                  <p key={j} className="mb-4 leading-relaxed whitespace-pre-line">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Comparison Table */}
        {data.comparison && (
          <section className="mt-12">
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6">{data.comparison.title}</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-medium text-foreground">Feature</th>
                    <th className="text-left p-3 font-medium text-primary">Option A</th>
                    <th className="text-left p-3 font-medium text-foreground">Option B</th>
                    <th className="text-left p-3 font-medium text-foreground">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparison.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-3 font-medium text-foreground">{row.feature}</td>
                      <td className="p-3 text-muted-foreground">{row.optionA}</td>
                      <td className="p-3 text-muted-foreground">{row.optionB}</td>
                      <td className="p-3 font-medium text-primary">{row.winner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Products Grid */}
        {products.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6">Recommended Products</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {products.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6">Frequently Asked Questions</h2>
          <Accordion type="multiple" className="space-y-2">
            {data.faq.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-lg px-4">
                <AccordionTrigger className="text-left text-sm font-medium">{f.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Related Links */}
        <section className="mt-12 p-6 bg-muted/30 rounded-xl border border-border">
          <h3 className="font-semibold text-foreground mb-4">Continue Reading</h3>
          <div className="flex flex-wrap gap-3">
            <Link to={data.parentHub.href} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ArrowRight className="w-3.5 h-3.5" /> {data.parentHub.label}
            </Link>
            {data.relatedLinks.map((l, i) => (
              <Link key={i} to={l.href} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <ArrowRight className="w-3.5 h-3.5" /> {l.label}
              </Link>
            ))}
          </div>
        </section>

        {/* Author & Disclaimer */}
        <div className="mt-10 space-y-6">
          <AuthorityAuthorBox />
          <MedicalDisclaimer />
        </div>
      </div>
    </Layout>
  );
}
