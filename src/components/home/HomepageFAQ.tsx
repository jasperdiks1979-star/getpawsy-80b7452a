import { Helmet } from 'react-helmet-async';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

const FAQ_ITEMS = [
  {
    q: 'How long does shipping take?',
    a: `Standard US delivery takes ${DELIVERY_TIME_STANDARD}. Orders are processed within 1–2 business days and shipped directly to you.`,
  },
  {
    q: 'Do you ship within the United States?',
    a: `Yes — GetPawsy ships to all 50 US states. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping. Orders under $${FREE_SHIPPING_THRESHOLD} ship for a flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}.`,
  },
  {
    q: 'What is your return policy?',
    a: `We offer a ${RETURN_WINDOW_DAYS}-day return window on eligible items. Contact us at ${SUPPORT_EMAIL} with your order number to start a return.`,
  },
  {
    q: 'Is checkout secure?',
    a: 'Yes. All payments are processed securely through Stripe with 256-bit SSL encryption. We accept Visa, Mastercard, PayPal, and Apple Pay.',
  },
  {
    q: 'How can I contact customer support?',
    a: `You can reach our support team at ${SUPPORT_EMAIL}. We respond within 24 hours on business days.`,
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

export function HomepageFAQ() {
  return (
    <section className="py-10 md:py-14 bg-muted/20 border-t border-border/30" aria-label="Frequently Asked Questions">
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>
      <div className="container px-4 md:px-6 max-w-2xl mx-auto">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export default HomepageFAQ;
