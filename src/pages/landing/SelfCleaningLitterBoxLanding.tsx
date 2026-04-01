import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Check, Star, Truck, RotateCcw, ShieldCheck, Home, Mail, Package, Clock, Info } from 'lucide-react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import logoIcon from '@/assets/logo-getpawsy.png';
import {
  BUSINESS_LOCATION,
  BUSINESS_OPERATOR,
  BUSINESS_REGISTRATION,
  BUSINESS_VAT_ID,
  SUPPORT_EMAIL,
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
  FLAT_SHIPPING_RATE,
  SITE_LAST_UPDATED,
} from '@/lib/shipping-constants';

const Accordion = lazy(() => import('@/components/ui/accordion').then(m => ({ default: m.Accordion })));
const AccordionContent = lazy(() => import('@/components/ui/accordion').then(m => ({ default: m.AccordionContent })));
const AccordionItem = lazy(() => import('@/components/ui/accordion').then(m => ({ default: m.AccordionItem })));
const AccordionTrigger = lazy(() => import('@/components/ui/accordion').then(m => ({ default: m.AccordionTrigger })));

const PRODUCT_LINK = '/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat';

const REAL_PRODUCT = {
  main: '/images/products/self-cleaning-litter-box.jpg',
  mechanism: '/images/products/litter-box-mechanism.jpg',
  angle: '/images/products/litter-box-angle.jpg',
  detail: '/images/products/litter-box-detail.jpg',
};

const SPECS = [
  { label: 'Capacity', value: '60 Liters' },
  { label: 'Suitable For', value: 'Cats 5 lbs and up' },
  { label: 'Noise Level', value: 'Under 50 dB' },
  { label: 'Litter Type', value: 'Clumping clay litter' },
  { label: 'Power', value: 'USB-C adapter (included)' },
  { label: 'App Control', value: 'iOS & Android' },
  { label: 'Safety', value: 'Infrared sensors pause cycle when cat is inside' },
  { label: 'Multi-Cat', value: 'Yes — designed for multi-cat households' },
];

const BENEFITS = [
  'Helps control odor with built-in deodorizer',
  'Reduces daily litter cleaning effort',
  'Designed for multi-cat households',
  'Automatic cleaning cycle after each use',
];

const REVIEWS = [
  { text: 'After a week of use, the odor in our home has noticeably improved. Setup was straightforward.', name: 'Amanda L.', location: 'Texas, USA', featured: true },
  { text: 'Works well for our two cats. The app notifications are handy to track usage.', name: 'Sarah M.', location: 'California, USA' },
  { text: 'Our home smells much fresher since we started using this.', name: 'David K.', location: 'Florida, USA' },
  { text: 'Both our cats adapted within a few days. Runs quietly at night.', name: 'Jessica R.', location: 'New York, USA' },
];

const FAQS = [
  { q: 'Does it help with odor?', a: 'The built-in deodorizer is designed to help neutralize odors after each automatic cleaning cycle. Results may vary depending on litter type and environment.' },
  { q: 'Is it safe for cats?', a: 'Yes. Infrared sensors detect when your cat is inside and pause the cleaning cycle until they leave. Recommended for cats over 5 lbs.' },
  { q: 'How often do I need to empty the waste compartment?', a: 'Typically every few days depending on usage. The sealed waste compartment holds more than a traditional litter box.' },
  { q: 'Does it work for multiple cats?', a: 'Yes. The 60L capacity is designed for multi-cat households with automatic cleaning after each use.' },
  { q: 'How loud is the cleaning cycle?', a: 'The motor operates at under 50 dB, which is comparable to a quiet conversation.' },
  { q: 'What type of litter should I use?', a: 'Clumping clay litter works with the self-cleaning system. Avoid crystal or non-clumping litter.' },
  { q: 'What is your return policy?', a: `We offer a ${RETURN_WINDOW_DAYS}-day return policy. If you're not satisfied, contact ${SUPPORT_EMAIL} with your order number. Items must be unused and in original packaging. Refund issued to original payment method within 5 business days.` },
  { q: 'How long does shipping take?', a: `Processing takes ${PROCESSING_TIME}. Delivery to the US takes ${DELIVERY_TIME_STANDARD}. Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Orders under $${FREE_SHIPPING_THRESHOLD} ship for $${FLAT_SHIPPING_RATE.toFixed(2)}.` },
];

const StarRating = () => (
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => (
      <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
    ))}
  </div>
);

const CtaButton = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Link
    to={PRODUCT_LINK}
    className={`inline-block rounded-full bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl active:scale-[0.97] transition-all duration-200 text-center ${className}`}
  >
    {children}
  </Link>
);

export default function SelfCleaningLitterBoxLanding() {
  const [stickyVisible, setStickyVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setStickyVisible(y < 100 || y < lastScrollY.current);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Helmet>
        <title>Automatic Self-Cleaning Cat Litter Box – 60L, App Control | GetPawsy</title>
        <meta name="description" content="60L automatic self-cleaning cat litter box with smart app control, infrared safety sensors, and built-in deodorizer. Free US shipping over $35. 30-day returns." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`https://getpawsy.pet${PRODUCT_LINK}`} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": FAQS.map(faq => ({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": { "@type": "Answer", "text": faq.a },
          }))
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* ─── HEADER ─── */}
        <header className="flex items-center justify-between px-4 py-3 max-w-xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src={logoIcon} alt="GetPawsy" className="w-8 h-8 rounded-lg" />
            <span className="font-display text-lg font-bold text-foreground">
              Get<span className="text-primary">Pawsy</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Link to="/contact" className="hover:text-primary transition-colors flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Contact
            </Link>
            <Link to="/" className="hover:text-primary transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" /> Home
            </Link>
          </div>
        </header>

        {/* ─── SHIPPING & CONTACT BAR (above the fold) ─── */}
        <div className="px-4 mb-4">
          <div className="max-w-xl mx-auto bg-muted/50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span>Free shipping ${FREE_SHIPPING_THRESHOLD}+</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span>Delivery: {DELIVERY_TIME_STANDARD}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span>{RETURN_WINDOW_DAYS}-day returns</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-primary transition-colors">{SUPPORT_EMAIL}</a>
            </div>
          </div>
        </div>

        <div className="px-4 mb-4">
          <div className="max-w-xl mx-auto rounded-xl border border-border/40 bg-card/80 p-3 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">Last updated:</span> {SITE_LAST_UPDATED}</p>
            <p className="mt-1"><span className="font-medium text-foreground">Business:</span> GetPawsy · {BUSINESS_OPERATOR} · {BUSINESS_LOCATION}</p>
            <p className="mt-1">{BUSINESS_REGISTRATION} · {BUSINESS_VAT_ID}</p>
          </div>
        </div>

        {/* ─── 1. HERO (Product Page Style) ─── */}
        <section className="px-4 pt-2 pb-6 max-w-xl mx-auto">
          {/* Product Image */}
          <img
            src={REAL_PRODUCT.main}
            alt="GetPawsy 60L automatic self-cleaning cat litter box with app control"
            className="w-full max-w-sm mx-auto rounded-2xl mb-5 bg-white"
            loading="eager"
            fetchPriority="high"
            width={1200}
            height={1200}
            style={{ aspectRatio: '1/1', objectFit: 'contain' }}
          />

          {/* Thumbnail gallery */}
          <div className="flex justify-center gap-2 mb-5">
            {[REAL_PRODUCT.main, REAL_PRODUCT.mechanism, REAL_PRODUCT.angle, REAL_PRODUCT.detail].map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`Product view ${i + 1}`}
                className="w-14 h-14 rounded-lg border border-border/50 bg-white object-contain"
                loading="lazy"
              />
            ))}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
            GetPawsy Automatic Self-Cleaning Cat Litter Box – 60L
          </h1>
          <p className="text-sm text-muted-foreground mb-3">
            Automatic cleaning system with smart app control, infrared safety sensors, and built-in deodorizer. Designed for multi-cat households.
          </p>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-4">
            <StarRating />
            <span className="text-xs text-muted-foreground">Rated by customers</span>
          </div>

          <CtaButton>View Full Product & Pricing</CtaButton>
        </section>

        {/* ─── 2. PRODUCT SPECIFICATIONS ─── */}
        <section className="px-4 py-8 bg-card">
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Product Specifications
            </h2>
            <div className="border border-border rounded-xl overflow-hidden">
              {SPECS.map((spec, i) => (
                <div key={spec.label} className={`flex justify-between px-4 py-3 text-sm ${i % 2 === 0 ? 'bg-muted/30' : 'bg-background'}`}>
                  <span className="font-medium text-foreground">{spec.label}</span>
                  <span className="text-muted-foreground text-right">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 3. SHIPPING, RETURNS & CONTACT ─── */}
        <section className="px-4 py-8">
          <div className="max-w-xl mx-auto grid gap-4">
            <h2 className="text-xl font-bold text-foreground">Shipping & Returns</h2>

            <div className="bg-muted/40 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">Processing Time</p>
                  <p className="text-sm text-muted-foreground">{PROCESSING_TIME}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">Delivery Time</p>
                  <p className="text-sm text-muted-foreground">{DELIVERY_TIME_STANDARD} to the United States</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">Shipping Cost</p>
                  <p className="text-sm text-muted-foreground">Free over ${FREE_SHIPPING_THRESHOLD} · ${FLAT_SHIPPING_RATE.toFixed(2)} flat rate under</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <RotateCcw className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">{RETURN_WINDOW_DAYS}-Day Returns</p>
                  <p className="text-sm text-muted-foreground">Items must be unused and in original packaging. Refund to original payment method within 5 business days.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">Contact</p>
                  <p className="text-sm text-muted-foreground">
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a> · <Link to="/contact" className="text-primary hover:underline">Contact page</Link>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Link to="/shipping" className="text-primary hover:underline">Shipping Policy</Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/returns" className="text-primary hover:underline">Returns Policy</Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/contact" className="text-primary hover:underline">Contact Us</Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/about" className="text-primary hover:underline">About GetPawsy</Link>
            </div>
          </div>
        </section>

        {/* ─── 4. HOW IT WORKS ─── */}
        <section className="px-4 py-8 bg-card">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl font-bold text-foreground mb-4">How It Works</h2>
            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto mb-6">
              {[
                { emoji: '🐱', title: 'Cat enters the box' },
                { emoji: '📡', title: 'Sensors detect exit' },
                { emoji: '✅', title: 'Waste sealed automatically' },
              ].map((s, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 px-3 py-4 bg-background rounded-xl border border-border/50 text-center">
                  <span className="text-2xl">{s.emoji}</span>
                  <p className="text-xs font-semibold text-foreground leading-tight">{s.title}</p>
                </div>
              ))}
            </div>
            <img
              src={REAL_PRODUCT.mechanism}
              alt="Internal cleaning mechanism of the GetPawsy self-cleaning litter box"
              className="w-full max-w-sm mx-auto rounded-2xl bg-white"
              loading="lazy"
              width={1200}
              height={960}
              style={{ aspectRatio: '5/4', objectFit: 'contain' }}
            />
          </div>
        </section>

        {/* ─── 5. KEY FEATURES ─── */}
        <section className="px-4 py-8">
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-foreground text-center mb-5">Key Features</h2>
            <div className="grid gap-3 max-w-sm mx-auto">
              {BENEFITS.map((b) => (
                <div key={b} className="flex items-center gap-3 px-5 py-3.5 bg-muted/30 rounded-xl border border-border/40">
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 6. PRODUCT IMAGES ─── */}
        <section className="px-4 py-8 bg-card">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl font-bold text-foreground mb-4">Product Images</h2>
            <div className="grid grid-cols-2 gap-3">
              {[REAL_PRODUCT.angle, REAL_PRODUCT.detail].map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`GetPawsy self-cleaning litter box — view ${i + 1}`}
                  className="w-full rounded-xl bg-white"
                  loading="lazy"
                  style={{ aspectRatio: '1/1', objectFit: 'contain' }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ─── 7. CUSTOMER REVIEWS ─── */}
        <section className="px-4 py-8">
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-foreground text-center mb-1">Customer Reviews</h2>
            <p className="text-xs text-muted-foreground text-center mb-5">Feedback from verified buyers</p>
            <div className="grid gap-3">
              {REVIEWS.map((r, i) => (
                <div key={i} className="rounded-xl p-4 bg-card border border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <StarRating />
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">Verified Buyer</span>
                  </div>
                  <p className="text-sm text-muted-foreground italic">"{r.text}"</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.location}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 8. FAQ ─── */}
        <section className="bg-card px-4 py-8">
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-foreground text-center mb-5">Frequently Asked Questions</h2>
            <Suspense fallback={<div className="space-y-2">{FAQS.map((faq, i) => <div key={i} className="border rounded-xl px-4 py-4 bg-background text-sm font-medium">{faq.q}</div>)}</div>}>
              <Accordion type="single" collapsible className="space-y-2">
                {FAQS.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-4 bg-background">
                    <AccordionTrigger className="text-sm font-medium text-left py-4">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground pb-4">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Suspense>
          </div>
        </section>

        {/* ─── RELATED GUIDES — topical cluster interlinking ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto">
            <h2 className="text-lg font-bold text-foreground mb-4 text-center">Learn More About Self-Cleaning Litter Boxes</h2>
            <div className="grid gap-2">
              {[
                { path: '/guides/best-self-cleaning-litter-box-2026', title: 'Best Self-Cleaning Litter Box 2026 — Top Picks Tested' },
                { path: '/guides/how-does-self-cleaning-litter-box-work', title: 'How Do Self-Cleaning Litter Boxes Work?' },
                { path: '/guides/self-cleaning-litter-box-pros-cons', title: 'Self-Cleaning Litter Box: Pros & Cons' },
                { path: '/guides/litter-box-odor-control-solutions', title: 'Litter Box Odor Control Solutions' },
                { path: '/guides/best-litter-box-for-multiple-cats', title: 'Best Litter Box for Multiple Cats' },
                { path: '/guides/automatic-vs-manual-litter-box', title: 'Automatic vs Manual Litter Box' },
                { path: '/guides/how-to-train-cat-to-use-automatic-litter-box', title: 'How to Train Your Cat to Use an Automatic Litter Box' },
                { path: '/guides/is-self-cleaning-litter-box-safe', title: 'Is a Self-Cleaning Litter Box Safe?' },
              ].map((g) => (
                <Link
                  key={g.path}
                  to={g.path}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all group"
                >
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{g.title}</span>
                  <span className="text-xs text-primary ml-2 shrink-0">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA ─── */}
        <section className="px-4 py-8 text-center">
          <CtaButton className="text-lg px-10 py-5">View Full Product & Pricing</CtaButton>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
            <span>{RETURN_WINDOW_DAYS}-Day Returns</span>
            <span>•</span>
            <span>Free US Shipping ${FREE_SHIPPING_THRESHOLD}+</span>
            <span>•</span>
            <span>Secure Checkout</span>
          </div>
        </section>

        {/* ─── ABOUT ─── */}
        <section className="px-4 py-6">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-lg font-bold text-foreground mb-2">About GetPawsy</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              GetPawsy provides pet products designed to make daily life easier for pet owners. Registered business based in Apeldoorn, Netherlands (KVK 78156955, VAT NL003295015B69).
            </p>
          </div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer className="border-t border-border/30 bg-foreground text-background px-4 py-8">
          <div className="max-w-xl mx-auto text-center space-y-4">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">
              <a href="/about" className="text-background/60 hover:text-primary transition-colors">About Us</a>
              <a href="/contact" className="text-background/60 hover:text-primary transition-colors">Contact</a>
              <a href="/shipping" className="text-background/60 hover:text-primary transition-colors">Shipping Policy</a>
              <a href="/returns" className="text-background/60 hover:text-primary transition-colors">Returns Policy</a>
              <a href="/privacy" className="text-background/60 hover:text-primary transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-background/60 hover:text-primary transition-colors">Terms of Service</a>
            </div>
            <div className="text-xs text-background/40 space-y-1">
              <p>GetPawsy — Pet Supplies for US Pet Owners</p>
              <p>Apeldoorn, Netherlands · KVK 78156955 · VAT NL003295015B69</p>
              <p><a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a></p>
            </div>
            <p className="text-[10px] text-background/30">
              © {new Date().getFullYear()} GetPawsy. All rights reserved.
            </p>
          </div>
        </footer>

        {/* ─── Sticky Mobile CTA ─── */}
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 md:hidden transition-transform duration-300 ${stickyVisible ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ contain: 'layout' }}
        >
          <div className="flex items-center justify-between border-t bg-background/95 backdrop-blur-sm shadow-lg px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Free shipping ${FREE_SHIPPING_THRESHOLD}+</span>
            <Link
              to={PRODUCT_LINK}
              className="rounded-full px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all text-center"
            >
              View Product
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
