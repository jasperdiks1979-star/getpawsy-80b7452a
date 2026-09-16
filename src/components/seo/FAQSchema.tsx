import { Helmet } from 'react-helmet-async';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
  FAQ_SHIPPING_ANSWER,
  FAQ_RETURNS_ANSWER,
  FAQ_INTERNATIONAL_ANSWER,
} from '@/lib/shipping-constants';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSchemaProps {
  faqs: FAQItem[];
  pageUrl?: string;
}

export function FAQSchema({ faqs, pageUrl }: FAQSchemaProps) {
  if (!faqs || faqs.length === 0) return null;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
    ...(pageUrl && { url: pageUrl }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>
    </Helmet>
  );
}

// Common pet product FAQs that can be reused - using centralized constants
export const COMMON_PRODUCT_FAQS: FAQItem[] = [
  {
    question: 'What is your shipping policy?',
    answer: FAQ_SHIPPING_ANSWER,
  },
  {
    question: 'What is your return policy?',
    answer: FAQ_RETURNS_ANSWER,
  },
  {
    question: 'How do you select the products you sell?',
    answer: 'We select products by comparing published manufacturer specifications and supplier stock records. We do not test products ourselves, and we only publish specifications the manufacturer states.',
  },
  {
    question: 'How can I track my order?',
    answer: 'Once your order ships, you\'ll receive a confirmation email with a tracking number. You can use this number to track your package on our website or the carrier\'s website.',
  },
  {
    question: 'Do you ship internationally?',
    answer: FAQ_INTERNATIONAL_ANSWER,
  },
];

/**
 * Product FAQ structured data.
 *
 * Answers are limited to store policy and to what the product page itself
 * states. Category-guessed answers (machine-washable covers, non-toxic
 * materials, natural ingredients, "most customers complete assembly in
 * 30-60 minutes") asserted facts no manufacturer record contains and were
 * being published to search engines as FAQPage markup, so they are gone.
 */
export function generateProductFAQs(productName: string, _category?: string): FAQItem[] {
  const baseFaqs: FAQItem[] = [
    {
      question: `What are the exact dimensions and materials of the ${productName}?`,
      answer: `Every dimension, material and weight figure the manufacturer documents for the ${productName} is listed in the specifications on its product page. We do not publish figures the manufacturer has not stated.`,
    },
    {
      question: `Which size or colour of the ${productName} will I receive?`,
      answer: `You receive exactly the option selected at checkout. Out-of-stock options cannot be selected and we never substitute one option for another.`,
    },
  ];

  return [...baseFaqs, ...COMMON_PRODUCT_FAQS.slice(0, 2)];
}
