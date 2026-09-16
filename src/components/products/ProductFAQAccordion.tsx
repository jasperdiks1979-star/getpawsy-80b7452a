import { useMemo } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';
import { getProductContentOverride } from '@/config/product-content-overrides';

interface ProductFAQAccordionProps {
  productId?: string;
  productName: string;
  category?: string;
}

/**
 * FAQ answers must be checkable facts only.
 *
 * The previous version generated category-specific answers that asserted
 * product attributes nobody documented — infrared sensors and self-cleaning
 * cycles on manual litter boxes, decibel levels, weight capacities, sisal
 * longevity, airline cabin fit, BPA-free materials, assembly times and
 * "most customers …" popularity claims. None of that exists in any supplier
 * record, so it is removed. Only store policy (shipping, returns, support,
 * ordering) is answered here; product specifics live in the verified-spec
 * table on the product page, or in a per-product override.
 */
function generateFAQs(name: string, _category?: string) {
  return [
    {
      q: `Where does the ${name} ship from, and how long does it take?`,
      a: `Orders ship to addresses in the United States. Estimated delivery is ${DELIVERY_TIME_STANDARD} and is confirmed at checkout. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.`,
    },
    {
      q: `What is the return policy?`,
      a: `We offer a ${RETURN_WINDOW_DAYS}-day return window on eligible products. Items must be unused and in their original condition. Contact our support team with your order number to start a return.`,
    },
    {
      q: `Which size or colour will I receive?`,
      a: `You receive exactly the option you select on this page. If an option is out of stock it cannot be selected, and checkout will not accept an order without a specific in-stock option — we never substitute one for another.`,
    },
    {
      q: `What are the exact dimensions and materials?`,
      a: `Any dimension, material or weight figure the manufacturer documents for this product is listed in the specifications on this page. We do not publish figures the manufacturer has not stated, so if a detail is not shown there, we do not have it confirmed yet.`,
    },
    {
      q: `How do I track my order?`,
      a: `You will receive a confirmation email when your order ships, and you can look your order up at any time on our order tracking page.`,
    },
    {
      q: `How do I contact support?`,
      a: `You can reach us through the Contact page with your order number, and we will reply by email.`,
    },
  ];
}

export function ProductFAQAccordion({ productId, productName, category }: ProductFAQAccordionProps) {
  const faqs = useMemo(() => {
    const override = getProductContentOverride(productId);
    if (override?.faqs && override.faqs.length > 0) return override.faqs;
    return generateFAQs(productName, category);
  }, [productId, productName, category]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2 mb-6">
        <HelpCircle className="w-6 h-6 text-primary" />
        Frequently Asked Questions
      </h2>
      <Accordion type="single" collapsible className="w-full space-y-2">
        {faqs.map((faq, idx) => (
          <AccordionItem
            key={idx}
            value={`faq-${idx}`}
            className="border rounded-xl px-4 bg-card"
          >
            <AccordionTrigger className="text-sm md:text-base font-medium text-left py-4">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground pb-4">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
