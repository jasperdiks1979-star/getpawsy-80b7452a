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
  url = 'https://getpawsy.pet',
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

  // Online Store Schema - without problematic nested Product schemas
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
  };

  // ItemList schema for product categories (without Product type to avoid validation errors)
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pet Product Categories',
    description: 'Browse our collection of premium pet products',
    numberOfItems: 6,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Dog Products',
        url: `${url}/products?category=Dogs`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Cat Products',
        url: `${url}/products?category=Cats`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Pet Toys',
        url: `${url}/products?category=Toys`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: 'Pet Food & Treats',
        url: `${url}/products?category=Food`,
      },
      {
        '@type': 'ListItem',
        position: 5,
        name: 'Pet Accessories',
        url: `${url}/products?category=Accessories`,
      },
      {
        '@type': 'ListItem',
        position: 6,
        name: 'Grooming Supplies',
        url: `${url}/products?category=Grooming`,
      },
    ],
  };

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={url} />

      {/* Hreflang Tags for International SEO */}
      <link rel="alternate" hrefLang="en" href={url} />
      <link rel="alternate" hrefLang="en-US" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />

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
      <script type="application/ld+json">
        {JSON.stringify(itemListSchema)}
      </script>
    </Helmet>
  );
}
