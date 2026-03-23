import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Check, Star, Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const PRODUCT_LINK = '/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat';

const LP_IMAGES = {
  hero: '/lp/litter-box-hero-lifestyle.webp',
  happyCat: '/lp/litter-box-happy-cat.webp',
  solution: '/lp/litter-box-clean-solution.webp',
  scrollStopper: '/lp/litter-box-scroll-stopper.webp',
  trust: '/lp/litter-box-trust-scene.webp',
};

const PAIN_POINTS = [
  'Bad smell that fills your home',
  'Daily scooping you dread',
  'Litter mess all around the box',
];

const BENEFITS = [
  'No smell — built-in deodorizer',
  'No scooping — fully automatic',
  'Perfect for multi-cat homes',
  'Saves you 30+ minutes daily',
];

const REVIEWS = [
  { text: 'This changed my life. No more scooping at all.', name: 'Sarah M.', rating: 5 },
  { text: 'Our home smells fresh for the first time since we got cats.', name: 'David K.', rating: 5 },
  { text: 'Both our cats adapted in one day. Best purchase this year.', name: 'Jessica R.', rating: 5 },
  { text: 'I was skeptical but it really works. So quiet too.', name: 'Michael T.', rating: 5 },
];

const FAQS = [
  { q: 'Does it smell?', a: 'No. Waste is automatically sealed after each use with a built-in deodorizer that neutralizes odors at the source.' },
  { q: 'Is it safe for cats?', a: 'Yes. Infrared sensors detect when your cat is inside and pause the cleaning cycle until they leave.' },
  { q: 'How often do I empty it?', a: 'Every few days depending on use. The sealed waste compartment holds much more than a traditional box.' },
  { q: 'Does it work for multiple cats?', a: 'Absolutely. The 60L capacity is designed for multi-cat households with automatic cleaning after every use.' },
];

const CtaButton = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Link
    to={PRODUCT_LINK}
    className={`inline-block rounded-full bg-[hsl(24,95%,53%)] px-8 py-4 text-base font-bold text-white shadow-lg hover:bg-[hsl(24,95%,47%)] active:scale-[0.97] transition-all duration-200 text-center ${className}`}
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
        <meta name="description" content="No scooping ever. Discover the best self-cleaning litter box for your cat." />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`https://getpawsy.pet${PRODUCT_LINK}`} />
      </Helmet>

      <div className="min-h-screen bg-[#FDFAF6]">
        {/* ─── HERO ─── */}
        <section className="px-4 pt-10 pb-12 max-w-xl mx-auto text-center">
          <img
            src={LP_IMAGES.hero}
            alt="Self-cleaning litter box in a cozy living room with cat inside"
            className="w-full max-w-md mx-auto rounded-2xl shadow-lg mb-8"
            loading="eager"
            fetchPriority="high"
            width={1200}
            height={1200}
            style={{ aspectRatio: '1/1', objectFit: 'cover' }}
          />
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#1a1a1a] leading-tight mb-4">
            Self-Cleaning Litter Box —<br />No Scooping Ever
          </h1>
          <p className="text-base md:text-lg text-[#555] mb-6 max-w-md mx-auto">
            Stop cleaning your cat's litter every day. This smart litter box does it for you.
          </p>
          <CtaButton>Shop Now</CtaButton>
          <p className="mt-4 text-xs text-[#888]">
            Free US shipping over $35 • 30-day returns
          </p>
        </section>

        {/* ─── EMOTIONAL DESIRE (NEW) ─── */}
        <section className="px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(24,95%,53%)] mb-3">Trending</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-4">
              Cat owners are switching fast...
            </h2>
            <p className="text-[#555] mb-8 max-w-md mx-auto">
              A clean home, a happy cat, and zero effort. That's what thousands of cat owners now enjoy every single day.
            </p>
            <img
              src={LP_IMAGES.happyCat}
              alt="Happy relaxed cat lounging in a clean modern home"
              className="w-full max-w-md mx-auto rounded-2xl shadow-md"
              loading="lazy"
              width={1200}
              height={768}
              style={{ aspectRatio: '16/10', objectFit: 'cover' }}
            />
          </div>
        </section>

        {/* ─── PROBLEM ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-8">
              Still scooping your cat's litter every day?
            </h2>
            <div className="grid gap-4 max-w-sm mx-auto">
              {PAIN_POINTS.map((point) => (
                <div key={point} className="flex items-center gap-3 bg-red-50 rounded-xl px-5 py-4 text-left">
                  <span className="text-red-400 text-lg font-bold">✕</span>
                  <span className="text-sm font-medium text-[#333]">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── SOLUTION ─── */}
        <section className="px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-4">
              It cleans itself automatically
            </h2>
            <p className="text-[#555] mb-8 max-w-md mx-auto">
              After your cat leaves, infrared sensors trigger an automatic cycle that separates waste into a sealed compartment. No scooping, no smell, no effort.
            </p>
            <img
              src={LP_IMAGES.solution}
              alt="Modern self-cleaning litter box open and clean in a bright home"
              className="w-full max-w-sm mx-auto rounded-2xl shadow-sm"
              loading="lazy"
              width={1200}
              height={960}
              style={{ aspectRatio: '5/4', objectFit: 'cover' }}
            />
          </div>
        </section>

        {/* ─── SCROLL STOPPER (NEW) ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <img
              src={LP_IMAGES.scrollStopper}
              alt="Cat stepping into a self-cleaning litter box in a warm home"
              className="w-full max-w-md mx-auto rounded-2xl shadow-lg mb-6"
              loading="lazy"
              width={1200}
              height={800}
              style={{ aspectRatio: '3/2', objectFit: 'cover' }}
            />
            <p className="text-2xl md:text-3xl font-extrabold text-[#1a1a1a]">
              Never scoop again.
            </p>
          </div>
        </section>

        {/* ─── BENEFITS ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-[#1a1a1a] text-center mb-8">Why Cat Owners Love It</h2>
            <div className="grid gap-3 max-w-sm mx-auto">
              {BENEFITS.map((b) => (
                <div key={b} className="flex items-center gap-3 px-5 py-4 bg-green-50 rounded-xl">
                  <Check className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-[#333]">{b}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <CtaButton>Shop Now</CtaButton>
            </div>
          </div>
        </section>

        {/* ─── SOCIAL PROOF ─── */}
        <section className="px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-[#1a1a1a] text-center mb-8">What Cat Owners Say</h2>
            <div className="grid gap-4">
              {REVIEWS.map((r, i) => (
                <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-[#eee]">
                  <StarRating />
                  <p className="text-sm text-[#444] mt-2 italic">"{r.text}"</p>
                  <p className="text-xs font-semibold text-[#222] mt-2">— {r.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── PRODUCT + CTA (trust lifestyle image) ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <img
              src={LP_IMAGES.trust}
              alt="Woman relaxing on sofa with happy cat and self-cleaning litter box in background"
              className="w-full max-w-md mx-auto rounded-2xl shadow-md mb-6"
              loading="lazy"
              width={1200}
              height={800}
              style={{ aspectRatio: '3/2', objectFit: 'cover' }}
            />
            <CtaButton className="text-lg px-10 py-5">Get Yours Now</CtaButton>
          </div>
        </section>

        {/* ─── TRUST ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto flex flex-wrap justify-center gap-6">
            {[
              { icon: RotateCcw, label: '30-Day Returns' },
              { icon: ShieldCheck, label: 'Secure Checkout' },
              { icon: Truck, label: 'Fast US Shipping' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm text-[#555]">
                <Icon className="w-5 h-5 text-[hsl(24,95%,53%)]" />
                <span className="font-medium">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-[#1a1a1a] text-center mb-8">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="space-y-2">
              {FAQS.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-4 bg-[#FDFAF6]">
                  <AccordionTrigger className="text-sm font-medium text-left py-4">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-[#666] pb-4">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ─── FINAL CTA ─── */}
        <section className="px-4 py-14 text-center">
          <CtaButton className="text-lg px-10 py-5">Stop Scooping Forever</CtaButton>
        </section>

        {/* ─── Sticky Mobile CTA ─── */}
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 md:hidden transition-transform duration-300 ${stickyVisible ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ contain: 'layout' }}
        >
          <div className="flex items-center justify-between border-t bg-white/95 backdrop-blur-sm shadow-lg px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-xs text-[#888]">Free US Shipping</span>
            </div>
            <Link
              to={PRODUCT_LINK}
              className="rounded-full px-6 py-2.5 text-sm font-bold bg-[hsl(24,95%,53%)] text-white hover:bg-[hsl(24,95%,47%)] active:scale-[0.97] transition-all"
            >
              Shop Now
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
