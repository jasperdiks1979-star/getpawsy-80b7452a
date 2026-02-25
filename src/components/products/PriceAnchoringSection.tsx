/**
 * Price Anchoring + "Why This Isn't Cheap" persuasion section.
 * Renders on Tier A cat products to reframe price as a durability investment.
 */
import { Shield, CheckCircle } from 'lucide-react';

interface PriceAnchoringSectionProps {
  productName: string;
  category: string | null;
  price: number;
}

const CAT_PRODUCT_PATTERN = /cat\s*tree|cat\s*condo|cat\s*tower|cat\s*furniture|scratching|litter\s*box|self[\s-]*clean/i;

export function PriceAnchoringSection({ productName, category, price }: PriceAnchoringSectionProps) {
  const name = productName.toLowerCase();
  const cat = (category || '').toLowerCase();
  
  if (!CAT_PRODUCT_PATTERN.test(name) && !CAT_PRODUCT_PATTERN.test(cat)) return null;

  const isCatTree = /cat\s*tree|cat\s*condo|cat\s*tower|scratching/i.test(name) || /cat\s*tree|cat\s*condo/i.test(cat);
  const isLitter = /litter/i.test(name) || /litter/i.test(cat);

  // Price anchoring — show "comparable at" for products over certain thresholds
  const anchorPrice = price >= 179
    ? Math.round(price * 1.4)
    : price >= 99
    ? Math.round(price * 1.35)
    : null;

  const investmentPoints = isCatTree
    ? [
        'Heavy-duty base plate prevents tipping — even with 25+ lb cats',
        'Sisal-wrapped posts last 3–5× longer than carpet-covered alternatives',
        'Replaces multiple scratching posts, perches & hideaways in one unit',
        'Reduces furniture damage — pays for itself in months',
      ]
    : isLitter
    ? [
        'Eliminates daily scooping — saves 15+ minutes per day',
        'Advanced odor control reduces litter changes by 50%',
        'Enclosed design keeps mess contained and floors clean',
        'Built-in filtration extends between full cleanings',
      ]
    : [];

  if (investmentPoints.length === 0 && !anchorPrice) return null;

  return (
    <div className="space-y-4 mt-2">
      {/* Price anchor */}
      {anchorPrice && (
        <div className="flex items-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-muted-foreground">
            Comparable premium models retail at <span className="font-semibold text-foreground">${anchorPrice}+</span>
          </span>
        </div>
      )}

      {/* Investment reframe */}
      {investmentPoints.length > 0 && (
        <details className="group rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-semibold text-foreground hover:text-primary transition-colors select-none">
            <Shield className="w-4 h-4 text-primary" />
            {isCatTree ? "Why This Isn't a Cheap Cat Tree" : "Why This Is a Smart Investment"}
          </summary>
          <div className="px-4 pb-4 pt-1">
            <ul className="space-y-2">
              {investmentPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground/80 italic">
              Quality cat furniture is a long-term investment — not a recurring expense.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
