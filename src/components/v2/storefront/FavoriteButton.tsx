import { Heart } from 'lucide-react';
import { useWishlist } from '@/contexts/WishlistContext';

/** Accessible favorite toggle; stored on this device only (no login). */
export function FavoriteButton({ productId, name, className = '' }: { productId: string; name: string; className?: string }) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const on = isInWishlist(productId);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(productId); }}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favorites` : `Save ${name} to favorites`}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Heart className={`h-5 w-5 ${on ? 'fill-primary text-primary' : ''}`} aria-hidden="true" />
    </button>
  );
}
