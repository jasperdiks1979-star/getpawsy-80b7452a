/**
 * SeoTrafficPage — Top-3 ranking level money page template.
 * Expanded: trust badges, pros/cons, enhanced comparison table, budget picks,
 * common mistakes, cross-links, "Updated for 2026" signals.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, Truck, Shield, Star, ArrowRight, ShoppingCart, Clock,
  ThumbsUp, ThumbsDown, BadgeCheck, CalendarCheck, Award, List,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { SITE_URL } from '@/lib/constants';

const ProductCard = lazy(() =>
  import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard }))
);

// ── Types ──

export interface ComparisonProduct {
  rank: number;
  name: string;
  bestFor: string;
  highlights: string[];
  pros: string[];
  cons: string[];
  priceRange: string;
  rating: number;
  productSlug?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ContentSection {
  heading: string;
  body: string;
  listItems?: string[];
}

export interface InternalLink {
  text: string;
  href: string;
}

export interface CrossLink {
  title: string;
  description: string;
  href: string;
}

export interface SeoTrafficPageProps {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  subtitle: string;
  introText: string;
  comparisonProducts: ComparisonProduct[];
  benefits: ContentSection[];
  buyingGuide: ContentSection[];
  commonMistakes: ContentSection;
  budgetPicks: ContentSection;
  faq: FAQItem[];
  productCategories: string[];
  internalLinks: InternalLink[];
  crossLinks: CrossLink[];
  species: 'cat' | 'dog';
  breadcrumbs: { label: string; href?: string }[];
  lastUpdated?: string;
}

export default function SeoTrafficPage(props: SeoTrafficPageProps) {
  const canonical = `${SITE_URL}/${props.slug}`;
  const lastUpdated = props.lastUpdated || '2026-03-18';

  const { data: products } = useQuery({
    queryKey: ['seo-traffic-products', props.slug],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', props.productCategories)
        .order('price', { ascending: false })
        .limit(8);
      return (data || []).map(p => safeProduct(p)).filter((p): p is SafeProduct => p !== null);
    },
    staleTime: 10 * 60 * 1000,
  });

  // JSON-LD
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: props.faq.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: props.h1,
    description: props.metaDescription,
    url: canonical,
    datePublished: '2026-01-15T08:00:00Z',
    dateModified: `${lastUpdated}T08:00:00Z`,
    author: { '@type': 'Organization', name: 'GetPawsy' },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: props.breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.label,
      ...(b.href ? { item: `${SITE_URL}${b.href}` } : {}),
    })),
  };

  return (
    <Layout>
      <Helmet>
        <title>{props.title}</title>
        <meta name="description" content={props.metaDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={props.title} />
        <meta property="og:description" content={props.metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap" aria-label="Breadcrumb">
          {props.breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {b.href ? (
                <Link to={b.href} className="hover:text-foreground transition-colors">{b.label}</Link>
              ) : (
                <span className="text-foreground font-medium">{b.label}</span>
              )}
            </span>
          ))}
        </nav>

        {/* ── Hero ── */}
        <section className="mb-12">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold leading-tight mb-4 text-foreground">
            {props.h1}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mb-5">
            {props.subtitle}
          </p>

          {/* Authority Badges */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <BadgeCheck className="w-3.5 h-3.5" /> Tested & Reviewed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CalendarCheck className="w-3.5 h-3.5" /> Updated {lastUpdated}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Award className="w-3.5 h-3.5" /> Expert Picks
            </span>
          </div>

          {/* Trust Strip */}
          <div className="flex flex-wrap gap-4 text-sm mb-6">
            <span className="flex items-center gap-1.5 text-primary">
              <Truck className="w-4 h-4" /> Free shipping over $35
            </span>
            <span className="flex items-center gap-1.5 text-primary">
              <Shield className="w-4 h-4" /> 30-day money-back guarantee
            </span>
            <span className="flex items-center gap-1.5 text-primary">
              <CheckCircle className="w-4 h-4" /> Expert-reviewed picks
            </span>
            <span className="flex items-center gap-1.5 text-primary">
              <Clock className="w-4 h-4" /> Ships in 3–7 business days
            </span>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-sm text-muted-foreground leading-relaxed">
            {props.introText}
          </div>
        </section>

        {/* ── Comparison Table ── */}
        <section className="mb-14">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6 text-foreground">
            Top {props.comparisonProducts.length} Picks Compared
          </h2>

          <div className="overflow-x-auto mb-8 rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th className="text-left p-3 font-semibold text-foreground">Rank</th>
                  <th className="text-left p-3 font-semibold text-foreground">Product</th>
                  <th className="text-left p-3 font-semibold text-foreground">Rating</th>
                  <th className="text-left p-3 font-semibold text-foreground">Best For</th>
                  <th className="text-left p-3 font-semibold text-foreground">Price</th>
                  <th className="text-left p-3 font-semibold text-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {props.comparisonProducts.map(p => (
                  <tr key={p.rank} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-bold text-primary">#{p.rank}</td>
                    <td className="p-3 font-medium text-foreground">
                      {p.productSlug ? (
                        <Link to={`/product/${p.productSlug}`} className="hover:text-primary transition-colors">{p.name}</Link>
                      ) : p.name}
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {p.rating}/5
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.bestFor}</td>
                    <td className="p-3 font-medium text-foreground whitespace-nowrap">{p.priceRange}</td>
                    <td className="p-3">
                      {p.productSlug ? (
                        <Link to={`/product/${p.productSlug}`}>
                          <Button size="sm" variant="outline" className="gap-1 text-xs">
                            <ShoppingCart className="w-3 h-3" /> Shop Now
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Coming soon</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detailed cards with Pros/Cons */}
          <div className="space-y-6">
            {props.comparisonProducts.map(p => (
              <div key={p.rank} className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-lg font-display font-bold text-foreground">
                      #{p.rank}. {p.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">Best for: {p.bestFor}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-lg font-bold text-primary block">{p.priceRange}</span>
                    <span className="flex items-center gap-1 text-xs text-amber-500 justify-end">
                      <Star className="w-3 h-3 fill-amber-400" /> {p.rating}/5
                    </span>
                  </div>
                </div>

                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mb-4">
                  {p.highlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>

                {/* Pros / Cons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
                      <ThumbsUp className="w-3.5 h-3.5" /> Pros
                    </p>
                    <ul className="text-xs text-foreground/80 space-y-1">
                      {p.pros.map((pro, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" /> {pro}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-2">
                      <ThumbsDown className="w-3.5 h-3.5" /> Cons
                    </p>
                    <ul className="text-xs text-foreground/80 space-y-1">
                      {p.cons.map((con, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="w-3 h-3 mt-0.5 flex-shrink-0 text-center text-destructive">−</span> {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {p.productSlug && (
                  <Link to={`/product/${p.productSlug}`}>
                    <Button size="sm" className="gap-2">
                      <ShoppingCart className="w-4 h-4" /> View Product
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Benefits & Use Cases ── */}
        <section className="mb-14">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6 text-foreground">
            Benefits & Use Cases
          </h2>
          {props.benefits.map((section, i) => (
            <div key={i} className="mb-8">
              <h3 className="text-xl font-display font-bold mb-3 text-foreground">{section.heading}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{section.body}</p>
              {section.listItems && (
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {section.listItems.map((item, j) => <li key={j}>{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </section>

        {/* ── Budget Picks ── */}
        <section className="mb-14 bg-muted/30 border border-border rounded-xl p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4 text-foreground">
            {props.budgetPicks.heading}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{props.budgetPicks.body}</p>
          {props.budgetPicks.listItems && (
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {props.budgetPicks.listItems.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          )}
        </section>

        {/* ── Buying Guide ── */}
        <section className="mb-14">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6 text-foreground">
            How to Choose the Best Option
          </h2>
          {props.buyingGuide.map((section, i) => (
            <div key={i} className="mb-8">
              <h3 className="text-xl font-display font-bold mb-3 text-foreground">{section.heading}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{section.body}</p>
              {section.listItems && (
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {section.listItems.map((item, j) => <li key={j}>{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </section>

        {/* ── Common Mistakes ── */}
        <section className="mb-14 bg-destructive/5 border border-destructive/20 rounded-xl p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4 text-foreground">
            {props.commonMistakes.heading}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{props.commonMistakes.body}</p>
          {props.commonMistakes.listItems && (
            <ul className="space-y-2 text-sm text-muted-foreground">
              {props.commonMistakes.listItems.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="text-destructive font-bold mt-0.5">✗</span> {item}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── CTA Banner ── */}
        <section className="mb-14 bg-primary/10 border border-primary/30 rounded-xl p-8 text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold mb-3 text-foreground">
            Ready to Shop?
          </h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
            Browse our hand-picked selection with free shipping on orders over $35 and a 30-day money-back guarantee.
          </p>
          <Link to={`/collections/${props.productCategories[0] || (props.species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
            <Button size="lg" className="gap-2">
              Shop Now <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </section>

        {/* ── Real Products Grid ── */}
        {products && products.length > 0 && (
          <section className="mb-14">
            <h2 className="text-2xl font-display font-bold mb-6 text-foreground">Shop Our Top Picks</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Suspense fallback={null}>
                {products.map(product => (
                  <ProductCard key={product.id} product={product as any} />
                ))}
              </Suspense>
            </div>
          </section>
        )}

        {/* ── FAQ Section ── */}
        <section className="mb-14">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6 text-foreground">
            Frequently Asked Questions
          </h2>
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

        {/* ── Cross-Links to Other Money Pages ── */}
        {props.crossLinks.length > 0 && (
          <section className="mb-14">
            <h2 className="text-xl font-display font-bold mb-4 text-foreground">You May Also Like</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {props.crossLinks.map(cl => (
                <Link
                  key={cl.href}
                  to={cl.href}
                  className="group rounded-xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <h3 className="font-display font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-1">
                    {cl.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{cl.description}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Read guide <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Internal Links ── */}
        <section className="mb-14">
          <h2 className="text-xl font-display font-bold mb-4 text-foreground">Related Guides & Collections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {props.internalLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="group flex items-center gap-2 rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <span className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm">
                  {link.text} →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Trust Footer ── */}
        <section className="bg-muted/50 border border-border rounded-xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          <div>
            <Truck className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="font-semibold text-foreground">Free Shipping</p>
            <p className="text-muted-foreground text-xs">Orders over $35</p>
          </div>
          <div>
            <Shield className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="font-semibold text-foreground">30-Day Returns</p>
            <p className="text-muted-foreground text-xs">No hassle guarantee</p>
          </div>
          <div>
            <CheckCircle className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="font-semibold text-foreground">Expert Reviewed</p>
            <p className="text-muted-foreground text-xs">Trusted recommendations</p>
          </div>
          <div>
            <Clock className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="font-semibold text-foreground">Fast Delivery</p>
            <p className="text-muted-foreground text-xs">3–7 business days</p>
          </div>
        </section>
      </div>
    </Layout>
  );
}
