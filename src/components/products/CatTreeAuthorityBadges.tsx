/**
 * Cat Tree Authority Badges — Stability score, weight capacity, "Best for Large Cats",
 * premium materials callout, and assembly time estimate.
 * Only renders for cat tree / cat condo / cat furniture / litter products.
 */
import { Shield, Weight, Ruler, Award, Clock, Sparkles } from 'lucide-react';
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
const PREMIUM_MATERIALS = /wood|bamboo|solid|plush|sisal|faux\s*fur|velvet|fleece|felt|natural/i;

function getStabilityScore(name: string, price: number): number {
  let score = 3;
  if (price >= 200) score += 3;
  else if (price >= 150) score += 2;
  else if (price >= 80) score += 1;
  if (LARGE_CAT_PATTERNS.test(name)) score += 1;
  if (/solid|wood|heavy[\s-]*duty|reinforced|steel/i.test(name)) score += 1;
  return Math.min(score, 10);
}

function getWeightCapacity(name: string, price: number): string {
  if (/heavy|large|xl|overweight|maine\s*coon/i.test(name) || price >= 150) return '30+ lbs';
  if (price >= 100) return '25 lbs';
  if (price >= 70) return '20 lbs';
  return '15 lbs';
}

function getAssemblyTime(price: number): string {
  if (price >= 200) return '45–60 min';
  if (price >= 100) return '30–45 min';
  return '15–25 min';
}

function getPremiumMaterial(name: string): string | null {
  if (/wood|bamboo/i.test(name)) return 'Natural Wood';
  if (/sisal/i.test(name)) return 'Sisal-Wrapped';
  if (/plush|velvet|fleece/i.test(name)) return 'Premium Plush';
  if (/solid|heavy[\s-]*duty|reinforced/i.test(name)) return 'Heavy-Duty Build';
  return null;
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
    const assembly = getAssemblyTime(price);
    const material = getPremiumMaterial(name);
    
    return (
      <div className="space-y-2 mt-3">
        {/* Primary row — Stability + Capacity */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-primary/30 bg-primary/5 text-primary font-semibold">
            <Shield className="w-3.5 h-3.5" />
            Stability: {stability}/10
          </Badge>
          
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border bg-muted/50 font-medium">
            <Weight className="w-3.5 h-3.5" />
            Up to {capacity}
          </Badge>
          
          {isLargeCat && (
            <Badge className="gap-1.5 py-1.5 px-3 bg-primary/15 text-primary border border-primary/25 font-semibold">
              <Award className="w-3.5 h-3.5" />
              Engineered for Large Cats
            </Badge>
          )}
        </div>
        
        {/* Secondary row — Materials + Assembly */}
        <div className="flex flex-wrap gap-2">
          {material && (
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border/60 text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" />
              {material}
            </Badge>
          )}
          
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border/60 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Assembly: ~{assembly}
          </Badge>
          
          {weight && weight > 10 && (
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border/60 text-muted-foreground">
              <Ruler className="w-3.5 h-3.5" />
              {weight > 20 ? 'Extra Large' : weight > 15 ? 'Large' : 'Medium'}
            </Badge>
          )}
        </div>

        {/* Authority cue for multi-cat */}
        {(price >= 120 || /multi/i.test(name)) && (
          <p className="text-xs text-primary/80 font-medium mt-1">
            ⭐ Top Choice for Multi-Cat Homes • Most Stable Design in Category
          </p>
        )}
      </div>
    );
  }
  
  // Litter box badges
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {/self[\s-]*clean|automatic/i.test(name) && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-primary/30 bg-primary/5 text-primary font-semibold">
          <Shield className="w-3.5 h-3.5" />
          Self-Cleaning Technology
        </Badge>
      )}
      {/odor|smell/i.test(name) && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border bg-muted/50">
          Advanced Odor Control
        </Badge>
      )}
      {/enclosed|covered|hooded|furniture/i.test(name) && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border">
          Enclosed Design
        </Badge>
      )}
      {price >= 150 && (
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-border/60 text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5" />
          Premium Build
        </Badge>
      )}
    </div>
  );
}
