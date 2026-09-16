import { ShieldCheck, Truck, RotateCcw, Mail } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

/**
 * Checkout reassurance block.
 *
 * The three "verified reviews" that used to sit here were written by us, not by
 * customers, and were shown at the most sensitive point of the purchase. They
 * have been removed. What remains are commitments we can actually honour, each
 * one checkable against our own policies.
 */
const FACTS = [
  { icon: ShieldCheck, text: 'Payment is handled by Stripe. We never see or store your card details.' },
  { icon: Truck, text: `Orders are processed within ${PROCESSING_TIME}. Free shipping on eligible US orders over $${FREE_SHIPPING_THRESHOLD}.` },
  { icon: RotateCcw, text: `${RETURN_WINDOW_DAYS}-day returns on eligible items.` },
  { icon: Mail, text: `Questions about your order? Email ${SUPPORT_EMAIL}.` },
] as const;

export function CheckoutSocialProof() {
  return (
    <section
      aria-label="Payment, shipping and returns"
      className="rounded-xl border border-border/50 bg-card p-4 sm:p-5"
    >
      <ul className="space-y-3 list-none p-0 m-0">
        {FACTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5">
            <Icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" aria-hidden />
            <p className="text-[13px] text-muted-foreground leading-snug">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default CheckoutSocialProof;
