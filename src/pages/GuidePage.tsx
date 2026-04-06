import { useParams, Link, Navigate } from 'react-router-dom';
import { useMemo } from 'react';
import { getGuideRedirectTarget } from '@/lib/guide-consolidation';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Clock, BookOpen, ChevronRight, ShoppingBag, CheckCircle, XCircle, AlertTriangle, RefreshCw, User, Award } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuide, useGuidesList } from '@/hooks/useGuides';
import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import NotFound from './NotFound';
import { QuickRecommendation } from '@/components/guides/QuickRecommendation';
import { ComparisonTable } from '@/components/guides/ComparisonTable';
import { StickyCTA } from '@/components/guides/StickyCTA';
import { ConversionBadges } from '@/components/guides/ConversionBadges';
import { AUTHOR, getAuthorSchema, getPublisherSchema } from '@/lib/author-entity';
import { getClusterRelatedGuides, injectGuideLinks } from '@/lib/guide-link-injector';
import { getSeoTitle } from '@/lib/seo-title-ab';
import { RecommendedProductsBlock } from '@/components/seo/RecommendedProductsBlock';
import { ReadNextGuideCTA } from '@/components/guides/ReadNextGuideCTA';
import { GuideTopPick } from '@/components/guides/GuideTopPick';
import { GuideInlineProduct } from '@/components/guides/GuideInlineProduct';
import { WhyTrustGetPawsy } from '@/components/seo/WhyTrustGetPawsy';
import { PeopleAlsoRead } from '@/components/seo/PeopleAlsoRead';
import { GuideShareFreshness } from '@/components/guides/GuideShareFreshness';
import { GuideHelpfulWidget } from '@/components/guides/GuideHelpfulWidget';
import { GuideMoneyLinks } from '@/components/guides/GuideMoneyLinks';

const BASE_URL = 'https://getpawsy.pet';

/** Map guide relatedCategories to collection slugs for proper internal linking */
const CATEGORY_TO_COLLECTION: Record<string, string> = {
  'cat-trees': 'cat-condos',
  'cat-litter': 'cat-litter-boxes',
  'cat-litter-boxes': 'cat-litter-boxes',
  'cat-toys': 'best-cat-toys-for-indoor-cats',
  'cat-beds': 'best-cat-beds',
  'cat-carriers': 'best-cat-carriers',
  'cat-scratching': 'best-cat-scratching-posts',
  'cat-feeders': 'automatic-cat-feeders',
  'dog-beds': 'dog-beds',
  'dog-toys': 'best-interactive-dog-toys',
  'dog-harness': 'best-dog-harnesses',
  'dog-harnesses': 'best-dog-harnesses',
  'dog-car': 'dog-car-travel-safety-seats',
  'dog-car-seats': 'dog-car-travel-safety-seats',
  'dog-grooming': 'best-dog-grooming-kits',
  'dog-bowls': 'best-slow-feeder-dog-bowls',
  'dog-travel': 'dogs',
  'dog-training': 'dog-training-accessories',
  'dog-potty': 'dog-potty-training',
  'dog-leash': 'dog-leash-control',
  'dog-anti-bark': 'dog-anti-bark',
};

function categoryToCollectionSlug(cat: string): string | null {
  const catLower = cat.toLowerCase();
  if (CATEGORY_TO_COLLECTION[catLower]) return CATEGORY_TO_COLLECTION[catLower];
  // Fuzzy match
  for (const [key, slug] of Object.entries(CATEGORY_TO_COLLECTION)) {
    if (catLower.includes(key) || key.includes(catLower)) return slug;
  }
  // Species fallback
  if (catLower.includes('cat')) return 'cats';
  if (catLower.includes('dog')) return 'dogs';
  return null;
}

const GuidePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: guide, isLoading, error } = useGuide(slug);
  const { data: allGuides } = useGuidesList();

  // Guide consolidation: redirect weak duplicates to primary guide
  const redirectTarget = slug ? getGuideRedirectTarget(slug) : null;

  // Fetch products for internal linking AND image enrichment in guide content
  const { data: linkableProducts = [] } = useQuery({
    queryKey: ['internal-linking-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, category, image_url')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .limit(200);
      return (data || []) as { id: string; name: string; slug: string | null; category: string | null; image_url: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Build a fuzzy product-name → image_url map for enriching guide sections
  const productImageMap = useMemo(() => {
    const map = new Map<string, string>();
    linkableProducts.forEach(p => {
      if (p.image_url) {
        // Full name match
        map.set(p.name.toLowerCase().trim(), p.image_url);
        // Extract key phrases (3-5 words) for fuzzy matching
        const words = p.name.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
        for (let len = Math.min(5, words.length); len >= 3; len--) {
          for (let i = 0; i <= words.length - len; i++) {
            const phrase = words.slice(i, i + len).join(' ');
            if (phrase.length >= 10 && !map.has(phrase)) {
              map.set(phrase, p.image_url);
            }
          }
        }
      }
    });
    return map;
  }, [linkableProducts]);

  // Helper: find a real product image for a guide product name
  const findProductImage = (name: string): string | undefined => {
    const lower = name.toLowerCase().trim();
    // Exact match first
    if (productImageMap.has(lower)) return productImageMap.get(lower);
    // Try to find a map entry that's contained in the name or vice versa
    const nameWords = lower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
    let bestMatch: { key: string; score: number; url: string } | null = null;
    for (const [key, url] of productImageMap) {
      const keyWords = key.split(/\s+/);
      const overlap = keyWords.filter(w => nameWords.includes(w)).length;
      const score = overlap / Math.max(keyWords.length, 1);
      if (overlap >= 2 && score >= 0.5 && (!bestMatch || overlap > bestMatch.score)) {
        bestMatch = { key, score: overlap, url };
      }
    }
    return bestMatch?.url;
  };

  // Enrich comparisonProducts with real images from the database
  const enrichedComparisonProducts = useMemo(() => {
    return guide?.comparisonProducts?.map(p => {
      // Check if the image exists (static paths like /images/guides/... usually don't)
      const isStaticPlaceholder = !p.image || p.image.startsWith('/images/guides/');
      if (isStaticPlaceholder) {
        const dbImage = findProductImage(p.name);
        return dbImage ? { ...p, image: dbImage } : p;
      }
      return p;
    });
  }, [guide?.comparisonProducts, productImageMap]);

  // Build keyword → product URL lookup for auto-linking product mentions in guide content
  const productLinkMap = useMemo(() => {
    const map = new Map<string, string>();
    
    // Priority 1: Add guide's own comparisonProducts (most accurate, short names)
    guide?.comparisonProducts?.forEach(cp => {
      if (cp.name && cp.link) {
        map.set(cp.name.toLowerCase().trim(), cp.link);
      }
    });
    
    // Priority 2: Add full product names from DB
    linkableProducts.forEach(p => {
      if (p.slug) {
        const name = p.name.toLowerCase().trim();
        if (!map.has(name)) {
          map.set(name, `/product/${p.slug}`);
        }
        
        // Extract meaningful multi-word phrases (3+ words) from product names
        const words = name.split(/\s+/).filter(w => w.length >= 3);
        for (let len = 4; len >= 3; len--) {
          for (let i = 0; i <= words.length - len; i++) {
            const phrase = words.slice(i, i + len).join(' ');
            if (phrase.length >= 12 && !map.has(phrase)) {
              map.set(phrase, `/product/${p.slug}`);
            }
          }
        }
      }
    });
    
    return map;
  }, [linkableProducts, guide?.comparisonProducts]);

  // IMPORTANT: This useMemo MUST be before any conditional returns to maintain
  // stable React hooks order across all renders (loading, error, loaded).
  const contentLinkedSlugs = useMemo(() => {
    const set = new Set<string>();
    const regex = /\/guides\/([a-z0-9-]+)/g;
    const allText = (guide?.sections || []).map(s => String(s.content || '')).join(' ');
    let m;
    while ((m = regex.exec(allText)) !== null) set.add(m[1]);
    return set;
  }, [guide?.sections]);

  // Guide consolidation: redirect weak duplicates to primary guide
  if (redirectTarget) {
    return <Navigate to={`/guides/${redirectTarget}`} replace />;
  }

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
    // Fallback: redirect to guides listing instead of showing 404
    return <Navigate to="/guides" replace />;
  }

  // Canonical WITHOUT trailing slash (canonical standard)
  const guideUrl = `${BASE_URL}/guides/${guide.slug}`;

  // Cluster-aware related guides from SCALING_GUIDES (4-6 guides)
  const clusterRelated = getClusterRelatedGuides(guide.slug, guide.category);

  // Map cluster guides to full guide data, filtering out duplicates from content
  const relatedGuides = clusterRelated
    .filter(cr => cr.slug !== guide.slug && !contentLinkedSlugs.has(cr.slug))
    .map(cr => {
      const fullGuide = allGuides?.find(g => g.slug === cr.slug);
      return fullGuide || { slug: cr.slug, title: cr.title, excerpt: '', category: cr.cluster, keywords: [], publishedAt: '', updatedAt: '', featuredImage: '', readingTime: 0, relatedCategories: [] };
    });
  
  // Fallback: if insufficient cluster matches, add same-category guides
  if (relatedGuides.length < 4 && allGuides) {
    const existingSlugs = new Set(relatedGuides.map(g => g.slug));
    const sameCat = allGuides
      .filter(g => g.slug !== guide.slug && g.category === guide.category && !existingSlugs.has(g.slug) && !contentLinkedSlugs.has(g.slug))
      .slice(0, 6 - relatedGuides.length);
    relatedGuides.push(...sameCat);
  }

  // Active SEO title from A/B test or fallback
  // Safe accessors — never crash on missing data
  const safeFaq = guide.faq || [];
  const safeKeywords = guide.keywords || [];
  const safeSections = guide.sections || [];
  const safeRelatedCategories = guide.relatedCategories || [];

  const activeSeoTitle = getSeoTitle(guide.slug, guide.seoTitle, guide.title);

  // Article schema with Person author entity
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.excerpt || '',
    image: guide.featuredImage ? `${BASE_URL}${guide.featuredImage}` : `${BASE_URL}/og-image.png`,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    author: getAuthorSchema(),
    publisher: getPublisherSchema(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': guideUrl },
    keywords: safeKeywords.join(', '),
    articleSection: guide.category,
    inLanguage: 'en-US',
  };

  // FAQ schema
  const faqSchema = safeFaq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: safeFaq.map((item) => ({
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

  // Product schemas removed from guide pages — Google Shopping policy requires
  // Product schema only on product pages (/product/*), not editorial guides.

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

  // Check if a list item is a "Best for X → Y" recommendation pattern
  const isBestForPattern = (line: string) => /^- \*\*Best\s/i.test(line) && line.includes('→');

  // Render a premium "Best for" card grid
  const renderBestForCards = (lines: string[], key: number) => {
    const items = lines.filter(l => l.startsWith('- ')).map(l => {
      const text = l.slice(2);
      const arrowIdx = text.indexOf('→');
      if (arrowIdx === -1) return { label: text, desc: '' };
      const label = text.slice(0, arrowIdx).replace(/\*\*/g, '').trim();
      const desc = text.slice(arrowIdx + 1).trim();
      return { label, desc };
    });

    return (
      <div key={key} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {items.map((item, j) => (
          <div
            key={j}
            className="group relative rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Award className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="font-display font-bold text-foreground text-sm leading-snug mb-1">
                  {item.label}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(item.desc) }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

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

      // H3 subheading (### Heading)
      if (lines.length === 1 && lines[0].startsWith('### ')) {
        const heading = lines[0].slice(4);
        return (
          <h3 key={i} className="flex items-center gap-3 text-lg font-display font-bold text-foreground mt-8 mb-4">
            <span className="w-1 h-6 rounded-full bg-gradient-to-b from-primary to-primary/40" />
            {heading}
          </h3>
        );
      }

      const isList = lines.every((l) => l.startsWith('- ') || l.startsWith('**') || l.trim() === '');

      // "Best for" pattern → premium card grid
      if (isList && lines.some(l => l.startsWith('- ')) && lines.filter(l => l.startsWith('- ')).every(isBestForPattern)) {
        return renderBestForCards(lines, i);
      }

      // Regular bullet list → premium styled
      if (isList && lines.some((l) => l.startsWith('- '))) {
        return (
          <ul key={i} className="space-y-2.5 mb-6 pl-1">
            {lines.filter((l) => l.startsWith('- ')).map((l, j) => (
              <li key={j} className="flex items-start gap-3 text-muted-foreground text-[15px] leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2.5 flex-shrink-0" />
                <span dangerouslySetInnerHTML={{ __html: formatInline(l.slice(2)) }} />
              </li>
            ))}
          </ul>
        );
      }

      return (
        <p
          key={i}
          className="text-muted-foreground leading-[1.8] mb-5 text-[15px]"
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
    
    // Auto-link product names found in content
    if (productLinkMap.size > 0) {
      // Sort by name length (longest first) to match most specific product first
      const sortedProducts = Array.from(productLinkMap.entries())
        .sort((a, b) => b[0].length - a[0].length);
      
      for (const [name, productUrl] of sortedProducts) {
        // Skip very short names to avoid false matches
        if (name.length < 10) continue;
        
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match product name (case-insensitive), but not inside existing <a> tags or HTML attributes
        const regex = new RegExp(
          `(?<![<\\/a-zA-Z"=])\\b(${escapedName})\\b(?![^<]*>)(?![^<]*<\\/a>)`,
          'gi'
        );
        
        // Only link the first occurrence per product
        let matched = false;
        result = result.replace(regex, (match) => {
          if (matched) return match;
          matched = true;
          return `<a href="${productUrl}" class="text-primary hover:underline font-medium transition-colors" data-internal-product="true">${match}</a>`;
        });
      }
    }
    
    return result;
  };

  // Updated year badge
  const updatedYear = guide.updatedAt ? new Date(guide.updatedAt).getFullYear() : new Date().getFullYear();

  return (
    <Layout>
      <Helmet>
        <title>{activeSeoTitle || `${guide.title} | GetPawsy`}</title>
        <meta name="description" content={guide.seoDescription || guide.excerpt} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" /><meta property="og:title" content={activeSeoTitle || guide.title} />
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
        {safeKeywords.map((kw, i) => (
          <meta key={i} property="article:tag" content={kw} />
        ))}
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        {faqSchema && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
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
        <GuideMoneyLinks currentSlug={guide.slug} position="top" relatedCategories={safeRelatedCategories} />
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

        {/* Quick Answer Snippet — Premium */}
        {guide.quickAnswer && (
          <div className="relative mb-10 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card overflow-hidden shadow-sm">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-primary/40" />
            <div className="p-6 pl-7">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-display font-bold text-primary uppercase tracking-wider">
                  Quick Answer
                </h2>
              </div>
              <p className="text-foreground leading-[1.75] text-[15px]">{guide.quickAnswer}</p>
            </div>
          </div>
        )}

        {/* Bullet Summary — Key Takeaways for snippet capture */}
        {guide.bulletSummary && guide.bulletSummary.length > 0 && (
          <div className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Key Takeaways
            </h2>
            <ul className="space-y-2">
              {guide.bulletSummary.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-primary">{i + 1}</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}


        {guide.quickRecommendation && (() => {
          try {
            const qr = guide.quickRecommendation;
            const enrichPick = (pick: typeof qr.bestOverall | undefined) => {
              if (!pick?.name || !pick?.link) return pick;
              const hasRealImage = pick.image && !pick.image.startsWith('/images/guides/');
              return {
                ...pick,
                image: hasRealImage
                  ? pick.image
                  : findProductImage(pick.name) || enrichedComparisonProducts?.find(p => p.link === pick.link)?.image,
              };
            };
            return (
              <QuickRecommendation
                data={{
                  ...qr,
                  bestOverall: enrichPick(qr.bestOverall) || qr.bestOverall,
                  bestBudget: enrichPick(qr.bestBudget) || qr.bestBudget,
                  bestPremium: enrichPick(qr.bestPremium) || qr.bestPremium,
                }}
              />
            );
          } catch { return null; }
        })()}

        {/* Conversion Badges — Top Picks with shipping/trust signals */}
        {(() => {
          try {
            const validBadgeProducts = (enrichedComparisonProducts || []).filter(p =>
              p.name && p.name.length >= 10 && p.price && p.link?.startsWith('/product') && p.image && !p.image.startsWith('/images/guides/')
            );
            if (validBadgeProducts.length < 2) return null;
            return (
              <ConversionBadges
                picks={validBadgeProducts.slice(0, 3).map(p => ({
                  label: p.badge || 'Top Pick',
                  name: p.name,
                  price: p.price,
                  link: p.link,
                  image: p.image,
                }))}
              />
            );
          } catch { return null; }
        })()}

        {/* Top Pick Hero — #1 product with strong CTA */}
        {(() => {
          try {
            const topProduct = (enrichedComparisonProducts || []).find(p =>
              p.name && p.link?.startsWith('/product') && p.image && !p.image.startsWith('/images/guides/')
            );
            if (!topProduct) return null;
            const benefits = topProduct.advantages?.slice(0, 4) || [];
            return (
              <GuideTopPick
                name={topProduct.name}
                image={topProduct.image}
                price={topProduct.price}
                link={topProduct.link}
                badge={topProduct.badge ? `🏆 ${topProduct.badge}` : undefined}
                benefits={benefits}
                trustLabel="Limited stock available"
              />
            );
          } catch { return null; }
        })()}


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

        {/* Table of Contents — Premium */}
        <nav className="rounded-2xl border border-border bg-card p-6 mb-12 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-sm font-display font-bold text-foreground uppercase tracking-wider">
              In This Guide
            </h2>
          </div>
          <ol className="space-y-1.5">
            {safeSections.map((section, i) => (
              <li key={i}>
                <a
                  href={`#section-${i}`}
                  className="group flex items-center gap-3 text-sm py-1.5 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                    {section.heading}
                  </span>
                </a>
              </li>
            ))}
            {guide.buyingCriteria && (
              <li>
                <a href="#buying-criteria" className="group flex items-center gap-3 text-sm py-1.5 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">✓</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">Buying Criteria</span>
                </a>
              </li>
            )}
            {guide.prosAndCons && (
              <li>
                <a href="#pros-cons" className="group flex items-center gap-3 text-sm py-1.5 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">±</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">Pros &amp; Cons</span>
                </a>
              </li>
            )}
            {guide.commonMistakes && guide.commonMistakes.length > 0 && (
              <li>
                <a href="#common-mistakes" className="group flex items-center gap-3 text-sm py-1.5 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">!</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">Common Mistakes</span>
                </a>
              </li>
            )}
            {guide.notFor && guide.notFor.length > 0 && (
              <li>
                <a href="#not-for" className="group flex items-center gap-3 text-sm py-1.5 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">✗</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">Who This Is NOT For</span>
                </a>
              </li>
            )}
            {safeFaq.length > 0 && (
              <li>
                <a href="#faq" className="group flex items-center gap-3 text-sm py-1.5 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">?</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">Frequently Asked Questions</span>
                </a>
              </li>
            )}
          </ol>
        </nav>

        {/* Main Sections with inline product CTAs */}
        <SectionErrorBoundary section="GuidePage-sections">
          {safeSections.map((section, i) => {
            // Insert inline product CTA after every 3rd section
            const inlineProduct = (i > 0 && i % 3 === 2)
              ? (enrichedComparisonProducts || []).filter(p =>
                  p.name && p.link?.startsWith('/product') && p.image && !p.image.startsWith('/images/guides/')
                )[Math.floor(i / 3) % Math.max((enrichedComparisonProducts || []).length, 1)]
              : null;

            const INLINE_TRIGGERS = [
              'Most popular choice',
              'Recommended for large dogs',
              'Best for joint support',
              'Customers are buying this now',
            ];

            return (
              <div key={i}>
                <section id={`section-${i}`} className="mb-12 scroll-mt-24">
                  <h2 className="text-2xl font-display font-bold text-foreground mb-5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    {section.heading}
                  </h2>
                  {renderContent(section.content, i)}
                </section>
                {inlineProduct && (
                  <GuideInlineProduct
                    name={inlineProduct.name}
                    image={inlineProduct.image}
                    price={inlineProduct.price}
                    link={inlineProduct.link}
                    trustTrigger={inlineProduct.badge || INLINE_TRIGGERS[Math.floor(i / 3) % INLINE_TRIGGERS.length]}
                    benefit={inlineProduct.advantages?.[0]}
                  />
                )}
                {/* Mid-article "People Also Read" after section 4 */}
                {i === 3 && relatedGuides.length >= 3 && (
                  <PeopleAlsoRead guides={relatedGuides.slice(0, 4)} className="mb-12" />
                )}
              </div>
            );
          })}
        </SectionErrorBoundary>

        {/* Comparison Table — only with validated products */}
        {(() => {
          try {
            const validComparison = (enrichedComparisonProducts || []).filter(p =>
              p.name && p.name.length >= 10 && p.price && p.link?.startsWith('/product') && p.image && !p.image.startsWith('/images/guides/')
            );
            if (validComparison.length < 2) return null;
            return <ComparisonTable products={validComparison} />;
          } catch { return null; }
        })()}

        {/* Buying Criteria Block — Premium */}
        {guide.buyingCriteria && (
          <section id="buying-criteria" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-5">
              {guide.buyingCriteria.title || 'What to Look For'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {guide.buyingCriteria.criteria.map((item, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-sm transition-all duration-300">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-foreground text-sm mb-1">{item.name}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pros & Cons Block — Premium */}
        {guide.prosAndCons && (
          <section id="pros-cons" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-5">
              Pros &amp; Cons
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl p-5 border border-border bg-card">
                <h3 className="font-display font-bold text-foreground flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  Pros
                </h3>
                <ul className="space-y-2.5">
                  {guide.prosAndCons.pros.map((pro, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2.5 leading-relaxed">
                      <span className="text-green-600 font-bold mt-px">+</span> {pro}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl p-5 border border-border bg-card">
                <h3 className="font-display font-bold text-foreground flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  Cons
                </h3>
                <ul className="space-y-2.5">
                  {guide.prosAndCons.cons.map((con, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2.5 leading-relaxed">
                      <span className="text-red-600 font-bold mt-px">−</span> {con}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Common Mistakes Block — Premium */}
        {guide.commonMistakes && guide.commonMistakes.length > 0 && (
          <section id="common-mistakes" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-5">
              Common Mistakes to Avoid
            </h2>
            <div className="space-y-3">
              {guide.commonMistakes.map((mistake, i) => (
                <div key={i} className="flex items-start gap-3.5 rounded-2xl p-5 border border-border bg-card hover:border-amber-500/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-foreground text-sm mb-1">{mistake.mistake}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{mistake.whyItMatters}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Who This Is NOT For */}
        {guide.notFor && guide.notFor.length > 0 && (
          <section id="not-for" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-5">
              Who This Is NOT For
            </h2>
            <div className="rounded-2xl border border-border bg-card p-5">
              <ul className="space-y-2.5">
                {guide.notFor.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                    <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}


        {safeFaq.length > 0 && (
          <section id="faq" className="mb-12 scroll-mt-24">
            <h2 className="text-2xl font-display font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h2>
            <div className="space-y-0 border border-border rounded-2xl overflow-hidden shadow-sm">
              {safeFaq.map((item, i) => (
                <details key={i} className="group border-b border-border last:border-0">
                  <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer hover:bg-muted/30 transition-colors list-none [&::-webkit-details-marker]:hidden">
                    <h3 className="text-[15px] font-display font-semibold text-foreground text-left">{item.question}</h3>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-5 pb-5 pt-0">
                    <p className="text-muted-foreground leading-[1.8] text-sm">{item.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* How We Evaluated — Trust Section Premium */}
        <section className="mb-12 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-display font-bold text-foreground">How We Evaluated These Products</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-[1.8] mb-3">
            Every product in this guide was evaluated by <Link to="/about-the-author" className="text-primary hover:underline font-medium">{AUTHOR.name}</Link> using our standardized research process. We compare materials, durability, real-world performance, and value for money across multiple price points.
          </p>
          <p className="text-sm text-muted-foreground leading-[1.8]">
            Our recommendations are independent and never influenced by affiliate commissions. Read our full <Link to="/how-we-test-products" className="text-primary hover:underline font-medium">testing methodology</Link> and <Link to="/editorial-guidelines" className="text-primary hover:underline font-medium">editorial guidelines</Link> for complete transparency.
          </p>
        </section>

        {/* Was this helpful? — micro-engagement signal */}
        <GuideHelpfulWidget guideSlug={guide.slug} className="mb-8" />

        {/* Share & Freshness Signal */}
        <GuideShareFreshness
          title={guide.title}
          url={`/guides/${guide.slug}`}
          updatedAt={guide.updatedAt}
          className="mb-8"
        />

        {/* E-E-A-T Trust Block */}
        <GuideMoneyLinks currentSlug={guide.slug} position="bottom" relatedCategories={safeRelatedCategories} />
        <WhyTrustGetPawsy variant="guide" className="mb-12" />

        {/* People Also Read — session depth booster */}
        {relatedGuides.length >= 2 && (
          <PeopleAlsoRead guides={relatedGuides.slice(0, 6)} className="mb-12" />
        )}

        <SectionErrorBoundary section="GuidePage-recommended-products">
          {safeRelatedCategories.length > 0 && (
            <RecommendedProductsBlock
              categories={guide.relatedCategories.map(cat =>
                cat.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              )}
              title="Recommended Products for Your Pet"
              limit={4}
              className="mb-12"
            />
          )}
        </SectionErrorBoundary>

        {/* Shop Category CTA — Premium */}
        {safeRelatedCategories.length > 0 && (
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-6 mb-12 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-display font-bold text-foreground">Shop Related Products</h3>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {safeRelatedCategories.map((cat) => {
                const collectionSlug = categoryToCollectionSlug(cat);
                const displayName = cat.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <Link
                    key={cat}
                    to={collectionSlug ? `/collections/${collectionSlug}` : `/collections/${cat}`}
                    className="text-sm bg-card border border-border rounded-full px-5 py-2 hover:border-primary/40 hover:text-primary hover:shadow-sm transition-all font-medium"
                  >
                    View all {displayName} products →
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Related Guides — Premium */}
        {relatedGuides && relatedGuides.length > 0 && (
          <section className="mt-12 pt-8 border-t border-border">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-xl font-display font-bold text-foreground">
                Related Pet Guides
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedGuides.map((rg) => (
                <Link
                  key={rg.slug}
                  to={`/guides/${rg.slug}`}
                  className="group block rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
                >
                  <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors mb-1.5 text-[15px]">
                    {rg.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{rg.excerpt}</p>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary mt-3 group-hover:gap-2.5 transition-all duration-300">
                    Read Guide <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Read Next Guide CTA — session depth booster */}
        {relatedGuides.length > 0 && (
          <ReadNextGuideCTA guide={relatedGuides[0]} className="mt-10 mb-8" />
        )}
      </article>

      {/* Sticky CTA */}
      {safeRelatedCategories.length > 0 && (
        <StickyCTA
          categorySlug={safeRelatedCategories[0]}
          categoryLabel={safeRelatedCategories[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        />
      )}
    </Layout>
  );
};

export default GuidePage;
