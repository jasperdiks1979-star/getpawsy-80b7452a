/**
 * Top 3 winner products — used for homepage badges, collection highlights,
 * and ad prioritization. Hand-curated based on price, margin, and conversion potential.
 */

export interface TopWinner {
  productId: string;
  slug: string;
  badge: 'top-pick' | 'best-seller' | 'most-popular';
  label: string;
}

export const TOP_WINNERS: TopWinner[] = [
  {
    productId: 'c7177ee4-5509-492f-965f-617402968f5c',
    slug: 'elevated-cooling-dog-bed-outdoor-pet-cot',
    badge: 'top-pick',
    label: 'Top Pick',
  },
  {
    productId: '128e0207-8a94-4d71-b428-5b7f5002528f',
    slug: 'automatic-cat-litter-box-self-cleaning-app-control',
    badge: 'best-seller',
    label: 'Best Seller',
  },
  {
    productId: '18028997-901a-40b8-8790-9e7b3ec558bf',
    slug: 'foldable-dog-stroller-pet-travel-cart',
    badge: 'most-popular',
    label: 'Most Popular',
  },
];

export function getWinnerBadge(productId: string): TopWinner | undefined {
  return TOP_WINNERS.find(w => w.productId === productId);
}

export function isTopWinner(productId: string): boolean {
  return TOP_WINNERS.some(w => w.productId === productId);
}
