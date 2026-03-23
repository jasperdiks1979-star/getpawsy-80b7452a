import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Check, Star, Truck, RotateCcw, ShieldCheck, Flame, Clock } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const PRODUCT_LINK = '/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat';

const REAL_PRODUCT = {
  main: 'https://cf.cjdropshipping.com/18f614cb-6909-40a2-a031-1d251708ebae.png',
  mechanism: 'https://cf.cjdropshipping.com/c887b0aa-7ff1-4aad-9fbf-903f3eb0a2f6.png',
  angle: 'https://cf.cjdropshipping.com/e4454bbe-8555-4938-97e7-9c25acf0bb2a.png',
  detail: 'https://cf.cjdropshipping.com/da3626ae-df14-47d8-b202-1e4f9c1f7a50.png',
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
  { text: 'I was skeptical… but after 1 day I was sold. Best thing I ever bought for my cats.', name: 'Amanda L.', rating: 5, featured: true },
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

const MicroTrust = () => (
  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-xs text-[#777]">
    <span>✔ 30-Day Returns</span>
    <span>✔ Fast US Shipping</span>
    <span>✔ Secure Checkout</span>
  </div>
);

const CtaButton = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Link
    to={PRODUCT_LINK}
    className={`inline-block rounded-full bg-[hsl(24,95%,53%)] px-8 py-4 text-base font-bold text-white shadow-lg hover:bg-[hsl(24,95%,47%)] hover:shadow-xl active:scale-[0.97] transition-all duration-200 text-center animate-[pulse_5s_ease-in-out_infinite] hover:animate-none ${className}`}
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
        <section className="px-4 pt-10 pb-6 max-w-xl mx-auto text-center">
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
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#1a1a1a] leading-tight mb-4">
            Stop Scooping Your Cat's Litter Forever 😺
          </h1>
          <p className="text-base md:text-lg text-[#555] mb-6 max-w-md mx-auto">
            No smell. No mess. Fully automatic cleaning — every single day.
          </p>
          <CtaButton>Get Yours Now</CtaButton>
          <MicroTrust />
        </section>

        {/* ─── OFFER BLOCK ─── */}
        <section className="px-4 pb-6">
          <div className="max-w-xl mx-auto">
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl px-6 py-5 text-center">
              <p className="text-lg md:text-xl font-extrabold text-[#1a1a1a] mb-1">
                🔥 Today Only: 40% OFF + Free US Shipping
              </p>
              <p className="text-sm text-[#555] mb-2">
                Limited stock available — once it's gone, it's gone
              </p>
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-orange-600">
                <Clock className="w-3.5 h-3.5" />
                <span>⏳ Sale ends tonight</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── EMOTIONAL TRIGGER ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center bg-white rounded-2xl border border-[#eee] px-6 py-10">
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-6 italic">
              "Imagine never scooping again."
            </h2>
            <div className="space-y-2 text-base text-[#555] max-w-sm mx-auto">
              <p>No smell in your home.</p>
              <p>No daily cleaning.</p>
              <p>No stress.</p>
              <p className="font-semibold text-[#1a1a1a] pt-2">Just a clean litter box — automatically.</p>
            </div>
          </div>
        </section>

        {/* ─── SCROLL STOPPER ─── */}
        <section className="px-4 py-8">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl font-extrabold text-[#1a1a1a] mb-5">
              This is why cat owners switch instantly
            </h2>
            <div className="grid gap-3 max-w-sm mx-auto text-left">
              {['No more daily scooping', 'No more bad smell', 'No effort — fully automatic'].map((line) => (
                <div key={line} className="flex items-center gap-3 px-5 py-3.5 bg-green-50 rounded-xl">
                  <Check className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm font-bold text-[#1a1a1a]">{line}</span>
                </div>
              ))}
            </div>
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
              src={REAL_PRODUCT.mechanism}
              alt="Self-cleaning litter box internal mechanism and cleaning system"
              className="w-full max-w-sm mx-auto rounded-2xl bg-white"
              loading="lazy"
              width={1200}
              height={960}
              style={{ aspectRatio: '5/4', objectFit: 'contain' }}
            />
            <div className="mt-8">
              <CtaButton>Get Yours Now — Before It Sells Out</CtaButton>
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
              <CtaButton>Get Yours Now — Before It Sells Out</CtaButton>
              <MicroTrust />
            </div>
          </div>
        </section>

        {/* ─── BUY NOW TRIGGER ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl px-6 py-6">
              <p className="text-lg font-extrabold text-[#1a1a1a] mb-1">
                🔥 Going viral right now
              </p>
              <p className="text-sm text-[#555] mb-2">
                Thousands of cat owners are switching this month
              </p>
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-orange-600">
                <Flame className="w-3.5 h-3.5 animate-pulse" />
                <span>Limited stock available</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SOCIAL PROOF ─── */}
        <section className="bg-white px-4 py-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-[#1a1a1a] text-center mb-8">What Cat Owners Say</h2>
            <div className="grid gap-4">
              {REVIEWS.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-5 shadow-sm border ${
                    r.featured
                      ? 'bg-orange-50/60 border-orange-200 ring-1 ring-orange-200'
                      : 'bg-[#FDFAF6] border-[#eee]'
                  }`}
                >
                  <StarRating />
                  <p className={`text-sm mt-2 italic ${r.featured ? 'text-[#1a1a1a] font-semibold' : 'text-[#444]'}`}>
                    "{r.text}"
                  </p>
                  <p className="text-xs font-semibold text-[#222] mt-2">— {r.name}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <CtaButton>Get Yours Now — Before It Sells Out</CtaButton>
              <MicroTrust />
            </div>
          </div>
        </section>

        {/* ─── SOCIAL MOMENTUM ─── */}
        <section className="px-4 py-10">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(24,95%,53%)] mb-3">Trending</p>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-4">
              Join 10,000+ cat owners who stopped scooping forever
            </h2>
            <p className="text-[#555] max-w-md mx-auto">
              A clean home, a happy cat, and zero effort. That's what thousands of cat owners now enjoy every single day.
            </p>
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
            <CtaButton className="text-lg px-10 py-5">Get Yours Now — Before It Sells Out</CtaButton>
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
                    <Icon className="w-5 h-5 text-[hsl(24,95%,53%)]" />
                  </div>
                  <span className="text-xs font-semibold text-[#444]">{label}</span>
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
              <h2 className="text-xl font-bold text-[#1a1a1a] mb-2">
                Try it risk-free for 30 days
              </h2>
              <p className="text-sm text-[#555] max-w-sm mx-auto">
                If you don't love it, we'll refund you. No questions asked.
              </p>
            </div>
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

        {/* ─── FINAL URGENCY ─── */}
        <section className="px-4 pt-10 pb-4">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-sm font-bold text-[#1a1a1a]">🔥 Only a few units left in stock</p>
            <p className="text-xs text-[#888] mt-1">Once it's gone, it's gone</p>
          </div>
        </section>

        {/* ─── FINAL CTA ─── */}
        <section className="px-4 pb-14 pt-4 text-center">
          <CtaButton className="text-lg px-10 py-5">Stop Scooping Forever</CtaButton>
          <MicroTrust />
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
              Buy Now — Free US Shipping
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
