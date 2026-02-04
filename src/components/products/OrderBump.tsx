import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { computeAvailability } from '@/lib/availability';

interface Product {
  id: string;
  name: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  slug?: string | null;
  is_active?: boolean | null;
}

interface OrderBumpProps {
  product: Product | null;
  isChecked: boolean;
  onToggle: (checked: boolean, product: Product) => void;
  discountPercent?: number;
}

// Benefit copy based on product type
const BUMP_BENEFITS: Record<string, string> = {
  default: 'Complete your order with this add-on',
  protector: 'Protects your car interior from dirt, scratches & spills',
  cover: 'Full coverage protection for every ride',
  mat: 'Keeps your car clean and scratch-free',
  blanket: 'Adds extra comfort and warmth',
  liner: 'Easy to clean, perfect for messy trips',
  guard: 'Ultimate protection for your vehicle',
  accessory: 'The perfect companion for your purchase',
};

const getBumpBenefit = (productName: string): string => {
  const nameLower = productName.toLowerCase();
  for (const [key, benefit] of Object.entries(BUMP_BENEFITS)) {
    if (nameLower.includes(key)) return benefit;
  }
  return BUMP_BENEFITS.default;
};

// Discount for order bump
const ORDER_BUMP_DISCOUNT = 10;

export const OrderBump = ({
  product,
  isChecked,
  onToggle,
  discountPercent = ORDER_BUMP_DISCOUNT,
}: OrderBumpProps) => {
  // Don't render if no product
  if (!product) return null;

  // Check availability using centralized logic
  const availability = computeAvailability(product);
  if (!availability.isInStock) return null;

  const discountedPrice = product.price * (1 - discountPercent / 100);
  const savings = product.price - discountedPrice;
  const benefitCopy = getBumpBenefit(product.name);
  const productUrl = product.slug ? `/product/${product.slug}` : `/product/${product.id}`;

  const handleToggle = () => {
    onToggle(!isChecked, product);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className={`
        relative p-4 rounded-xl border-2 transition-all cursor-pointer
        ${isChecked 
          ? 'border-primary bg-primary/5 shadow-md' 
          : 'border-dashed border-muted-foreground/30 bg-muted/30 hover:border-primary/50'
        }
      `}
      onClick={handleToggle}
    >
      {/* Corner ribbon for discount */}
      <div className="absolute -top-2 -right-2">
        <Badge className="bg-gradient-to-r from-emerald-500 to-green-500 text-primary-foreground text-[10px] px-2 py-0.5 shadow-sm">
          Save {discountPercent}%
        </Badge>
      </div>

      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          <Checkbox
            checked={isChecked}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5"
          />
        </div>

        {/* Product Image */}
        <Link 
          to={productUrl}
          onClick={(e) => e.stopPropagation()}
          className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-border/50"
        >
          <img
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
                <Link 
                  to={productUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold hover:text-primary transition-colors line-clamp-1"
                >
                  Add {product.name}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {benefitCopy}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm font-bold text-primary">
              +${discountedPrice.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground line-through">
              ${product.price.toFixed(2)}
            </span>
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              Save ${savings.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Selection indicator */}
        {isChecked && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0"
          >
            <Check className="w-4 h-4 text-primary-foreground" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
