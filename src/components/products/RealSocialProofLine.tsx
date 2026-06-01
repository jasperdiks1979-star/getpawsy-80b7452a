/**
 * RealSocialProofLine
 *
 * Renders ONLY verified signals (real PDP views, real orders) returned by
 * `useRealSocialProof`. No invented quotes, names, or star averages.
 * Hidden entirely when no signal clears its threshold — per the project
 * compliance memory ("no fake reviews").
 */
import { Eye, ShoppingBag } from 'lucide-react';
import { useRealSocialProof } from '@/hooks/useRealSocialProof';

interface Props {
  productId: string | undefined | null;
  className?: string;
}

export function RealSocialProofLine({ productId, className = '' }: Props) {
  const { data } = useRealSocialProof(productId);
  if (!data?.hasAny) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${className}`}
      aria-label="Recent shopper activity"
    >
      {data.views7d !== null && (
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-primary/80" aria-hidden="true" />
          <span>
            <strong className="text-foreground tabular-nums">
              {data.views7d.toLocaleString('en-US')}
            </strong>{' '}
            viewed this week
          </span>
        </span>
      )}
      {data.orders30d !== null && (
        <span className="inline-flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-primary/80" aria-hidden="true" />
          <span>
            <strong className="text-foreground tabular-nums">
              {data.orders30d.toLocaleString('en-US')}
            </strong>{' '}
            ordered in the last 30 days
          </span>
        </span>
      )}
    </div>
  );
}

export default RealSocialProofLine;
