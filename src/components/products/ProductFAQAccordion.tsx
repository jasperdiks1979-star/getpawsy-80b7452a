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

interface ProductFAQAccordionProps {
  productName: string;
  category?: string;
}

function generateFAQs(name: string, category?: string) {
  const cat = (category || '').toLowerCase();
  const faqs = [
    {
      q: `What sizes does the ${name} come in?`,
      a: `The ${name} is available in multiple sizes to fit different pet breeds. Check the product specifications above for exact dimensions and weight recommendations.`,
    },
    {
      q: `How long does shipping take?`,
      a: `We ship from US warehouses with standard delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.`,
    },
    {
      q: `What is your return policy?`,
      a: `We offer a ${RETURN_WINDOW_DAYS}-day hassle-free return policy. If you're not satisfied, contact our support team for a full refund or exchange.`,
    },
    {
      q: `What materials is this made from?`,
      a: `The ${name} is made from premium, pet-safe materials designed for durability and comfort. See the product description for specific material details.`,
    },
    {
      q: `Is this easy to clean?`,
      a: cat.includes('bed')
        ? `Most of our pet beds feature removable, machine-washable covers for easy maintenance.`
        : `Yes, this product is designed for easy cleaning. Refer to the care instructions in the product description.`,
    },
    {
      q: `Does this come with a warranty?`,
      a: `All GetPawsy products are backed by our ${RETURN_WINDOW_DAYS}-day satisfaction guarantee. We stand behind the quality of every product we sell.`,
    },
    {
      q: `Is this safe for puppies and kittens?`,
      a: `Yes, we prioritize pet safety in every product. However, we recommend supervising young pets during initial use.`,
    },
    {
      q: `Can I use this for multiple pets?`,
      a: `Absolutely! Many of our customers use this product in multi-pet households. Choose the appropriate size for your largest pet.`,
    },
    {
      q: `Do you ship internationally?`,
      a: `We currently focus on US shipping to ensure the fastest delivery times. International shipping may be available for select items.`,
    },
    {
      q: `How do I contact customer support?`,
      a: `You can reach our friendly support team via the Contact page or email us directly. We typically respond within 24 hours.`,
    },
  ];
  return faqs;
}

export function ProductFAQAccordion({ productName, category }: ProductFAQAccordionProps) {
  const faqs = useMemo(() => generateFAQs(productName, category), [productName, category]);

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
