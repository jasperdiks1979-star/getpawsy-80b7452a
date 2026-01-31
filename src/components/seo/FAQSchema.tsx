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
    question: 'Are your products safe for pets?',
    answer: 'Yes, all our products are carefully selected and tested to ensure they are safe for your beloved pets. We prioritize quality and safety in every product we offer.',
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

// Generate product-specific FAQs
export function generateProductFAQs(productName: string, category?: string): FAQItem[] {
  const baseFaqs: FAQItem[] = [
    {
      question: `Is the ${productName} suitable for all pet sizes?`,
      answer: `The ${productName} comes in various sizes to accommodate different pet sizes. Please check the product specifications for exact dimensions and weight recommendations.`,
    },
    {
      question: `How do I clean the ${productName}?`,
      answer: `Most of our products are easy to clean. For specific care instructions, please refer to the product description or contact our customer support team.`,
    },
    {
      question: `What materials is the ${productName} made from?`,
      answer: `We use high-quality, pet-safe materials in all our products. Check the product description for specific material information.`,
    },
  ];

  // Add category-specific FAQs
  if (category) {
    const categoryLower = category.toLowerCase();
    
    if (categoryLower.includes('bed') || categoryLower.includes('furniture')) {
      baseFaqs.push({
        question: `Is the ${productName} machine washable?`,
        answer: `Many of our pet beds feature removable, machine-washable covers. Check the product details for specific washing instructions.`,
      });
    }
    
    if (categoryLower.includes('toy')) {
      baseFaqs.push({
        question: `Is the ${productName} safe for chewing?`,
        answer: `Our pet toys are made from durable, non-toxic materials. However, always supervise your pet during play and replace toys showing signs of wear.`,
      });
    }
    
    if (categoryLower.includes('food') || categoryLower.includes('treat')) {
      baseFaqs.push({
        question: `What are the ingredients in the ${productName}?`,
        answer: `We use only natural, high-quality ingredients in our pet food and treats. Check the product label for a complete ingredient list.`,
      });
    }
    
    if (categoryLower.includes('cat tree') || categoryLower.includes('scratching')) {
      baseFaqs.push({
        question: `How do I assemble the ${productName}?`,
        answer: `The ${productName} comes with easy-to-follow assembly instructions and all necessary hardware. Most customers complete assembly in 30-60 minutes.`,
      });
    }
  }

  return [...baseFaqs, ...COMMON_PRODUCT_FAQS.slice(0, 2)];
}
