import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Check, Star, Truck, RotateCcw, ShieldCheck, Clock, Home } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import logoIcon from '@/assets/logo-getpawsy.png';
import { SUPPORT_EMAIL } from '@/lib/shipping-constants';

const PRODUCT_LINK = '/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat';

const REAL_PRODUCT = {
  main: 'https://cf.cjdropshipping.com/18f614cb-6909-40a2-a031-1d251708ebae.png',
  mechanism: 'https://cf.cjdropshipping.com/c887b0aa-7ff1-4aad-9fbf-903f3eb0a2f6.png',
  angle: 'https://cf.cjdropshipping.com/e4454bbe-8555-4938-97e7-9c25acf0bb2a.png',
  detail: 'https://cf.cjdropshipping.com/da3626ae-df14-47d8-b202-1e4f9c1f7a50.png',
};

const PAIN_POINTS = [
  'Unpleasant odor that lingers in your home',
  'Daily scooping you dread',
  'Litter mess all around the box',
];

const BENEFITS = [
  'Helps reduce odor — built-in deodorizer',
  'No more daily scooping — automatically cleans after use',
  'Designed for multi-cat homes',
  'Saves you time every day',
];

const REVIEWS = [
  { text: 'I was skeptical… but after 1 day I was sold. Highly recommend for cat owners.', name: 'Amanda L.', rating: 5, featured: true },
  { text: 'This changed my daily routine. No more scooping at all.', name: 'Sarah M.', rating: 5 },
  { text: 'Our home smells much fresher since we started using this.', name: 'David K.', rating: 5 },
  { text: 'Both our cats adapted in one day. Great purchase.', name: 'Jessica R.', rating: 5 },
  { text: 'I was skeptical but it really works. So quiet too.', name: 'Michael T.', rating: 5 },
];

const FAQS = [
  { q: 'Does it help with odor?', a: 'Yes. Waste is automatically sealed after each use with a built-in deodorizer designed to help neutralize odors.' },
  { q: 'Is it safe for cats?', a: 'Yes. Infrared sensors detect when your cat is inside and pause the cleaning cycle until they leave.' },
  { q: 'How often do I empty it?', a: 'Every few days depending on use. The sealed waste compartment holds much more than a traditional box.' },
  { q: 'Does it work for multiple cats?', a: 'Yes. The 60L capacity is designed for multi-cat households with automatic cleaning after every use.' },
];

const MicroTrust = () => (
  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-xs text-muted-foreground">
    <span>✔ 30-Day Returns</span>
    <span>✔ Fast US Shipping</span>
    <span>✔ Secure Checkout</span>
  </div>
);

const CtaButton = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Link
    to={PRODUCT_LINK}
    className={`inline-block rounded-full bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl active:scale-[0.97] transition-all duration-200 text-center animate-[pulse_5s_ease-in-out_infinite] hover:animate-none ${className}`}
  >
    {children}
  </Link>
);

const StarRating = () => (
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => (
      <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
    ))}
  </div>
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
        <title>Self Cleaning Litter Box | GetPawsy</title>
        <meta name="description" content="Automatically cleans after use. Discover a smarter self-cleaning litter box for your cat." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`https://getpawsy.pet${PRODUCT_LINK}`} />
      </Helmet>

      <div className="min-h-screen bg-[#FDFAF6]">
        {/* ─── MINIMAL HEADER ─── */}
        <header className="flex items-center justify-between px-4 py-3 max-w-xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src={logoIcon} alt="GetPawsy" className="w-8 h-8 rounded-lg" />
            <span className="font-display text-lg font-bold text-foreground">
              Get<span className="text-primary">Pawsy</span>
            </span>
          </Link>
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
        </header>

        {/* ─── HERO ─── */}
        <section className="px-4 pt-6 pb-6 max-w-xl mx-auto text-center">
          <img
            src={REAL_PRODUCT.main}
            alt="60L automatic self-cleaning cat litter box — smart app control"
            className="w-full max-w-sm mx-auto rounded-2xl mb-8 bg-white"
            loading="eager"
            fetchPriority="high"
            width={1200}
            height={1200}
            style={{ aspectRatio: '1/1', objectFit: 'contain' }}
          />
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground leading-tight mb-4">
            Stop Scooping Your Cat's Litter 😺
          </h1>
          <p className="text-base md:text-lg text-muted-foreground mb-2 max-w-md mx-auto">
            Helps reduce odor. No mess. Automatically cleans after every use.
          </p>
          <p className="text-xs text-muted-foreground/70 mb-6">
            *Results may vary depending on usage and environment
          </p>
          <CtaButton>Get Yours Now</CtaButton>
          <MicroTrust />
        </section>

        {/* ─── OFFER BLOCK ─── */}
        <section className="px-4 pb-6">
          <div className="max-w-xl mx-auto">
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl px-6 py-5 text-center">
              <p className="text-lg md:text-xl font-extrabold text-foreground mb-1">
                🔥 Today Only: 40% OFF + Free US Shipping
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                Limited stock available — while supplies last
              </p>
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary">
                <Clock className="w-3.5 h-3.5" />
                <span>⏳ Sale ends tonight</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-6">How It Works</h2>
            <div className="grid gap-3 max-w-sm mx-auto">
              {[
                { step: '1', title: 'Detects when your cat leaves', desc: 'Infrared sensors identify when the litter box is empty.' },
                { step: '2', title: 'Triggers cleaning cycle', desc: 'The automatic mechanism separates waste from clean litter.' },
                { step: '3', title: 'Seals waste into compartment', desc: 'Waste is stored in a sealed drawer, helping reduce odor.' },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3 px-5 py-4 bg-card rounded-xl border border-border/50">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{s.step}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── EMOTIONAL TRIGGER ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center bg-white rounded-2xl border border-border/40 px-6 py-10">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 italic">
              "Imagine a litter box that cleans itself."
            </h2>
            <div className="space-y-2 text-base text-muted-foreground max-w-sm mx-auto">
              <p>Helps reduce odor in your home.</p>
              <p>No more daily cleaning routine.</p>
              <p>Less stress for you and your cat.</p>
              <p className="font-semibold text-foreground pt-2">A cleaner litter box — automatically.</p>
            </div>
          </div>
        </section>

        {/* ─── SCROLL STOPPER ─── */}
        <section className="px-4 py-8">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground mb-5">
              Why cat owners are making the switch
            </h2>
            <div className="grid gap-3 max-w-sm mx-auto text-left">
              {['No more daily scooping', 'Helps reduce litter box odor', 'Automatically cleans after use'].map((line) => (
                <div key={line} className="flex items-center gap-3 px-5 py-3.5 bg-green-50 rounded-xl">
                  <Check className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm font-bold text-foreground">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── PROBLEM ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
              Still scooping your cat's litter every day?
            </h2>
            <div className="grid gap-4 max-w-sm mx-auto">
              {PAIN_POINTS.map((point) => (
                <div key={point} className="flex items-center gap-3 bg-red-50 rounded-xl px-5 py-4 text-left">
                  <span className="text-red-400 text-lg font-bold">✕</span>
                  <span className="text-sm font-medium text-foreground/80">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── SOLUTION ─── */}
        <section className="px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              Automatically cleans after every use
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              After your cat leaves, infrared sensors trigger an automatic cycle that separates waste into a sealed compartment — helping reduce odor and mess.
            </p>
            <img
              src={REAL_PRODUCT.mechanism}
              alt="Self-cleaning litter box internal mechanism and cleaning system"
              className="w-full max-w-sm mx-auto rounded-2xl bg-white"
              loading="lazy"
              width={1200}
              height={960}
              style={{ aspectRatio: '5/4', objectFit: 'contain' }}
            />
            <div className="mt-8">
              <CtaButton>Get Yours Now</CtaButton>
              <MicroTrust />
            </div>
          </div>
        </section>

        {/* ─── PRODUCT VISUAL ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <img
              src={REAL_PRODUCT.angle}
              alt="Self-cleaning litter box — alternate angle showing full product"
              className="w-full max-w-md mx-auto rounded-2xl mb-6 bg-white"
              loading="lazy"
              width={1200}
              height={800}
              style={{ aspectRatio: '3/2', objectFit: 'contain' }}
            />
            <p className="text-2xl md:text-3xl font-extrabold text-foreground">
              No more daily scooping.
            </p>
          </div>
        </section>

        {/* ─── BENEFITS ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground text-center mb-8">Why Cat Owners Love It</h2>
            <div className="grid gap-3 max-w-sm mx-auto">
              {BENEFITS.map((b) => (
                <div key={b} className="flex items-center gap-3 px-5 py-4 bg-green-50 rounded-xl">
                  <Check className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-foreground/80">{b}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <CtaButton>Stop Scooping — Get Yours Now</CtaButton>
              <MicroTrust />
            </div>
          </div>
        </section>

        {/* ─── WHY BUY NOW ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-5">
              Why cat owners are choosing this
            </h2>
            <div className="grid gap-3 max-w-sm mx-auto text-left">
              {[
                'No more daily scooping routine',
                'Helps reduce unpleasant odor',
                'Designed for multiple cats',
                'Saves time every day',
              ].map((line) => (
                <div key={line} className="flex items-center gap-3 px-5 py-3 bg-card rounded-xl border border-border/40">
                  <Check className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-sm text-foreground">{line}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">Popular choice among cat owners</p>
          </div>
        </section>

        {/* ─── SOCIAL PROOF ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground text-center mb-2">What Cat Owners Say</h2>
            <p className="text-xs text-muted-foreground text-center mb-8">Highly rated by customers</p>
            <div className="grid gap-4">
              {REVIEWS.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-5 shadow-sm border ${
                    r.featured
                      ? 'bg-orange-50/60 border-orange-200 ring-1 ring-orange-200'
                      : 'bg-[#FDFAF6] border-border/40'
                  }`}
                >
                  <StarRating />
                  <p className={`text-sm mt-2 italic ${r.featured ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                    "{r.text}"
                  </p>
                  <p className="text-xs font-semibold text-foreground mt-2">— {r.name}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <CtaButton>Get Yours Now</CtaButton>
              <MicroTrust />
            </div>
          </div>
        </section>

        {/* ─── PRODUCT + CTA ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <img
              src={REAL_PRODUCT.detail}
              alt="Self-cleaning litter box product detail view"
              className="w-full max-w-md mx-auto rounded-2xl mb-6 bg-white"
              loading="lazy"
              width={1200}
              height={800}
              style={{ aspectRatio: '3/2', objectFit: 'contain' }}
            />
            <CtaButton className="text-lg px-10 py-5">Stop Scooping — Get Yours Now</CtaButton>
            <MicroTrust />
          </div>
        </section>

        {/* ─── TRUST ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto">
            <div className="flex justify-center gap-8">
              {[
                { icon: RotateCcw, label: '30-Day Returns' },
                { icon: ShieldCheck, label: 'Secure Checkout' },
                { icon: Truck, label: 'Fast US Shipping' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── RISK REVERSAL ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-8">
              <RotateCcw className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                30-Day Return Policy
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Not satisfied? Return your order within 30 days for a full refund. See our return policy for details.
              </p>
            </div>
          </div>
        </section>

        {/* ─── ABOUT ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-lg font-bold text-foreground mb-3">About GetPawsy</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              GetPawsy provides innovative pet solutions designed to make daily life easier for pet owners. We're operated by Skidzo, a registered business based in Apeldoorn, Netherlands (KVK 78156955).
            </p>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground text-center mb-8">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="space-y-2">
              {FAQS.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-4 bg-[#FDFAF6]">
                  <AccordionTrigger className="text-sm font-medium text-left py-4">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-4">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ─── FINAL CTA ─── */}
        <section className="px-4 pb-8 pt-6 text-center">
          <CtaButton className="text-lg px-10 py-5">Stop Scooping — Get Yours Now</CtaButton>
          <MicroTrust />
        </section>

        {/* ─── LP FOOTER ─── */}
        <footer className="border-t border-border/30 bg-foreground text-background px-4 py-8">
          <div className="max-w-xl mx-auto text-center space-y-4">
            <div className="flex justify-center gap-6 text-xs">
              <a href="/privacy" className="text-background/60 hover:text-primary transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-background/60 hover:text-primary transition-colors">Terms of Service</a>
              <a href="/contact" className="text-background/60 hover:text-primary transition-colors">Contact Us</a>
              <a href="/returns" className="text-background/60 hover:text-primary transition-colors">Returns</a>
            </div>
            <div className="text-xs text-background/40 space-y-1">
              <p>GetPawsy — Operated by Skidzo</p>
              <p>Apeldoorn, Netherlands · KVK 78156955 · VAT NL003295015B69</p>
              <p>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a>
              </p>
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
          <div className="flex items-center justify-between border-t bg-white/95 backdrop-blur-sm shadow-lg px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Free US Shipping</span>
            </div>
            <Link
              to={PRODUCT_LINK}
              className="rounded-full px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all"
            >
              Buy Now — Free Shipping
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
