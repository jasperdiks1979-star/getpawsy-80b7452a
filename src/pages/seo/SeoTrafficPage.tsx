/**
 * SeoTrafficPage — Maximum-conversion money page template.
 * Badges, CTAs every 2-3 sections, enhanced quick picks, trust strips.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, Truck, Shield, Star, ArrowRight, ShoppingCart, Clock,
  ThumbsUp, ThumbsDown, BadgeCheck, CalendarCheck, Award, List, Heart,
  ExternalLink, Zap,
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
  badge?: string;          // e.g. "Best Overall", "Best Budget", "Editor's Pick"
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

export interface RelatedGuideLink {
  title: string;
  description: string;
  href: string;
  badge?: string;
}

export interface LockdownSection {
  heading: string;
  body: string;
  listItems?: string[];
}

export interface QuickPick {
  name: string;
  bestFor: string;
  productSlug?: string;
  badge?: string;         // e.g. "#1 Best Overall", "Best Budget", "Most Popular"
  cta?: string;           // e.g. "Check Price", "View Deal"
}

export interface CustomerQuote {
  text: string;
  name: string;
  context?: string; // e.g. "Multi-cat owner, Texas"
}

export interface BestOverallPick {
  name: string;
  benefits: string[];
  productSlug?: string;
  badge?: string;
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
  relatedGuides?: RelatedGuideLink[];
  species: 'cat' | 'dog';
  breadcrumbs: { label: string; href?: string }[];
  lastUpdated?: string;
  quickAnswer?: { picks: QuickPick[] };
  whoShouldNotBuy?: LockdownSection;
  bestAlternatives?: LockdownSection;
  expertVerdict?: LockdownSection;
  ctrHook?: string;
  bestOverallPick?: BestOverallPick;
  customerQuotes?: CustomerQuote[];
}

// ── Badge color helper ──
function badgeClasses(badge: string): string {
  const b = badge.toLowerCase();
  if (b.includes('best overall') || b.includes('#1'))
    return 'bg-primary text-primary-foreground';
  if (b.includes('budget'))
    return 'bg-accent text-accent-foreground';
  if (b.includes('editor'))
    return 'bg-secondary text-secondary-foreground';
  if (b.includes('popular') || b.includes('trending'))
    return 'bg-primary/10 text-primary border border-primary/30';
  return 'bg-muted text-foreground';
}

// ── Inline CTA block (used between sections) ──
function MidCTA({ slug, categories, species }: { slug: string; categories: string[]; species: string }) {
  return (
    <div className="mb-14 bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8 text-center">
      <h3 className="text-lg md:text-xl font-semibold mb-2 text-foreground">Found Your Perfect Pick?</h3>
      <p className="text-muted-foreground text-sm mb-4 max-w-xl mx-auto">
        Browse our expert-tested selection with free shipping on orders over $35 and a 30-day return policy.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link to={`/collections/${categories[0] || (species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
          <Button className="gap-2"><ShoppingCart className="w-4 h-4" /> Shop Now <ArrowRight className="w-4 h-4" /></Button>
        </Link>
        <a href="#comparison">
          <Button variant="outline" className="gap-2"><Star className="w-4 h-4" /> View Best Pick</Button>
        </a>
      </div>
    </div>
  );
}

// ── Mini trust strip ──
function TrustStrip() {
  return (
    <div className="flex flex-wrap gap-4 text-sm mb-6">
      <span className="flex items-center gap-1.5 text-primary">
        <Truck className="w-4 h-4" /> Free shipping over $35
      </span>
      <span className="flex items-center gap-1.5 text-primary">
        <Shield className="w-4 h-4" /> 30-day return policy
      </span>
      <span className="flex items-center gap-1.5 text-primary">
        <CheckCircle className="w-4 h-4" /> Expert-reviewed picks
      </span>
      <span className="flex items-center gap-1.5 text-primary">
        <Heart className="w-4 h-4" /> Trusted by US pet owners
      </span>
    </div>
  );
}

// ── Customer quote strip ──
function QuoteStrip({ quotes }: { quotes: CustomerQuote[] }) {
  if (!quotes || quotes.length === 0) return null;
  return (
    <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {quotes.slice(0, 3).map((q, i) => (
        <blockquote key={i} className="bg-card border border-border/50 rounded-xl p-4">
          <div className="flex gap-0.5 mb-2">
            {[...Array(5)].map((_, j) => (
              <Star key={j} className="w-3 h-3 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <p className="text-sm text-muted-foreground italic leading-relaxed mb-2">"{q.text}"</p>
          <footer className="text-xs font-medium text-foreground">
            — {q.name}{q.context && <span className="text-muted-foreground font-normal">, {q.context}</span>}
          </footer>
        </blockquote>
      ))}
    </div>
  );
}

// ── Best Overall Pick hero ──
function BestOverallHero({ pick, products, categories, species }: { pick: BestOverallPick; products?: SafeProduct[]; categories: string[]; species: string }) {
  const matchedProduct = products?.find(p =>
    pick.productSlug && p.slug === pick.productSlug
  );

  return (
    <section className="mb-10 bg-primary/5 border-2 border-primary/30 rounded-2xl p-6 md:p-8 scroll-mt-16">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🏆</span>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">Best Overall Pick</h2>
        {pick.badge && (
          <span className="text-[11px] font-bold bg-primary text-primary-foreground px-3 py-0.5 rounded-full">
            {pick.badge}
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Product image */}
        {matchedProduct?.image_url && (
          <div className="w-full md:w-48 flex-shrink-0">
            <img
              src={matchedProduct.image_url}
              alt={pick.name}
              className="w-full rounded-xl border border-border object-cover aspect-square"
              loading="lazy"
            />
          </div>
        )}

        <div className="flex-1">
          <h3 className="text-lg font-display font-bold text-foreground mb-3">{pick.name}</h3>

          {/* Benefits */}
          <ul className="space-y-2 mb-5">
            {pick.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="flex flex-wrap gap-3 items-center">
            {pick.productSlug ? (
              <Link to={`/product/${pick.productSlug}`}>
                <Button className="gap-2 bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white">
                  <ShoppingCart className="w-4 h-4" /> Buy Now — Free Shipping
                </Button>
              </Link>
            ) : (
              <Link to={`/collections/${categories[0] || (species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
                <Button className="gap-2">
                  <ShoppingCart className="w-4 h-4" /> Shop Now
                </Button>
              </Link>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" /> 30-day return policy
            </span>
          </div>

          {/* Price if available */}
          {matchedProduct && (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold text-primary">${Number(matchedProduct.price).toFixed(2)}</span>
              {matchedProduct.compare_at_price && Number(matchedProduct.compare_at_price) > Number(matchedProduct.price) && (
                <span className="text-sm text-muted-foreground line-through">${Number(matchedProduct.compare_at_price).toFixed(2)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function SeoTrafficPage(props: SeoTrafficPageProps) {
  const canonical = `${SITE_URL}/${props.slug}`;
  const lastUpdated = props.lastUpdated || '2026-03-18';

  // ── Jump Nav sections ──
  const jumpNavItems = [
    { id: 'quick-answer', label: 'Top 3 Picks' },
    { id: 'comparison', label: 'Comparison' },
    { id: 'benefits', label: 'Benefits' },
    { id: 'budget', label: 'Budget Picks' },
    { id: 'buying-guide', label: 'Buying Guide' },
    { id: 'mistakes', label: 'Common Mistakes' },
    { id: 'who-should-not', label: 'Who Should NOT Buy' },
    { id: 'alternatives', label: 'Alternatives' },
    { id: 'verdict', label: 'Expert Verdict' },
    { id: 'products', label: 'Shop Products' },
    { id: 'faq', label: 'FAQ' },
    { id: 'related-guides', label: 'Related Guides' },
  ].filter(item => {
    if (item.id === 'quick-answer') return !!props.quickAnswer;
    if (item.id === 'who-should-not') return !!props.whoShouldNotBuy;
    if (item.id === 'alternatives') return !!props.bestAlternatives;
    if (item.id === 'verdict') return !!props.expertVerdict;
    return true;
  });

  const [activeSection, setActiveSection] = useState('');
  const [showJumpNav, setShowJumpNav] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowJumpNav(window.scrollY > 350);
      let current = '';
      for (const item of jumpNavItems) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 120) current = item.id;
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
        <meta name="description" content={props.metaDescription} /><meta property="og:title" content={props.title} />
        <meta property="og:description" content={props.metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      {/* ── Sticky Jump Nav ── */}
      {showJumpNav && (
        <nav className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b shadow-sm" aria-label="Page sections">
          <div className="container overflow-x-auto">
            <div className="flex gap-1 py-2">
              {jumpNavItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    activeSection === item.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </nav>
      )}

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
        <section className="mb-10">
          {/* CTR Hook — above the fold credibility trigger */}
          {props.ctrHook && (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-medium text-primary">
              <Zap className="w-4 h-4" />
              {props.ctrHook}
            </div>
          )}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold leading-tight mb-4 text-foreground">
            {props.h1}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mb-5">
            {props.subtitle}
          </p>

          {/* Authority Badges */}
          <div className="flex flex-wrap gap-2 mb-5">
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
          <TrustStrip />

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-sm text-muted-foreground leading-relaxed">
            {props.introText}
          </div>

          {/* Post-intro CTA */}
          <div className="flex flex-wrap gap-3 mt-5">
            <Link to={`/collections/${props.productCategories[0] || (props.species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
              <Button className="gap-2"><ShoppingCart className="w-4 h-4" /> Shop Top Picks</Button>
            </Link>
            <a href="#comparison">
              <Button variant="outline" className="gap-2"><Star className="w-4 h-4" /> See Full Comparison</Button>
            </a>
          </div>
        </section>

        {/* ── 🏆 Best Overall Pick Hero ── */}
        {props.bestOverallPick && (
          <BestOverallHero
            pick={props.bestOverallPick}
            products={products ?? undefined}
            categories={props.productCategories}
            species={props.species}
          />
        )}

        {/* ── Customer Quotes ── */}
        {props.customerQuotes && <QuoteStrip quotes={props.customerQuotes} />}

        {/* ── Quick Answer — Top 3 Picks (Conversion-Optimized) ── */}
        {props.quickAnswer && (
          <section id="quick-answer" className="mb-10 scroll-mt-16">
            <div className="bg-primary/5 border-2 border-primary/30 rounded-2xl p-6 md:p-8">
              <h2 className="text-xl md:text-2xl font-display font-bold mb-1 text-foreground flex items-center gap-2">
                🏆 Top 3 Picks (Quick Answer)
              </h2>
              <p className="text-sm text-muted-foreground mb-5">In a rush? Here are our top recommendations at a glance.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {props.quickAnswer.picks.map((pick, i) => (
                  <div key={i} className="relative bg-background rounded-xl border-2 border-border hover:border-primary/40 transition-all p-5 flex flex-col">
                    {/* Badge */}
                    {pick.badge && (
                      <span className={`absolute -top-3 left-4 text-[11px] font-bold px-3 py-0.5 rounded-full ${badgeClasses(pick.badge)}`}>
                        {pick.badge}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-2 mt-1">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                        #{i + 1}
                      </span>
                      <p className="font-semibold text-sm text-foreground leading-tight">{pick.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 flex-1">{pick.bestFor}</p>
                    {pick.productSlug ? (
                      <Link to={`/product/${pick.productSlug}`}>
                        <Button size="sm" className="w-full gap-1.5 text-xs">
                          <ExternalLink className="w-3 h-3" /> {pick.cta || 'Check Price'}
                        </Button>
                      </Link>
                    ) : (
                      <a href="#comparison">
                        <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                          <ArrowRight className="w-3 h-3" /> {pick.cta || 'View Details'}
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Quick Summary ToC ── */}
        <nav className="mb-10 border rounded-xl bg-card p-5 max-w-md" aria-label="Table of contents">
          <div className="flex items-center gap-2 mb-3">
            <List className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">In This Guide</span>
          </div>
          <ol className="space-y-1.5">
            {jumpNavItems.map((item, i) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span className="text-xs text-primary/60 font-mono w-4">{i + 1}.</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Comparison Table ── */}
        <section id="comparison" className="mb-14 scroll-mt-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6 text-foreground">
            Top {props.comparisonProducts.length} Picks Compared
          </h2>

          {/* Desktop table */}
          <div className="overflow-x-auto mb-8 rounded-xl border border-border hidden md:block">
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
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.badge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${badgeClasses(p.badge)}`}>
                            {p.badge}
                          </span>
                        )}
                        <span className="font-medium text-foreground">
                          {p.productSlug ? (
                            <Link to={`/product/${p.productSlug}`} className="hover:text-primary transition-colors">{p.name}</Link>
                          ) : p.name}
                        </span>
                      </div>
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
                          <Button size="sm" className="gap-1 text-xs">
                            <ShoppingCart className="w-3 h-3" /> Check Price
                          </Button>
                        </Link>
                      ) : (
                        <a href={`#product-${p.rank}`}>
                          <Button size="sm" variant="outline" className="gap-1 text-xs">
                            See Details
                          </Button>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards for comparison */}
          <div className="md:hidden space-y-3 mb-8">
            {props.comparisonProducts.map(p => (
              <div key={p.rank} className="relative bg-card border border-border rounded-xl p-4">
                {p.badge && (
                  <span className={`absolute -top-2.5 left-3 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${badgeClasses(p.badge)}`}>
                    {p.badge}
                  </span>
                )}
                <div className="flex items-start justify-between gap-3 mt-1">
                  <div>
                    <p className="font-bold text-sm text-foreground">#{p.rank}. {p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.bestFor}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-primary block">{p.priceRange}</span>
                    <span className="flex items-center gap-0.5 text-xs text-amber-500 justify-end">
                      <Star className="w-3 h-3 fill-amber-400" /> {p.rating}
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  {p.productSlug ? (
                    <Link to={`/product/${p.productSlug}`}>
                      <Button size="sm" className="w-full gap-1.5 text-xs">
                        <ShoppingCart className="w-3 h-3" /> Check Price
                      </Button>
                    </Link>
                  ) : (
                    <a href={`#product-${p.rank}`}>
                      <Button size="sm" variant="outline" className="w-full text-xs">See Details</Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed cards with Pros/Cons + Badges */}
          <div className="space-y-6">
            {props.comparisonProducts.map(p => (
              <div key={p.rank} id={`product-${p.rank}`} className="relative bg-card border border-border rounded-xl p-6 scroll-mt-16">
                {/* Badge ribbon */}
                {p.badge && (
                  <span className={`absolute -top-3 left-5 text-[11px] font-bold px-3 py-1 rounded-full shadow-sm ${badgeClasses(p.badge)}`}>
                    {p.badge}
                  </span>
                )}

                <div className="flex items-start justify-between gap-4 mb-3 mt-1">
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

                {/* Key highlights as bullet points */}
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

                {/* CTA for each product */}
                <div className="flex flex-wrap gap-3 items-center">
                  {p.productSlug ? (
                    <Link to={`/product/${p.productSlug}`}>
                      <Button size="sm" className="gap-2">
                        <ShoppingCart className="w-4 h-4" /> Check Price
                      </Button>
                    </Link>
                  ) : (
                    <a href={`/collections/${props.productCategories[0] || (props.species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
                      <Button size="sm" variant="outline" className="gap-2">
                        <ShoppingCart className="w-4 h-4" /> Shop Similar
                      </Button>
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Truck className="w-3 h-3" /> Free shipping over $35
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA after comparison ── */}
        <MidCTA slug={props.slug} categories={props.productCategories} species={props.species} />

        {/* ── Benefits & Use Cases ── */}
        <section id="benefits" className="mb-14 scroll-mt-16">
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
        <section id="budget" className="mb-14 bg-muted/30 border border-border rounded-xl p-6 md:p-8 scroll-mt-16">
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

        {/* ── CTA after budget ── */}
        <div className="mb-14 flex flex-col sm:flex-row items-center gap-4 bg-primary/5 border border-primary/20 rounded-xl p-5">
          <div className="flex-1">
            <p className="font-semibold text-foreground text-sm">💡 Want to see all options side by side?</p>
            <p className="text-xs text-muted-foreground">Jump to our full comparison table above.</p>
          </div>
          <div className="flex gap-2">
            <a href="#comparison">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs"><Star className="w-3 h-3" /> View Comparison</Button>
            </a>
            <a href="#faq">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs">See Reviews →</Button>
            </a>
          </div>
        </div>

        {/* ── Buying Guide ── */}
        <section id="buying-guide" className="mb-14 scroll-mt-16">
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
        <section id="mistakes" className="mb-14 bg-destructive/5 border border-destructive/20 rounded-xl p-6 md:p-8 scroll-mt-16">
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

        {/* ── CTA after mistakes ── */}
        <MidCTA slug={props.slug} categories={props.productCategories} species={props.species} />

        {/* ── Who Should NOT Buy ── */}
        {props.whoShouldNotBuy && (
          <section id="who-should-not" className="mb-14 bg-muted/40 border border-border rounded-xl p-6 md:p-8 scroll-mt-16">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4 text-foreground">
              {props.whoShouldNotBuy.heading}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{props.whoShouldNotBuy.body}</p>
            {props.whoShouldNotBuy.listItems && (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {props.whoShouldNotBuy.listItems.map((item, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">→</span> {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Best Alternatives ── */}
        {props.bestAlternatives && (
          <section id="alternatives" className="mb-14 border border-border rounded-xl p-6 md:p-8 scroll-mt-16">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4 text-foreground">
              {props.bestAlternatives.heading}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{props.bestAlternatives.body}</p>
            {props.bestAlternatives.listItems && (
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {props.bestAlternatives.listItems.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            )}
          </section>
        )}

        {/* ── Expert Verdict ── */}
        {props.expertVerdict && (
          <section id="verdict" className="mb-14 bg-primary/5 border-2 border-primary/20 rounded-2xl p-6 md:p-8 scroll-mt-16">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4 text-foreground flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" /> {props.expertVerdict.heading}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{props.expertVerdict.body}</p>
            {props.expertVerdict.listItems && (
              <ul className="space-y-2 text-sm text-foreground/80">
                {props.expertVerdict.listItems.map((item, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            )}
            {/* CTA after verdict */}
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="#quick-answer">
                <Button size="sm" className="gap-1.5"><Zap className="w-3.5 h-3.5" /> View Best Pick</Button>
              </a>
              <Link to={`/collections/${props.productCategories[0] || (props.species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
                <Button size="sm" variant="outline" className="gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Shop All</Button>
              </Link>
            </div>
          </section>
        )}

        {/* ── CTA Banner ── */}
        <section className="mb-14 bg-primary/10 border border-primary/30 rounded-xl p-8 text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold mb-3 text-foreground">
            Ready to Shop?
          </h2>
          <p className="text-muted-foreground mb-3 max-w-xl mx-auto">
            Browse our hand-picked selection with free shipping on orders over $35 and a 30-day return policy.
          </p>
          {/* Inline trust signals */}
          <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground mb-5">
            <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> Free Shipping $35+</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> 30-Day Return Policy</span>
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Secure Checkout</span>
          </div>
          <Link to={`/collections/${props.productCategories[0] || (props.species === 'cat' ? 'cat-supplies' : 'dog-supplies')}`}>
            <Button size="lg" className="gap-2">
              Shop Now <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </section>

        {/* ── Real Products Grid ── */}
        {products && products.length > 0 && (
          <section id="products" className="mb-14 scroll-mt-16">
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
        <section id="faq" className="mb-14 scroll-mt-16">
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

        {/* ── Related Expert Guides ── */}
        {props.relatedGuides && props.relatedGuides.length > 0 && (
          <section id="related-guides" className="mb-14 bg-muted/30 rounded-2xl p-6 md:p-10 scroll-mt-16">
            <h2 className="text-2xl font-display font-bold mb-1 text-foreground">Related Expert Guides</h2>
            <p className="text-muted-foreground text-sm mb-6">In-depth research and buying advice from our pet product team.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {props.relatedGuides.map(g => (
                <Link
                  key={g.href}
                  to={g.href}
                  className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  {g.badge && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5 mb-2">
                      {g.badge}
                    </span>
                  )}
                  <h3 className="font-semibold text-sm mb-1 text-foreground group-hover:text-primary transition-colors">{g.title}</h3>
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    Read expert guide <ArrowRight className="w-3 h-3" />
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
            <p className="text-muted-foreground text-xs">Easy return process</p>
          </div>
          <div>
            <CheckCircle className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="font-semibold text-foreground">Expert Reviewed</p>
            <p className="text-muted-foreground text-xs">Trusted recommendations</p>
          </div>
          <div>
            <Heart className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="font-semibold text-foreground">Pet Owners Love Us</p>
            <p className="text-muted-foreground text-xs">Trusted across the US</p>
          </div>
        </section>
      </div>
    </Layout>
  );
}
