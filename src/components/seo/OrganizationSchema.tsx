import { Helmet } from 'react-helmet-async';
import { SITE_URL } from '@/lib/constants';

/**
 * Organization JSON-LD schema — renders site-wide via Layout.
 * Provides Google with business identity signals for Merchant Center compliance.
 */
export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: 'GetPawsy',
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.png`,
    email: 'support@getpawsy.pet',
    description:
      'GetPawsy is an online pet supplies retailer operated by Skidzo. Orders are fulfilled from warehouses located in the United States and shipped directly to customers across the United States.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Apeldoorn',
      addressCountry: 'NL',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@getpawsy.pet',
      contactType: 'customer service',
      availableLanguage: 'English',
    },
    returnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'US',
      returnPolicyCategory:
        'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/FreeReturn',
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
