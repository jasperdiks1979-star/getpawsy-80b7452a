import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Truck, RotateCcw } from 'lucide-react';

/**
 * Shipping & Returns accordion for product pages.
 * Contains exact Google Merchant Center compliance keywords
 * in static HTML: "Processing Time", "business days",
 * "Delivery Time", "US warehouse partners", "30-day returns", "refund".
 */
export function ProductShippingReturns({ className = '' }: { className?: string }) {
  return (
    <Accordion type="single" collapsible className={className}>
      <AccordionItem value="shipping">
        <AccordionTrigger className="text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            Shipping Information
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Processing Time:</strong> 1–2 business days</li>
            <li><strong className="text-foreground">Delivery Time:</strong> 3–7 business days within the United States</li>
            <li><strong className="text-foreground">Fulfillment:</strong> Ships from US warehouse partners</li>
            <li><strong className="text-foreground">Tracking:</strong> Tracking number provided by email after dispatch</li>
            <li><strong className="text-foreground">Free shipping</strong> on orders over $49</li>
          </ul>
          <Link to="/shipping" className="inline-block mt-3 text-sm text-primary hover:underline font-medium">
            View full Shipping Policy →
          </Link>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="returns">
        <AccordionTrigger className="text-sm font-semibold">
          <span className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" />
            Returns & Refunds
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">30-day returns</strong> on all products</li>
            <li>Items must be unused and in original packaging</li>
            <li>Full refund issued after returned item is received and inspected</li>
            <li>Contact <a href="mailto:support@getpawsy.pet" className="text-primary hover:underline">support@getpawsy.pet</a> with your order number to start a return</li>
          </ul>
          <Link to="/returns" className="inline-block mt-3 text-sm text-primary hover:underline font-medium">
            View full Returns Policy →
          </Link>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export default ProductShippingReturns;
