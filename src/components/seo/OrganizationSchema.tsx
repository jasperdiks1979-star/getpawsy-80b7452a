import { Helmet } from 'react-helmet-async';
import { SITE_URL } from '@/lib/constants';
import { SUPPORT_EMAIL } from '@/lib/shipping-constants';

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
    email: SUPPORT_EMAIL,
    brand: 'GetPawsy',
    vatID: 'NL003295015B69',
    taxID: 'NL003295015B69',
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
      email: SUPPORT_EMAIL,
      contactType: 'customer service',
      availableLanguage: 'English',
    },
    returnPolicy: {
      '@type': 'MerchantReturnPolicy',
      '@id': `${SITE_URL}/#returnpolicy`,
      url: `${SITE_URL}/returns`,
      applicableCountry: 'US',
      returnPolicyCategory:
        'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/ReturnShippingFees',
      refundType: 'https://schema.org/FullRefund',
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
