import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);
import { FadeInView } from '@/components/ui/FadeInView';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

// ── Below-fold heavy components — lazy-loaded ──────────────────────────
const TopPicksSection = lazy(() => import('@/components/home/TopPicksSection'));
const TrendingProducts = lazy(() => import('@/components/home/TrendingProducts'));
const ProblemSolutionBlock = lazy(() => import('@/components/home/ProblemSolutionBlock'));
const WhyGetPawsyComparison = lazy(() => import('@/components/home/WhyGetPawsyComparison'));
const GuaranteeBlock = lazy(() => import('@/components/home/GuaranteeBlock'));
const HomepageAuthoritySection = lazy(() => import('@/components/home/HomepageAuthoritySection'));
const StickyMobileCta = lazy(() => import('@/components/home/StickyMobileCta'));

// ── SEO schemas — tiny, sync ─────────────────────────────────────────────
const WebsiteSchema = lazy(() => import('@/components/seo/WebsiteSchema').then(m => ({ default: m.WebsiteSchema })));
const LocalBusinessSchema = lazy(() => import('@/components/seo/LocalBusinessSchema').then(m => ({ default: m.LocalBusinessSchema })));

// ── Non-critical analytics/debug — deferred ───────────────────────────────
const trackNewsletterSignup = (email: string) =>
  import('@/lib/analytics').then(m => m.trackNewsletterSignup(email));
const showToast = (type: 'success' | 'error' | 'info', msg: string) =>
  import('sonner').then(m => m.toast[type](msg));

// ── Hook: gates non-critical data fetches until after first interaction/paint ──
function useHydrationReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const activate = () => setReady(true);
    const ric = 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback(activate, { timeout: 3000 })
      : setTimeout(activate, 1000);
    const handler = () => activate();
    window.addEventListener('scroll', handler, { once: true, passive: true });
    window.addEventListener('click', handler, { once: true, passive: true });
    window.addEventListener('touchstart', handler, { once: true, passive: true });
    return () => {
      if ('requestIdleCallback' in window) (window as any).cancelIdleCallback(ric);
      else clearTimeout(ric as number);
      window.removeEventListener('scroll', handler);
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [ready]);
  return ready;
}

const Index = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const hydrationReady = useHydrationReady();

  // Dev-only crawl heatmap logger
  useEffect(() => {
    if (hydrationReady) {
      import('@/utils/crawlHeatmap').then(m => m.logHomepageCrawlStats()).catch(() => {});
    }
  }, [hydrationReady]);

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
          showToast('info', 'You\'re already subscribed to our newsletter!');
        } else {
          throw error;
        }
      } else {
        showToast('success', 'Thanks for signing up! Check your inbox for 10% off.');
        trackNewsletterSignup(newsletterEmail);
      }
      setNewsletterEmail('');
    } catch {
      showToast('error', 'Something went wrong. Please try again later.');
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Premium Dog & Cat Essentials — Fast US Shipping | GetPawsy</title>
        <meta name="description" content="Premium dog & cat essentials with fast US shipping. Vet-approved picks, 3–7 day delivery, 30-day returns. Shop training gear, beds, cat trees & more." />
        <link rel="canonical" href="https://getpawsy.pet/" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="Premium Dog & Cat Essentials — Fast US Shipping | GetPawsy" />
        <meta property="og:description" content="Premium dog & cat essentials with fast US shipping. Vet-approved picks, 3–7 day delivery, 30-day returns." />
        <meta property="og:url" content="https://getpawsy.pet/" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Premium Dog & Cat Essentials | GetPawsy" />
        <meta name="twitter:description" content="Vet-approved dog & cat essentials. Fast US shipping, 30-day returns." />
      </Helmet>
      <Suspense fallback={null}>
        <WebsiteSchema />
        <LocalBusinessSchema />
      </Suspense>

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO — zero JS, instant paint, preloaded LCP image
          ═══════════════════════════════════════════════════════════════ */}
      <section
        className="hero-lcp-section relative overflow-hidden flex items-center"
        style={{ minHeight: 'calc(85vh - 148px)', contain: 'layout style' }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <picture>
            <source
              media="(max-width: 768px)"
              srcSet="/hero/getpawsy-hero-mobile.webp"
              type="image/webp"
              width={896}
              height={1184}
            />
            <img
              src="/hero/getpawsy-hero-desktop.webp"
              alt="Premium dog and cat essentials — beds, cat trees, training gear"
              width={1600}
              height={896}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="hero-lcp-img"
            />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent pointer-events-none" />
        </div>

        <div className="container relative z-10 px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">
                Dog & Cat Essentials — US Based
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-[1.05] tracking-tight">
                Premium Dog &amp; Cat Essentials
                <br />
                <span className="text-primary">Fast US Shipping</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
                Vet-approved picks • 3–7 day US delivery • 30-day returns
              </p>
              {/* ⚡ Hero CTAs: plain <a> tags — no Radix/Button on critical path */}
              <div className="flex flex-wrap items-center gap-4 pt-2 relative z-10 pointer-events-auto">
                <a
                  href="/collections/dog"
                  className="inline-flex items-center gap-2 rounded-full px-10 py-3 text-base font-semibold bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all duration-200"
                >
                  Shop Dog Essentials →
                </a>
                <a
                  href="/collections/cat"
                  className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Shop Cat Essentials
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          2. TRUST BAR — SVG-only icons, no external libraries
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-5 border-y border-border/40 bg-card/60" aria-label="Trust signals">
        <div className="container px-4 md:px-6">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary">
                <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              US Warehouse Shipping
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              4.8/5 Customer Rating
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              30-Day Guarantee
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Secure Checkout
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          3. TRENDING PET FAVORITES — max 6 products
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Trending Products">
        <Suspense fallback={<div className="py-14" style={{ minHeight: 400 }} />}>
          <TrendingProducts />
        </Suspense>
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          4. SHOP BY PROBLEM — 4 grid blocks
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Problem Solution">
        <Suspense fallback={<div className="py-14" style={{ minHeight: 300 }} />}>
          <ProblemSolutionBlock />
        </Suspense>
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          5. WHY GETPAWSY — 4 feature blocks
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Why GetPawsy">
        <Suspense fallback={<div className="py-14" style={{ minHeight: 300 }} />}>
          <WhyGetPawsyComparison />
        </Suspense>
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          6. GUARANTEE BLOCK — 30-day happiness guarantee
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Guarantee">
        <Suspense fallback={<div className="py-14" style={{ minHeight: 200 }} />}>
          <GuaranteeBlock />
        </Suspense>
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          7. TOP PICKS — 20 curated products for internal link authority
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Top Picks">
        <Suspense fallback={<div className="py-16" style={{ minHeight: 500 }} />}>
          <TopPicksSection />
        </Suspense>
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          8. SEO AUTHORITY TEXT — category links + 200-word paragraph
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Authority Section">
        <Suspense fallback={<div className="py-16" style={{ minHeight: 300 }} />}>
          {hydrationReady ? <HomepageAuthoritySection /> : <div style={{ minHeight: 300 }} />}
        </Suspense>
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          9. EMAIL CAPTURE — 10% off, inline form, no popup
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Newsletter">
        {hydrationReady ? (
          <section className="py-16 md:py-20">
            <div className="container px-4 md:px-6">
              <FadeInView className="relative overflow-hidden rounded-3xl gradient-warm p-10 md:p-16 text-center">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
                <div className="relative z-10">
                  <h2 className="text-3xl md:text-4xl font-display font-bold mb-4 text-primary-foreground">
                    Get 10% Off Your First Order
                  </h2>
                  <p className="text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
                    Join thousands of pet parents. Get exclusive deals, new arrivals, and pet care tips.
                  </p>
                  <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      className="flex-1 px-5 py-3.5 rounded-full bg-white/15 border border-white/25 placeholder:text-white/60 text-white focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
                      disabled={isSubscribing}
                    />
                    <button
                      type="submit"
                      className="rounded-full px-8 py-3.5 text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      disabled={isSubscribing}
                    >
                      {isSubscribing ? 'Subscribing...' : 'Get 10% Off'}
                    </button>
                  </form>
                  <p className="text-sm text-primary-foreground/70 mt-4">
                    No spam, unsubscribe anytime. We respect your inbox.
                  </p>
                </div>
              </FadeInView>
            </div>
          </section>
        ) : (
          <div style={{ minHeight: 300 }} />
        )}
      </SectionErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════
          STICKY MOBILE CTA — fixed bottom bar, Dog/Cat links
          ═══════════════════════════════════════════════════════════════ */}
      <Suspense fallback={null}>
        <StickyMobileCta />
      </Suspense>
    </Layout>
  );
};

export default Index;
