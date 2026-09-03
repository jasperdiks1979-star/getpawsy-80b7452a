/**
 * ProductGuaranteeBadge
 *
 * Displays only the factual, policy-backed return window. All category
 * "promise" claims (comfort promise, stability promise, odor-control promise,
 * skin-safe materials, mechanical reliability, built-to-last) were removed:
 * they are unsubstantiated product claims.
 */
import { ShieldCheck } from 'lucide-react';
import { RETURN_WINDOW_DAYS } from '@/lib/shipping-constants';

interface Props {
  productName?: string | null;
  category?: string | null;
  className?: string;
}

export function ProductGuaranteeBadge({ className = '' }: Props) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 ${className}`}
      aria-label="Return policy"
    >
      <ShieldCheck
        className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">
          {RETURN_WINDOW_DAYS}-day return policy
        </p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">
          Eligible items can be returned within {RETURN_WINDOW_DAYS} days. See our return policy for details.
        </p>
      </div>
    </div>
  );
}

export default ProductGuaranteeBadge;
