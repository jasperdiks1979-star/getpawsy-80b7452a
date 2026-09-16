/**
 * Commerce V2 storefront navigation (Safe Copy).
 *
 * Every href here MUST map to a real route registered in src/App.tsx.
 * No dead links, no placeholder destinations.
 */
export interface NavItem {
  label: string;
  href: string;
  description?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: 'Shop', href: '/products', description: 'Browse cat essentials' },
  { label: 'Cats', href: '/collections/cats', description: 'Litter boxes, trees and enrichment' },
  { label: 'Sets', href: '/bundles', description: 'Shop compatible product sets' },
  { label: 'Help', href: '/help', description: 'Support, shipping & returns' },
];

export const POLICY_NAV: NavItem[] = [
  { label: 'Contact', href: '/contact' },
  { label: 'Shipping', href: '/shipping' },
  { label: 'Returns & Refunds', href: '/returns' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Cookies', href: '/cookies' },
];

export const SHOP_NAV: NavItem[] = [
  { label: 'Cat essentials', href: '/products' },
  { label: 'Litter boxes', href: '/collections/cat-litter-boxes' },
  { label: 'Cat trees', href: '/collections/cat-trees-and-condos' },
  { label: 'Sets', href: '/bundles' },
  { label: 'Pet care guides', href: '/guides' },
];

export const SUPPORT_NAV: NavItem[] = [
  { label: 'Help center', href: '/help' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Track your order', href: '/track' },
  { label: 'About GetPawsy', href: '/about' },
];
