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
import { ConversionBadges } from '@/components/guides/ConversionBadges';
import { AUTHOR, getAuthorSchema, getPublisherSchema } from '@/lib/author-entity';
import { getClusterRelatedGuides, injectGuideLinks } from '@/lib/guide-link-injector';
import { getSeoTitle } from '@/lib/seo-title-ab';

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

  // Cluster-aware related guides from SCALING_GUIDES
  const clusterRelated = getClusterRelatedGuides(guide.slug, guide.category);
  
  // Map cluster guides to full guide data from allGuides
  const relatedGuides = clusterRelated
    .map(cr => {
      const fullGuide = allGuides?.find(g => g.slug === cr.slug);
      return fullGuide || { slug: cr.slug, title: cr.title, excerpt: '', category: cr.cluster, keywords: [], publishedAt: '', updatedAt: '', featuredImage: '', readingTime: 0, relatedCategories: [] };
    })
    .filter(g => g.slug !== guide.slug);
  
  // Fallback: if no cluster matches, use same-category guides
  if (relatedGuides.length === 0 && allGuides) {
    const sameCat = allGuides.filter(g => g.slug !== guide.slug && g.category === guide.category).slice(0, 5);
    relatedGuides.push(...sameCat);
  }

  // Active SEO title from A/B test or fallback
  const activeSeoTitle = getSeoTitle(guide.slug, guide.seoTitle, guide.title);

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

  // ItemList schema for ranked game lists (difficultyOverview)
  const itemListSchema = guide.difficultyOverview && guide.difficultyOverview.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: guide.title,
    description: guide.seoDescription || guide.excerpt,
    numberOfItems: guide.difficultyOverview.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: guide.difficultyOverview.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.game,
      description: `${item.energy} energy, ${item.difficulty} difficulty. Best for: ${item.bestFor}. ${item.type === 'Both' ? 'Indoor & Outdoor' : item.type}.`,
    })),
  } : null;

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

  // Parse a markdown table block into header + rows
  const parseMarkdownTable = (lines: string[]): { headers: string[]; rows: string[][] } | null => {
    if (lines.length < 3) return null;
    const parseRow = (line: string) =>
      line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    const headers = parseRow(lines[0]);
    if (headers.length < 2) return null;
    // Line 1 should be separator like |---|---|
    if (!/^\|?[\s-|]+\|?$/.test(lines[1])) return null;
    const rows = lines.slice(2).map(parseRow).filter(r => r.length === headers.length);
    return rows.length > 0 ? { headers, rows } : null;
  };

  // Render a premium styled table
  const renderPremiumTable = (table: { headers: string[]; rows: string[][] }, key: number) => (
    <div key={key} className="mb-8 rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              {table.headers.map((h, j) => (
                <th key={j} className="px-5 py-3.5 text-left font-display font-bold text-foreground text-xs uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-5 py-3.5 ${ci === 0 ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
                    dangerouslySetInnerHTML={{ __html: formatInline(cell) }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Render markdown-like content (bold, paragraphs, lists, tables, internal guide links)
  const renderContent = (content: string, sectionIndex?: number) => {
    // Inject guide links for sections after the first 2
    let processedContent = content;
    if (sectionIndex !== undefined && sectionIndex >= 2) {
      processedContent = injectGuideLinks(content, guide.slug);
    }
    
    const paragraphs = processedContent.split('\n\n');
    return paragraphs.map((para, i) => {
      const lines = para.split('\n').filter(l => l.trim() !== '');

      // Check if this block is a markdown table
      if (lines.length >= 3 && lines[0].includes('|') && lines[1].includes('---')) {
        const table = parseMarkdownTable(lines);
        if (table) return renderPremiumTable(table, i);
      }

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
    // Bold
    let result = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
    // Markdown links [text](/guides/slug) → <a> tags
    result = result.replace(/\[([^\]]+)\]\(\/guides\/([a-z0-9-]+)\)/g, 
      '<a href="/guides/$2" class="text-primary hover:underline font-medium" data-internal-guide="true">$1</a>');
    return result;
  };

  // Updated year badge
  const updatedYear = guide.updatedAt ? new Date(guide.updatedAt).getFullYear() : new Date().getFullYear();

  return (
    <Layout>
      <Helmet>
        <title>{activeSeoTitle || `${guide.title} | GetPawsy`}</title>
        <meta name="description" content={guide.seoDescription || guide.excerpt} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <link rel="canonical" href={guideUrl} />
        <meta property="og:title" content={activeSeoTitle || guide.title} />
        <meta property="og:description" content={guide.seoDescription || guide.excerpt} />
        <meta property="og:url" content={guideUrl} />
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={guide.publishedAt} />
        <meta property="article:modified_time" content={guide.updatedAt} />
        <meta property="article:section" content={guide.category} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={activeSeoTitle || guide.title} />
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
        {guide.howTo && (
          <script type="application/ld+json">{JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: guide.howTo.name,
            description: guide.howTo.description,
            ...(guide.howTo.totalTime && { totalTime: guide.howTo.totalTime }),
            ...(guide.howTo.estimatedCost && {
              estimatedCost: { '@type': 'MonetaryAmount', currency: guide.howTo.estimatedCost.currency, value: guide.howTo.estimatedCost.value },
            }),
            ...(guide.howTo.supply && { supply: guide.howTo.supply.map(s => ({ '@type': 'HowToSupply', name: s })) }),
            ...(guide.howTo.tool && { tool: guide.howTo.tool.map(t => ({ '@type': 'HowToTool', name: t })) }),
            step: guide.howTo.steps.map((step, idx) => ({
              '@type': 'HowToStep',
              position: idx + 1,
              name: step.name,
              text: step.text,
              ...(step.image && { image: step.image }),
            })),
          })}</script>
        )}
        {itemListSchema && (
          <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
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
        <header className="mb-12">
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground mb-5">
            <span className="bg-gradient-to-r from-primary/15 to-primary/5 text-primary px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ring-1 ring-primary/10">
              {guide.category}
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5" />
              {guide.readingTime} min read
            </span>
            <span className="flex items-center gap-1.5 bg-accent/60 text-accent-foreground px-2.5 py-1 rounded-full text-xs font-semibold">
              <RefreshCw className="w-3 h-3" />
              Updated {updatedYear}
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-[1.15] tracking-tight">
            {guide.h1Override || guide.title}
          </h1>
          <p className="text-lg text-muted-foreground mt-5 leading-relaxed max-w-2xl">{guide.excerpt}</p>
          
          {/* Trust Lines */}
          {guide.trustLines && guide.trustLines.length > 0 && (
            <ul className="mt-5 space-y-1.5">
              {guide.trustLines.map((line, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="text-primary">✓</span> {line}
                </li>
              ))}
            </ul>
          )}
          
          {/* Author Byline — Premium */}
          <div className="flex items-center gap-3.5 mt-6 pt-5 border-t border-border/60">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Written by </span>
              <Link to="/about-the-author" className="text-foreground font-semibold hover:text-primary transition-colors">
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

        {/* Quick Recommendation Box — enrich with images from comparisonProducts */}
        {guide.quickRecommendation && (
          <QuickRecommendation
            data={{
              ...guide.quickRecommendation,
              bestOverall: {
                ...guide.quickRecommendation.bestOverall,
                image: guide.quickRecommendation.bestOverall.image || guide.comparisonProducts?.find(p => p.link === guide.quickRecommendation!.bestOverall.link)?.image,
              },
              bestBudget: {
                ...guide.quickRecommendation.bestBudget,
                image: guide.quickRecommendation.bestBudget.image || guide.comparisonProducts?.find(p => p.link === guide.quickRecommendation!.bestBudget.link)?.image,
              },
              bestPremium: {
                ...guide.quickRecommendation.bestPremium,
                image: guide.quickRecommendation.bestPremium.image || guide.comparisonProducts?.find(p => p.link === guide.quickRecommendation!.bestPremium.link)?.image,
              },
            }}
          />
        )}

        {/* Conversion Badges — Top Picks with shipping/trust signals */}
        {guide.comparisonProducts && guide.comparisonProducts.length >= 3 && (
          <ConversionBadges
            picks={guide.comparisonProducts.slice(0, 3).map(p => ({
              label: p.badge || 'Top Pick',
              name: p.name,
              price: p.price,
              link: p.link,
              image: p.image,
            }))}
          />
        )}

        {/* Above-the-Fold Difficulty Overview Table */}
        {guide.difficultyOverview && guide.difficultyOverview.length > 0 && (
          <div className="mb-8 border border-border rounded-xl overflow-hidden" id="comparison">
            <div className="bg-muted/50 px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                📊 Quick Comparison — All {guide.difficultyOverview.length} Games
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">#</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">Game</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">Energy</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs">Difficulty</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs hidden sm:table-cell">Best For</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-foreground text-xs hidden md:table-cell">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.difficultyOverview.map((item, i) => (
                    <tr key={i} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground font-medium">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{item.game}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.energy === 'High' ? 'bg-destructive/10 text-destructive' :
                          item.energy === 'Medium' ? 'bg-accent text-accent-foreground' :
                          'bg-secondary text-secondary-foreground'
                        }`}>
                          {item.energy}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.difficulty === 'Advanced' ? 'bg-destructive/10 text-destructive' :
                          item.difficulty === 'Medium' ? 'bg-accent text-accent-foreground' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {item.difficulty}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs hidden sm:table-cell">{item.bestFor}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs hidden md:table-cell">{item.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Jump Navigation Bar (sticky on scroll) */}
        {guide.jumpNav && guide.jumpNav.length > 0 && (
          <nav className="sticky top-16 z-30 -mx-4 px-4 py-2 mb-6 bg-background/95 backdrop-blur-sm border-b border-border overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {guide.jumpNav.map((item, i) => (
                <a
                  key={i}
                  href={`#${item.anchor}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors whitespace-nowrap"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
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
            {renderContent(section.content, i)}
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

        {/* FAQ Accordion */}
        {guide.faq.length > 0 && (
          <section id="faq" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h2>
            <div className="space-y-0 border border-border rounded-xl overflow-hidden">
              {guide.faq.map((item, i) => (
                <details key={i} className="group border-b border-border last:border-0">
                  <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer hover:bg-muted/30 transition-colors list-none [&::-webkit-details-marker]:hidden">
                    <h3 className="text-[15px] font-semibold text-foreground text-left">{item.question}</h3>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-5 pb-5 pt-0">
                    <p className="text-muted-foreground leading-relaxed text-sm">{item.answer}</p>
                  </div>
                </details>
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
