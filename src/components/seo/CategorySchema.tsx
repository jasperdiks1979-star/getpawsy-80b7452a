import { Helmet } from 'react-helmet-async';
import { getKeywordsForCategory, SEO_KEYWORDS } from '@/lib/seo-keywords';

interface CategorySchemaProps {
  categoryName?: string;
  searchQuery?: string;
  productCount: number;
  baseUrl?: string;
}

export function CategorySchema({
  categoryName,
  searchQuery,
  productCount,
  baseUrl = 'https://getpawsy.lovable.app',
}: CategorySchemaProps) {
  const isSearch = !!searchQuery;
  const pageTitle = isSearch
    ? `Search: "${searchQuery}" | GetPawsy Pet Products`
    : categoryName
      ? `${categoryName} | GetPawsy Pet Products & Supplies`
      : 'All Pet Products | GetPawsy - Premium Pet Supplies';

  const pageDescription = isSearch
    ? `Found ${productCount} products for "${searchQuery}". Shop premium pet supplies at GetPawsy with free shipping on orders over $50.`
    : categoryName
      ? `Shop our collection of ${productCount}+ ${categoryName.toLowerCase()} at GetPawsy. Premium quality ${categoryName.toLowerCase()} for your beloved pets. Free shipping, vet-approved products.`
      : `Browse ${productCount}+ premium pet products at GetPawsy. Quality dog beds, cat trees, pet toys, collars, and more. Free shipping on orders over $50.`;

  const keywords = categoryName
    ? getKeywordsForCategory(categoryName).slice(0, 20)
    : [...SEO_KEYWORDS.primary, ...SEO_KEYWORDS.trending.slice(0, 10)];

  const canonicalUrl = isSearch
    ? `${baseUrl}/products?search=${encodeURIComponent(searchQuery!)}`
    : categoryName
      ? `${baseUrl}/products?category=${encodeURIComponent(categoryName)}`
      : `${baseUrl}/products`;

  // Collection Schema for product listing
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    numberOfItems: productCount,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: productCount,
      itemListOrder: 'https://schema.org/ItemListUnordered',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
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

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={keywords.join(', ')} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Robots */}
      <meta name="robots" content={isSearch ? 'noindex, follow' : 'index, follow'} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content="GetPawsy" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(collectionSchema)}
      </script>
    </Helmet>
  );
}
