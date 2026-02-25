/**
 * Cat Tree Authority Badges — Stability score, weight capacity, and "Best for Large Cats" tag.
 * Only renders for cat tree / cat condo / cat furniture products.
 */
import { Shield, Weight, Ruler, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CatTreeAuthorityBadgesProps {
  productName: string;
  category: string | null;
  price: number;
  weight?: number | null;
}

const CAT_TREE_PATTERNS = /cat\s*tree|cat\s*condo|cat\s*tower|scratching\s*post|cat\s*furniture|climbing/i;
const LARGE_CAT_PATTERNS = /large|big|heavy|maine\s*coon|sturdy|stable|xl|extra|overweight|20\s*lb|25\s*lb|30\s*lb/i;
const LITTER_PATTERNS = /litter\s*box|self[\s-]*clean|automatic\s*litter/i;

function getStabilityScore(name: string, price: number): number {
  let score = 3; // base
  if (price >= 150) score += 2;
  else if (price >= 80) score += 1;
  if (LARGE_CAT_PATTERNS.test(name)) score += 1;
  if (/solid|wood|heavy[\s-]*duty|reinforced|steel/i.test(name)) score += 1;
  return Math.min(score, 5);
}

function getWeightCapacity(name: string, price: number): string {
  if (/heavy|large|xl|overweight|maine\s*coon/i.test(name) || price >= 120) return '25+ lbs';
  if (price >= 70) return '20 lbs';
  return '15 lbs';
}

export function CatTreeAuthorityBadges({ productName, category, price, weight }: CatTreeAuthorityBadgesProps) {
  const name = productName.toLowerCase();
  const cat = (category || '').toLowerCase();
  
  const isCatTree = CAT_TREE_PATTERNS.test(name) || CAT_TREE_PATTERNS.test(cat);
  const isLitter = LITTER_PATTERNS.test(name) || LITTER_PATTERNS.test(cat);
  
  if (!isCatTree && !isLitter) return null;

  const isLargeCat = LARGE_CAT_PATTERNS.test(name);
  
  if (isCatTree) {
    const stability = getStabilityScore(name, price);
    const capacity = getWeightCapacity(name, price);
    
    return (
      <div className="flex flex-wrap gap-2 mt-3">
        {/* Stability Score */}
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-primary/30 bg-primary/5 text-primary">
          <Shield className="w-3.5 h-3.5" />
          Stability: {stability}/5
        </Badge>
        
        {/* Weight Capacity */}
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border bg-muted/50">
          <Weight className="w-3.5 h-3.5" />
          Up to {capacity}
        </Badge>
        
        {/* Best for Large Cats */}
        {isLargeCat && (
          <Badge className="gap-1.5 py-1.5 px-3 bg-accent/20 text-accent-foreground border border-accent/30">
            <Award className="w-3.5 h-3.5" />
            Best for Large Cats
          </Badge>
        )}
        
        {/* Size indicator */}
        {weight && weight > 10 && (
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border">
            <Ruler className="w-3.5 h-3.5" />
            {weight > 20 ? 'Extra Large' : weight > 15 ? 'Large' : 'Medium'}
          </Badge>
        )}
      </div>
    );
  }
  
  // Litter box badges
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {/self[\s-]*clean|automatic/i.test(name) && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-primary/30 bg-primary/5 text-primary">
          <Shield className="w-3.5 h-3.5" />
          Self-Cleaning
        </Badge>
      )}
      {/odor|smell/i.test(name) && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border bg-muted/50">
          Odor Control
        </Badge>
      )}
      {/enclosed|covered|hooded/i.test(name) && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border">
          Enclosed Design
        </Badge>
      )}
    </div>
  );
}
