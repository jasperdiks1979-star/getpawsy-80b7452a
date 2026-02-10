import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Clock, BookOpen, ChevronRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuide, useGuidesList } from '@/hooks/useGuides';
import { Loader2 } from 'lucide-react';
import NotFound from './NotFound';

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

  const guideUrl = `${BASE_URL}/guides/${guide.slug}`;

  // Related guides from same category
  const relatedGuides = allGuides?.filter(
    (g) => g.slug !== guide.slug && g.category === guide.category
  ).slice(0, 3);

  // Article schema
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.excerpt,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    author: { '@type': 'Organization', name: 'GetPawsy', url: BASE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'GetPawsy',
      logo: { '@type': 'ImageObject', url: `${BASE_URL}/favicon.png`, width: 512, height: 512 },
      url: BASE_URL,
    },
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

  // Render markdown-like content (bold, paragraphs, lists)
  const renderContent = (content: string) => {
    const paragraphs = content.split('\n\n');
    return paragraphs.map((para, i) => {
      // Check if it's a list
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

  // Bold and inline formatting
  const formatInline = (text: string) => {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
  };

  return (
    <Layout>
      <Helmet>
        <title>{guide.title} | GetPawsy</title>
        <meta name="description" content={guide.excerpt} />
        <link rel="canonical" href={guideUrl} />
        <meta property="og:title" content={guide.title} />
        <meta property="og:description" content={guide.excerpt} />
        <meta property="og:url" content={guideUrl} />
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={guide.publishedAt} />
        <meta property="article:modified_time" content={guide.updatedAt} />
        <meta property="article:section" content={guide.category} />
        {guide.keywords.map((kw, i) => (
          <meta key={i} property="article:tag" content={kw} />
        ))}
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        {faqSchema && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
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
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">
            {guide.title}
          </h1>
          <p className="text-lg text-muted-foreground mt-4">{guide.excerpt}</p>
        </header>

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

        {/* Sections */}
        {guide.sections.map((section, i) => (
          <section key={i} id={`section-${i}`} className="mb-10 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-4">
              {section.heading}
            </h2>
            {renderContent(section.content)}
          </section>
        ))}

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

        {/* Internal links to categories */}
        {guide.relatedCategories.length > 0 && (
          <div className="bg-muted/30 rounded-xl p-6 mb-10 border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3">Related Categories</h3>
            <div className="flex flex-wrap gap-2">
              {guide.relatedCategories.map((cat) => (
                <Link
                  key={cat}
                  to={`/products?category=${cat}`}
                  className="text-sm bg-background border border-border rounded-full px-4 py-1.5 hover:border-primary/40 hover:text-primary transition-colors"
                >
                  {cat.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Guides */}
        {relatedGuides && relatedGuides.length > 0 && (
          <section className="mt-12 pt-8 border-t border-border">
            <h2 className="text-xl font-display font-bold text-foreground mb-6 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              More in {guide.category}
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
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </Layout>
  );
};

export default GuidePage;
