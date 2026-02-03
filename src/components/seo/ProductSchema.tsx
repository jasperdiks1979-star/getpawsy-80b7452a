import { Helmet } from 'react-helmet-async';
import { generateProductKeywords, generateMetaDescription } from '@/lib/seo-keywords';
import { FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_RATE } from '@/lib/shipping-constants';

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
  // Reviews prop kept for API compatibility but not used in schema
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reviews = [],
  baseUrl = 'https://getpawsy.pet'
}: ProductSchemaProps) {
  // Clean description from HTML
  const cleanDescription = product.description
    ?.replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || `Premium ${product.name} for your beloved pet. Shop quality pet products at GetPawsy.`;

  // NOTE: Reviews/ratings intentionally removed from structured data
  // Google requires real customer reviews - no placeholders or fake data
  // Will be re-enabled when real review system is implemented

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

  // JSON-LD Product Schema with enhanced trust signals
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${baseUrl}/product/${productPath}#product`,
    name: truncatedName,
    description: cleanDescription,
    image: images.length > 0 ? images : [primaryImage],
    sku: product.sku || product.id,
    mpn: product.id,
    gtin12: undefined, // Can be added if available
    brand: {
      '@type': 'Brand',
      name: 'GetPawsy',
      logo: `${baseUrl}/favicon.png`,
    },
    manufacturer: {
      '@type': 'Organization',
      name: 'GetPawsy',
      url: baseUrl,
    },
    category: product.category || 'Pet Supplies',
    audience: {
      '@type': 'PeopleAudience',
      suggestedMinAge: '18',
      audienceType: 'Pet Owners',
    },
    isRelatedTo: {
      '@type': 'Product',
      name: 'Pet Supplies',
    },
    offers: {
      '@type': 'Offer',
      '@id': `${baseUrl}/product/${productPath}#offer`,
      url: `${baseUrl}/product/${productPath}`,
      priceCurrency: 'USD',
      price: product.price.toFixed(2),
      // Use a fixed future date for stability (Google recommends at least 1 year)
      priceValidUntil: '2027-12-31',
      availability: (product.stock ?? 0) > 0 
        ? 'https://schema.org/InStock' 
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'GetPawsy',
        url: baseUrl,
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        '@id': `${baseUrl}/#returnpolicy`,
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
      // Shipping details - reflects actual policy: Free over $35, $5.99 flat rate under $35
      shippingDetails: [
        {
          '@type': 'OfferShippingDetails',
          '@id': `${baseUrl}/#shipping-free`,
          shippingRate: {
            '@type': 'MonetaryAmount',
            value: '0.00',
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
              minValue: 3,
              maxValue: 7,
              unitCode: 'DAY',
            },
          },
          // Free shipping applies to orders over $35
          shippingLabel: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}`,
        },
        {
          '@type': 'OfferShippingDetails',
          '@id': `${baseUrl}/#shipping-flat`,
          shippingRate: {
            '@type': 'MonetaryAmount',
            value: FLAT_SHIPPING_RATE.toFixed(2),
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
              minValue: 3,
              maxValue: 7,
              unitCode: 'DAY',
            },
          },
          // Flat rate for orders under $35
          shippingLabel: `Flat rate $${FLAT_SHIPPING_RATE.toFixed(2)} for orders under $${FREE_SHIPPING_THRESHOLD}`,
        },
      ],
    },
    // NOTE: aggregateRating and review fields intentionally omitted
    // Google requires real customer reviews - will be added when available
  };

  // WebPage schema for product page
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemPage',
    '@id': `${baseUrl}/product/${productPath}#webpage`,
    url: `${baseUrl}/product/${productPath}`,
    name: `${product.name} | GetPawsy`,
    description: metaDescription,
    isPartOf: { '@id': `${baseUrl}/#website` },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: primaryImage,
    },
    breadcrumb: { '@id': `${baseUrl}/product/${productPath}#breadcrumb` },
    mainEntity: { '@id': `${baseUrl}/product/${productPath}#product` },
  };

  // BreadcrumbList Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${baseUrl}/product/${productPath}#breadcrumb`,
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
      <script type="application/ld+json">
        {JSON.stringify(webPageSchema)}
      </script>
    </Helmet>
  );
}
