import { Helmet } from 'react-helmet-async';
import { generateProductKeywords, generateMetaDescription } from '@/lib/seo-keywords';
import { computeAvailability } from '@/lib/availability';

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
  // Clean description from HTML and make it benefit-driven for US market
  const rawDescription = product.description
    ?.replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  
  // Ensure description is always populated with benefit-driven copy
  const cleanDescription = rawDescription && rawDescription.length > 50 
    ? rawDescription 
    : `Shop ${product.name} at GetPawsy. Premium quality pet product designed for comfort and durability. Fast US shipping, 30-day hassle-free returns.`;

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

  // Dynamic priceValidUntil - 12 months from now
  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);
  const priceValidUntilStr = priceValidUntil.toISOString().split('T')[0];

  // JSON-LD Product Schema - Google Rich Results & Merchant Center compliant
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${baseUrl}/product/${productPath}#product`,
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
      '@id': `${baseUrl}/product/${productPath}#offer`,
      url: `${baseUrl}/product/${productPath}`,
      priceCurrency: 'USD',
      price: product.price.toFixed(2),
      priceValidUntil: priceValidUntilStr,
      // Use centralized availability logic (real supplier stock)
      availability: computeAvailability(product as { stock?: number | null; is_active?: boolean | null }).isInStock
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
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
      // NOTE: Shipping rate in schema is per-item estimate; actual shipping is order-threshold based
      // ($0 for orders >= $35, $5.99 for orders < $35) configured in Merchant Center settings.
      // We omit shippingRate here to avoid mismatch with order-level logic.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'US',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 3,
            unitCode: 'd',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: 3,
            maxValue: 7,
            unitCode: 'd',
          },
        },
      },
    },
    // FUTURE: Add when real customer reviews are available:
    // aggregateRating: { '@type': 'AggregateRating', ratingValue: X, reviewCount: Y, bestRating: 5, worstRating: 1 }
    // review: [{ '@type': 'Review', author: { '@type': 'Person', name: '...' }, reviewRating: { '@type': 'Rating', ratingValue: X }, reviewBody: '...' }]
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
      <meta property="product:availability" content={computeAvailability(product as { stock?: number | null; is_active?: boolean | null }).isInStock ? 'in stock' : 'out of stock'} />
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
