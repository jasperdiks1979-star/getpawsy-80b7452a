import { Helmet } from 'react-helmet-async';
import { SITE_KEYWORDS } from '@/lib/seo-keywords';

interface WebsiteSchemaProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
}

export function WebsiteSchema({
  title = 'GetPawsy - Premium Pet Products & Supplies',
  description = 'Discover premium, eco-friendly pet products at GetPawsy. Shop quality dog beds, cat trees, pet toys, collars, grooming supplies and more. Free shipping on orders over $50. Vet-approved items for happy, healthy pets.',
  keywords = SITE_KEYWORDS,
  image = '/og-image.png',
  url = 'https://getpawsy.lovable.app',
  type = 'website',
}: WebsiteSchemaProps) {
  // Organization Schema
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'GetPawsy',
    url: url,
    logo: `${url}/favicon.png`,
    description: 'Premium pet products store offering quality supplies for dogs, cats, and other pets.',
    sameAs: [
      'https://facebook.com/getpawsy',
      'https://instagram.com/getpawsy',
      'https://twitter.com/getpawsy',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: ['English'],
    },
  };

  // Website Schema
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'GetPawsy',
    url: url,
    description: description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${url}/products?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  // Online Store Schema
  const storeSchema = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: 'GetPawsy Pet Store',
    url: url,
    description: 'Online pet store offering premium dog beds, cat trees, pet toys, collars, grooming supplies and accessories.',
    priceRange: '$$',
    image: `${url}${image}`,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    paymentAccepted: ['Credit Card', 'Debit Card'],
    currenciesAccepted: 'USD',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Pet Products',
      itemListElement: [
        {
          '@type': 'OfferCatalog',
          name: 'Dog Products',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Dog Beds' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Dog Toys' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Dog Collars' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Dog Bowls' } },
          ],
        },
        {
          '@type': 'OfferCatalog',
          name: 'Cat Products',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Cat Trees' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Cat Toys' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Cat Beds' } },
          ],
        },
      ],
    },
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={url} />

      {/* Robots */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow" />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={`${url}${image}`} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="GetPawsy" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@GetPawsy" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${url}${image}`} />

      {/* Additional SEO Tags */}
      <meta name="author" content="GetPawsy" />
      <meta name="publisher" content="GetPawsy" />
      <meta name="rating" content="general" />
      <meta name="distribution" content="global" />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(storeSchema)}
      </script>
    </Helmet>
  );
}
