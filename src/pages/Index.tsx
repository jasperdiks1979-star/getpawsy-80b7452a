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
const WhyTrainingToolsWork = lazy(() => import('@/components/home/WhyTrainingToolsWork'));
const GuaranteeBlock = lazy(() => import('@/components/home/GuaranteeBlock'));
const HomepageAuthoritySection = lazy(() => import('@/components/home/HomepageAuthoritySection'));
const StickyMobileCta = lazy(() => import('@/components/home/StickyMobileCta'));
const PopularRightNow = lazy(() => import('@/components/home/PopularRightNow'));

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
        <title>Professional Dog Training Tools — Trusted by Owners Across the US | GetPawsy</title>
        <meta name="description" content="Professional dog training tools for potty training, behavior correction & safer walks. Free US shipping $49+, 30-day returns. Trusted by dog owners nationwide." />
        <link rel="canonical" href="https://getpawsy.pet/" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="Professional Dog Training Tools — Trusted by Owners Across the US | GetPawsy" />
        <meta property="og:description" content="Potty training. Behavior correction. Safer walks. Smarter solutions. Free US shipping $49+." />
        <meta property="og:url" content="https://getpawsy.pet/" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Professional Dog Training Tools | GetPawsy" />
        <meta name="twitter:description" content="Dog training tools trusted by owners across the US. Free shipping $49+, 30-day returns." />
      </Helmet>
      <Suspense fallback={null}>
        <WebsiteSchema />
        <LocalBusinessSchema />
      </Suspense>

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO — Dog Training Authority positioning
          ═══════════════════════════════════════════════════════════════ */}
      <section
        className="hero-lcp-section relative overflow-hidden flex items-center"
        style={{ minHeight: 'calc(85vh - 148px)', contain: 'layout style' }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <picture>
            <source
              media="(max-width: 768px)"
              srcSet="/hero/dog-training-hero-mobile.webp"
              type="image/webp"
              width={896}
              height={1184}
            />
            <img
              src="/hero/dog-training-hero-desktop.webp"
              alt="Golden retriever being trained by owner in sunlit backyard — professional dog training tools"
              width={1920}
              height={1080}
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
                DOG TRAINING AUTHORITY — US BASED
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-[1.05] tracking-tight">
                Professional Dog Training Tools
                <br />
                <span className="text-primary">Trusted by Owners Across the US</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
                Potty training. Behavior correction. Safer walks. Smarter solutions.
              </p>
              {/* ⚡ Hero CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-2 relative z-10 pointer-events-auto">
                <a
                  href="/collections/dog-potty-training"
                  className="inline-flex items-center gap-2 rounded-full px-10 py-3 text-base font-semibold bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all duration-200"
                >
                  Shop Potty Training →
                </a>
                <a
                  href="/collections/dog-leash-control"
                  className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Explore Leash & Control →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          2. TRUST BAR — 3 trust badges as specified
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-5 border-y border-border/40 bg-card/60" aria-label="Trust signals">
        <div className="container px-4 md:px-6">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              Free US Shipping $49+
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              30-Day Returns
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              US Fulfillment Centers
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-primary" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Tested for Large Breeds
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
          4b. WHY OUR TRAINING TOOLS WORK — authority block
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Why Training Tools Work">
        <Suspense fallback={<div className="py-14" style={{ minHeight: 300 }} />}>
          <WhyTrainingToolsWork />
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
          7b. POPULAR RIGHT NOW — 3 boost-target money collections
          ═══════════════════════════════════════════════════════════════ */}
      <SectionErrorBoundary sectionName="Popular Right Now">
        <Suspense fallback={<div className="py-10" style={{ minHeight: 200 }} />}>
          {hydrationReady ? <PopularRightNow /> : <div style={{ minHeight: 200 }} />}
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
