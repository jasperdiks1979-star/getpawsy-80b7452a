/**
 * LockdownClusterArticle — Generic renderer for lockdown cluster articles.
 * Reads from cluster-index.json to find metadata, then fetches the full
 * JSON article from public/data/guides/lockdown-clusters/<category>/<slug>.json
 * 
 * Includes: canonical, breadcrumb schema, FAQ schema, article schema.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Home, ArrowRight } from 'lucide-react';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { AuthorityAuthorBox } from '@/components/affiliate/AuthorityAuthorBox';
import { MedicalDisclaimer } from '@/components/affiliate/AffiliateDisclaimer';
import { SITE_URL } from '@/lib/constants';

interface ClusterIndexEntry {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  keywords: string[];
  publishedAt: string;
  readingTime: number;
  pillarPage: string;
}

interface ArticleSection {
  heading: string;
  content: string;
}

interface ArticleFaq {
  question: string;
  answer: string;
}

interface FullArticle {
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  category: string;
  tags: string[];
  publishedAt: string;
  updatedAt: string;
  readingTime: number;
  pillarPage: string;
  siblingArticles: string[];
  sections: ArticleSection[];
  faq: ArticleFaq[];
}

// Category slug mapping for filesystem paths
const CATEGORY_DIR_MAP: Record<string, string> = {
  'Cat Furniture': 'cat-trees-large-cats',
  'Cat Litter': 'self-cleaning-litter-box',
  'Dog Travel': 'dog-car-seats',
  'Dog Feeding': 'slow-feeder-dog-bowl',
  'Dog Toys': 'interactive-dog-toys',
  'Dog Beds': 'elevated-dog-beds',
  'Cat Feeding': 'cat-water-fountains',
  'Dog Training': 'no-pull-dog-harness',
};

// Pillar page label mapping
const PILLAR_LABELS: Record<string, string> = {
  '/collections/no-pull-dog-harness': 'No-Pull Dog Harnesses',
  '/collections/self-cleaning-litter-box': 'Self-Cleaning Litter Boxes',
  '/collections/dog-car-seats': 'Dog Car Seats',
  '/collections/slow-feeder-dog-bowl': 'Slow Feeder Dog Bowls',
  '/collections/interactive-dog-toys': 'Interactive Dog Toys',
  '/collections/elevated-dog-beds': 'Elevated Dog Beds',
  '/collections/cat-water-fountains': 'Cat Water Fountains',
  '/collections/all': 'All Collections',
};

let _clusterIndex: ClusterIndexEntry[] | null = null;

async function getClusterIndex(): Promise<ClusterIndexEntry[]> {
  if (_clusterIndex) return _clusterIndex;
  const res = await fetch('/data/guides/lockdown-clusters/cluster-index.json');
  _clusterIndex = await res.json();
  return _clusterIndex!;
}

export default function LockdownClusterArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [indexEntry, setIndexEntry] = useState<ClusterIndexEntry | null>(null);
  const [article, setArticle] = useState<FullArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);

    getClusterIndex().then(async (index) => {
      const entry = index.find(e => e.slug === slug);
      if (!entry) { setNotFound(true); setLoading(false); return; }
      setIndexEntry(entry);

      const dir = CATEGORY_DIR_MAP[entry.category];
      if (!dir) { setNotFound(true); setLoading(false); return; }

      try {
        const res = await fetch(`/data/guides/lockdown-clusters/${dir}/${slug}.json`);
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        const data = await res.json();
        setArticle(data);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <Layout>
        <div className="container max-w-4xl py-20 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-3/4 mx-auto" />
            <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
          </div>
        </div>
      </Layout>
    );
  }

  if (notFound || !indexEntry) {
    return (
      <Layout>
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
          <title>Article Not Found | GetPawsy</title>
        </Helmet>
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
          <Link to="/" className="text-primary underline">← Back to Home</Link>
        </div>
      </Layout>
    );
  }

  // Use full article data if available, otherwise fallback to index entry
  const title = article?.seoTitle || article?.title || indexEntry.title;
  const description = article?.metaDescription || indexEntry.excerpt;
  const canonical = `${SITE_URL}/guides/cluster/${slug}`;
  const pillarHref = indexEntry.pillarPage;
  const pillarLabel = PILLAR_LABELS[pillarHref] || 'Collection';

  const faqItems = article?.faq || [];
  const sections = article?.sections || [];

  const faqSchema = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({
      '@type': 'Question', name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  } : null;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: pillarLabel, item: `${SITE_URL}${pillarHref}` },
      { '@type': 'ListItem', position: 3, name: indexEntry.title, item: canonical },
    ],
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url: canonical,
    author: { '@type': 'Organization', name: 'GetPawsy Pet Wellness Team', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: SITE_URL },
    datePublished: article?.publishedAt || indexEntry.publishedAt,
    dateModified: article?.updatedAt || indexEntry.publishedAt,
  };

  return (
    <Layout>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} /><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        {faqSchema && <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>}
      </Helmet>

      <div className="container max-w-4xl py-8 md:py-12">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/"><Home className="h-3.5 w-3.5" /></Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link to={pillarHref}>{pillarLabel}</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{indexEntry.title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Hero */}
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 leading-tight">
            {article?.title || indexEntry.title}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span>{indexEntry.readingTime} min read</span>
            <span>·</span>
            <span>Last Updated: {new Date(article?.updatedAt || indexEntry.publishedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          </div>
        </header>

        {/* Content Sections */}
        {sections.length > 0 && (
          <div className="space-y-10">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4">{section.heading}</h2>
                <div
                  className="prose prose-sm md:prose-base max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              </section>
            ))}
          </div>
        )}

        {/* Fallback if no full article JSON (index-only entries) */}
        {sections.length === 0 && (
          <div className="py-8">
            <p className="text-muted-foreground leading-relaxed">{indexEntry.excerpt}</p>
            <Link to={pillarHref} className="inline-flex items-center gap-2 mt-6 text-primary hover:underline">
              <ArrowRight className="w-4 h-4" /> View full {pillarLabel} collection
            </Link>
          </div>
        )}

        {/* FAQ */}
        {faqItems.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6">Frequently Asked Questions</h2>
            <Accordion type="multiple" className="space-y-2">
              {faqItems.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-lg px-4">
                  <AccordionTrigger className="text-left text-sm font-medium">{f.question}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        {/* Related Links */}
        <section className="mt-12 p-6 bg-muted/30 rounded-xl border border-border">
          <h3 className="font-semibold text-foreground mb-4">Continue Reading</h3>
          <div className="flex flex-wrap gap-3">
            <Link to={pillarHref} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ArrowRight className="w-3.5 h-3.5" /> {pillarLabel}
            </Link>
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
