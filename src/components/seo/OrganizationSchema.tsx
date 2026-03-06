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
    email: 'info@getpawsy.pet',
    brand: 'GetPawsy',
    vatID: 'NL003295015B69',
    taxID: 'NL003295015B69',
    parentOrganization: {
      '@type': 'Organization',
      name: 'Skidzo',
    },
    description:
      'GetPawsy is an independent online store focused on high-quality pet products for dogs, cats, and small animals. Orders are shipped directly to customers across the United States.',
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'Gelderland',
      addressLocality: 'Apeldoorn',
      addressCountry: 'NL',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'info@getpawsy.pet',
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
