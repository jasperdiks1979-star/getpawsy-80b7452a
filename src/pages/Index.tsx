import { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

// ── Lazy-loaded below-fold sections ──
const TrendingProducts = lazy(() => import('@/components/home/TrendingProducts'));
const StickyMobileCta = lazy(() => import('@/components/home/StickyMobileCta'));

// ── SEO schemas ──
const WebsiteSchema = lazy(() => import('@/components/seo/WebsiteSchema').then(m => ({ default: m.WebsiteSchema })));
const LocalBusinessSchema = lazy(() => import('@/components/seo/LocalBusinessSchema').then(m => ({ default: m.LocalBusinessSchema })));

const showToast = (type: 'success' | 'error' | 'info', msg: string) =>
  import('sonner').then(m => m.toast[type](msg));
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

const CATEGORIES = [
  { name: 'Cat Litter Solutions', href: '/collections/self-cleaning-litter-boxes', emoji: '🐱' },
  { name: 'Cat Trees & Condos', href: '/collections/cat-trees-and-condos', emoji: '🏠' },
  { name: 'Dog Beds & Comfort', href: '/collections/orthopedic-dog-beds', emoji: '🛏️' },
  { name: 'Dog Travel & Safety', href: '/collections/dog-car-seats', emoji: '🚗' },
  { name: 'Training Essentials', href: '/collections/dog-training-accessories', emoji: '🎯' },
] as const;

const BUYING_GUIDES = [
  { path: '/best-cat-litter-box-2026', title: 'Best Self-Cleaning Litter Boxes 2026', badge: '🔥 Top Guide' },
  { path: '/best-dog-car-seat-safety', title: 'Best Dog Car Seats (Crash-Tested)', badge: '🔥 Top Guide' },
  { path: '/guides/best-cat-trees-and-condos-2026', title: 'Best Cat Trees & Condos 2026', badge: '🔥 Top Guide' },
  { path: '/guides/best-dog-anxiety-solutions-2026', title: 'Best Dog Anxiety Solutions 2026', badge: '🔥 Top Guide' },
] as const;

const GUIDES = [
  { path: '/best-dog-car-seat-safety', title: 'Best Dog Car Seats (Crash-Tested)', desc: 'Safety-rated picks for travel with your dog.' },
  { path: '/guides/complete-dog-training-guide-2026', title: 'Dog Training Toys Guide', desc: 'Expert-tested methods for any breed or age.' },
  { path: '/guides/best-cat-trees-and-condos-2026', title: 'Best Cat Trees 2026', desc: 'Stability-tested picks for every home size.' },
  { path: '/best-cat-litter-box-2026', title: 'Best Self-Cleaning Litter Boxes', desc: 'No more scooping — tested for odor & safety.' },
] as const;

const HOW_IT_WORKS_STEPS = [
  { step: '1', title: 'Browse & Choose', desc: 'Find the right product for your pet\'s specific needs — from litter solutions to travel gear.' },
  { step: '2', title: 'Fast US Delivery', desc: 'Every order ships with tracking. Free shipping on orders over $35. Delivered in 3–7 business days.' },
  { step: '3', title: 'Happier Pet, Easier Life', desc: 'Smart products that solve real problems — less mess, less stress, more quality time with your pet.' },
] as const;

const Index = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail || !newsletterEmail.includes('@')) {
      showToast('error', 'Please enter a valid email address');
      return;
    }
    setIsSubscribing(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email: newsletterEmail });
      if (error) {
        if (error.code === '23505') {
          showToast('info', "You're already subscribed!");
        } else throw error;
      } else {
        showToast('success', 'Thanks for signing up!');
      }
      setNewsletterEmail('');
    } catch {
      showToast('error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Upgrade Your Pet's Life — Smart Cat & Dog Essentials | GetPawsy</title>
        <meta name="description" content="Smart solutions for happier cats & dogs. Self-cleaning litter boxes, orthopedic dog beds, cat trees & more. Free US shipping $35+." />
        <link rel="canonical" href="https://getpawsy.pet/" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="Upgrade Your Pet's Life — Smart Cat & Dog Essentials | GetPawsy" />
        <meta property="og:description" content="Smart solutions for happier cats & dogs. Free US shipping $35+, 30-day returns." />
        <meta property="og:url" content="https://getpawsy.pet/" />
        <meta property="og:type" content="website" />
      </Helmet>
      <Suspense fallback={null}>
        <WebsiteSchema />
        <LocalBusinessSchema />
      </Suspense>

      {/* ═══ 1. HERO — product-focused conversion section ═══ */}
      <section
        className="relative overflow-hidden"
        style={{ contain: 'layout style' }}
      >
        <div className="container px-4 md:px-6 py-10 md:py-16">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Left — copy */}
            <div className="space-y-4 order-2 md:order-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-xs font-semibold text-primary">
                🏆 #1 Best-Selling Automatic Cat Litter Box
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-[2.5rem] font-display font-bold text-foreground leading-[1.1] tracking-tight" style={{ textWrap: 'balance' as any }}>
                Never Scoop Litter Again
                <span className="text-primary"> — 100% Automatic</span>
              </h1>

              <p className="text-sm md:text-base text-muted-foreground max-w-md leading-relaxed" style={{ textWrap: 'pretty' as any }}>
                The smart litter box that cleans itself, eliminates odor, and works while you sleep. App-controlled for multiple cats.
              </p>

              <ul className="space-y-2 text-sm text-foreground/90">
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">✓</span>
                  No more scooping — fully automatic cleaning
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">✓</span>
                  Eliminates odor with sealed deodorizing design
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">✓</span>
                  Smart app control — works while you sleep
                </li>
              </ul>

              {/* Rating + urgency */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400">★★★★★</span>
                  <span className="font-semibold text-foreground">4.8/5</span>
                  <span className="text-muted-foreground text-xs">(1,247 reviews)</span>
                </div>
                <span className="text-amber-600 text-xs font-medium">🔥 Limited stock — selling fast</span>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat"
                  className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold bg-[hsl(24,95%,53%)] text-white shadow-lg hover:bg-[hsl(24,95%,47%)] active:scale-[0.97] transition-all duration-200"
                >
                  Get Yours Now — Limited Stock
                </Link>
                <a
                  href="#how-it-works"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold border border-border bg-card/80 text-foreground hover:bg-accent active:scale-[0.97] transition-all duration-200"
                >
                  See How It Works
                </a>
              </div>

              <p className="text-base font-bold text-foreground pt-1">
                Only $268.99 — <span className="font-normal text-sm text-muted-foreground">Free US Shipping</span>
              </p>
              <p className="text-xs text-muted-foreground">
                🛡️ 30-Day Risk-Free Guarantee &nbsp;·&nbsp; 🔒 Secure checkout
              </p>
            </div>

            {/* Right — product image */}
            <div className="order-1 md:order-2 flex justify-center">
              <div className="relative w-full max-w-sm md:max-w-md">
                <div className="aspect-square rounded-2xl overflow-hidden bg-muted border border-border/30 shadow-lg">
                  <img
                    src="/hero/cat-litter-box-hero.webp"
                    alt="Automatic Self-Cleaning Cat Litter Box"
                    width={600}
                    height={600}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://cf.cjdropshipping.com/d37e59ba-54ea-41e7-8b7a-04b2088d37f4.jpg'; }}
                  />
                </div>
                {/* Floating badge */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-4 py-1.5 shadow-md text-xs font-semibold text-foreground whitespace-nowrap">
                  ⭐ Best Seller — Trusted by 10,000+ Pet Owners
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. TRUST BAR ═══ */}
      <section className="py-4 border-y border-border/40 bg-card/50" aria-label="Trust signals">
        <div className="container px-4 md:px-6">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              Free US Shipping $35+
            </span>
            <span className="inline-flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              30-Day Returns
            </span>
            <span className="inline-flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Secure Checkout
            </span>
          </div>
        </div>
      </section>

      {/* ═══ 3. BESTSELLERS — immediately visible ═══ */}
      <div id="bestsellers">
        <SectionErrorBoundary sectionName="Trending Products">
          <Suspense fallback={
            <section className="py-10">
              <div className="container px-4 md:px-6">
                <div className="h-7 w-48 bg-muted rounded mb-6 animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl bg-muted animate-pulse" style={{ aspectRatio: '3/4' }} />
                  ))}
                </div>
              </div>
            </section>
          }>
            <TrendingProducts />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {/* ═══ CTA BLOCK — after bestsellers ═══ */}
      <section className="py-6">
        <div className="container px-4 md:px-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">🔥 Selling fast in the US — limited stock available</p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all duration-200"
          >
            Shop All Products
          </Link>
        </div>
      </section>

      {/* ═══ 4. HOW IT WORKS — funnel bridge ═══ */}
      <section id="how-it-works" className="py-12 md:py-16 scroll-mt-20 bg-muted/20">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-8">
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-2">
              How GetPawsy Works
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              From browsing to unboxing — it's simple, fast, and guaranteed.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {HOW_IT_WORKS_STEPS.map((s) => (
              <article key={s.step} className="relative bg-card rounded-xl p-6 border border-border/50 text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-sm font-bold text-primary">{s.step}</span>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 5. SHOP BY CATEGORY — Dogs + Cats ═══ */}
      <section className="py-10 md:py-12">
        <div className="container px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
            Shop by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {CATEGORIES.map((cat) => (
              <a
                key={cat.href}
                href={cat.href}
                className="group flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-card p-5 hover:border-primary/50 hover:shadow-md transition-all text-center"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {cat.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 6. BUYING GUIDES HUB — money page authority ═══ */}
      <section className="py-10 md:py-12 bg-muted/20">
        <div className="container px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-2">
            🔥 Best Buying Guides 2026
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-lg mx-auto">
            👉 Read before you buy: expert-tested comparisons that save you money and regret.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {BUYING_GUIDES.map((g) => (
              <Link
                key={g.path}
                to={g.path}
                className="group relative rounded-xl border border-border/40 bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <span className="absolute top-3 right-3 text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {g.badge}
                </span>
                <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors pr-20 mb-1">
                  {g.title}
                </h3>
                <span className="text-xs font-medium text-primary">View Best Picks →</span>
              </Link>
            ))}
          </div>
          {/* CTA after guides */}
          <div className="text-center mt-6">
            <Link
              to="/best-cat-litter-box-2026"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold bg-[hsl(24,95%,53%)] text-white hover:bg-[hsl(24,95%,47%)] active:scale-[0.97] transition-all duration-200"
            >
              View Best Litter Boxes →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 7. WHY CHOOSE US ═══ */}
      <section className="py-10 md:py-12">
        <div className="container px-4 md:px-6 max-w-3xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
            Why Pet Owners Choose GetPawsy
          </h2>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="space-y-2">
              <p className="text-2xl">✅</p>
              <h3 className="font-semibold text-foreground text-sm">Tested for Real Results</h3>
              <p className="text-xs text-muted-foreground">No gimmicks — tools that actually work</p>
            </div>
            <div className="space-y-2">
              <p className="text-2xl">🚚</p>
              <h3 className="font-semibold text-foreground text-sm">Fast US Shipping</h3>
              <p className="text-xs text-muted-foreground">3–7 business days, tracking included</p>
            </div>
            <div className="space-y-2">
              <p className="text-2xl">↩️</p>
              <h3 className="font-semibold text-foreground text-sm">30-Day Risk-Free Returns</h3>
              <p className="text-xs text-muted-foreground">Not happy? Full refund, no hassle</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 8. EXPERT GUIDES ═══ */}
      <section className="py-10 md:py-12 bg-muted/20">
        <div className="container px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
            Expert Pet Guides
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {GUIDES.map((g) => (
              <Link
                key={g.path}
                to={g.path}
                className="group rounded-xl border border-border/40 bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-1">
                  {g.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{g.desc}</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-5">
            <Link to="/guides" className="text-sm font-medium text-primary hover:underline">
              View all guides →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 9. NEWSLETTER ═══ */}
      <section className="py-10 md:py-12">
        <div className="container px-4 md:px-6">
          <div className="max-w-md mx-auto text-center">
            <h2 className="text-lg font-display font-semibold text-foreground mb-2">
              Get 10% Off Your First Order
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Join thousands of pet parents. Get exclusive deals & tips.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
              <input
                type="email"
                placeholder="Your email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={isSubscribing}
              />
              <button
                type="submit"
                className="rounded-full px-6 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                disabled={isSubscribing}
              >
                {isSubscribing ? '...' : 'Get 10% Off'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <Suspense fallback={null}>
        <StickyMobileCta />
      </Suspense>
    </Layout>
  );
};

export default Index;
