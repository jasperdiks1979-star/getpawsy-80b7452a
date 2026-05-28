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
import { getConversionFlag } from '@/lib/conversionFlags';
import {
  SUPPORT_EMAIL,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  BUSINESS_LOCATION,
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

const FooterSection = ({ title, children, className, premium }: { title: string; children: React.ReactNode; className?: string; premium?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={className}>
      <button
        className={
          premium
            ? "font-display text-[11px] uppercase tracking-[0.22em] mb-5 w-full text-left flex items-center justify-between md:pointer-events-none text-background/80"
            : "font-display font-semibold text-sm mb-4 w-full text-left flex items-center justify-between md:pointer-events-none text-background"
        }
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
    { label: 'All Collections', href: '/products' },
  ],
  collections: [
    { label: 'Cat Trees & Condos', href: '/collections/cat-trees-and-condos' },
    { label: 'Cat Litter Boxes', href: '/collections/cat-litter-boxes' },
    { label: 'Dog Beds', href: '/collections/dog-beds' },
    { label: 'Dog Travel Guide', href: '/guides/dog-travel-essentials-guide' },
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

const LinkList = ({ links, premium }: { links: { label: string; href: string }[]; premium?: boolean }) => (
  <ul className={premium ? "space-y-2" : "space-y-2.5"}>
    {links.map((link) => (
      <li key={link.href}>
        <a href={link.href} className={premium ? "text-[13px] text-background/55 hover:text-primary transition-colors" : "text-sm text-background/60 hover:text-primary transition-colors"}>
          {link.label}
        </a>
      </li>
    ))}
  </ul>
);

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const premium = getConversionFlag('premiumFooter');

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
                <p className="font-medium text-background/80">GetPawsy LLC</p>
                <p>New York, NY · United States</p>
                <p className="text-xs mt-0.5">Email: {SUPPORT_EMAIL}</p>
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
                GetPawsy LLC is a US-based online pet supply store serving customers across the United States. Free shipping on orders over ${FREE_SHIPPING_THRESHOLD}.
              </p>

              {/* Social Links */}
              <div className="mt-4 flex items-center gap-3">
                <a href="https://www.pinterest.com/getpawsystore/" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on Pinterest" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-1.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/></svg>
                </a>
                <a href="https://instagram.com/getpawsy" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on Instagram" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
                <a href="https://x.com/getpawsy" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on X" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://facebook.com/getpawsy" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on Facebook" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="https://linkedin.com/company/getpawsy" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on LinkedIn" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://youtube.com/@getpawsy" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on YouTube" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
              </div>
            </div>

            {/* Shop */}
            <FooterSection title="Shop" premium={premium}>
              <LinkList links={footerLinks.shop} premium={premium} />
            </FooterSection>

            {/* Collections */}
            <FooterSection title="Collections" premium={premium}>
              <LinkList links={footerLinks.collections} premium={premium} />
            </FooterSection>

            {/* Help */}
            <FooterSection title="Help" premium={premium}>
              <LinkList links={footerLinks.support} premium={premium} />
              <div className="mt-4">
                <LinkList links={footerLinks.company} premium={premium} />
              </div>
            </FooterSection>

            {/* Guides */}
            <FooterSection title="Guides" premium={premium}>
              <LinkList links={footerLinks.guides} premium={premium} />
            </FooterSection>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className={premium ? "border-t border-background/5" : "border-t border-background/10"}>
          <div className="container px-4 md:px-6 py-4">
            <div className={premium ? "flex flex-col md:flex-row justify-between items-center gap-3 md:gap-6" : "flex flex-col md:flex-row justify-between items-center gap-3"}>
              <p className={premium ? "text-[11px] text-background/35 tracking-wide" : "text-xs text-background/40"}>
                © {currentYear} GetPawsy. All rights reserved.
              </p>
              <div className={premium ? "flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-background/45" : "flex flex-wrap justify-center gap-4 text-xs text-background/50"}>
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
