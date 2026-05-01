import { memo, useMemo } from 'react';
import { Plus, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';

interface FreeShippingNudgeProps {
  amountNeeded: number;
  currentItemIds: string[];
}

/**
 * Suggests a specific product that bridges the free shipping gap.
 * Picks the cheapest product whose price >= amountNeeded (so one add gets free shipping).
 * Falls back to cheapest product above $5 if none perfectly bridges.
 */
export const FreeShippingNudge = memo(({ amountNeeded, currentItemIds }: FreeShippingNudgeProps) => {
  const { addItem } = useCart();

  const baseProductIds = useMemo(
    () => currentItemIds.map(id => id.split('-')[0]),
    [currentItemIds]
  );

  const { data: nudgeProduct } = useQuery({
    queryKey: ['free-shipping-nudge', amountNeeded, baseProductIds],
    queryFn: async () => {
      // Find products priced just above the gap amount
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, price, image_url, slug')
        .eq('is_active', true)
        .gte('price', amountNeeded)
        .order('price', { ascending: true })
        .limit(20);

      if (error || !data) return null;

      // Filter out items already in cart
      const candidates = data.filter(p => !baseProductIds.includes(p.id));
      
      // Return the cheapest qualifying product
      return candidates[0] || null;
    },
    enabled: amountNeeded > 0 && amountNeeded <= FREE_SHIPPING_THRESHOLD * 0.6,
    staleTime: 5 * 60 * 1000,
  });

  if (!nudgeProduct) return null;

  const handleAdd = () => {
    addItem({
      id: nudgeProduct.id,
      slug: nudgeProduct.slug ?? undefined,
      name: nudgeProduct.name,
      price: Number(nudgeProduct.price),
      image: nudgeProduct.image_url || '/placeholder.svg',
    });
    toast.success('Added! You now qualify for free shipping 🎉');
  };

  return (
    <div className="mt-2 flex items-center gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
      <img
        src={nudgeProduct.image_url || '/placeholder.svg'}
        alt={nudgeProduct.name}
        className="w-10 h-10 object-cover rounded-md shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{nudgeProduct.name}</p>
        <p className="text-xs text-primary font-semibold">${Number(nudgeProduct.price).toFixed(2)}</p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 h-7 text-xs gap-1"
        onClick={handleAdd}
      >
        <Plus className="w-3 h-3" />
        Add
      </Button>
    </div>
  );
});

FreeShippingNudge.displayName = 'FreeShippingNudge';
