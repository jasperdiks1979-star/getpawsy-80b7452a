/**
 * ProductGuaranteeBadge
 *
 * Category-specific reassurance line shown under the global trust grid on
 * the PDP. Static, deterministic, derived from product category/name —
 * never invents claims, never makes medical/efficacy promises, and respects
 * the high-risk terminology policy (no "vet-approved", no "guaranteed cure").
 */
import { ShieldCheck } from 'lucide-react';

interface Props {
  productName?: string | null;
  category?: string | null;
  className?: string;
}

interface Guarantee {
  title: string;
  detail: string;
}

function resolveGuarantee(name: string, category: string): Guarantee {
  const hay = `${name} ${category}`.toLowerCase();

  if (/litter/i.test(hay)) {
    return {
      title: 'Odor-control promise',
      detail: 'Built to lock in odors. Not satisfied within 30 days? Return it.',
    };
  }
  if (/cat\s*tree|cat\s*condo|scratching/i.test(hay)) {
    return {
      title: 'Stability promise',
      detail: 'Designed to support adult cats safely. 30-day return window applies.',
    };
  }
  if (/bed|cushion|mat/i.test(hay)) {
    return {
      title: 'Comfort promise',
      detail: 'Supportive fill that holds its shape. Try it risk-free for 30 days.',
    };
  }
  if (/harness|leash|collar/i.test(hay)) {
    return {
      title: 'Fit promise',
      detail: 'Exchange for a different size within 30 days, no questions asked.',
    };
  }
  if (/carrier|crate/i.test(hay)) {
    return {
      title: 'Travel-ready promise',
      detail: 'Built for trips. If it doesn’t fit your pet, send it back.',
    };
  }
  if (/brush|comb|paw\s*cleaner|groom|shampoo|nail/i.test(hay)) {
    return {
      title: 'Skin-safe materials',
      detail: 'Pet-friendly construction. 30-day satisfaction return window.',
    };
  }
  if (/feeder|dispenser|fountain/i.test(hay)) {
    return {
      title: 'Mechanical reliability',
      detail: 'Quiet motor and clean fit. Defect? We replace it.',
    };
  }
  if (/toy|ball|chew/i.test(hay)) {
    return {
      title: 'Built-to-last promise',
      detail: 'Durable construction for everyday play. 30-day return window.',
    };
  }

  return {
    title: '30-day satisfaction promise',
    detail: 'Try it at home. If it isn’t right for your pet, send it back.',
  };
}

export function ProductGuaranteeBadge({ productName, category, className = '' }: Props) {
  const g = resolveGuarantee(productName || '', category || '');
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 ${className}`}
      aria-label="Product guarantee"
    >
      <ShieldCheck
        className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">{g.title}</p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">{g.detail}</p>
      </div>
    </div>
  );
}

export default ProductGuaranteeBadge;
