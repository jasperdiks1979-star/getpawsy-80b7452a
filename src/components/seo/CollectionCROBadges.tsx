import { ShieldCheck, Truck, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CollectionCROBadgesProps {
  collectionSlug: string;
  productName: string;
  productPrice: number;
}

const BADGE_CONFIG: Record<string, { badges: { icon: 'shield' | 'truck' | 'award'; label: string }[] }> = {
  'cat-trees-and-condos': {
    badges: [
      { icon: 'shield', label: 'Stability Tested' },
      { icon: 'award', label: 'Large Cat Approved' },
      { icon: 'truck', label: 'US Shipping' },
    ],
  },
  'best-cat-litter-boxes': {
    badges: [
      { icon: 'shield', label: 'Odor Control Tested' },
      { icon: 'award', label: 'Vet Recommended' },
      { icon: 'truck', label: 'US Shipping' },
    ],
  },
  'modern-cat-trees': {
    badges: [
      { icon: 'shield', label: 'Stability Tested' },
      { icon: 'award', label: 'Design Award' },
      { icon: 'truck', label: 'US Shipping' },
    ],
  },
  'best-cat-scratching-posts': {
    badges: [
      { icon: 'shield', label: 'Durability Tested' },
      { icon: 'truck', label: 'US Shipping' },
    ],
  },
};

const IconMap = {
  shield: ShieldCheck,
  truck: Truck,
  award: Award,
} as const;

export function CollectionCROBadges({ collectionSlug }: CollectionCROBadgesProps) {
  const config = BADGE_CONFIG[collectionSlug];
  if (!config) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {config.badges.map(({ icon, label }) => {
        const Icon = IconMap[icon];
        return (
          <Badge
            key={label}
            variant="outline"
            className="text-[10px] gap-1 py-0.5 px-1.5 bg-secondary/50 text-secondary-foreground border-secondary"
          >
            <Icon className="w-2.5 h-2.5" />
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

export function isMoneyCollection(slug: string): boolean {
  return slug in BADGE_CONFIG;
}
