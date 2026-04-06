/**
 * SeoClusterPage — Lightweight long-tail keyword cluster page.
 * Targets specific keyword variations and links back to the parent money page.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { ArrowRight, BadgeCheck, CalendarCheck, Star, ShoppingCart, CheckCircle, Award } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

interface ClusterPick {
  name: string;
  bestFor: string;
  rating: number;
  priceRange: string;
  productSlug?: string;
}

interface ClusterFAQ {
  question: string;
  answer: string;
}

export interface SeoClusterPageProps {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  subtitle: string;
  introText: string;
  picks: ClusterPick[];
  faq: ClusterFAQ[];
  parentPage: { title: string; href: string };
  relatedPages: { title: string; href: string }[];
  verdict: string;
  lastUpdated?: string;
}

export default function SeoClusterPage(props: SeoClusterPageProps) {
  const canonical = `${SITE_URL}/${props.slug}`;
  const lastUpdated = props.lastUpdated || '2026-03-18';

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: props.faq.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  return (
    <Layout>
      <Helmet>
        <title>{props.title}</title>
        <meta name="description" content={props.metaDescription} /><script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <Link to={props.parentPage.href} className="hover:text-foreground transition-colors">{props.parentPage.title}</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{props.h1}</span>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <h1 className="text-2xl md:text-4xl font-display font-bold leading-tight mb-3 text-foreground">
            {props.h1}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-3xl mb-4">{props.subtitle}</p>
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <BadgeCheck className="w-3.5 h-3.5" /> Expert Reviewed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CalendarCheck className="w-3.5 h-3.5" /> Updated {lastUpdated}
            </span>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-sm text-muted-foreground leading-relaxed">
            {props.introText}
          </div>
        </section>

        {/* Top Picks */}
        <section className="mb-12">
          <h2 className="text-xl md:text-2xl font-display font-bold mb-5 text-foreground">Our Top Picks</h2>
          <div className="space-y-4">
            {props.picks.map((pick, i) => (
              <div key={i} className="flex items-center gap-4 bg-card border border-border rounded-xl p-5">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{pick.name}</p>
                  <p className="text-xs text-muted-foreground">Best for: {pick.bestFor}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {pick.rating}/5</span>
                    <span className="text-xs font-medium text-foreground">{pick.priceRange}</span>
                  </div>
                </div>
                {pick.productSlug && (
                  <Link to={`/product/${pick.productSlug}`}>
                    <Button size="sm" className="gap-1 text-xs"><ShoppingCart className="w-3 h-3" /> Shop</Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Expert Verdict */}
        <section className="mb-12 bg-primary/5 border-2 border-primary/20 rounded-2xl p-6">
          <h2 className="text-xl font-display font-bold mb-3 text-foreground flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" /> Expert Verdict
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{props.verdict}</p>
        </section>

        {/* CTA to parent page */}
        <div className="mb-12 bg-primary/10 border border-primary/30 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold mb-2 text-foreground">Want the Complete Comparison?</h3>
          <p className="text-sm text-muted-foreground mb-4">Read our full expert guide with detailed pros, cons, and comparison tables.</p>
          <Link to={props.parentPage.href}>
            <Button className="gap-2">Read Full Guide <ArrowRight className="w-4 h-4" /></Button>
          </Link>
        </div>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-bold mb-5 text-foreground">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {props.faq.map(f => (
              <details key={f.question} className="group bg-card border border-border rounded-xl">
                <summary className="cursor-pointer p-4 font-medium text-sm flex items-center justify-between text-foreground">
                  {f.question}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{f.answer}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Related Pages */}
        <section className="mb-12">
          <h2 className="text-lg font-display font-bold mb-4 text-foreground">Related Expert Guides</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {props.relatedPages.map(p => (
              <Link key={p.href} to={p.href} className="group rounded-xl border border-border/50 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{p.title} →</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
