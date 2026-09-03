import React from 'react';

interface LowStockBadgeProps {
  stock: number | null | undefined;
  /** Retained for API compatibility. */
  threshold?: number;
  className?: string;
}

/**
 * Scarcity messaging is disabled.
 *
 * "Low stock — only a few left" is an urgency claim we cannot substantiate
 * per-visitor, so this component renders nothing. It is kept so existing call
 * sites keep compiling.
 */
export const LowStockBadge: React.FC<LowStockBadgeProps> = () => null;

export default LowStockBadge;
