import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Clock, BookOpen, ChevronRight, ShoppingBag, CheckCircle, XCircle, AlertTriangle, RefreshCw, User } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuide, useGuidesList } from '@/hooks/useGuides';
import { Loader2 } from 'lucide-react';
import NotFound from './NotFound';
import { QuickRecommendation } from '@/components/guides/QuickRecommendation';
import { ComparisonTable } from '@/components/guides/ComparisonTable';
import { StickyCTA } from '@/components/guides/StickyCTA';
import { AUTHOR, getAuthorSchema, getPublisherSchema } from '@/lib/author-entity';

const BASE_URL = 'https://getpawsy.pet';

const GuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: guide, isLoading, error } = useGuide(slug);
  const { data: allGuides } = useGuidesList();

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (error || !guide) {
    return <NotFound />;
  }

  // Canonical WITHOUT trailing slash (canonical standard)
  const guideUrl = `${BASE_URL}/guides/${guide.slug}`;

  // Related guides: same category first, then other guides for cross-cluster linking
  const sameCategoryGuides = allGuides?.filter(
    (g) => g.slug !== guide.slug && g.category === guide.category
  ) || [];
  const otherGuides = allGuides?.filter(
    (g) => g.slug !== guide.slug && g.category !== guide.category
  ) || [];
  // Ensure minimum 4 related guides: fill from same category, then cross-cluster
  const relatedGuides = [...sameCategoryGuides, ...otherGuides].slice(0, 5);

  // Find cornerstone for this cluster (first guide with "best-" prefix in same category)
  const clusterCornerstone = sameCategoryGuides.find(g => g.slug.startsWith('best-'));
  // Ensure cornerstone is in related guides if it exists and isn't already there
  if (clusterCornerstone && !relatedGuides.find(g => g.slug === clusterCornerstone.slug)) {
    relatedGuides.unshift(clusterCornerstone);
  }

  // Article schema with Person author entity
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.excerpt,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    author: getAuthorSchema(),
    publisher: getPublisherSchema(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': guideUrl },
    keywords: guide.keywords.join(', '),
    articleSection: guide.category,
    inLanguage: 'en-US',
  };

  // FAQ schema
  const faqSchema = guide.faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  } : null;

  // Breadcrumb schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BASE_URL}/guides` },
      { '@type': 'ListItem', position: 3, name: guide.title, item: guideUrl },
    ],
  };

  // Product schema for comparison products
  const productSchemas = guide.comparisonProducts?.map((product) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.image,
    description: product.description || product.advantages.join('. '),
    brand: { '@type': 'Brand', name: 'GetPawsy' },
    ...(product.sku ? { sku: product.sku } : {}),
    offers: {
      '@type': 'Offer',
      price: parseFloat(product.price.replace(/[^0-9.]/g, '')),
      priceCurrency: 'USD',
      availability: `https://schema.org/${product.availability || 'InStock'}`,
      url: `${BASE_URL}${product.link}`,
      seller: { '@type': 'Organization', name: 'GetPawsy' },
    },
    review: {
      '@type': 'Review',
      author: { '@type': 'Organization', name: 'GetPawsy' },
      reviewRating: { '@type': 'Rating', ratingValue: '4.5', bestRating: '5' },
    },
  })) || [];

  // Render markdown-like content (bold, paragraphs, lists)
  const renderContent = (content: string) => {
    const paragraphs = content.split('\n\n');
    return paragraphs.map((para, i) => {
      const lines = para.split('\n');
      const isList = lines.every((l) => l.startsWith('- ') || l.startsWith('**') || l.trim() === '');

      if (isList && lines.some((l) => l.startsWith('- '))) {
        return (
          <ul key={i} className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
            {lines.filter((l) => l.startsWith('- ')).map((l, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(l.slice(2)) }} />
            ))}
          </ul>
        );
      }

      return (
        <p
          key={i}
          className="text-muted-foreground leading-relaxed mb-4"
          dangerouslySetInnerHTML={{ __html: formatInline(para.replace(/\n/g, '<br/>')) }}
        />
      );
    });
  };

  const formatInline = (text: string) => {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
  };

  // Updated year badge
  const updatedYear = guide.updatedAt ? new Date(guide.updatedAt).getFullYear() : new Date().getFullYear();

  return (
    <Layout>
      <Helmet>
        <title>{guide.title} | GetPawsy</title>
        <meta name="description" content={guide.excerpt} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <link rel="canonical" href={guideUrl} />
        <meta property="og:title" content={guide.title} />
        <meta property="og:description" content={guide.excerpt} />
        <meta property="og:url" content={guideUrl} />
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={guide.publishedAt} />
        <meta property="article:modified_time" content={guide.updatedAt} />
        <meta property="article:section" content={guide.category} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={guide.title} />
        <meta name="twitter:description" content={guide.excerpt} />
        {guide.featuredImage && <meta property="og:image" content={`${BASE_URL}${guide.featuredImage}`} />}
        {guide.featuredImage && <meta name="twitter:image" content={`${BASE_URL}${guide.featuredImage}`} />}
        {guide.keywords.map((kw, i) => (
          <meta key={i} property="article:tag" content={kw} />
        ))}
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        {faqSchema && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
        {productSchemas.length > 0 && productSchemas.map((schema, i) => (
          <script key={`product-${i}`} type="application/ld+json">{JSON.stringify(schema)}</script>
        ))}
      </Helmet>

      <article className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/guides" className="hover:text-foreground transition-colors">Guides</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium line-clamp-1">{guide.title}</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium">
              {guide.category}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {guide.readingTime} min read
            </span>
            <span className="flex items-center gap-1.5 bg-accent/60 text-accent-foreground px-2.5 py-0.5 rounded-full text-xs font-medium">
              <RefreshCw className="w-3 h-3" />
              Updated for {updatedYear}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
            {guide.title}
          </h1>
          <p className="text-lg text-muted-foreground mt-4">{guide.excerpt}</p>
          
          {/* Author Byline */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Written by </span>
              <Link to="/about-the-author" className="text-foreground font-medium hover:text-primary transition-colors">
                {AUTHOR.name}
              </Link>
              <span className="text-muted-foreground"> · {AUTHOR.shortBio}</span>
            </div>
          </div>
        </header>

        {/* Quick Answer Snippet */}
        {guide.quickAnswer && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-8">
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
              ✅ Quick Answer
            </h2>
            <p className="text-foreground leading-relaxed text-[15px]">{guide.quickAnswer}</p>
          </div>
        )}

        {/* Quick Recommendation Box */}
        {guide.quickRecommendation && (
          <QuickRecommendation data={guide.quickRecommendation} />
        )}


        {/* Table of Contents */}
        <nav className="bg-muted/50 rounded-xl p-6 mb-10 border border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
            In This Guide
          </h2>
          <ol className="space-y-2">
            {guide.sections.map((section, i) => (
              <li key={i}>
                <a
                  href={`#section-${i}`}
                  className="text-sm text-primary hover:underline flex items-center gap-2"
                >
                  <span className="text-muted-foreground text-xs w-5">{i + 1}.</span>
                  {section.heading}
                </a>
              </li>
            ))}
            {guide.buyingCriteria && (
              <li>
                <a href="#buying-criteria" className="text-sm text-primary hover:underline flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-5">✓</span>
                  Buying Criteria
                </a>
              </li>
            )}
            {guide.prosAndCons && (
              <li>
                <a href="#pros-cons" className="text-sm text-primary hover:underline flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-5">±</span>
                  Pros &amp; Cons
                </a>
              </li>
            )}
            {guide.commonMistakes && guide.commonMistakes.length > 0 && (
              <li>
                <a href="#common-mistakes" className="text-sm text-primary hover:underline flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-5">!</span>
                  Common Mistakes
                </a>
              </li>
            )}
            {guide.faq.length > 0 && (
              <li>
                <a href="#faq" className="text-sm text-primary hover:underline flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-5">?</span>
                  Frequently Asked Questions
                </a>
              </li>
            )}
          </ol>
        </nav>

        {/* Main Sections */}
        {guide.sections.map((section, i) => (
          <section key={i} id={`section-${i}`} className="mb-10 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-4">
              {section.heading}
            </h2>
            {renderContent(section.content)}
          </section>
        ))}

        {/* Comparison Table */}
        {guide.comparisonProducts && guide.comparisonProducts.length > 0 && (
          <ComparisonTable products={guide.comparisonProducts} />
        )}

        {/* Buying Criteria Block */}
        {guide.buyingCriteria && (
          <section id="buying-criteria" className="mb-10 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-4">
              {guide.buyingCriteria.title || 'What to Look For'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {guide.buyingCriteria.criteria.map((item, i) => (
                <div key={i} className="bg-muted/30 rounded-lg p-4 border border-border">
                  <h3 className="font-semibold text-foreground text-sm mb-1">{item.name}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pros & Cons Block */}
        {guide.prosAndCons && (
          <section id="pros-cons" className="mb-10 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-4">
              Pros &amp; Cons
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-5 border border-green-200 dark:border-green-900">
                <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-green-600" /> Pros
                </h3>
                <ul className="space-y-2">
                  {guide.prosAndCons.pros.map((pro, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">+</span> {pro}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-5 border border-red-200 dark:border-red-900">
                <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                  <XCircle className="w-4 h-4 text-red-600" /> Cons
                </h3>
                <ul className="space-y-2">
                  {guide.prosAndCons.cons.map((con, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-red-600 mt-0.5">−</span> {con}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Common Mistakes Block */}
        {guide.commonMistakes && guide.commonMistakes.length > 0 && (
          <section id="common-mistakes" className="mb-10 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-4">
              Common Mistakes to Avoid
            </h2>
            <div className="space-y-3">
              {guide.commonMistakes.map((mistake, i) => (
                <div key={i} className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 border border-amber-200 dark:border-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{mistake.mistake}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{mistake.whyItMatters}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        {guide.faq.length > 0 && (
          <section id="faq" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              {guide.faq.map((item, i) => (
                <div key={i} className="border-b border-border pb-5 last:border-0">
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.question}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How We Evaluated — Trust Section */}
        <section className="mb-10 bg-muted/30 rounded-xl p-6 border border-border">
          <h2 className="text-lg font-display font-bold text-foreground mb-3">How We Evaluated These Products</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Every product in this guide was evaluated by <Link to="/about-the-author" className="text-primary hover:underline">{AUTHOR.name}</Link> using our standardized research process. We compare materials, durability, real-world performance, and value for money across multiple price points.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our recommendations are independent and never influenced by affiliate commissions. Read our full <Link to="/how-we-test-products" className="text-primary hover:underline">testing methodology</Link> and <Link to="/editorial-guidelines" className="text-primary hover:underline">editorial guidelines</Link> for complete transparency.
          </p>
        </section>

        {/* Shop Category CTA */}
        {guide.relatedCategories.length > 0 && (
          <div className="bg-primary/5 rounded-xl p-6 mb-10 border border-primary/20">
            <div className="flex items-center gap-3 mb-3">
              <ShoppingBag className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Shop Related Products</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {guide.relatedCategories.map((cat) => (
                <Link
                  key={cat}
                  to={`/products?category=${cat}`}
                  className="text-sm bg-background border border-border rounded-full px-4 py-1.5 hover:border-primary/40 hover:text-primary transition-colors font-medium"
                >
                  Shop all {cat.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Guides — Internal Link Authority Block */}
        {relatedGuides && relatedGuides.length > 0 && (
          <section className="mt-12 pt-8 border-t border-border">
            <h2 className="text-xl font-display font-bold text-foreground mb-6 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Related Buying Guides
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedGuides.map((rg) => (
                <Link
                  key={rg.slug}
                  to={`/guides/${rg.slug}`}
                  className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                    {rg.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{rg.excerpt}</p>
                  <span className="flex items-center gap-1 text-xs font-medium text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    Read Guide <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      {/* Sticky CTA */}
      {guide.relatedCategories.length > 0 && (
        <StickyCTA
          categorySlug={guide.relatedCategories[0]}
          categoryLabel={guide.relatedCategories[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        />
      )}
    </Layout>
  );
};

export default GuidePage;
