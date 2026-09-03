import { Helmet } from 'react-helmet-async';
import { SITE_URL } from '@/lib/constants';
import { SUPPORT_EMAIL } from '@/lib/shipping-constants';

/**
 * Organization JSON-LD schema — renders site-wide via Layout.
 * Provides Google with business identity signals for Merchant Center compliance.
 */
export function OrganizationSchema() {
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: 'GetPawsy',
    legalName: 'Skidzo',
    vatID: 'NL003295015B69',
    taxID: 'NL003295015B69',
    identifier: { '@type': 'PropertyValue', name: 'KvK', value: '78156955' },
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.png`,
    email: SUPPORT_EMAIL,
    brand: {
      '@type': 'Brand',
      name: 'GetPawsy',
    },
    description:
      'GetPawsy is a trading name of Skidzo, a Dutch sole proprietorship based in Apeldoorn, Netherlands, offering pet products for dogs and cats to customers in the United States. Free shipping on orders over $35.',
    sameAs: [
      'https://www.pinterest.com/getpawsystore/',
      'https://instagram.com/getpawsy',
      'https://x.com/getpawsy',
      'https://facebook.com/getpawsy',
      'https://linkedin.com/company/getpawsy',
      'https://youtube.com/@getpawsy',
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Apeldoorn',
      addressCountry: 'NL',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: SUPPORT_EMAIL,
      contactType: 'customer service',
      availableLanguage: 'English',
      areaServed: 'US',
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

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineBusiness',
    '@id': `${SITE_URL}/#localbusiness`,
    name: 'GetPawsy',
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.png`,
    email: SUPPORT_EMAIL,
    description: 'Online pet supply store operated by Skidzo (Apeldoorn, Netherlands), specializing in cat trees, cat condos, and pet products for US customers.',
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Apeldoorn',
      addressCountry: 'NL',
    },
    sameAs: [
      'https://www.pinterest.com/getpawsystore/',
      'https://instagram.com/getpawsy',
      'https://x.com/getpawsy',
      'https://facebook.com/getpawsy',
      'https://linkedin.com/company/getpawsy',
      'https://youtube.com/@getpawsy',
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(orgSchema)}</script>
      <script type="application/ld+json">{JSON.stringify(localBusinessSchema)}</script>
    </Helmet>
  );
}
