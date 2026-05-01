/**
 * Post-Purchase Offer — shows a single related product with a timed discount
 * after checkout. The offer expires after 10 minutes.
 * Lightweight: uses existing cart context + query.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Sparkles, ShoppingBag, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const OFFER_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const OFFER_DISCOUNT_PERCENT = 10;

interface PostPurchaseOfferProps {
  /** IDs of products just purchased — used to find a related but different product */
  purchasedProductIds: string[];
}

export const PostPurchaseOffer = ({ purchasedProductIds }: PostPurchaseOfferProps) => {
  const [dismissed, setDismissed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(OFFER_DURATION_MS);
  const startTime = useRef(Date.now());

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      const remaining = Math.max(0, OFFER_DURATION_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch a related product not in the purchase
  const { data: offerProduct } = useQuery({
    queryKey: ['post-purchase-offer', purchasedProductIds],
    queryFn: async () => {
      // Get categories of purchased products
      const baseIds = purchasedProductIds.map(id => id.split('-')[0]);
      
      const { data: purchasedProducts } = await supabase
        .from('products_public')
        .select('category')
        .in('id', baseIds);

      const categories = [...new Set(purchasedProducts?.map(p => p.category).filter(Boolean) || [])];

      // Find related product from same category
      let query = supabase
        .from('products_public')
        .select('id, name, price, image_url, slug, compare_at_price')
        .eq('is_active', true)
        .gt('price', 10) // Skip very cheap items
        .limit(10);

      if (categories.length > 0) {
        query = query.in('category', categories);
      }

      const { data } = await query;
      if (!data) return null;

      // Filter out purchased items and pick one
      const candidates = data.filter(p => !baseIds.includes(p.id));
      if (candidates.length === 0) return null;

      // Pick the one with highest price (best margin)
      return candidates.sort((a, b) => Number(b.price) - Number(a.price))[0];
    },
    enabled: purchasedProductIds.length > 0,
    staleTime: Infinity, // Don't refetch — this is a one-time offer
  });

  const expired = timeLeft <= 0;
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  if (dismissed || expired || !offerProduct) return null;

  const originalPrice = Number(offerProduct.price);
  const discountedPrice = originalPrice * (1 - OFFER_DISCOUNT_PERCENT / 100);
  const savings = originalPrice - discountedPrice;
  const productUrl = offerProduct.slug
    ? `/products/${offerProduct.slug}`
    : `/products`;

  return (
    <div className="bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-2xl p-6 border border-primary/20 relative">
      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
        aria-label="Dismiss offer"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="font-display font-semibold text-foreground">
          Exclusive Post-Purchase Offer
        </h3>
        <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
          {OFFER_DISCOUNT_PERCENT}% Off
        </Badge>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <Clock className="w-4 h-4 text-primary" />
        <span>
          Offer expires in{' '}
          <span className="font-mono font-semibold text-foreground">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </span>
      </div>

      {/* Product */}
      <div className="flex items-center gap-4">
        <Link to={productUrl} className="shrink-0">
          <img
            src={offerProduct.image_url || '/placeholder.svg'}
            alt={offerProduct.name}
            className="w-20 h-20 object-cover rounded-xl border border-border/50"
            loading="lazy"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={productUrl}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            {offerProduct.name}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-primary">
              ${discountedPrice.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground line-through">
              ${originalPrice.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-[hsl(var(--success))] font-medium mt-0.5">
            You save ${savings.toFixed(2)}
          </p>
        </div>
      </div>

      {/* CTA */}
      <Link to={productUrl} className="block mt-4">
        <Button className="w-full gap-2">
          <ShoppingBag className="w-4 h-4" />
          View & Add to Next Order
        </Button>
      </Link>

      <p className="text-[10px] text-muted-foreground text-center mt-2">
        This offer is available for a limited time only
      </p>
    </div>
  );
};
