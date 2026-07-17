import { useParams, Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useMemo, useState } from 'react';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { Helmet } from 'react-helmet-async';
import { preloadCriticalImage } from '@/hooks/useCriticalImagePreload';
import { supabase } from '@/integrations/supabase/client';
import { getCollectionConfig } from '@/config/collectionMap';
import { resolveCollectionProducts, type CollectionProduct } from '@/lib/collection-matching-engine';
import { useCollectionIntegrityCheck } from '@/lib/collection-integrity';
import { resolveCollectionSlug, getVirtualCollection } from '@/lib/collection-slug-resolver';
import { logCollectionResolution } from '@/lib/diagnostics-payload';
import { classifySpecies } from '@/lib/species-taxonomy';
import { getConversionFlag } from '@/lib/conversionFlags';
import { Layout } from '@/components/layout/Layout';
import { sanitizeHtml } from '@/lib/sanitize';
import { SectionErrorBoundary } from '@/components/error/SectionErrorBoundary';
import { CrossCollectionLinks } from '@/components/seo/CrossCollectionLinks';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getSchemaAvailability } from '@/lib/availability';
import { 
  Home, 
  ChevronRight, 
  BookOpen,
  HelpCircle,
  ArrowRight,
  Package,
  Truck,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SoftEmailCapture } from '@/components/email/SoftEmailCapture';
import { 
  generateCollectionMetaTitle, 
  generateCollectionMetaDescription 
} from '@/lib/seo-longtail-keywords';
import { CategoryRelatedGuides } from '@/components/seo/CategoryRelatedGuides';
import { CollectionClusterIntro } from '@/components/authority/CollectionClusterIntro';
import { CategoryPopularProducts } from '@/components/seo/CategoryPopularProducts';
import { CategoryClusterLinks } from '@/components/seo/CategoryClusterLinks';
import { CollectionExpertGuides } from '@/components/seo/CollectionExpertGuides';
import { ExpertBlock } from '@/components/seo/ExpertBlock';
import { ComparisonTable, getComparisonData } from '@/components/seo/ComparisonTable';
import { CollectionTableOfContents, getCollectionTocItems } from '@/components/seo/CollectionTableOfContents';
import { ScrollProgressIndicator } from '@/components/ui/ScrollProgressIndicator';
import { RelatedCategoriesBlock } from '@/components/seo/RelatedCategoriesBlock';
import { FeaturedSnippetBlock } from '@/components/seo/FeaturedSnippetBlock';
import { StickyJumpNav } from '@/components/seo/StickyJumpNav';
import { PAASection } from '@/components/seo/PAASection';
import { MidContentCTA } from '@/components/seo/MidContentCTA';
import { getDominationConfig } from '@/data/domination-config';
import { CatTreesHubContent } from '@/components/seo/CatTreesHubContent';
import { DogBedsHubContent } from '@/components/seo/DogBedsHubContent';
import { CollectionTrustBar } from '@/components/seo/CollectionTrustBar';
import { WhyGetPawsy } from '@/components/shared/WhyGetPawsy';
import { CollectionMiniComparison } from '@/components/seo/CollectionMiniComparison';
import { CollectionCROBadges, isMoneyCollection } from '@/components/seo/CollectionCROBadges';
import { getMoneyCollectionFAQs } from '@/lib/money-collection-faqs';
import { TrainingCollectionCrossLinks } from '@/components/collections/TrainingCollectionCrossLinks';
import { buildStructuredProductName } from '@/lib/structured-product-name';
// SoldCounter removed — fake "X sold this week" risks Google misrepresentation flags

const TRAINING_COLLECTION_SLUGS = ['dog-potty-training', 'dog-leash-control', 'dog-anti-bark', 'puppy-essentials', 'dog-training-accessories'];

interface FAQItem {
  question: string;
  answer: string;
}

interface SeoCollectionData {
  id: string;
  slug: string;
  name: string;
  primary_keyword: string;
  secondary_keywords: string[];
  seo_intro: string;
  meta_title: string | null;
  meta_description: string | null;
  faq: FAQItem[];
  related_blog_slug: string | null;
  related_collection_slugs: string[];
  product_category_filter: string | null;
  product_keyword_filter: string | null;
}


// Generate CollectionPage JSON-LD
const generateCollectionJsonLd = (collection: SeoCollectionData, products: CollectionProduct[]) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `https://getpawsy.pet/collections/${collection.slug}#collection`,
  name: collection.name,
  description: collection.meta_description || collection.seo_intro.substring(0, 160),
  url: `https://getpawsy.pet/collections/${collection.slug}`,
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: products.length,
    itemListElement: products.slice(0, 8).map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        '@id': `https://getpawsy.pet/product/${product.slug || product.id}`,
        name: buildStructuredProductName(product),
        image: product.image_url,
        ...((product.price && Number(product.price) > 0) ? {
          offers: {
            '@type': 'Offer',
            price: Number(product.price).toFixed(2),
            priceCurrency: 'USD',
            availability: getSchemaAvailability(product)
          }
        } : {})
      }
    })).filter((entry: any) => entry.item.offers)
  }
});

// Generate FAQ JSON-LD
const generateFAQJsonLd = (faqs: FAQItem[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer
    }
  }))
});

// Generate Breadcrumb JSON-LD — supports parent pillar hierarchy
const generateBreadcrumbJsonLd = (collection: SeoCollectionData, parentCollection?: { slug: string; name: string } | null) => {
  const items = [
    {
      '@type': 'ListItem' as const,
      position: 1,
      name: 'Home',
      item: 'https://getpawsy.pet'
    },
    {
      '@type': 'ListItem' as const,
      position: 2,
      name: 'Products',
      item: 'https://getpawsy.pet/products'
    },
  ];

  if (parentCollection) {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: parentCollection.name.replace(/\s–.*$/, ''),
      item: `https://getpawsy.pet/collections/${parentCollection.slug}`
    });
    items.push({
      '@type': 'ListItem',
      position: 4,
      name: collection.name.replace(/\s–.*$/, ''),
      item: `https://getpawsy.pet/collections/${collection.slug}`
    });
  } else {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: collection.name.replace(/\s–.*$/, ''),
      item: `https://getpawsy.pet/collections/${collection.slug}`
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items
  };
};

/**
 * Slugs that have dedicated static route components.
 * SeoCollection must NEVER handle these — they have their own pages.
 * If React Router accidentally matches /:slug or /collections/:slug for these,
 * we redirect to the correct static route.
 */
const RESERVED_CLUSTER_SLUGS = new Set<string>([
  // No reserved slugs — all collections now served via /collections/:slug
]);

const SeoCollection = () => {
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const viewShop = searchParams.get('view') === 'shop';
  const scrolledRef = useRef(false);

  // Resolve slug through canonical mapping layer
  const slugResolution = useMemo(() => {
    if (!rawSlug) return null;
    return resolveCollectionSlug(rawSlug);
  }, [rawSlug]);

  const slug = slugResolution?.resolvedSlug || rawSlug;
  const isReserved = !!(slug && RESERVED_CLUSTER_SLUGS.has(slug));

  // Dev-only integrity validator to catch broken collection mappings early
  useCollectionIntegrityCheck(import.meta.env.DEV);

  // Auto-scroll to product grid when coming from homepage CTA (hash or query param)
  useEffect(() => {
    if (scrolledRef.current) return;
    const shouldScroll = viewShop || window.location.hash === '#product-grid';
    if (!shouldScroll) return;
    scrolledRef.current = true;
    const timer = setTimeout(() => {
      const el = document.getElementById('product-grid');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
    return () => clearTimeout(timer);
  }, [viewShop]);

  // Fetch collection data — tries resolved slug first
  const { data: dbCollection, isLoading: collectionLoading, error } = useQuery({
    queryKey: ['seo-collection', slug],
    queryFn: async () => {
      if (!slug) throw new Error('No slug');

      // Try resolved slug
      const { data, error: err } = await supabase
        .from('seo_collections')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (!err && data) {
        logCollectionResolution({
          requestedSlug: rawSlug || '',
          resolvedSlug: slug,
          aliasUsed: slugResolution?.aliasUsed || false,
          matchResult: 'db_hit',
        });

        // Parse FAQ from JSONB safely
        const rawFaq = data.faq;
        const faq: FAQItem[] = Array.isArray(rawFaq)
          ? rawFaq.map((item: unknown) => {
              const faqItem = item as { question?: string; answer?: string; q?: string; a?: string };
              return {
                question: faqItem?.question || faqItem?.q || '',
                answer: faqItem?.answer || faqItem?.a || ''
              };
            }).filter(f => f.question && f.answer)
          : [];
        return { ...data, faq } as SeoCollectionData;
      }

      // If alias was used, also try the original slug
      if (slugResolution?.aliasUsed && rawSlug) {
        const { data: origData, error: origErr } = await supabase
          .from('seo_collections')
          .select('*')
          .eq('slug', rawSlug)
          .eq('is_active', true)
          .single();
        if (!origErr && origData) {
          logCollectionResolution({
            requestedSlug: rawSlug,
            resolvedSlug: rawSlug,
            aliasUsed: false,
            matchResult: 'db_hit',
          });
          const rawFaq = origData.faq;
          const faq: FAQItem[] = Array.isArray(rawFaq)
            ? rawFaq.map((item: unknown) => {
                const faqItem = item as { question?: string; answer?: string; q?: string; a?: string };
                return { question: faqItem?.question || faqItem?.q || '', answer: faqItem?.answer || faqItem?.a || '' };
              }).filter(f => f.question && f.answer)
            : [];
          return { ...origData, faq } as SeoCollectionData;
        }
      }

      throw err || new Error('Collection not found in database');
    },
    enabled: !!slug && !isReserved,
    retry: false,
  });

  // Virtual collection fallback — if DB lookup fails and we have a virtual definition
  const virtualCollection = useMemo(() => {
    if (dbCollection || collectionLoading) return null;
    if (!slug) return null;
    const vc = getVirtualCollection(slug);
    if (vc) {
      logCollectionResolution({
        requestedSlug: rawSlug || '',
        resolvedSlug: slug,
        aliasUsed: slugResolution?.aliasUsed || false,
        matchResult: 'virtual',
      });
    }
    return vc;
  }, [dbCollection, collectionLoading, slug, rawSlug, slugResolution]);

  // Effective collection: DB hit or virtual fallback
  const collection: SeoCollectionData | null = dbCollection || (virtualCollection ? {
    id: `virtual-${virtualCollection.slug}`,
    slug: virtualCollection.slug,
    name: virtualCollection.name,
    primary_keyword: virtualCollection.primary_keyword,
    secondary_keywords: virtualCollection.secondary_keywords,
    seo_intro: virtualCollection.seo_intro,
    meta_title: virtualCollection.meta_title,
    meta_description: virtualCollection.meta_description,
    faq: virtualCollection.faq,
    related_blog_slug: virtualCollection.related_blog_slug,
    related_collection_slugs: virtualCollection.related_collection_slugs,
    product_category_filter: virtualCollection.product_category_filter,
    product_keyword_filter: virtualCollection.product_keyword_filter,
  } : null);

  // Fetch matching products — robust adaptive collection matching engine
  const { data: productMatch, isLoading: productsLoading } = useQuery({
    queryKey: ['seo-collection-products', collection?.id, collection?.slug],
    queryFn: async () => {
      if (!collection) {
        return {
          products: [] as CollectionProduct[],
          fallbackTriggered: false,
          appliedFilters: [],
          debug: { slug: '', primaryMatches: 0, fallbackMatches: 0 },
        };
      }

      const collectionConfig = getCollectionConfig(collection.slug);
      return resolveCollectionProducts(collection, collectionConfig);
    },
    enabled: !!collection,
  });

  // Species taxonomy filter — applies to cat/dog hub pages AND all dog-*/cat-* prefixed collections
  const isSpeciesCollection = slug === 'cat' || slug === 'dog' || slug === 'multi-pet';
  const isDogPrefixedCollection = slug?.startsWith('dog-') || slug?.startsWith('puppy-');
  const isCatPrefixedCollection = slug?.startsWith('cat-');
  const needsSpeciesFilter = isSpeciesCollection || isDogPrefixedCollection || isCatPrefixedCollection;
  const [includeMultiPet, setIncludeMultiPet] = useState(false); // STRICT mode: off by default

  const products = useMemo(() => {
    const raw = productMatch?.products || [];
    if (!needsSpeciesFilter || raw.length === 0) return raw;

    if (slug === 'multi-pet') {
      return raw.filter(p => {
        const dbSpecies = (p as any).primary_species;
        if (dbSpecies) return dbSpecies === 'both';
        const taxonomy = classifySpecies(p.name, p.category || '', []);
        return taxonomy.speciesPrimary === 'multi';
      });
    }

    // Determine target species from slug prefix or exact slug
    const targetSpecies: 'cat' | 'dog' = (slug === 'cat' || isCatPrefixedCollection) ? 'cat' : 'dog';
    const oppositeSpecies = targetSpecies === 'cat' ? 'dog' : 'cat';
    return raw.filter(p => {
      const dbSpecies = (p as any).primary_species as string | null;
      const category = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();

      // Hard-exclude products whose category explicitly belongs to the opposite species
      const oppositeKeywords = oppositeSpecies === 'dog'
        ? ['dog collar', 'dog leash', 'dog harness', 'dog training', 'dog bed', 'dog toy', 'dog crate', 'dog car']
        : ['cat tree', 'cat litter', 'cat condo', 'cat tower', 'cat scratching', 'cat furniture'];
      const hasCategoryConflict = oppositeKeywords.some(kw => category.includes(kw));
      if (hasCategoryConflict) return false;

      if (dbSpecies && dbSpecies !== 'unknown') {
        if (dbSpecies === targetSpecies) return true;
        if (dbSpecies === 'both') return true;
        return false;
      }
      const taxonomy = classifySpecies(name, category, []);
      if (taxonomy.speciesPrimary === targetSpecies) return true;
      if (taxonomy.speciesPrimary === 'multi') return true;
      return false;
    });
  }, [productMatch?.products, needsSpeciesFilter, slug, isDogPrefixedCollection, isCatPrefixedCollection, includeMultiPet]);

  // Infinite scroll for large catalogs (e.g. /collections/all)
  const { visibleItems, hasMore, isLoading: scrollLoading, loaderRef } = useInfiniteScroll({
    items: products,
    itemsPerPage: 24,
  });

  // "Related results" mode completely disabled — only real products shown

  // Preload first 2 product images for faster LCP
  useEffect(() => {
    if (products.length > 0) {
      products.slice(0, 2).forEach(p => {
        if (p.image_url) preloadCriticalImage(p.image_url);
      });
    }
  }, [products]);

  // Fetch related blog post
  const { data: relatedBlog } = useQuery({
    queryKey: ['seo-collection-blog', collection?.related_blog_slug],
    queryFn: async () => {
      if (!collection?.related_blog_slug) return null;

      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image')
        .eq('slug', collection.related_blog_slug)
        .eq('is_published', true)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!collection?.related_blog_slug,
  });

  // Determine if this is a sub-collection by checking if related_collection_slugs
  // contains a single parent pillar (sub-collections link UP to their pillar)
  const isSubCollection = (collection?.related_collection_slugs?.length === 1);
  const parentSlug = isSubCollection ? collection?.related_collection_slugs[0] : null;

  // Fetch parent collection for breadcrumb hierarchy
  const { data: parentCollection } = useQuery({
    queryKey: ['seo-collection-parent', parentSlug],
    queryFn: async () => {
      if (!parentSlug) return null;
      const { data, error } = await supabase
        .from('seo_collections')
        .select('slug, name')
        .eq('slug', parentSlug)
        .eq('is_active', true)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!parentSlug,
  });

  // Fetch sub-collections for pillar pages (pillar has multiple related slugs)
  const subCollectionSlugs = (!isSubCollection && collection?.related_collection_slugs?.length) 
    ? collection.related_collection_slugs : [];
  
  const { data: subCollections = [] } = useQuery({
    queryKey: ['seo-sub-collections', subCollectionSlugs],
    queryFn: async () => {
      if (subCollectionSlugs.length === 0) return [];
      const { data, error } = await supabase
        .from('seo_collections')
        .select('slug, name, primary_keyword, meta_description')
        .in('slug', subCollectionSlugs)
        .eq('is_active', true)
        .order('display_order');
      if (error) return [];
      return data;
    },
    enabled: subCollectionSlugs.length > 0,
  });

  // GUARD: If this slug has a dedicated static component, redirect there.
  if (isReserved && slug) {
    return <Navigate to={`/collections/${slug}`} replace />;
  }

  // If alias was used and the resolved slug differs from the URL, redirect to canonical
  if (slugResolution?.aliasUsed && rawSlug !== slug) {
    return <Navigate to={`/collections/${slug}`} replace />;
  }

  if (collectionLoading) {
    return (
      <Layout>
        <div className="container py-8">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-10 w-96 mb-4" />
          <Skeleton className="h-32 w-full mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!collection) {
    // NEVER redirect /collections/all to itself
    if (rawSlug === 'all') {
      return (
        <Layout>
          <div className="container py-16 text-center">
            <h2 className="text-2xl font-bold mb-4">All Products</h2>
            <p className="text-muted-foreground mb-6">Our catalog is loading. Please try again shortly.</p>
            <Button asChild><Link to="/">Back to Home</Link></Button>
          </div>
        </Layout>
      );
    }
    logCollectionResolution({
      requestedSlug: rawSlug || '',
      resolvedSlug: slug || '',
      aliasUsed: slugResolution?.aliasUsed || false,
      matchResult: 'not_found',
    });
    // Redirect unknown collection slugs to /products — never show "Collection Not Found"
    return <Navigate to="/products" replace />;
  }

  // Thin collection guard: show "no products found" message instead of redirecting to /collections/all
  // This prevents showing wrong products when a collection has few items
  const isAllRoute = rawSlug === 'all' || slug === 'all';
  const safeSlugs = new Set(['all', 'multi-pet', 'dog', 'cat', 'dogs', 'cats']);
  const isThinCollection = !isAllRoute && !productsLoading && products.length === 0 && !safeSlugs.has(slug || '') && !safeSlugs.has(rawSlug || '');
  if (isThinCollection) {
    return <Navigate to="/collections/all" replace />;
  }

  const collectionJsonLd = products.length > 0 ? generateCollectionJsonLd(collection, products) : null;
  
  // Merge DB FAQs with money collection FAQ fallbacks
  const moneyFaqs = getMoneyCollectionFAQs(collection.slug);
  const mergedFaqs = collection.faq.length > 0
    ? collection.faq
    : moneyFaqs.map(f => ({ question: f.question, answer: f.answer }));
  
  const faqJsonLd = mergedFaqs.length > 0 ? generateFAQJsonLd(mergedFaqs) : null;
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(collection, parentCollection);

  const comparisonData = getComparisonData(collection.slug);
  const tocItems = getCollectionTocItems(!!comparisonData, mergedFaqs.length > 0);
  const isPriorityCategory = !!comparisonData; // has comparison = priority category
  const domConfig = getDominationConfig(collection.slug);
  const isMoney = isMoneyCollection(collection.slug);

  // HowTo schema for domination pages
  const howToSchema = domConfig?.howTo ? {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: domConfig.howTo.name,
    description: domConfig.howTo.description,
    totalTime: domConfig.howTo.totalTime,
    step: domConfig.howTo.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  } : null;
  return (
    <Layout>
      <SectionErrorBoundary section="SeoCollection-scroll-progress">
        {(isPriorityCategory || domConfig) && <ScrollProgressIndicator />}
      </SectionErrorBoundary>
      <SectionErrorBoundary section="SeoCollection-sticky-nav">
      {domConfig && <StickyJumpNav items={domConfig.jumpNavItems} />}
      </SectionErrorBoundary>
      <Helmet>
        <title>{collection.meta_title || generateCollectionMetaTitle(collection.primary_keyword)}</title>
        <meta 
          name="description" 
          content={collection.meta_description || generateCollectionMetaDescription(collection.primary_keyword)} 
        />
        <meta 
          name="keywords" 
          content={[collection.primary_keyword, ...collection.secondary_keywords].join(', ')} 
        />{/* Thin collection guard: noindex collections with <3 products */}
        {products.length < 3 && (
          <>
            <meta name="robots" content="noindex, follow" />
            <meta name="googlebot" content="noindex, follow" />
          </>
        )}
        
        {/* Open Graph */}
        <meta property="og:title" content={collection.meta_title || collection.name} />
        <meta property="og:description" content={collection.meta_description || collection.seo_intro.substring(0, 155)} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://getpawsy.pet/collections/${collection.slug}`} />
        <meta property="og:site_name" content="GetPawsy" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={collection.meta_title || collection.name} />
        <meta name="twitter:description" content={collection.meta_description || collection.seo_intro.substring(0, 155)} />
        
        {collectionJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(collectionJsonLd)}
          </script>
        )}
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
        {faqJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(faqJsonLd)}
          </script>
        )}
        {howToSchema && (
          <script type="application/ld+json">
            {JSON.stringify(howToSchema)}
          </script>
        )}
      </Helmet>

      <div className="container py-8 md:py-12">
        {/* Breadcrumbs */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">Home</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/products">Products</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {parentCollection && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/collections/${parentCollection.slug}`}>
                      {parentCollection.name.replace(/\s–.*$/, '')}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{collection.name.replace(/\s–.*$/, '')}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Section A: Ultra-compact Header — max 40vh on mobile */}
        <header className="mb-3 md:mb-6 max-h-[40vh] overflow-hidden">
          <Badge variant="secondary" className="mb-2">
            {collection.primary_keyword}
          </Badge>
          <h1 className="text-2xl md:text-4xl font-display font-bold mb-1">
            {collection.name}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-3xl line-clamp-2">
            {(collection.meta_description || collection.seo_intro || '').substring(0, 300).replace(/<[^>]*>/g, '')}
          </p>
        </header>

        {/* Trust strip — CI-10 hairline row (matches CI-7 hero / CI-8 cart).
            Flip premiumCollection to false to restore the legacy bordered chip row. */}
        {getConversionFlag('premiumCollection') ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 mb-3 border-y border-border/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5"><Truck className="w-3 h-3" /> Free US shipping over $35</span>
            <span className="hidden sm:inline text-border">·</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="w-3 h-3" /> 30-day returns</span>
            <span className="hidden sm:inline text-border">·</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Secure checkout</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 md:gap-6 py-2 px-3 mb-3 rounded-lg bg-secondary/20 border border-secondary/40 text-xs text-secondary-foreground">
            <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-primary" /> Free Shipping on Orders $35+</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5 text-primary" /> 30-Day Returns</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> Secure Checkout</span>
          </div>
        )}

        <SectionErrorBoundary section="SeoCollection-cluster-intro">
          <CollectionClusterIntro
            collectionName={collection.name}
            collectionSlug={collection.slug}
          />
        </SectionErrorBoundary>

        <div id="product-grid" />
        <section id="products" className="mb-8 md:mb-12">
          <div className="flex items-end justify-between mb-3 md:mb-6">
            <h2 className={
              getConversionFlag('premiumCollection')
                ? 'text-lg md:text-2xl font-display font-semibold tracking-tight'
                : 'text-lg md:text-2xl font-semibold'
            }>
              Shop {collection.name.replace(/\s–.*$/, '')}
            </h2>
            <span className={
              getConversionFlag('premiumCollection')
                ? 'text-muted-foreground text-[11px] md:text-xs uppercase tracking-wider tabular-nums'
                : 'text-muted-foreground text-xs md:text-sm'
            }>
              {products.length} {getConversionFlag('premiumCollection') ? 'items · Sorted by best match' : 'products'}
            </span>
          </div>

          {/* Species filter toggle for cat/dog collections */}
          {isSpeciesCollection && slug !== 'multi-pet' && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setIncludeMultiPet(!includeMultiPet)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  includeMultiPet
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted border-border text-muted-foreground'
                }`}
              >
                🐾 {includeMultiPet ? 'Includes multi-pet items' : 'Include multi-pet items'}
              </button>
            </div>
          )}


          {productsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
                {visibleItems.map((product, index) => (
                  <div key={product.id}>
                    <ProductCard
                      product={{
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        compare_at_price: product.compare_at_price,
                        image_url: product.image_url,
                        category: product.category,
                        slug: product.slug,
                        stock: product.stock,
                        created_at: product.created_at,
                        updated_at: product.updated_at
                      }}
                      listId="seo-collection"
                      listName={collection.name}
                      position={index + 1}
                      popularChoice={isPriorityCategory && index < 3 && (product.stock ?? 0) > 0}
                      showSpeciesBadge={isSpeciesCollection}
                      species={(() => {
                        const dbSpecies = (product as any).primary_species as string | null;
                        if (dbSpecies === 'dog') return 'dog';
                        if (dbSpecies === 'cat') return 'cat';
                        if (dbSpecies === 'both') return 'both';
                        const taxonomy = classifySpecies(product.name, product.category || '', []);
                        if (taxonomy.speciesPrimary === 'multi') return 'both';
                        return taxonomy.speciesPrimary === 'cat' || taxonomy.speciesPrimary === 'dog' ? taxonomy.speciesPrimary : 'unknown';
                      })()}
                    />
                    {isMoney && (
                      <div className="px-2 pb-2">
                        <CollectionCROBadges
                          collectionSlug={collection.slug}
                          productName={product.name}
                          productPrice={product.price}
                        />
                        
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Infinite scroll loader — CI-10 calmer hairline divider when v2 on. */}
              {hasMore && (
                getConversionFlag('premiumCollection') ? (
                  <div ref={loaderRef} className="relative flex items-center justify-center py-10">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-border/50" aria-hidden="true" />
                    <span className="relative bg-background px-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {scrollLoading ? 'Loading…' : 'More below'}
                    </span>
                  </div>
                ) : (
                  <div ref={loaderRef} className="flex justify-center py-8">
                    {scrollLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        Loading more products...
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Scroll for more</span>
                    )}
                  </div>
                )
              )}

              {/* CRO: Mini comparison table after first 4 products */}
              {isMoney && products.length >= 4 && (
                <CollectionMiniComparison products={products} collectionSlug={collection.slug} />
              )}
            </>
          ) : (
            <div className="text-center py-12 bg-muted/30 rounded-2xl">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                We're updating this collection
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                New products are being added to this collection. In the meantime, explore our most popular categories below.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button asChild variant="default">
                  <Link to="/dog">Shop Dog Products</Link>
                </Button>
                <Button asChild variant="default">
                  <Link to="/cat">Shop Cat Products</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/bestsellers">View Bestsellers</Link>
                </Button>
              </div>
              <nav className="mt-8 text-left max-w-md mx-auto" aria-label="Popular collections">
                <h3 className="text-sm font-medium text-foreground mb-3">Popular Collections</h3>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <li><Link to="/collections/cat-trees-and-condos" className="text-primary hover:underline">Cat Trees & Condos</Link></li>
                  <li><Link to="/collections/cat-litter-boxes" className="text-primary hover:underline">Cat Litter Boxes</Link></li>
                  <li><Link to="/collections/dog-beds" className="text-primary hover:underline">Dog Beds</Link></li>
                  <li><Link to="/guides/dog-travel-essentials-guide" className="text-primary hover:underline">Dog Travel Guide</Link></li>
                  <li><Link to="/collections/dog-toys" className="text-primary hover:underline">Dog Toys</Link></li>
                  <li><Link to="/collections/cat-scratching-posts" className="text-primary hover:underline">Cat Scratching Posts</Link></li>
                </ul>
              </nav>
            </div>
          )}
        </section>

        {/* ── SEO GUIDE CONTENT — below products, always collapsed ── */}
        {collection.seo_intro && collection.seo_intro.length > 200 && (
          <section id="seo-content" className="mb-12">
            <Accordion type="single" collapsible>
              <AccordionItem value="guide-content" className="border rounded-xl">
                <AccordionTrigger className="px-5 py-4 text-lg font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    Buying Guide: {collection.name.replace(/\s–.*$/, '')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-6">
                  <div 
                    className="text-muted-foreground text-base leading-relaxed max-w-4xl prose prose-headings:text-foreground prose-headings:font-display prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2 prose-p:mb-4 prose-a:text-primary prose-a:underline prose-strong:text-foreground"
                    dangerouslySetInnerHTML={{ 
                      __html: sanitizeHtml(collection.seo_intro
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                        .replace(/\n\n/g, '</p><p>')
                        .replace(/^(?!<[h|s])(.+)/gm, (match) => match.startsWith('<') ? match : `<p>${match}</p>`)
                        .replace(/<p><\/p>/g, ''))
                    }}
                  />
                  {/* Secondary Keywords as Tags */}
                  {collection.secondary_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {collection.secondary_keywords.slice(0, 5).map((keyword) => (
                        <Badge key={keyword} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        )}

        <SectionErrorBoundary section="SeoCollection-domination-blocks">
          {/* Domination: Featured Snippet Block */}
          {domConfig && (
            <FeaturedSnippetBlock
              directAnswer={domConfig.directAnswer}
              bulletUSPs={domConfig.bulletUSPs}
              quickComparison={domConfig.quickComparison}
            />
          )}

          {/* Expert Block + Comparison for priority categories */}
          {isPriorityCategory && (
            <ExpertBlock categoryName={collection.name.replace(/\s–.*$/, '')} />
          )}
          {comparisonData && (
            <div id="comparison">
              <ComparisonTable title={comparisonData.title} rows={comparisonData.rows} />
            </div>
          )}

          {/* Cat Trees Hub: authority content — BELOW products */}
          {collection.slug === 'cat-trees-and-condos' && <CatTreesHubContent />}
          {collection.slug === 'dog-beds' && <DogBedsHubContent />}

          {/* Training Collection Cross-Links — bidirectional silo linking */}
          {TRAINING_COLLECTION_SLUGS.includes(collection.slug) && (
            <TrainingCollectionCrossLinks currentSlug={collection.slug} />
          )}

          {/* Expert Guides — curated guide links for this collection */}
          <div id="expert-guides">
            <CollectionExpertGuides collectionSlug={collection.slug} />
          </div>
        </SectionErrorBoundary>

        {/* Sub-Category Navigation — "Explore by Type" (pillar pages only) */}
        {subCollections.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">
              Explore {collection.name.replace(/\s–.*$/, '')} by Type
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subCollections.map((sub) => (
                <Link
                  key={sub.slug}
                  to={`/collections/${sub.slug}`}
                  className="group block bg-card border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                    {sub.name.replace(/\s–.*$/, '')}
                  </h3>
                  {sub.primary_keyword && (
                    <span className="text-xs text-muted-foreground/70 italic block mb-1">
                      {sub.primary_keyword}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {sub.meta_description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-primary text-xs mt-2">
                    Shop Now <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <SectionErrorBoundary section="SeoCollection-related-categories">
          <RelatedCategoriesBlock collectionSlug={collection.slug} />
        </SectionErrorBoundary>

        {/* Back to Pillar (sub-collection pages only) */}
        {parentCollection && (
          <div className="mb-8">
            <Link
              to={`/collections/${parentCollection.slug}`}
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ChevronRight className="w-3 h-3 rotate-180" />
              View all {parentCollection.name.replace(/\s–.*$/, '')}
            </Link>
          </div>
        )}
        {/* Featured Snippet Block */}
        <section className="mb-12 max-w-4xl">
          <h2 className="text-2xl font-semibold mb-3">
            What Is the Best {collection.name.replace(/^Best\s+/i, '')} in 2026?
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            The best {collection.primary_keyword} in 2026 combines durability, pet safety, and excellent value. Our top picks are selected by analyzing verified customer reviews, return rates, and real sales data from US pet owners. Browse our curated selection above to find the perfect match for your pet's needs and your budget.
          </p>
        </section>

        <SectionErrorBoundary section="SeoCollection-paa-midcta">
          {/* Domination: PAA Expansion Section */}
          {domConfig && domConfig.paaQuestions.length > 0 && (
            <PAASection questions={domConfig.paaQuestions} />
          )}

          {/* Domination: Mid-Content CTA */}
          {domConfig && (
            <MidContentCTA
              headline={`Find the Best ${collection.name.replace(/^Best\s+/i, '').replace(/\s–.*$/, '')} for Your Pet`}
              subtext="Browse our curated selection — every product is quality-tested with free shipping on eligible orders over $35."
              ctaText="Shop Now"
              ctaHref="#products"
            />
          )}
        </SectionErrorBoundary>

        {/* Section C: Mini FAQ */}
        {mergedFaqs.length > 0 && (
          <section id="faq" className="mb-12 bg-muted/30 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-6">
              <HelpCircle className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-semibold">
                Frequently Asked Questions
              </h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {mergedFaqs.map((item, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        <SectionErrorBoundary section="SeoCollection-bottom-sections">
          {/* Soft Email Capture for SEO Traffic */}
          <SoftEmailCapture 
            variant="collection" 
            className="mb-12"
          />

          {/* Related Guides — dynamic keyword-matched blog posts */}
          <CategoryRelatedGuides 
            categoryName={collection.name}
            categorySlug={collection.slug}
            primaryKeyword={collection.primary_keyword}
          />

          {/* Popular in this Category — best-selling products with anchor variation */}
          <CategoryPopularProducts 
            categoryName={collection.name}
            products={products}
          />

          {/* Cluster Links — contextual paragraph linking to supporting pages */}
          <CategoryClusterLinks 
            categoryName={collection.name}
            categorySlug={collection.slug}
            relatedSlugs={collection.related_collection_slugs}
            subCollections={subCollections}
          />

          {/* Cross-Collection Links — money collection cross-linking */}
          <CrossCollectionLinks currentSlug={collection.slug} />
        </SectionErrorBoundary>

        {/* Section D: Internal Links */}
        <section className="grid md:grid-cols-2 gap-6">
          {/* Related Blog Article */}
          {relatedBlog && (
            <Link 
              to={`/blog/${relatedBlog.slug}`}
              className="group block bg-card border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
            >
              {relatedBlog.featured_image && (
                <div className="aspect-video overflow-hidden">
                  <img 
                    src={relatedBlog.featured_image} 
                    alt={relatedBlog.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <BookOpen className="w-4 h-4" />
                  <span className="text-sm font-medium">Related Guide</span>
                </div>
                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                  {relatedBlog.title}
                </h3>
                <p className="text-muted-foreground text-sm line-clamp-2">
                  {relatedBlog.excerpt}
                </p>
                <span className="inline-flex items-center gap-1 text-primary text-sm mt-3">
                  Read Article <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          )}

          {/* Browse More */}
          <Link 
            to="/products"
            className="group flex flex-col justify-center items-center bg-primary/5 border border-primary/20 rounded-2xl p-8 hover:bg-primary/10 transition-colors"
          >
            <Package className="w-10 h-10 text-primary mb-4" />
            <h3 className="font-semibold text-lg mb-2">
              Explore More Products
            </h3>
            <p className="text-muted-foreground text-sm text-center mb-4">
              Browse our full catalog of premium pet supplies
            </p>
            <span className="inline-flex items-center gap-2 text-primary font-medium">
              View All Products <ChevronRight className="w-4 h-4" />
            </span>
          </Link>
        </section>

        {/* Global Trust Block */}
        <WhyGetPawsy className="mt-8" />
      </div>
    </Layout>
  );
};

export default SeoCollection;