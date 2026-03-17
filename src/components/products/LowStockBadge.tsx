import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface LowStockBadgeProps {
  stock: number | null | undefined;
  /** Threshold below which badge appears. Default: 10 */
  threshold?: number;
  className?: string;
}

/**
 * Safe low-stock indicator — no fake timers or urgency.
 * Only shows when real inventory is below threshold.
 */
export const LowStockBadge: React.FC<LowStockBadgeProps> = ({
  stock,
  threshold = 10,
  className = '',
}) => {
  // Don't show if stock is unknown or above threshold
  if (stock == null || stock <= 0 || stock > threshold) return null;

  return (
    <div className={`flex items-center gap-1.5 text-amber-600 dark:text-amber-400 ${className}`}>
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-sm font-medium">
        Low stock — only a few left
      </span>
    </div>
  );
};
