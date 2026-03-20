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
  { name: 'Potty Training', href: '/collections/dog-potty-training', emoji: '🏠' },
  { name: 'Leash & Control', href: '/collections/dog-leash-control', emoji: '🦮' },
  { name: 'Anti-Bark', href: '/collections/dog-anti-bark', emoji: '🔇' },
  { name: 'Puppy Essentials', href: '/collections/puppy-training-essentials', emoji: '🐶' },
  { name: 'Training Accessories', href: '/collections/dog-training-accessories', emoji: '🎯' },
] as const;

const GUIDES = [
  { path: '/best-dog-car-seat-safety', title: 'Best Dog Car Seats (Crash-Tested)', desc: 'Safety-rated picks for travel with your dog.' },
  { path: '/guides/complete-dog-training-guide-2026', title: 'Dog Training Toys Guide', desc: 'Expert-tested methods for any breed or age.' },
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

      {/* ═══ 1. HERO ═══ */}
      <section
        className="relative overflow-hidden flex items-center"
        style={{ minHeight: 'min(75vh, 560px)', contain: 'layout style' }}
      >
        <div className="absolute inset-0 z-0">
          <picture>
            <source media="(max-width: 768px)" srcSet="/hero/dog-training-hero-mobile.webp" type="image/webp" width={896} height={1184} />
            <img
              src="/hero/dog-training-hero-desktop.webp"
              alt="Dog being trained by owner — professional dog training tools"
              width={1920} height={1080}
              loading="eager" fetchPriority="high" decoding="async"
              className="hero-lcp-img"
            />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
        </div>

        <div className="container relative z-10 px-4 md:px-6 py-12 md:py-20">
          <div className="max-w-xl space-y-5">
             <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-[1.1] tracking-tight">
               Upgrade Your Pet's Life
               <br />
               <span className="text-primary">Today</span>
             </h1>
             <p className="text-base md:text-lg text-muted-foreground max-w-md">
               Smart solutions for happier cats & dogs.
             </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#bestsellers"
                className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
              >
                Shop Bestsellers →
              </a>
              <a
                href="/products"
                className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold border border-border bg-card/80 text-foreground hover:bg-accent transition-colors"
              >
                Browse All Products
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. TRUST BAR — exactly 3 items ═══ */}
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
            <span className="inline-flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
              </svg>
              support@getpawsy.pet
            </span>
          </div>
        </div>
      </section>

      {/* ═══ 3. BESTSELLERS / PRODUCTS — immediately visible ═══ */}
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

      {/* ═══ 4. SHOP BY CATEGORY — 5 core categories ═══ */}
      <section className="py-10 md:py-12 bg-muted/20">
        <div className="container px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
            Shop by Training Need
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

      {/* ═══ 5. WHY CHOOSE US — single block, 3 bullets ═══ */}
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

      {/* ═══ 6. GUIDES — max 3, minimal ═══ */}
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

      {/* ═══ 7. NEWSLETTER — simple inline ═══ */}
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
