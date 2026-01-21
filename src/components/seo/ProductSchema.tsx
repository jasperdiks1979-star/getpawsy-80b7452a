import { Helmet } from 'react-helmet-async';
import { generateProductKeywords, generateMetaDescription } from '@/lib/seo-keywords';

interface ProductSchemaProps {
  product: {
    id: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    price: number;
    compare_at_price?: number | null;
    image_url?: string | null;
    images?: string[] | null;
    category?: string | null;
    stock?: number | null;
    sku?: string | null;
  };
  reviews?: Array<{
    rating: number;
    title?: string;
    content?: string | null;
  }>;
  baseUrl?: string;
}

export function ProductSchema({ 
  product, 
  reviews = [],
  baseUrl = 'https://getpawsy.pet'
}: ProductSchemaProps) {
  // Clean description from HTML
  const cleanDescription = product.description
    ?.replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || `Premium ${product.name} for your beloved pet. Shop quality pet products at GetPawsy.`;

  // Calculate aggregate rating
  const hasReviews = reviews.length > 0;
  const aggregateRating = hasReviews
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;

  // Generate keywords
  const keywords = generateProductKeywords(
    product.name,
    product.category || '',
    product.description || ''
  );

  // Generate meta description
  const metaDescription = generateMetaDescription(
    product.name,
    product.price,
    product.category || undefined
  );

  // Product images
  const images = product.images?.filter(Boolean) || [];
  const primaryImage = images[0] || product.image_url || `${baseUrl}/og-image.png`;

  // Use slug for SEO-friendly URLs, fallback to id
  const productPath = product.slug || product.id;

  // Truncate product name for Google (max 150 chars recommended)
  const truncatedName = product.name.length > 150 
    ? product.name.slice(0, 147) + '...' 
    : product.name;

  // JSON-LD Product Schema
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: truncatedName,
    description: cleanDescription,
    image: images.length > 0 ? images : [primaryImage],
    sku: product.sku || product.id,
    mpn: product.id,
    brand: {
      '@type': 'Brand',
      name: 'GetPawsy',
    },
    category: product.category || 'Pet Supplies',
    offers: {
      '@type': 'Offer',
      url: `${baseUrl}/product/${productPath}`,
      priceCurrency: 'USD',
      price: product.price.toFixed(2),
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      availability: (product.stock ?? 0) > 0 
        ? 'https://schema.org/InStock' 
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'GetPawsy',
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
        returnPolicySeasonalOverride: undefined,
      },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: '0',
          currency: 'USD',
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'US',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 2,
            unitCode: 'DAY',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: 5,
            maxValue: 14,
            unitCode: 'DAY',
          },
        },
      },
    },
    ...(hasReviews && aggregateRating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: aggregateRating.toFixed(1),
        reviewCount: reviews.length,
        bestRating: '5',
        worstRating: '1',
      },
      review: reviews.slice(0, 5).map((review) => ({
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: '5',
          worstRating: '1',
        },
        name: review.title,
        reviewBody: review.content,
      })),
    }),
  };

  // BreadcrumbList Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
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
      ...(product.category ? [{
        '@type': 'ListItem',
        position: 3,
        name: product.category,
        item: `${baseUrl}/products?category=${encodeURIComponent(product.category)}`,
      }] : []),
      {
        '@type': 'ListItem',
        position: product.category ? 4 : 3,
        name: product.name,
        item: `${baseUrl}/product/${productPath}`,
      },
    ],
  };

  const productUrl = `${baseUrl}/product/${productPath}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{`${product.name} | GetPawsy - Premium Pet Products`}</title>
      <meta name="description" content={metaDescription} />
      <meta name="keywords" content={keywords.join(', ')} />
      <link rel="canonical" href={productUrl} />

      {/* Hreflang Tags for International SEO */}
      <link rel="alternate" hrefLang="en" href={productUrl} />
      <link rel="alternate" hrefLang="en-US" href={productUrl} />
      <link rel="alternate" hrefLang="x-default" href={productUrl} />

      {/* Open Graph */}
      <meta property="og:type" content="product" />
      <meta property="og:title" content={`${product.name} | GetPawsy`} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={primaryImage} />
      <meta property="og:url" content={productUrl} />
      <meta property="og:site_name" content="GetPawsy" />
      <meta property="product:price:amount" content={product.price.toString()} />
      <meta property="product:price:currency" content="USD" />
      <meta property="product:availability" content={(product.stock ?? 0) > 0 ? 'in stock' : 'out of stock'} />
      {product.category && <meta property="product:category" content={product.category} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${product.name} | GetPawsy`} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={primaryImage} />

      {/* Robots */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(productSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </script>
    </Helmet>
  );
}
