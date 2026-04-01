import { Helmet } from 'react-helmet-async';
import { getKeywordsForCategory, SEO_KEYWORDS } from '@/lib/seo-keywords';

interface CategorySchemaProps {
  categoryName?: string;
  searchQuery?: string;
  productCount: number;
  baseUrl?: string;
  products?: Array<{
    id: string;
    name: string;
    slug?: string | null;
    price: number;
    image_url?: string | null;
  }>;
}

export function CategorySchema({
  categoryName,
  searchQuery,
  productCount,
  baseUrl = 'https://getpawsy.pet',
  products = [],
}: CategorySchemaProps) {
  const isSearch = !!searchQuery;
  const pageTitle = isSearch
    ? `Search: "${searchQuery}" | GetPawsy Pet Products`
    : categoryName
      ? `${categoryName} | GetPawsy Pet Products & Supplies`
      : 'All Pet Products | GetPawsy - Premium Pet Supplies';

  const pageDescription = isSearch
    ? `Found ${productCount} products for "${searchQuery}". Shop premium pet supplies at GetPawsy with free US shipping on orders over $35.`
    : categoryName
      ? `Shop our collection of ${productCount}+ ${categoryName.toLowerCase()} at GetPawsy. Premium quality ${categoryName.toLowerCase()} for your beloved pets. Free shipping on eligible orders over $35, vet-approved products.`
      : `Browse ${productCount}+ premium pet products at GetPawsy. Quality dog beds, cat trees, pet toys, collars, and more. Free shipping on eligible orders over $35.`;

  const keywords = categoryName
    ? getKeywordsForCategory(categoryName).slice(0, 20)
    : [...SEO_KEYWORDS.primary, ...SEO_KEYWORDS.trending.slice(0, 10)];

  // CRITICAL: Canonical URLs must be CLEAN - no query parameters
  // All category pages canonicalize to /products (the single indexable category page)
  // Search and filtered views also canonicalize to /products
  const canonicalUrl = `${baseUrl}/products`;

  // Enhanced Collection Schema with ItemList
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonicalUrl}#collectionpage`,
    name: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    numberOfItems: productCount,
    isPartOf: { '@id': `${baseUrl}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      '@id': `${canonicalUrl}#itemlist`,
      numberOfItems: productCount,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      ...(products.length > 0 && {
        itemListElement: products.slice(0, 10).map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Product',
            '@id': `${baseUrl}/product/${product.slug || product.id}#product`,
            name: product.name,
            url: `${baseUrl}/product/${product.slug || product.id}`,
            ...(product.image_url && { image: product.image_url }),
            offers: {
              '@type': 'Offer',
              price: product.price.toFixed(2),
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
            },
          },
        })),
      }),
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: baseUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Products',
          item: `${baseUrl}/products`,
        },
        ...(categoryName ? [{
          '@type': 'ListItem',
          position: 3,
          name: categoryName,
          item: canonicalUrl,
        }] : []),
      ],
    },
  };

  // OfferCatalog Schema for category pages
  const offerCatalogSchema = categoryName ? {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    '@id': `${canonicalUrl}#offercatalog`,
    name: `${categoryName} - GetPawsy`,
    itemListElement: products.slice(0, 5).map((product) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Product',
        name: product.name,
        url: `${baseUrl}/product/${product.slug || product.id}`,
      },
      price: product.price.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    })),
  } : null;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={keywords.join(', ')} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Hreflang Tags */}
      <link rel="alternate" hrefLang="en" href={canonicalUrl} />
      <link rel="alternate" hrefLang="en-US" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />

      {/* Robots — search pages noindex; category/collection pages must be indexable for GMC */}
      <meta name="robots" content={isSearch ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content="GetPawsy" />
      <meta property="og:image" content={`${baseUrl}/og-image.png`} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={`${baseUrl}/og-image.png`} />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(collectionSchema)}
      </script>
      {offerCatalogSchema && (
        <script type="application/ld+json">
          {JSON.stringify(offerCatalogSchema)}
        </script>
      )}
    </Helmet>
  );
}
