import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Truck, RotateCcw } from 'lucide-react';
import {
  PROCESSING_TIME,
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

/**
 * Shipping & Returns accordion for product pages.
 * Contains exact Google Merchant Center compliance keywords
 * in static HTML: "Processing Time", "business days",
 * "Delivery Time", "United States", "return policy", "refund".
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
            <li><strong className="text-foreground">Processing Time:</strong> {PROCESSING_TIME}</li>
            <li><strong className="text-foreground">Delivery Time:</strong> {DELIVERY_TIME_STANDARD} to the United States</li>
            <li><strong className="text-foreground">Tracking:</strong> All orders receive a tracking number</li>
            <li><strong className="text-foreground">Carriers:</strong> Orders are delivered via trusted carrier partners</li>
            <li><strong className="text-foreground">Free shipping</strong> on orders over ${FREE_SHIPPING_THRESHOLD}</li>
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
            <li><strong className="text-foreground">{RETURN_WINDOW_DAYS}-day return policy</strong> on all products</li>
            <li>Returns must be sent back <strong className="text-foreground">by mail</strong></li>
            <li>Items must be unused and in original packaging</li>
            <li>Customer is responsible for return shipping costs (unless item arrived damaged or incorrect)</li>
            <li>Refund issued to <strong className="text-foreground">original payment method</strong> within 5 business days</li>
            <li>Contact <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a> with your order number to start a return</li>
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
