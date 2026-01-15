import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Instagram, Facebook, Twitter, Youtube, Heart, Send, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import logoIcon from '@/assets/logo-getpawsy.png';

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
      { label: 'All Products', href: '/products' },
      { label: 'Dogs', href: '/products?category=dogs' },
      { label: 'Cats', href: '/products?category=cats' },
      { label: 'Toys', href: '/products?category=toys' },
      { label: 'Grooming', href: '/products?category=care' },
    ],
    support: [
      { label: 'Contact', href: '/contact' },
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns', href: '/returns' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Track Order', href: '/track' },
    ],
    company: [
      { label: 'About Us', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Careers', href: '/careers' },
      { label: 'Partners', href: '/partners' },
    ],
  };

  const socialLinks = [
    { icon: Instagram, href: 'https://instagram.com', label: 'Instagram', color: 'hover:text-pink-400' },
    { icon: Facebook, href: 'https://facebook.com', label: 'Facebook', color: 'hover:text-blue-400' },
    { icon: Twitter, href: 'https://twitter.com', label: 'Twitter', color: 'hover:text-sky-400' },
    { icon: Youtube, href: 'https://youtube.com', label: 'YouTube', color: 'hover:text-red-400' },
  ];

  return (
    <footer className="relative mt-auto overflow-hidden">
      {/* Decorative top wave */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-background to-transparent pointer-events-none" />
      
      {/* Newsletter Section */}
      <div className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 py-16 relative">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM5QzkyQUMiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        
        <div className="container px-4 md:px-6 relative">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-6">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
              Stay in the Loop
            </h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Get exclusive deals, pet care tips, and early access to new products.
            </p>
            
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 pl-4 pr-4 rounded-xl border-2 border-border/50 bg-background/80 backdrop-blur-sm focus:border-primary"
                />
              </div>
              <Button 
                type="submit" 
                size="lg"
                disabled={isSubmitting}
                className="h-12 px-6 btn-organic gap-2 font-semibold"
              >
                {isSubmitting ? (
                  'Subscribing...'
                ) : (
                  <>
                    Subscribe
                    <Send className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
            
            <p className="text-xs text-muted-foreground mt-4">
              By subscribing you agree to our privacy policy. Unsubscribe anytime.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="bg-foreground text-background">
        <div className="container px-4 md:px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
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
                  <motion.a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl bg-background/10 text-background/70 transition-colors ${social.color}`}
                  >
                    <social.icon className="w-5 h-5" />
                  </motion.a>
                ))}
              </div>

              {/* Contact Info */}
              <div className="space-y-3 pt-2">
                <a href="mailto:support@getpawsy.pet" className="flex items-center gap-3 text-sm text-background/70 hover:text-primary transition-colors">
                  <Mail className="w-4 h-4" />
                  <span>support@getpawsy.pet</span>
                </a>
                <a href="tel:+18001234567" className="flex items-center gap-3 text-sm text-background/70 hover:text-primary transition-colors">
                  <Phone className="w-4 h-4" />
                  <span>+1 (800) 123-4567</span>
                </a>
                <div className="flex items-center gap-3 text-sm text-background/70">
                  <MapPin className="w-4 h-4" />
                  <span>Ships from USA 🇺🇸</span>
                </div>
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
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-background/10">
          <div className="container px-4 md:px-6 py-6">
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
                <Link to="/cookies" className="hover:text-primary transition-colors">
                  Cookie Policy
                </Link>
              </div>

              {/* Payment methods placeholder */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-background/40">Payment methods:</span>
                <div className="flex gap-1">
                  {['💳', '🏦', '📱'].map((icon, idx) => (
                    <span key={idx} className="text-lg">{icon}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
