import { Link } from 'react-router-dom';
import { PawPrint, Mail, Phone, MapPin, Instagram, Facebook, Twitter, Youtube, Heart, Send, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export const Footer = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vul je e-mailadres in');
      return;
    }
    
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success('Bedankt voor je aanmelding! 🎉');
    setEmail('');
    setIsSubmitting(false);
  };

  const currentYear = new Date().getFullYear();

  const footerLinks = {
    shop: [
      { label: 'Alle Producten', href: '/products' },
      { label: 'Honden', href: '/products?category=dogs' },
      { label: 'Katten', href: '/products?category=cats' },
      { label: 'Speelgoed', href: '/products?category=toys' },
      { label: 'Verzorging', href: '/products?category=care' },
    ],
    support: [
      { label: 'Contact', href: '/contact' },
      { label: 'Verzending', href: '/shipping' },
      { label: 'Retourneren', href: '/returns' },
      { label: 'Veelgestelde vragen', href: '/faq' },
      { label: 'Track & Trace', href: '/track' },
    ],
    company: [
      { label: 'Over ons', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Vacatures', href: '/careers' },
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
              Blijf op de hoogte
            </h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Ontvang exclusieve aanbiedingen, tips voor je huisdier en als eerste toegang tot nieuwe producten.
            </p>
            
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="Je e-mailadres"
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
                  'Aanmelden...'
                ) : (
                  <>
                    Aanmelden
                    <Send className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
            
            <p className="text-xs text-muted-foreground mt-4">
              Door je aan te melden ga je akkoord met onze privacyvoorwaarden. Afmelden kan altijd.
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
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg group-hover:scale-105 transition-transform">
                  <PawPrint className="w-7 h-7" />
                </div>
                <span className="font-display text-2xl font-bold">
                  Get<span className="text-primary">Pawsy</span>
                </span>
              </Link>
              <p className="text-background/70 leading-relaxed max-w-sm">
                Premium producten voor je huisdier, met liefde geselecteerd. 
                Wij maken staarten blij sinds 2024.
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
                <a href="tel:+31201234567" className="flex items-center gap-3 text-sm text-background/70 hover:text-primary transition-colors">
                  <Phone className="w-4 h-4" />
                  <span>+31 20 123 4567</span>
                </a>
                <div className="flex items-center gap-3 text-sm text-background/70">
                  <MapPin className="w-4 h-4" />
                  <span>Verzending vanuit Nederland 🇳🇱</span>
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
              <h4 className="font-display font-semibold text-lg mb-5">Klantenservice</h4>
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
              <h4 className="font-display font-semibold text-lg mb-5">Bedrijf</h4>
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
                © {currentYear} GetPawsy. Gemaakt met <Heart className="w-3.5 h-3.5 text-accent fill-accent" /> voor huisdieren.
              </p>
              
              <div className="flex flex-wrap justify-center gap-6 text-sm text-background/50">
                <Link to="/privacy" className="hover:text-primary transition-colors">
                  Privacybeleid
                </Link>
                <Link to="/terms" className="hover:text-primary transition-colors">
                  Algemene voorwaarden
                </Link>
                <Link to="/cookies" className="hover:text-primary transition-colors">
                  Cookiebeleid
                </Link>
              </div>

              {/* Payment methods placeholder */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-background/40">Betaalmethodes:</span>
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
