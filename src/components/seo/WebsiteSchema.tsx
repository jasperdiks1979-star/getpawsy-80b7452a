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
  description = 'Discover premium, eco-friendly pet products at GetPawsy. Shop quality dog beds, cat trees, pet toys, collars, grooming supplies and more. Free US shipping on orders over $35. Vet-approved items for happy, healthy pets.',
  keywords = SITE_KEYWORDS,
  image = '/og-image.png',
  url = 'https://getpawsy.pet',
  type = 'website',
}: WebsiteSchemaProps) {
  // Enhanced Organization Schema with additional trust signals
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${url}/#organization`,
    name: 'GetPawsy',
    legalName: 'GetPawsy Pet Products',
    url: url,
    logo: {
      '@type': 'ImageObject',
      url: `${url}/favicon.png`,
      width: 512,
      height: 512,
    },
    image: `${url}${image}`,
    description: 'Premium pet products store offering quality supplies for dogs, cats, and other pets. Trusted by thousands of pet owners worldwide.',
    foundingDate: '2024',
    slogan: 'Happy Pets, Happy Life',
    sameAs: [
      'https://facebook.com/getpawsy',
      'https://instagram.com/getpawsy',
      'https://twitter.com/getpawsy',
      'https://pinterest.com/getpawsy',
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        email: 'support@getpawsy.pet',
        availableLanguage: ['English', 'Dutch'],
        areaServed: 'Worldwide',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@getpawsy.pet',
        availableLanguage: ['English'],
      },
    ],
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NL',
    },
    knowsAbout: [
      'Pet Products',
      'Dog Supplies',
      'Cat Supplies',
      'Pet Care',
      'Animal Accessories',
    ],
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

  // Enhanced Online Store Schema with trust signals
  const storeSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': `${url}/#store`,
    name: 'GetPawsy Pet Store',
    url: url,
    description: 'Online pet store offering premium dog beds, cat trees, pet toys, collars, grooming supplies and accessories. Worldwide shipping with secure payment.',
    priceRange: '$$',
    image: `${url}${image}`,
    logo: `${url}/favicon.png`,
    telephone: '+31-000-000-000',
    email: 'support@getpawsy.pet',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NL',
    },
    areaServed: {
      '@type': 'GeoCircle',
      geoMidpoint: {
        '@type': 'GeoCoordinates',
        latitude: 52.3676,
        longitude: 4.9041,
      },
      geoRadius: '20000000',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    paymentAccepted: ['Credit Card', 'Debit Card', 'PayPal', 'Apple Pay', 'Google Pay'],
    currenciesAccepted: 'USD,EUR',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Pet Products Catalog',
      itemListElement: [
        { '@type': 'OfferCatalog', name: 'Dog Products' },
        { '@type': 'OfferCatalog', name: 'Cat Products' },
        { '@type': 'OfferCatalog', name: 'Pet Accessories' },
      ],
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: ['US', 'NL', 'GB', 'DE', 'FR'],
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/FreeReturn',
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
        addressCountry: ['US', 'NL', 'GB', 'DE', 'FR', 'BE', 'AU', 'CA'],
      },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: {
          '@type': 'QuantitativeValue',
          minValue: 1,
          maxValue: 3,
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
  };

  // FAQ Schema for common questions - helps with quality score
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What shipping options does GetPawsy offer?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'GetPawsy offers free US shipping on orders over $35. Orders ship from US fulfillment centers when available. Standard delivery takes 3-7 business days.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is your return policy?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We offer a 30-day hassle-free return policy. If you are not completely satisfied with your purchase, you can return it within 30 days for a full refund. Returns are free of charge.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are your pet products safe and high quality?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, all GetPawsy products are carefully selected for quality and safety. We work with trusted suppliers and many of our products are vet-approved. We prioritize pet-safe materials and durability.',
        },
      },
      {
        '@type': 'Question',
        name: 'What payment methods do you accept?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, Apple Pay, and Google Pay. All payments are processed securely through Stripe.',
        },
      },
      {
        '@type': 'Question',
        name: 'How can I track my order?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Once your order ships, you will receive an email with a tracking number. You can also track your order on our website by visiting the Track Order page and entering your order number and email.',
        },
      },
    ],
  };

  // WebPage Schema for the homepage
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}/#webpage`,
    url: url,
    name: title,
    description: description,
    isPartOf: { '@id': `${url}/#website` },
    about: { '@id': `${url}/#organization` },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${url}${image}`,
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: url,
        },
      ],
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', '.hero-description'],
    },
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
      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(webPageSchema)}
      </script>
    </Helmet>
  );
}
