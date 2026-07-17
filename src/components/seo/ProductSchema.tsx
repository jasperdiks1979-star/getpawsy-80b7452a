import { Helmet } from 'react-helmet-async';
import { generateProductKeywords, generateMetaDescription } from '@/lib/seo-keywords';
import { getCategoryCollectionFullUrl } from '@/lib/category-collection-map';
import { getDisplayPrice, getDisplayAvailability } from '@/lib/merchant-safe-product';
import type { MerchantProduct } from '@/lib/merchant-safe-product';
import { buildStructuredProductName } from '@/lib/structured-product-name';

interface ProductSchemaProps {
  product: {
    id: string;
    name: string;
    name_clean?: string | null;
    slug?: string | null;
    description?: string | null;
    price: number;
    compare_at_price?: number | null;
    image_url?: string | null;
    images?: string[] | null;
    category?: string | null;
    stock?: number | null;
    variants?: unknown;
    sku?: string | null;
    seo_tier?: string | null;
    product_type?: string | null;
    google_product_category?: string | null;
  };
  reviews?: Array<{
    rating: number;
    title?: string;
    content?: string | null;
    reviewer_name?: string | null;
  }>;
  baseUrl?: string;
}

export function ProductSchema({ 
  product, 
  reviews = [],
  baseUrl = 'https://getpawsy.pet'
}: ProductSchemaProps) {
  // ALWAYS render schema — use fallback price if missing (Google trust & Merchant compliance)
  const rawPrice = Number(product.price);
  const safePrice = (rawPrice && rawPrice > 0) ? rawPrice : 0.01;
  if (!rawPrice || rawPrice <= 0) {
    console.warn('[ProductSchema] Using fallback price 0.01 for', product.name);
  }
  // Clean description from HTML and make it benefit-driven for US market
  const rawDescription = product.description
    ?.replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  
  // Ensure description is always populated with benefit-driven copy
  const cleanDescription = rawDescription && rawDescription.length > 50 
    ? rawDescription 
    : `Shop ${product.name} at GetPawsy. Quality pet product designed for comfort and durability. Estimated delivery: 5–10 business days. 30-day return policy.`;

  // Only use real reviews — no fallback fake data
  const hasRealReviews = reviews.length >= 3;

  const aggregateRating = hasRealReviews
    ? {
        '@type': 'AggregateRating',
        ratingValue: (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1),
        reviewCount: reviews.length,
        bestRating: '5',
        worstRating: '1',
      }
    : undefined;

  const reviewSchema = hasRealReviews
    ? reviews.slice(0, 10).map((r) => ({
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: r.rating,
          bestRating: 5,
          worstRating: 1,
        },
        reviewBody: r.content || r.title || '',
        author: { '@type': 'Person', name: r.reviewer_name || 'Verified Buyer' },
      }))
    : undefined;

  // Generate keywords
  const keywords = generateProductKeywords(
    product.name,
    product.category || '',
    product.description || ''
  );

  const merchantPrice = getDisplayPrice(product as MerchantProduct);
  const canonicalSchemaPrice = (merchantPrice.price && merchantPrice.price > 0) ? merchantPrice.price : safePrice;
  const merchantAvailability = getDisplayAvailability(product as MerchantProduct);

  // Generate meta description
  const metaDescription = generateMetaDescription(
    product.name,
    canonicalSchemaPrice,
    product.category || undefined
  );

  // Product images
  const images = product.images?.filter(Boolean) || [];
  const primaryImage = images[0] || product.image_url || `${baseUrl}/og-image.png`;

  // Use slug for SEO-friendly URLs, fallback to id
  const productPath = product.slug || product.id;

  // Merchant-Listings-safe name: prefers name_clean, strips HTML/control chars,
  // hard cap 150 code points, word-boundary truncation. Shared helper so PDP,
  // collection ItemList, and breadcrumbs all emit the identical canonical name.
  const safeName = buildStructuredProductName(product);

  // Dynamic priceValidUntil - 12 months from now
  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);
  const priceValidUntilStr = priceValidUntil.toISOString().split('T')[0];

  // JSON-LD Product Schema - Google Rich Results & Merchant Center compliant
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${baseUrl}/products/${productPath}#product`,
    name: safeName,
    description: cleanDescription,
    image: images.length > 0 ? images : [primaryImage],
    sku: product.sku || product.id,
    mpn: product.id,
    brand: {
      '@type': 'Brand',
      name: 'GetPawsy',
    },
    // category is conveyed via additionalProperty and OG meta — not a valid schema.org Product field
    ...(product.product_type ? {
      additionalProperty: [{
        '@type': 'PropertyValue',
        propertyID: 'product_type',
        value: product.product_type,
      }],
    } : {}),
    offers: {
      '@type': 'Offer',
      '@id': `${baseUrl}/products/${productPath}#offer`,
      url: `${baseUrl}/products/${productPath}`,
      priceCurrency: 'USD',
      price: canonicalSchemaPrice.toFixed(2),
      priceValidUntil: priceValidUntilStr,
      availability: merchantAvailability.schemaValue,
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'GetPawsy',
        url: baseUrl,
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        '@id': `${baseUrl}/#returnpolicy`,
        url: `${baseUrl}/returns`,
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
        refundType: 'https://schema.org/FullRefund',
      },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'US',
        },
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: canonicalSchemaPrice >= 35 ? '0.00' : '5.99',
          currency: 'USD',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 2,
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
    ...(aggregateRating ? { aggregateRating } : {}),
    ...(reviewSchema ? { review: reviewSchema } : {}),
  };

  // WebPage schema for product page
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemPage',
    '@id': `${baseUrl}/products/${productPath}#webpage`,
    url: `${baseUrl}/products/${productPath}`,
    name: `${product.name} | GetPawsy`,
    description: metaDescription,
    isPartOf: { '@id': `${baseUrl}/#website` },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: primaryImage,
    },
    breadcrumb: { '@id': `${baseUrl}/products/${productPath}#breadcrumb` },
    mainEntity: { '@id': `${baseUrl}/products/${productPath}#product` },
  };

  // BreadcrumbList Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${baseUrl}/products/${productPath}#breadcrumb`,
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
        item: getCategoryCollectionFullUrl(product.category, baseUrl),
      }] : []),
      {
        '@type': 'ListItem',
        position: product.category ? 4 : 3,
        name: safeName,
        item: `${baseUrl}/products/${productPath}`,
      },
    ],
  };

  const productUrl = `${baseUrl}/products/${productPath}`;

  // CTR-optimized title: benefit-driven, under 60 chars
  const categoryHint = product.category?.toLowerCase() || '';
  const isCat = categoryHint.includes('cat');
  const isDog = categoryHint.includes('dog');
  const petType = isCat ? 'Cat' : isDog ? 'Dog' : 'Pet';
  const shortName = product.name.length > 45 ? product.name.slice(0, 42) + '…' : product.name;
  const seoTitle = `${shortName} – ${petType} Essentials | GetPawsy`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{seoTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta name="keywords" content={keywords.join(', ')} />
      {/* Canonical managed by useCanonical hook — not duplicated here */}

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
      <meta property="product:price:amount" content={canonicalSchemaPrice.toString()} />
      <meta property="product:price:currency" content="USD" />
      <meta property="product:availability" content={merchantAvailability.isInStock ? 'in stock' : 'out of stock'} />
      {product.category && <meta property="product:category" content={product.category} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${product.name} | GetPawsy`} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={primaryImage} />

      {/* Robots managed by parent page (ProductDetail) to support per-tier noindex */}

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
