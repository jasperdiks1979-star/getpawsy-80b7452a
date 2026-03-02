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
    '@type': 'OnlineBusiness',
    '@id': `${baseUrl}/#localbusiness`,
    name: 'GetPawsy',
    alternateName: 'GetPawsy Pet Products',
    description: 'Online pet store offering dog training tools, cat essentials, and pet accessories. Operated from the Netherlands, serving US customers with US warehouse fulfillment.',
    url: baseUrl,
    logo: `${baseUrl}/favicon.png`,
    image: `${baseUrl}/og-image.png`,
    email: 'info@getpawsy.pet',
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
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
    </Helmet>
  );
}
