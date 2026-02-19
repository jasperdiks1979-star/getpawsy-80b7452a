import { Link } from 'react-router-dom';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
import { Mail, MapPin, Instagram, Facebook, Twitter, Youtube, Heart, ArrowRight, RotateCcw, Cookie, Clock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
// framer-motion removed — CSS transitions used instead (perf: critical path)
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
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

const emailSchema = z.string().trim().email({ message: 'Invalid email address' }).max(255);

export const Footer = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email: result.data });
      
      if (error) {
        if (error.code === '23505') {
          toast.info("You're already subscribed to our newsletter! 📬");
        } else {
          throw error;
        }
      } else {
        toast.success('Thanks for subscribing! 🎉');
        
        // Send confirmation email (don't block on this)
        supabase.functions.invoke('send-newsletter-confirmation', {
          body: { email: result.data },
        }).catch((emailError) => {
          console.error('Failed to send confirmation email:', emailError);
        });
      }
      setEmail('');
    } catch (error) {
      console.error('Newsletter subscription error:', error);
      toast.error('Something went wrong. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentYear = new Date().getFullYear();

  const footerLinks = {
    shop: [
      { label: 'Bestsellers', href: '/bestsellers' },
      { label: 'Best Cat Litter Boxes', href: '/collections/best-cat-litter-boxes' },
      { label: 'Best Dog Toys', href: '/collections/best-interactive-dog-toys' },
      { label: 'All Products', href: '/products' },
      { label: 'Dogs', href: '/products?category=dogs' },
      { label: 'Cats', href: '/products?category=cats' },
    ],
    support: [
      { label: 'Contact', href: '/contact' },
      { label: 'Shipping', href: '/shipping', noFollow: true },
      { label: 'Returns', href: '/returns' },
      { label: 'FAQ', href: '/faq' },
    ],
    company: [
      { label: 'About Us', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  };

  const socialLinks = [
    { icon: Instagram, href: 'https://instagram.com', label: 'Instagram', color: 'hover:text-pink-400' },
    { icon: Facebook, href: 'https://facebook.com', label: 'Facebook', color: 'hover:text-blue-400' },
    { icon: Twitter, href: 'https://twitter.com', label: 'Twitter', color: 'hover:text-sky-400' },
    { icon: Youtube, href: 'https://youtube.com', label: 'YouTube', color: 'hover:text-red-400' },
  ];

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
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
                Premium products for your pet, lovingly curated. 
                Making tails wag since 2024.
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

              {/* Contact Info - Enhanced with response time */}
              <div className="space-y-3 pt-2">
                <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-3 text-sm text-background/70 hover:text-primary transition-colors">
                  <Mail className="w-4 h-4" />
                  <span>{SUPPORT_EMAIL}</span>
                </a>
                <div className="flex items-center gap-3 text-sm text-background/70">
                  <Clock className="w-4 h-4" />
                  <span>{RESPONSE_TIME}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-background/70">
                  <MapPin className="w-4 h-4" />
                  <span>US-based support 🇺🇸</span>
                </div>
              </div>
              
              {/* Trust highlights */}
              <div className="pt-4 space-y-2 text-sm text-background/60">
                <p>✓ Free shipping on orders ${FREE_SHIPPING_THRESHOLD}+</p>
                <p>✓ {RETURN_WINDOW_DAYS}-day hassle-free returns</p>
                <p>✓ Secure checkout via Stripe</p>
              </div>
            </div>

            {/* Shop Links */}
            <div>
              <h4 className="font-display font-semibold text-lg mb-5">Shop</h4>
              <ul className="space-y-3">
                {footerLinks.shop.map((link) => (
                  <li key={link.href}>
                    <Link 
                      to={link.href} 
                      className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                    >
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support Links */}
            <div>
              <h4 className="font-display font-semibold text-lg mb-5">Customer Service</h4>
              <ul className="space-y-3">
                {footerLinks.support.map((link) => (
                  <li key={link.href}>
                    <Link 
                      to={link.href}
                      rel={(link as any).noFollow ? 'nofollow' : undefined}
                      className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                    >
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company Links */}
            <div>
              <h4 className="font-display font-semibold text-lg mb-5">Company</h4>
              <ul className="space-y-3">
                {footerLinks.company.map((link) => (
                  <li key={link.href}>
                    <Link 
                      to={link.href} 
                      className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                    >
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

          </div>
          {/* Expert Pet Buying Guides — SEO Cornerstone Link Section */}
          <div className="mt-12 pt-8 border-t border-background/10">
            <h4 className="font-display font-semibold text-lg mb-4">Expert Pet Buying Guides</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {[
                { slug: 'best-cat-litter-box-2026', label: 'Best Cat Litter Box 2026 – Complete Guide' },
                { slug: 'best-cat-litter-box-furniture-enclosures-2026', label: 'Best Litter Box Furniture & Enclosures' },
                { slug: 'best-extra-large-litter-boxes', label: 'Best Extra Large Litter Boxes for Big Cats' },
                { slug: 'best-litter-boxes-multi-cat', label: 'Best Litter Boxes for Multi-Cat Homes' },
                { slug: 'best-cat-trees-small-apartments', label: 'Best Cat Trees for Small Apartments' },
                { slug: 'how-many-litter-boxes-per-cat', label: 'How Many Litter Boxes Per Cat? N+1 Rule' },
                { slug: 'best-litter-box-small-apartments', label: 'Best Litter Box for Small Apartments' },
                { slug: 'best-litter-box-kittens', label: 'Best Litter Box for Kittens – Starter Picks' },
                { slug: 'best-litter-box-senior-cats', label: 'Best Litter Box for Senior Cats' },
                { slug: 'best-low-tracking-litter-box', label: 'Best Low-Tracking Litter Box 2026' },
              ].map((guide) => (
                <Link
                  key={guide.slug}
                  to={`/guides/${guide.slug}`}
                  className="text-sm text-background/70 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                >
                  <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  <span>{guide.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-background/10">
        <div className="container px-4 md:px-6 py-6">
            <div className="flex flex-col gap-4">
              {/* US Trust Section */}
              <div className="flex flex-col items-center gap-2 text-xs text-background/40 border-b border-background/10 pb-4">
                <div className="flex flex-wrap justify-center gap-4 text-background/60 mb-2">
                  <span>🇺🇸 US-Based Customer Support</span>
                  <span>🚚 Fast US Shipping</span>
                  <span>🔄 30-Day Easy Returns</span>
                </div>
                <p>
                  Customer support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-background/60 hover:text-primary transition-colors">{SUPPORT_EMAIL}</a> | <Link to="/returns" className="text-background/60 hover:text-primary transition-colors">Returns Policy</Link>
                </p>
                <p className="text-background/30 text-[10px]">
                  GetPawsy is operated by Skidzo, a registered business. All orders, payments, and customer service handled in accordance with US consumer protection standards.
                </p>
              </div>
              
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-sm text-background/50 flex items-center gap-1">
                  © {currentYear} GetPawsy. Made with <Heart className="w-3.5 h-3.5 text-accent fill-accent" /> for pets.
                </p>
                
                <div className="flex flex-wrap justify-center gap-6 text-sm text-background/50">
                  <Link to="/privacy" className="hover:text-primary transition-colors">
                    Privacy Policy
                  </Link>
                  <Link to="/terms" className="hover:text-primary transition-colors">
                    Terms of Service
                  </Link>
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
                            toast.success('App data cleared! Refreshing...');
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
