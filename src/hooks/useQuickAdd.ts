import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import {
  resolveQuickAddPlan,
  type QuickAddPlan,
  type QuickAddProduct,
} from '@/lib/quickAdd';

export interface QuickAddOptions {
  inStock?: boolean;
  displayName?: string;
  displayPrice?: number;
  /** Optional side effects that should only run on a real add. */
  onAdded?: (plan: Extract<QuickAddPlan, { kind: 'add' }>) => void;
}

/**
 * Shared quick add-to-cart behaviour for every non-PDP entry point.
 * Never silently defaults to the first variant: a product with more than one
 * purchasable option sends the shopper to the product page to choose.
 */
export function useQuickAdd() {
  const { addItem } = useCart();
  const navigate = useNavigate();

  return useCallback(
    (product: QuickAddProduct, options: QuickAddOptions = {}): QuickAddPlan => {
      const plan = resolveQuickAddPlan(product, options);
      if (plan.kind === 'add') {
        addItem(plan.item);
        options.onAdded?.(plan);
        toast.success('Added to cart');
        return plan;
      }
      if (plan.kind === 'choose') {
        toast.info('Choose an option to continue');
        navigate(plan.url);
        return plan;
      }
      toast.error(
        plan.reason === 'out_of_stock'
          ? 'This product is out of stock'
          : 'This product is not available right now',
      );
      return plan;
    },
    [addItem, navigate],
  );
}
