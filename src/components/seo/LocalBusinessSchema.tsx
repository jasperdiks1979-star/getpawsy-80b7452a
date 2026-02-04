import { Helmet } from 'react-helmet-async';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

interface LocalBusinessSchemaProps {
  baseUrl?: string;
}

/**
 * LocalBusinessSchema - Enhances local SEO presence
 * Use this on the homepage or contact page for local search visibility
 * 
 * NOTE: Focused on US market for Google Merchant Center compliance
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
    description: 'Premium online pet store offering quality dog beds, cat trees, pet toys, collars, grooming supplies and accessories with fast US shipping.',
    url: baseUrl,
    logo: `${baseUrl}/favicon.png`,
    image: `${baseUrl}/og-image.png`,
    email: 'support@getpawsy.pet',
    priceRange: '$$',
    currenciesAccepted: 'USD',
    paymentAccepted: 'Credit Card, Debit Card, PayPal, Apple Pay, Google Pay',
    // US-focused for GMC compliance
    areaServed: [
      { '@type': 'Country', name: 'United States' },
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
            description: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}`,
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `${RETURN_WINDOW_DAYS}-Day Returns`,
            description: `Hassle-free returns within ${RETURN_WINDOW_DAYS} days`,
          },
        },
      ],
    },
    // NOTE: aggregateRating and review fields intentionally omitted
    // Google requires real customer reviews - will be added when real reviews are collected
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
    </Helmet>
  );
}
