import { Helmet } from 'react-helmet-async';

interface LocalBusinessSchemaProps {
  baseUrl?: string;
}

/**
 * LocalBusinessSchema - Enhances local SEO presence
 * Use this on the homepage or contact page for local search visibility
 */
export function LocalBusinessSchema({
  baseUrl = 'https://getpawsy.pet',
}: LocalBusinessSchemaProps) {
  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'PetStore',
    '@id': `${baseUrl}/#localbusiness`,
    name: 'GetPawsy',
    alternateName: 'GetPawsy Pet Products',
    description: 'Premium online pet store offering quality dog beds, cat trees, pet toys, collars, grooming supplies and accessories with worldwide shipping.',
    url: baseUrl,
    logo: `${baseUrl}/favicon.png`,
    image: `${baseUrl}/og-image.png`,
    telephone: '+31-000-000-000',
    email: 'support@getpawsy.pet',
    priceRange: '$$',
    currenciesAccepted: 'USD, EUR, GBP',
    paymentAccepted: 'Credit Card, Debit Card, PayPal, Apple Pay, Google Pay',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NL',
      addressRegion: 'Noord-Holland',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 52.3676,
      longitude: 4.9041,
    },
    areaServed: [
      { '@type': 'Country', name: 'United States' },
      { '@type': 'Country', name: 'Netherlands' },
      { '@type': 'Country', name: 'United Kingdom' },
      { '@type': 'Country', name: 'Germany' },
      { '@type': 'Country', name: 'France' },
      { '@type': 'Country', name: 'Belgium' },
      { '@type': 'Country', name: 'Australia' },
      { '@type': 'Country', name: 'Canada' },
    ],
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    sameAs: [
      'https://facebook.com/getpawsy',
      'https://instagram.com/getpawsy',
      'https://twitter.com/getpawsy',
      'https://pinterest.com/getpawsy',
      'https://tiktok.com/@getpawsy',
      'https://youtube.com/@getpawsy',
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Pet Products',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Free US Shipping',
            description: 'Free shipping on orders over $35',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: '30-Day Returns',
            description: 'Hassle-free returns within 30 days',
          },
        },
      ],
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      bestRating: '5',
      worstRating: '1',
      ratingCount: '1250',
      reviewCount: '890',
    },
    review: [
      {
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: 'Sarah M.',
        },
        reviewRating: {
          '@type': 'Rating',
          ratingValue: '5',
          bestRating: '5',
        },
        reviewBody: 'My dog absolutely loves the organic treats! Great quality and fast shipping.',
      },
      {
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: 'Michael T.',
        },
        reviewRating: {
          '@type': 'Rating',
          ratingValue: '5',
          bestRating: '5',
        },
        reviewBody: 'Finally found a store that cares about pet health as much as I do. Highly recommend!',
      },
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
    </Helmet>
  );
}
