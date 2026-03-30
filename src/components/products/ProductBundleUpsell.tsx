import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';

/**
 * Product Bundle Upsell
 * 
 * Shows a contextual bundle offer below the Add to Cart button
 * for specific hero products. Displays a complementary product
 * with a bundled discount.
 */

interface BundleItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_url: string;
  shortName: string;
}

interface BundleConfig {
  mainProductId: string;
  companion: BundleItem;
  discountPercent: number;
  headline: string;
}

const BUNDLE_CONFIGS: Record<string, BundleConfig> = {
  'dog-cot-cooling-pet-bed-3': {
    mainProductId: 'c7177ee4-5509-492f-965f-617402968f5c',
    companion: {
      id: '510dfad4-9d31-4a14-92ad-e70f349a8ea6',
      name: 'U-Shaped Cooling Pad for Dogs & Cats',
      slug: 'u-shaped-cooling-pad-for-cats-and-dogs-cat-and-dog-neck-sleeping-pad-summer-ice-feeling-u-shaped-hea',
      price: 48.99,
      image_url: 'https://cf.cjdropshipping.com/d45343a3-94f7-4411-92b3-85304b45aee1.jpg',
      shortName: 'Cooling Pad',
    },
    discountPercent: 10,
    headline: 'Complete Summer Cooling Bundle',
  },
};

interface ProductBundleUpsellProps {
  productSlug: string;
  mainProductPrice: number;
  mainProductName: string;
}

export const ProductBundleUpsell = ({
  productSlug,
  mainProductPrice,
  mainProductName,
}: ProductBundleUpsellProps) => {
  const config = BUNDLE_CONFIGS[productSlug];
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  if (!config) return null;

  const { companion, discountPercent, headline } = config;
  const bundleTotal = mainProductPrice + companion.price;
  const discountAmount = bundleTotal * (discountPercent / 100);
  const bundlePrice = bundleTotal - discountAmount;

  const handleAddBundle = () => {
    // Add companion product to cart
    addItem({
      id: companion.id,
      name: companion.name,
      price: companion.price,
      image: companion.image_url,
    });
    setAdded(true);
    toast.success(`${companion.shortName} added to cart!`, {
      description: `Save ${discountPercent}% when bought together.`,
    });
  };

  return (
    <div className="bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-2xl p-5 border border-primary/15 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        <h3 className="font-display font-semibold text-foreground text-sm">
          {headline}
        </h3>
        <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
          Save {discountPercent}%
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <Link to={`/product/${companion.slug}`} className="shrink-0">
          <img
            src={companion.image_url}
            alt={companion.name}
            className="w-16 h-16 object-cover rounded-xl border border-border/50"
            loading="lazy"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={`/product/${companion.slug}`}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            Add {companion.shortName}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-semibold text-foreground">
              ${companion.price.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground line-through">
              ${(companion.price * (1 + discountPercent / 100)).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bundle total: ${bundlePrice.toFixed(2)} (save ${discountAmount.toFixed(2)})
          </p>
        </div>
        <Button
          size="sm"
          variant={added ? 'outline' : 'default'}
          onClick={handleAddBundle}
          disabled={added}
          className="shrink-0"
        >
          {added ? (
            <>
              <Check className="w-4 h-4 mr-1" /> Added
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1" /> Add
            </>
          )}
        </Button>
      </div>

      {/* Joint support cross-sell - contextual only */}
      <div className="pt-3 border-t border-border/30">
        <p className="text-xs text-muted-foreground">
          🦴 Many pet parents also add a{' '}
          <Link
            to="/product/youmile-hip-joint-health-supplement-for-dogs-120-chews-glucosamine-chondroitin-f72f"
            className="text-primary hover:underline font-medium"
          >
            joint support supplement
          </Link>{' '}
          for dogs with stiffness or arthritis.
        </p>
      </div>
    </div>
  );
};

export default ProductBundleUpsell;
