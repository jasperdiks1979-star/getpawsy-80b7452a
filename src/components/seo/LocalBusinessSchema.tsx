import { Helmet } from 'react-helmet-async';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
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
    '@type': 'OnlineBusiness',
    '@id': `${baseUrl}/#localbusiness`,
    name: 'GetPawsy',
    alternateName: 'GetPawsy Pet Products',
    description: 'GetPawsy is an independent online store focused on high-quality pet products for dogs, cats, and small animals. Orders are shipped directly to customers across the United States.',
    url: baseUrl,
    logo: `${baseUrl}/favicon.png`,
    image: `${baseUrl}/og-image.png`,
    email: SUPPORT_EMAIL,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'New York',
      addressRegion: 'NY',
      addressCountry: 'US',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: SUPPORT_EMAIL,
      contactType: 'customer service',
      availableLanguage: 'English',
      hoursAvailable: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00-05:00',
        closes: '17:00-05:00',
      },
    },
    priceRange: '$$',
    currenciesAccepted: 'USD',
    paymentAccepted: 'Credit Card, Debit Card, PayPal, Apple Pay, Google Pay',
    areaServed: [
      { '@type': 'Country', name: 'United States' },
    ],
    // sameAs intentionally empty — only add verified brand social profiles
    sameAs: [],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Pet Products',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Free Shipping Available',
            description: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}`,
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `${RETURN_WINDOW_DAYS}-Day Returns`,
            description: `${RETURN_WINDOW_DAYS}-day return policy`,
          },
        },
      ],
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
    </Helmet>
  );
}
