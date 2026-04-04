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

              {/* Social Links */}
              <div className="mt-4 flex items-center gap-3">
                <a href="https://pinterest.com/getpawsy" target="_blank" rel="noopener noreferrer" aria-label="GetPawsy on Pinterest" className="text-background/50 hover:text-primary transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
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
