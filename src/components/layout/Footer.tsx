import { Link } from 'react-router-dom';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
// Icons are eager within this module — but the module itself is lazy-loaded by Layout,
// so these only download when Footer enters the viewport
import Mail from 'lucide-react/dist/esm/icons/mail';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Instagram from 'lucide-react/dist/esm/icons/instagram';
import Facebook from 'lucide-react/dist/esm/icons/facebook';
import Twitter from 'lucide-react/dist/esm/icons/twitter';
import Youtube from 'lucide-react/dist/esm/icons/youtube';
import Heart from 'lucide-react/dist/esm/icons/heart';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import Cookie from 'lucide-react/dist/esm/icons/cookie';
import Clock from 'lucide-react/dist/esm/icons/clock';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import { useState, useCallback } from 'react';
// ⚡ sonner deferred — only needed on form submit
const showToast = (type: 'success' | 'error', msg: string) => import('sonner').then(m => m.toast[type](msg));
// ⚡ supabase NOT imported at top-level — dynamic import keeps ~138KB SDK off critical path
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);
// ⚡ zod deferred — validation only needed on form submit
const getEmailSchema = () => import('zod').then(m => m.z.string().trim().email({ message: 'Invalid email address' }).max(255));
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import logoIcon from '@/assets/logo-getpawsy.png';
import { DebugPanel } from './DebugPanel';
import { getFounderModeStatus } from '@/lib/founder-mode';

const FounderBadge = () => {
  if (!getFounderModeStatus()) return null;
  return (
    <div className="fixed bottom-2 left-2 z-40 bg-foreground/90 text-background text-[10px] px-2 py-1 rounded-full opacity-60 pointer-events-none select-none">
      🛡️ Founder Mode ON
    </div>
  );
};
import {
  SUPPORT_EMAIL,
  RESPONSE_TIME,
  BUSINESS_NAME,
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

// emailSchema loaded lazily — see handleNewsletterSubmit

/**
 * Collapsible footer section — collapses on mobile to reduce DOM/paint cost.
 * Desktop: always expanded. Mobile: collapsed by default, expand on tap.
 */
const FooterSection = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={className}>
      <button
        className="font-display font-semibold text-lg mb-5 w-full text-left flex items-center justify-between md:pointer-events-none"
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

export const Footer = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailSchema = await getEmailSchema();
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      showToast('error', result.error.errors[0].message);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email: result.data });
      
      if (error) {
        if (error.code === '23505') {
          showToast('success', "You're already subscribed to our newsletter! 📬");
        } else {
          throw error;
        }
      } else {
        showToast('success', 'Thanks for subscribing! 🎉');
        
        // Send confirmation email (don't block on this)
        supabase.functions.invoke('send-newsletter-confirmation', {
          body: { email: result.data },
        }).catch((emailError: any) => {
          console.error('Failed to send confirmation email:', emailError);
        });
      }
      setEmail('');
    } catch (error) {
      console.error('Newsletter subscription error:', error);
      showToast('error', 'Something went wrong. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentYear = new Date().getFullYear();

  const footerLinks = {
    // Dog Training — primary authority silo
    dogTrainingLinks: [
      { label: 'Potty Training Gear', href: '/collections/dog-potty-training' },
      { label: 'Leash & Control', href: '/collections/dog-leash-control' },
      { label: 'Anti-Bark Solutions', href: '/collections/dog-anti-bark' },
      { label: 'Puppy Training Essentials', href: '/collections/puppy-training-essentials' },
      { label: 'Training Accessories', href: '/collections/dog-training-accessories' },
      { label: 'Dog Training Guide Hub', href: '/dog/best-dog-training-and-travel-gear-2026' },
      { label: 'Training Tips Blog', href: '/blog?category=dogs' },
    ],
    // Cat — deprioritized, secondary
    catLinks: [
      { label: 'Cat Trees & Condos', href: '/collections/cat-trees-and-condos' },
      { label: 'Cat Litter Boxes', href: '/collections/best-cat-litter-boxes' },
      { label: 'Cat Scratching Posts', href: '/collections/best-cat-scratching-posts' },
      { label: 'Cat Carriers', href: '/collections/best-cat-carriers' },
    ],
    // Pet Care Guides — topical authority links
    guideLinks: [
      { label: 'Best Cat Litter Box 2026', href: '/guides/best-cat-litter-box-2026' },
      { label: 'Best Dog Carriers for Travel', href: '/guides/best-dog-carriers-for-travel' },
      { label: 'Best Cat Trees for Indoor Cats', href: '/guides/best-cat-trees-for-indoor-cats' },
      { label: 'Best Automatic Cat Feeder', href: '/guides/best-automatic-cat-feeder' },
      { label: 'All Guides', href: '/guides' },
    ],
    discoverLinks: [
      { label: 'Shop All', href: '/shop' },
      { label: 'Trending Products', href: '/trending-pet-products' },
      { label: 'Recent Products', href: '/recent-products' },
      { label: 'Bestsellers', href: '/bestsellers' },
      { label: 'All Products', href: '/products' },
    ],
    support: [
      { label: 'Help Center', href: '/help' },
      { label: 'Contact', href: '/contact' },
      { label: 'Shipping Policy', href: '/shipping' },
      { label: 'Returns & Refunds', href: '/returns' },
      { label: 'Track Your Order', href: '/track' },
      { label: 'FAQ', href: '/faq' },
    ],
    company: [
      { label: 'About Us', href: '/about' },
      { label: 'Why Trust Our Reviews', href: '/why-trust-our-reviews' },
      { label: 'Blog', href: '/blog' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  };

  // Social links removed — generic domain links (instagram.com, facebook.com)
  // without real brand profiles are flagged as misleading by Google.
  // Re-add when actual GetPawsy social profiles exist.
  const socialLinks: { icon: typeof Instagram; href: string; label: string; color: string }[] = [];

  return (
    <footer className="relative mt-auto w-full max-w-[100vw] overflow-x-hidden pb-safe">
      {/* Decorative top wave */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-background to-transparent pointer-events-none" />
      
      {/* Newsletter Section - Subtle, Premium */}
      <div className="bg-muted/30 py-12 relative w-full">
        <div className="container px-4 md:px-6 relative max-w-full">
          <div className="max-w-xl mx-auto text-center">
            <h3 className="text-xl font-display font-semibold text-foreground mb-2">
              Stay in the Loop
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Pet care tips, new arrivals & exclusive offers — no spam, ever.
            </p>
            
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-full border-border/50 bg-background"
              />
              <Button 
                type="submit" 
                size="default"
                disabled={isSubmitting}
                className="h-11 px-6 rounded-full gap-2 font-medium"
              >
                {isSubmitting ? 'Subscribing...' : 'Subscribe'}
              </Button>
            </form>
            
            <p className="text-xs text-muted-foreground mt-3">
              Unsubscribe anytime. We respect your privacy.
            </p>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="bg-foreground text-background w-full">
        <div className="container px-4 md:px-6 py-16 max-w-full">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-10">
            {/* Brand Column */}
            <div className="col-span-2 md:col-span-2 space-y-6">
              <Link to="/" className="inline-flex items-center gap-3 group">
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                  <img src={logoIcon} alt="GetPawsy" className="w-full h-full object-cover" />
                </div>
                <span className="font-display text-2xl font-bold">
                  Get<span className="text-primary">Pawsy</span>
                </span>
              </Link>
               <p className="text-background/70 leading-relaxed max-w-sm">
                GetPawsy is an independent online store focused on high-quality pet products for dogs, cats, and small animals. 
                Customer satisfaction is our priority.
               </p>
              
              {/* Social Links */}
              <div className="flex items-center gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl bg-background/10 text-background/70 transition-all duration-200 hover:scale-110 hover:-translate-y-0.5 active:scale-95 ${social.color}`}
                  >
                    <social.icon className="w-5 h-5" />
                  </a>
                ))}
              </div>

              {/* Contact Info */}
              <div className="space-y-3 pt-2">
                <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-3 text-sm text-background/70 hover:text-primary transition-colors">
                  <Mail className="w-4 h-4" />
                  <span>{SUPPORT_EMAIL}</span>
                </a>
                <div className="flex items-center gap-3 text-sm text-background/70">
                  <Clock className="w-4 h-4" />
                  <span>Mon–Fri 9:00–17:00 EST • Within 24h</span>
                </div>
                 <div className="flex items-center gap-3 text-sm text-background/70">
                   <MapPin className="w-4 h-4" />
                   <span>Apeldoorn, Netherlands</span>
                 </div>
              </div>
              
              {/* Trust highlights */}
              <div className="pt-4 space-y-2 text-sm text-background/60">
                <p>✓ Free shipping on orders ${FREE_SHIPPING_THRESHOLD}+</p>
                <p>✓ {RETURN_WINDOW_DAYS}-day hassle-free returns</p>
                <p>✓ Secure checkout via Stripe</p>
              </div>
            </div>

            {/* Dog Training — primary authority column */}
            <FooterSection title="🐕 Dog Training">
              <ul className="space-y-3">
                {footerLinks.dogTrainingLinks.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group">
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </FooterSection>

            {/* Cat — secondary, deprioritized */}
            <FooterSection title="🐈 Cat Essentials">
              <ul className="space-y-3">
                {footerLinks.catLinks.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group">
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </FooterSection>

            {/* Pet Care Guides */}
            <FooterSection title="📚 Pet Care Guides">
              <ul className="space-y-3">
                {footerLinks.guideLinks.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group">
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </FooterSection>

            {/* Discover — crawl hub links */}
            <FooterSection title="🛍️ Discover">
              <ul className="space-y-3">
                {footerLinks.discoverLinks.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group">
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </FooterSection>

            {/* Support + Company — plain <a> tags for Google crawlability */}
            <FooterSection title="Customer Service">
              <ul className="space-y-3">
                {footerLinks.support.map((link) => (
                  <li key={link.href}>
                    <a 
                      href={link.href}
                      className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                    >
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>

              <FooterSection title="Company & Trust" className="mt-8">
                <ul className="space-y-3">
                  {footerLinks.company.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group">
                        <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        <span>{link.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </FooterSection>
            </FooterSection>
          </div>

          {/* Company Information — Business Transparency */}
          <div className="mt-12 pt-8 border-t border-background/10">
            <h4 className="font-display font-semibold text-lg mb-4">Company Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="space-y-2 text-sm">
               <p className="text-background/80"><strong className="text-background">Business Name:</strong> GetPawsy</p>
                <p className="text-background/80"><strong className="text-background">Operated by:</strong> Skidzo (Chamber of Commerce: 78156955)</p>
                <p className="text-background/80"><strong className="text-background">VAT ID:</strong> NL003295015B69</p>
                <p className="text-background/80"><strong className="text-background">Business Address:</strong> Apeldoorn, Gelderland, Netherlands</p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-background/80"><strong className="text-background">Support Email:</strong> <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a></p>
                <p className="text-background/80"><strong className="text-background">Support Hours:</strong> Mon–Fri 9:00–17:00 (EST)</p>
                <p className="text-background/80"><strong className="text-background">Response Time:</strong> Within 24 hours</p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-background/80"><strong className="text-background">Fulfillment:</strong> Orders ship to customers across the United States</p>
                <p className="text-background/80"><strong className="text-background">Serving:</strong> United States customers</p>
                <p className="text-background/80"><strong className="text-background">Currency:</strong> USD ($)</p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-background/80"><strong className="text-background">Secure Checkout:</strong> Powered by Stripe</p>
                <p className="text-background/80"><strong className="text-background">SSL Protected:</strong> 256-bit encryption</p>
                <p className="text-background/80"><strong className="text-background">Payments:</strong> Visa, Mastercard, PayPal, Apple Pay</p>
              </div>
            </div>
            <p className="text-sm text-background/60 mt-4 max-w-3xl">
              GetPawsy is an independent online store focused on high-quality pet products for dogs, cats, and small animals.
              We carefully select our pet products to ensure quality and comfort for your pets.
              Customer support available via email.
            </p>
            <div className="mt-3 space-y-1 text-sm text-background/60">
              <p>Operating location: Netherlands</p>
              <p>Shipping destination: United States</p>
              <p>KVK: 78156955 · VAT: NL003295015B69</p>
            </div>
          </div>

          {/* Dog Training Collection Highlights */}
          <div className="mt-8 pt-6 border-t border-background/10">
            <h4 className="font-display font-semibold text-lg mb-4">Dog Training Collections</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div>
                <Link to="/collections/dog-potty-training" className="text-sm font-medium text-primary hover:underline">
                  Potty Training Solutions →
                </Link>
                <p className="text-xs text-background/50 mt-1">
                  Pads, trays, sprays & bell systems for housebreaking any dog.
                </p>
              </div>
              <div>
                <Link to="/collections/dog-leash-control" className="text-sm font-medium text-primary hover:underline">
                  Leash & Walk Control →
                </Link>
                <p className="text-xs text-background/50 mt-1">
                  No-pull harnesses, training leashes & head collars for safe walks.
                </p>
              </div>
              <div>
                <Link to="/collections/dog-anti-bark" className="text-sm font-medium text-primary hover:underline">
                  Anti-Bark & Behavior →
                </Link>
                <p className="text-xs text-background/50 mt-1">
                  Humane bark control, calming aids & behavior correction tools.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-background/10">
          {/* Shipping Claims — plain text for crawler visibility */}
          <div className="container px-4 md:px-6 py-4 border-b border-background/10">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-background/60">
              <span>Processing time: 1–2 business days</span>
              <span>Delivery time: 3–7 business days</span>
              <span>Tracking included with every order</span>
              <span>30-day returns</span>
              <span>Secure checkout</span>
              <span>Customer support available via email</span>
            </div>
          </div>
        <div className="container px-4 md:px-6 py-6">
            <div className="flex flex-col gap-4">
              {/* US Trust Section */}
              <div className="flex flex-col items-center gap-2 text-xs text-background/40 border-b border-background/10 pb-4">
                <div className="flex flex-wrap justify-center gap-4 text-background/60 mb-2">
                  <span>📦 Free shipping to the United States</span>
                  <span>🚚 3–7 business day delivery</span>
                  <span>↩️ 30-day easy returns</span>
                  <span>🔒 Secure checkout</span>
                </div>
                <p>
                  Customer support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-background/60 hover:text-primary transition-colors">{SUPPORT_EMAIL}</a> | <Link to="/returns" className="text-background/60 hover:text-primary transition-colors">Returns Policy</Link>
                </p>
                <p className="text-background/30 text-[10px]">
                  GetPawsy is operated by Skidzo, a registered business in the Netherlands (KVK 78156955, VAT NL003295015B69). All orders, payments, and customer service handled in accordance with US consumer protection standards.
                </p>
              </div>
              
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-sm text-background/50 flex items-center gap-1">
                  © {currentYear} GetPawsy. Made with <Heart className="w-3.5 h-3.5 text-accent fill-accent" /> for pets.
                </p>
                
                <div className="flex flex-wrap justify-center gap-6 text-sm text-background/50">
                  <a href="/privacy" className="hover:text-primary transition-colors">
                    Privacy Policy
                  </a>
                  <a href="/terms" className="hover:text-primary transition-colors">
                    Terms of Service
                  </a>
                  <Link to="/cookies" rel="nofollow" className="hover:text-primary transition-colors">
                    Cookie Policy
                  </Link>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('open-cookie-settings'))}
                    className="hover:text-primary transition-colors inline-flex items-center gap-1"
                  >
                    <Cookie className="w-3 h-3" />
                    Cookie Settings
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="hover:text-primary transition-colors inline-flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />
                        Reset App Data
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset App Data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear your shopping cart, wishlist, and recently viewed products. 
                          This can help fix display issues but cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            localStorage.clear();
                            showToast('success', 'App data cleared! Refreshing...');
                            setTimeout(() => window.location.reload(), 1000);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Reset Data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Payment method badges */}
                <PaymentBadges variant="light" />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Debug Panel - only visible with ?debug=true */}
      <DebugPanel />
      <FounderBadge />
    </footer>
  );
};
