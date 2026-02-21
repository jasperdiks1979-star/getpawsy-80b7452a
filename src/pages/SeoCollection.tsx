import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
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
import { CategoryPopularProducts } from '@/components/seo/CategoryPopularProducts';
import { CategoryClusterLinks } from '@/components/seo/CategoryClusterLinks';

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

interface CollectionProduct {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  slug: string | null;
  category: string | null;
  stock: number | null;
  created_at: string;
  updated_at: string;
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
        name: product.name,
        image: product.image_url,
        offers: {
          '@type': 'Offer',
          price: product.price.toFixed(2),
          priceCurrency: 'USD',
          // DROPSHIPPING MODEL: Use centralized availability logic
          availability: getSchemaAvailability(product)
        }
      }
    }))
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

const SeoCollection = () => {
  const { slug } = useParams<{ slug: string }>();

  // Fetch collection data
  const { data: collection, isLoading: collectionLoading, error } = useQuery({
    queryKey: ['seo-collection', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seo_collections')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      
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
    },
    enabled: !!slug,
  });

  // Fetch matching products — keyword-first approach for accuracy
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['seo-collection-products', collection?.id],
    queryFn: async () => {
      if (!collection) return [];

      const hasCategory = !!collection.product_category_filter;
      const hasKeywords = !!collection.product_keyword_filter;
      const keywords = hasKeywords
        ? collection.product_keyword_filter!.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
        : [];

      // Infer pet type from collection name/slug for cross-contamination prevention
      const collName = (collection.name + ' ' + collection.slug).toLowerCase();
      const isDogCollection = collName.includes('dog') && !collName.includes('cat');
      const isCatCollection = collName.includes('cat') && !collName.includes('dog');

      const petTypeFilter = <T extends { name: string; category: string | null }>(items: T[]): T[] => {
        if (!isDogCollection && !isCatCollection) return items;
        return items.filter(p => {
          const pName = p.name.toLowerCase();
          const pCat = (p.category || '').toLowerCase();
          if (isDogCollection) {
            return !pCat.includes('cat') && !pCat.includes('bird') && !pCat.includes('hamster') &&
                   !pCat.includes('guinea') && !pCat.includes('rabbit') &&
                   !(pName.includes('cat ') || pName.startsWith('cat '));
          }
          if (isCatCollection) {
            return !pCat.includes('dog') && !pCat.includes('bird') && !pCat.includes('hamster') &&
                   !pCat.includes('guinea') && !pCat.includes('rabbit') &&
                   !(pName.includes('dog ') || pName.startsWith('dog '));
          }
          return true;
        });
      };

      // Relevance scoring: multi-word keywords score higher, require minimum threshold
      const scoreProduct = (pName: string): number => {
        let score = 0;
        for (const kw of keywords) {
          if (pName.includes(kw)) {
            // Multi-word keywords are more specific = higher score
            score += kw.includes(' ') ? 3 : 1;
          }
        }
        return score;
      };

      // Strategy: If we have keywords, build an OR filter on product name
      if (hasKeywords && !hasCategory) {
        const { data, error } = await supabase
          .from('products_public')
          .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at')
          .eq('is_active', true)
          .eq('is_duplicate', false)
          .limit(500);

        if (error) {
          console.error('Error fetching products:', error);
          return [];
        }

        // Score each product and require minimum relevance
        let scored = (data || [])
          .map(product => ({ ...product, _score: scoreProduct(product.name.toLowerCase()) }))
          .filter(p => p._score > 0);

        // Apply pet-type safety filter
        scored = petTypeFilter(scored);

        // Sort: highest relevance first, then in-stock, then newest
        scored.sort((a, b) => {
          if (b._score !== a._score) return b._score - a._score;
          const aStock = (a.stock ?? 0) > 0 ? 0 : 1;
          const bStock = (b.stock ?? 0) > 0 ? 0 : 1;
          if (aStock !== bStock) return aStock - bStock;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return scored.slice(0, 24) as CollectionProduct[];
      }

      // Category-based query
      let query = supabase
        .from('products_public')
        .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at')
        .eq('is_active', true)
        .eq('is_duplicate', false);

      if (hasCategory) {
        query = query.ilike('category', `%${collection.product_category_filter}%`);
      }

      const { data, error } = await query.limit(hasKeywords ? 200 : 24);

      if (error) {
        console.error('Error fetching products:', error);
        return [];
      }

      let filteredProducts = data || [];

      // Apply keyword filter if both category and keywords specified
      if (hasKeywords) {
        filteredProducts = filteredProducts.filter(product => {
          const pName = product.name.toLowerCase();
          return keywords.some(kw => pName.includes(kw));
        });
      }

      // Apply pet-type safety filter
      filteredProducts = petTypeFilter(filteredProducts);

      // Sort: in-stock first, then by created_at desc
      filteredProducts.sort((a, b) => {
        const aStock = (a.stock ?? 0) > 0 ? 0 : 1;
        const bStock = (b.stock ?? 0) > 0 ? 0 : 1;
        if (aStock !== bStock) return aStock - bStock;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return filteredProducts.slice(0, 24) as CollectionProduct[];
    },
    enabled: !!collection,
  });

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

  if (error || !collection) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-4">Collection Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The collection you're looking for doesn't exist or has been removed.
          </p>
          <Button asChild>
            <Link to="/products">Browse All Products</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const collectionJsonLd = generateCollectionJsonLd(collection, products);
  const faqJsonLd = collection.faq.length > 0 ? generateFAQJsonLd(collection.faq) : null;
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(collection, parentCollection);

  return (
    <Layout>
      <Helmet>
        <title>{collection.meta_title || generateCollectionMetaTitle(collection.primary_keyword)}</title>
        <meta 
          name="description" 
          content={collection.meta_description || generateCollectionMetaDescription(collection.primary_keyword)} 
        />
        <meta 
          name="keywords" 
          content={[collection.primary_keyword, ...collection.secondary_keywords].join(', ')} 
        />
        <link rel="canonical" href={`https://getpawsy.pet/collections/${collection.slug}`} />
        
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
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(collectionJsonLd)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
        {faqJsonLd && (
          <script type="application/ld+json">
            {JSON.stringify(faqJsonLd)}
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

        {/* Section A: SEO Intro */}
        <header className="mb-10">
          <Badge variant="secondary" className="mb-4">
            {collection.primary_keyword}
          </Badge>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {collection.name}
          </h1>
          <div 
            className="text-muted-foreground text-base leading-relaxed max-w-4xl prose prose-headings:text-foreground prose-headings:font-display prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2 prose-p:mb-4"
            dangerouslySetInnerHTML={{ 
              __html: collection.seo_intro
                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/^(?!<[h])(.+)/gm, (match) => match.startsWith('<') ? match : `<p>${match}</p>`)
                .replace(/<p><\/p>/g, '')
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
        </header>

        {/* Section B: Product Grid */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">
              Shop {collection.name}
            </h2>
            <span className="text-muted-foreground text-sm">
              {products.length} products
            </span>
          </div>

          {productsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map((product, index) => (
                <ProductCard
                  key={product.id}
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
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-muted/30 rounded-2xl">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Products coming soon! Check back later.
              </p>
              <Button asChild className="mt-4">
                <Link to="/products">Browse All Products</Link>
              </Button>
            </div>
          )}
        </section>

        {/* Sub-Category Navigation (pillar pages only) */}
        {subCollections.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Browse by Type</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {subCollections.map((sub) => (
                <Link
                  key={sub.slug}
                  to={`/collections/${sub.slug}`}
                  className="group block bg-card border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                    {sub.name.replace(/\s–.*$/, '')}
                  </h3>
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

        {/* Trust Reinforcement */}
        <section className="mb-12 grid sm:grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-5 text-center">
            <Truck className="w-6 h-6 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">Free US Shipping</h3>
            <p className="text-xs text-muted-foreground">On orders over $35</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <RotateCcw className="w-6 h-6 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">30-Day Returns</h3>
            <p className="text-xs text-muted-foreground">Hassle-free, no questions asked</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <ShieldCheck className="w-6 h-6 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">Pet-Safe Guarantee</h3>
            <p className="text-xs text-muted-foreground">Quality tested for safety</p>
          </div>
        </section>

        {/* Section C: Mini FAQ */}
        {collection.faq.length > 0 && (
          <section className="mb-12 bg-muted/30 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-6">
              <HelpCircle className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-semibold">
                Frequently Asked Questions
              </h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {collection.faq.map((item, index) => (
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
      </div>
    </Layout>
  );
};

export default SeoCollection;