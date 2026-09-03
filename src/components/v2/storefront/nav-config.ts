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
  { label: 'Shop', href: '/products', description: 'Browse the full catalog' },
  { label: 'Cats', href: '/collections/cat', description: 'Litter boxes, trees, scratchers' },
  { label: 'Dogs', href: '/collections/dog', description: 'Beds, travel gear, walking' },
  { label: 'Best Sellers', href: '/bestsellers', description: 'Most popular right now' },
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
  { label: 'All products', href: '/products' },
  { label: 'Cat supplies', href: '/collections/cat' },
  { label: 'Dog supplies', href: '/collections/dog' },
  { label: 'Best sellers', href: '/bestsellers' },
  { label: 'Pet care guides', href: '/guides' },
];

export const SUPPORT_NAV: NavItem[] = [
  { label: 'Help center', href: '/help' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Track your order', href: '/track' },
  { label: 'About GetPawsy', href: '/about' },
];
