import { Helmet } from 'react-helmet-async';
import { SITE_KEYWORDS } from '@/lib/seo-keywords';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  RETURN_WINDOW_DAYS,
  FAQ_SHIPPING_ANSWER,
  FAQ_RETURNS_ANSWER,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

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
  description = `Discover premium, eco-friendly pet products at GetPawsy. Shop quality dog beds, cat trees, pet toys, collars, grooming supplies and more. Free shipping on eligible orders over $${FREE_SHIPPING_THRESHOLD}. Vet-approved items for happy, healthy pets.`,
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
    url: url,
    logo: {
      '@type': 'ImageObject',
      url: `${url}/favicon.png`,
      width: 512,
      height: 512,
    },
    image: `${url}${image}`,
    description: 'Online pet products store offering dog training tools, cat essentials, and pet accessories. Serving customers across the United States with free shipping on orders over $35.',
    foundingDate: '2024',
    // sameAs intentionally empty — only real, verified brand profiles should be listed
    sameAs: [],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        email: SUPPORT_EMAIL,
        availableLanguage: ['English'],
        areaServed: 'US',
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '09:00',
          closes: '17:00',
        },
      },
    ],
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NL',
    },
    knowsAbout: [
      'Dog Training Products',
      'Pet Supplies',
      'Cat Essentials',
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

  // Enhanced Online Store Schema - US-focused for GMC compliance
  const storeSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': `${url}/#store`,
    name: 'GetPawsy Pet Store',
    url: url,
    description: 'Online pet store offering premium dog beds, cat trees, pet toys, collars, grooming supplies and accessories. US shipping with secure payment.',
    priceRange: '$$',
    image: `${url}${image}`,
    logo: `${url}/favicon.png`,
    email: SUPPORT_EMAIL,
    areaServed: {
      '@type': 'Country',
      name: 'United States',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    paymentAccepted: ['Credit Card', 'Debit Card', 'PayPal', 'Apple Pay', 'Google Pay'],
    currenciesAccepted: 'USD',
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
      '@id': `${url}/#returnpolicy`,
      url: `${url}/returns`,
      applicableCountry: 'US',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: RETURN_WINDOW_DAYS,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/ReturnShippingFees',
      refundType: 'https://schema.org/FullRefund',
    },
    // US shipping details - matches shipping-constants.ts
    shippingDetails: [
      {
        '@type': 'OfferShippingDetails',
        '@id': `${url}/#shipping-free`,
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
        shippingLabel: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}`,
      },
      {
        '@type': 'OfferShippingDetails',
        '@id': `${url}/#shipping-flat`,
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
        shippingLabel: `Flat rate $${FLAT_SHIPPING_RATE.toFixed(2)} for orders under $${FREE_SHIPPING_THRESHOLD}`,
      },
    ],
  };

  // FAQ Schema for common questions - uses centralized constants
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What shipping options does GetPawsy offer?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: FAQ_SHIPPING_ANSWER,
        },
      },
      {
        '@type': 'Question',
        name: 'What is your return policy?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: FAQ_RETURNS_ANSWER,
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
        name: 'Dog Training & Behavior Tools',
        url: `${url}/collections/dog`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Dog Collars & Leashes',
        url: `${url}/collections/dog-collars-leashes`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Dog Carriers',
        url: `${url}/collections/dog-carriers`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: 'Cat Trees & Condos',
        url: `${url}/collections/cat-trees-and-condos`,
      },
      {
        '@type': 'ListItem',
        position: 5,
        name: 'Self Cleaning Litter Boxes',
        url: `${url}/collections/self-cleaning-litter-box`,
      },
      {
        '@type': 'ListItem',
        position: 6,
        name: 'Interactive Dog Toys',
        url: `${url}/collections/best-interactive-dog-toys`,
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
