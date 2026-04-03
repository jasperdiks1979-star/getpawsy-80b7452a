import { Link } from 'react-router-dom';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Cookie from 'lucide-react/dist/esm/icons/cookie';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import { useState, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import logoIcon from '@/assets/logo-getpawsy.png';
import { DebugPanel } from './DebugPanel';
import { getFounderModeStatus } from '@/lib/founder-mode';
import {
  SUPPORT_EMAIL,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  BUSINESS_LOCATION,
  BUSINESS_REGISTRATION,
  BUSINESS_VAT_ID,
  RESPONSE_TIME,
} from '@/lib/shipping-constants';
import { Truck, ShieldCheck, RotateCcw as ReturnIcon, Clock } from 'lucide-react';

const showToast = (type: 'success' | 'error', msg: string) => import('sonner').then(m => m.toast[type](msg));

const FounderBadge = forwardRef<HTMLDivElement>((_, ref) => {
  if (!getFounderModeStatus()) return null;
  return (
    <div ref={ref} className="fixed bottom-2 left-2 z-40 bg-foreground/90 text-background text-[10px] px-2 py-1 rounded-full opacity-60 pointer-events-none select-none">
      🛡️ Founder Mode ON
    </div>
  );
});
FounderBadge.displayName = 'FounderBadge';

const FooterSection = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={className}>
      <button
        className="font-display font-semibold text-sm mb-4 w-full text-left flex items-center justify-between md:pointer-events-none text-background"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
      >
        {title}
        <ChevronDown className={`w-4 h-4 md:hidden transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${isOpen ? 'block' : 'hidden'} md:block`}>
        {children}
      </div>
    </div>
  );
};

const footerLinks = {
  shop: [
    { label: 'All Products', href: '/products' },
    { label: 'Bestsellers', href: '/bestsellers' },
    { label: 'Shop Dogs', href: '/collections/dogs' },
    { label: 'Shop Cats', href: '/collections/cats' },
    { label: 'All Collections', href: '/collections/all' },
  ],
  collections: [
    { label: 'Cat Trees & Condos', href: '/collections/cat-trees-and-condos' },
    { label: 'Cat Litter Boxes', href: '/collections/cat-litter-boxes' },
    { label: 'Dog Beds', href: '/collections/dog-beds' },
    { label: 'Dog Travel', href: '/collections/dog-travel-accessories' },
  ],
  guides: [
    { label: 'Cat Litter Box Guide', href: '/guides/best-cat-litter-box-2026' },
    { label: 'Best Cat Trees', href: '/guides/best-cat-trees-small-apartments' },
    { label: 'Dog Car Seat Guide', href: '/guides/best-dog-car-seats-safe-travel' },
    { label: 'Dog Training Guide', href: '/guides/complete-dog-training-guide-2026' },
    { label: 'Cat Toys Guide', href: '/guides/best-interactive-cat-toys-that-work' },
    { label: 'All Guides', href: '/guides' },
    { label: 'Blog', href: '/blog' },
  ],
  support: [
    { label: 'Contact Us', href: '/contact' },
    { label: 'Shipping Policy', href: '/shipping' },
    { label: 'Returns & Refunds', href: '/returns' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Track Your Order', href: '/track' },
  ],
  company: [
    { label: 'About Us', href: '/about' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

const LinkList = ({ links }: { links: { label: string; href: string }[] }) => (
  <ul className="space-y-2.5">
    {links.map((link) => (
      <li key={link.href}>
        <a href={link.href} className="text-sm text-background/60 hover:text-primary transition-colors">
          {link.label}
        </a>
      </li>
    ))}
  </ul>
);

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative mt-auto w-full max-w-[100vw] overflow-x-hidden pb-safe">
      <div className="bg-foreground text-background w-full">
        <div className="container px-4 md:px-6 py-12 max-w-full">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-2 space-y-4">
              <Link to="/" className="inline-flex items-center gap-2.5">
                <img src={logoIcon} alt="GetPawsy" className="w-10 h-10 rounded-xl" />
                <span className="font-display text-xl font-bold">
                  Get<span className="text-primary">Pawsy</span>
                </span>
              </Link>
              <div className="text-sm text-background/60 space-y-1">
                <p>{BUSINESS_LOCATION}</p>
                <p>{BUSINESS_REGISTRATION} · VAT: {BUSINESS_VAT_ID}</p>
                <p className="text-background/40 text-xs mt-1">Online-only business. No physical retail location.</p>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-sm text-primary hover:underline block mt-2"
                aria-label="Email customer support"
              >
                {'support' + '@' + 'getpawsy.pet'}
              </a>

              {/* Merchant Trust Signals */}
              <div className="mt-4 space-y-2 text-xs text-background/60">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-primary flex-shrink-0" />
                  <span>Customer support responds within 24 hours</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-primary flex-shrink-0" />
                  <span>Secure checkout &amp; encrypted payments</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ReturnIcon className="w-3 h-3 text-primary flex-shrink-0" />
                  <span>{RETURN_WINDOW_DAYS}-day returns policy</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3 h-3 text-primary flex-shrink-0" />
                  <span>Free shipping on orders over ${FREE_SHIPPING_THRESHOLD}</span>
                </div>
              </div>

              <p className="text-xs text-background/40 mt-3 leading-relaxed">
                GetPawsy is a registered pet supply business based in the Netherlands, serving customers in the United States with free shipping on orders over ${FREE_SHIPPING_THRESHOLD}.
              </p>
            </div>

            {/* Shop */}
            <FooterSection title="Shop">
              <LinkList links={footerLinks.shop} />
            </FooterSection>

            {/* Collections */}
            <FooterSection title="Collections">
              <LinkList links={footerLinks.collections} />
            </FooterSection>

            {/* Help */}
            <FooterSection title="Help">
              <LinkList links={footerLinks.support} />
              <div className="mt-4">
                <LinkList links={footerLinks.company} />
              </div>
            </FooterSection>

            {/* Guides */}
            <FooterSection title="Guides">
              <LinkList links={footerLinks.guides} />
            </FooterSection>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-background/10">
          <div className="container px-4 md:px-6 py-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-3">
              <p className="text-xs text-background/40">
                © {currentYear} GetPawsy. All rights reserved.
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-xs text-background/50">
                <a href="/privacy" className="hover:text-primary transition-colors">Privacy</a>
                <a href="/terms" className="hover:text-primary transition-colors">Terms</a>
                <Link to="/cookies" className="hover:text-primary transition-colors">Cookies</Link>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-cookie-settings'))}
                  className="hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  <Cookie className="w-3 h-3" /> Settings
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="hover:text-primary transition-colors inline-flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset App Data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will clear your cart, wishlist, and recently viewed products.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          localStorage.clear();
                          showToast('success', 'Data cleared! Refreshing...');
                          setTimeout(() => window.location.reload(), 1000);
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Reset
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <PaymentBadges variant="light" />
            </div>
          </div>
        </div>
      </div>
      <DebugPanel />
      <FounderBadge />
    </footer>
  );
};
