/**
 * LinkInBio (/go) — TikTok cold-traffic single-product funnel.
 *
 * Mini sales page (NOT a nav hub) for the self-cleaning litter box.
 * Visual hierarchy: HOOK → PRODUCT → CTA → BENEFITS → TRUST.
 * One action only. Mobile-first. Sticky CTA. Preserves UTM attribution.
 *
 * SEO: noindex (paid/social traffic only).
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TikTokDeepLinkButton } from '@/components/marketing/TikTokDeepLinkButton';
import { trackEvent } from '@/lib/analytics';
import { assignBioHook, BIO_HOOKS } from '@/lib/bioHookBucket';

const PRODUCT_IMAGE =
  'https://getpawsy.pet/images/products/128e0207-8a94-4d71-b428-5b7f5002528f.png';

export default function LinkInBio() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Sticky CTA is always visible on /go for maximum conversion (TikTok cold traffic).
  const showSticky = true;
  const primaryCtaRef = useRef<HTMLDivElement>(null);
  const stickyCtaRef = useRef<HTMLDivElement>(null);

  // Resolve attribution + auto-bucket bio-link traffic into hook1..hook5.
  //
  // Why bucket bio-link traffic: when a visitor lands on /go without an
  // explicit paid-ad hook (i.e. they tapped the TikTok profile bio link),
  // we used to tag everything as utm_campaign=tt_bio_link. That collapsed
  // ALL organic profile traffic into one row on the TikTok Ads Performance
  // dashboard, which made it impossible to A/B which hook copy converts
  // the organic audience best.
  //
  // Now: each device deterministically gets assigned hook1..hook5
  // (round-robin, sticky per device via localStorage), so bio-link traffic
  // spreads across the 5 hook rows just like paid traffic. We preserve
  // the bio-link origin in utm_content="tt_bio_link" so we can still
  // segment "bio vs paid" downstream.
  //
  // Paid ads (?utm_campaign=hook1..5) are NEVER rewritten — the URL
  // already carries the correct bucket.
  const attribution = useRef<Record<string, string | null>>(
    (() => {
      const urlCampaign = searchParams.get('utm_campaign');
      const isPaidHook = !!urlCampaign && (BIO_HOOKS as readonly string[]).includes(urlCampaign.toLowerCase());
      const resolvedCampaign = isPaidHook ? urlCampaign! : assignBioHook();
      const resolvedContent = searchParams.get('utm_content') || (isPaidHook ? null : 'tt_bio_link');
      return {
        utm_source: searchParams.get('utm_source') || 'tiktok',
        utm_medium: searchParams.get('utm_medium') || 'social',
        utm_campaign: resolvedCampaign,
        utm_content: resolvedContent,
        utm_term: searchParams.get('utm_term'),
        ad: searchParams.get('ad') || 'tt',
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      };
    })(),
  ).current;

  // Mirror the resolved attribution into the URL so child components that
  // read UTMs from useSearchParams (e.g. <TikTokDeepLinkButton/>) forward
  // the bucketed campaign through the deep-link click into the PDP. This
  // runs once on mount; user navigation away from /go is unaffected.
  useEffect(() => {
    const current = searchParams.get('utm_campaign');
    if (current === attribution.utm_campaign && searchParams.get('utm_content') === attribution.utm_content) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('utm_source', attribution.utm_source!);
    next.set('utm_medium', attribution.utm_medium!);
    next.set('utm_campaign', attribution.utm_campaign!);
    if (attribution.utm_content) next.set('utm_content', attribution.utm_content);
    next.set('ad', attribution.ad!);
    setSearchParams(next, { replace: true });
    // Mount-only sync — do not chase searchParams updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = 'GetPawsy — Shop the viral self-cleaning litter box';
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex,nofollow');
  }, []);

  // FUNNEL STEP 1 — Page view (entry into funnel)
  useEffect(() => {
    trackEvent('lp_view', {
      page: '/go',
      funnel: 'tiktok_bio',
      funnel_step: 1,
      ...attribution,
    });
  }, [attribution]);

  // FUNNEL STEP 2 — Scroll-depth milestones to surface where users drop off
  // before reaching the sticky CTA / benefits below the fold.
  useEffect(() => {
    const milestones = [25, 50, 75, 100];
    const fired = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = Math.max(doc.scrollHeight, 1);
      const pct = Math.min(100, Math.round((scrolled / total) * 100));
      for (const m of milestones) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          trackEvent('lp_scroll_depth', {
            page: '/go',
            funnel: 'tiktok_bio',
            depth_pct: m,
            ...attribution,
          });
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [attribution]);

  // FUNNEL STEP 3 — CTA impressions (fires once per CTA when ≥50% visible)
  useEffect(() => {
    const targets: Array<{ el: HTMLElement | null; placement: string }> = [
      { el: primaryCtaRef.current, placement: 'bio_primary' },
      { el: stickyCtaRef.current, placement: 'bio_sticky' },
    ];
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const placement = (entry.target as HTMLElement).dataset.ctaPlacement;
          if (!placement || seen.has(placement)) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            seen.add(placement);
            trackEvent('lp_cta_impression', {
              page: '/go',
              funnel: 'tiktok_bio',
              funnel_step: 2,
              placement,
              ...attribution,
            });
          }
        }
      },
      { threshold: [0.5] },
    );
    targets.forEach(({ el, placement }) => {
      if (!el) return;
      el.dataset.ctaPlacement = placement;
      io.observe(el);
    });
    return () => io.disconnect();
  }, [attribution]);

  // FUNNEL STEP 4 — CTA click. Bubble-capture click on the CTA wrapper so we
  // log even if the underlying <Link>'s own onClick changes. Outbound nav to
  // PDP is still tracked separately by TikTokDeepLinkButton (tiktok_deep_link_click).
  const handleCtaClick = (placement: string) => () => {
    trackEvent('lp_cta_click', {
      page: '/go',
      funnel: 'tiktok_bio',
      funnel_step: 3,
      placement,
      ...attribution,
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 px-5 pt-5 pb-32">
      <div className="mx-auto max-w-md flex flex-col items-center text-center gap-3">
        {/* Brand mark — minimal, no nav */}
        <Link to="/" className="inline-flex items-center gap-2" aria-label="GetPawsy home">
          <span className="text-base font-display font-extrabold tracking-tight text-foreground">
            Get<span className="text-[hsl(25,95%,53%)]">Pawsy</span>
          </span>
        </Link>

        {/* HOOK — matches TikTok video */}
        <h1 className="text-[28px] sm:text-4xl font-display font-extrabold leading-[1.1] text-foreground tracking-tight">
          I haven&apos;t scooped in 3 months...
        </h1>
        <p className="text-base font-semibold text-foreground/80 -mt-1">
          Here&apos;s exactly why <span className="text-[hsl(25,95%,53%)]">👇</span>
        </p>

        {/* PAIN HOOK — emotional connection */}
        <p className="text-[15px] font-medium text-foreground/75">
          Still scooping every single day? 😩
        </p>

        {/* PRODUCT VISUAL — single, large, centered */}
        <div className="w-full">
          <img
            src={PRODUCT_IMAGE}
            alt="GetPawsy automatic self-cleaning cat litter box"
            width={640}
            height={640}
            fetchPriority="high"
            decoding="async"
            className="w-full max-w-[300px] mx-auto aspect-square object-contain rounded-2xl bg-card shadow-md"
          />
        </div>

        {/* MOTION PROOF — simulated before → cleaning → after sequence */}
        <div
          className="w-full grid grid-cols-3 gap-2 text-center"
          aria-label="How the self-cleaning litter box works in three steps"
        >
          {[
            { label: 'Before', icon: '🐾', tone: 'text-foreground/70', ring: 'border-border/60 bg-card/60' },
            { label: 'Cleaning', icon: '🔄', tone: 'text-[hsl(25,95%,53%)] animate-spin-slow', ring: 'border-[hsl(25,95%,53%)]/40 bg-[hsl(25,95%,53%)]/5' },
            { label: 'Fresh', icon: '✨', tone: 'text-[hsl(142,71%,45%)]', ring: 'border-[hsl(142,71%,45%)]/40 bg-[hsl(142,71%,45%)]/5' },
          ].map((step, i) => (
            <div
              key={step.label}
              className={`rounded-xl border ${step.ring} px-2 py-3 flex flex-col items-center gap-1`}
            >
              <span
                className={`text-2xl ${step.tone}`}
                style={{ animation: `fade-in 0.6s ease-out ${i * 0.2}s both` }}
                aria-hidden="true"
              >
                {step.icon}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* VISUAL PROOF — before/after comparison */}
        <div className="w-full grid grid-cols-2 gap-2 text-left">
          <div className="rounded-xl border border-border/60 bg-card/60 p-3">
            <p className="text-[13px] font-bold text-foreground/70 mb-1.5">Manual litter box</p>
            <ul className="grid gap-0.5 text-[12px] text-muted-foreground">
              <li>✗ Daily scooping</li>
              <li>✗ Bad smell</li>
              <li>✗ Mess everywhere</li>
            </ul>
          </div>
          <div className="rounded-xl border-2 border-[hsl(25,95%,53%)]/40 bg-[hsl(25,95%,53%)]/5 p-3">
            <p className="text-[13px] font-bold text-[hsl(25,95%,53%)] mb-1.5">This smart litter box</p>
            <ul className="grid gap-0.5 text-[12px] text-foreground/85 font-medium">
              <li>✓ Cleans itself</li>
              <li>✓ No smell</li>
              <li>✓ Always fresh</li>
            </ul>
          </div>
        </div>

        {/* SOCIAL PROOF — single testimonial card */}
        <div className="w-full rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm">
          <p className="text-[13px] text-amber-500 leading-none" aria-label="5 out of 5 stars">★★★★★</p>
          <p className="mt-1.5 text-[14px] font-medium text-foreground leading-snug">
            “This literally changed my life. No more smell.”
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">— Sarah M., cat owner</p>
        </div>

        {/* PRIMARY CTA — above the fold */}
        <div className="w-full" ref={primaryCtaRef} onClickCapture={handleCtaClick('bio_primary')}>
          <TikTokDeepLinkButton
            label="Get Yours Now – Before It Sells Out →"
            campaign="tt_bio_link"
            content="bio_primary"
            className="h-14 text-base w-full"
          />
          {/* URGENCY — compliant, no fake countdown */}
          <p className="mt-2 text-[13px] font-medium text-foreground/70">
            ⚠️ Limited stock – selling out fast
          </p>
          {/* SPEED TRIGGER */}
          <p className="mt-1 text-[12px] font-medium text-foreground/75">
            Ships from US warehouse 🇺🇸
          </p>
          {/* MICRO TRUST — compliant, no fabricated counts */}
          <p className="mt-1 text-[12px] font-medium text-muted-foreground">
            Loved by cat owners across the US 🇺🇸
          </p>
        </div>

        {/* TRUST STRIP — moved directly under CTA */}
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] font-medium text-muted-foreground w-full">
          <li>✔ Free US Shipping</li>
          <li>✔ 30-Day Returns</li>
          <li>✔ Secure Checkout</li>
        </ul>

        {/* BENEFIT BULLETS — short, scannable */}
        <ul className="w-full text-left grid gap-1 text-[15px] font-medium text-foreground pt-2">
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> Cleans itself automatically</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> No smell, ever</li>
        </ul>

        {/* PATTERN INTERRUPT */}
        <p className="w-full text-left text-[13px] font-semibold text-[hsl(25,95%,53%)]/90 py-1">
          ⚠️ Most people wait too long — and regret it.
        </p>

        <ul className="w-full text-left grid gap-1 text-[15px] font-medium text-foreground">
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> Works with most cat litter</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> App-controlled convenience</li>
        </ul>

        {/* FRICTION KILLER */}
        <ul className="w-full text-left grid gap-1 text-[14px] font-medium text-foreground/85 pt-1">
          <li className="flex items-center gap-2"><span className="text-[hsl(142,71%,45%)] font-bold">✓</span> Works in under 60 seconds</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(142,71%,45%)] font-bold">✓</span> No installation needed</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(142,71%,45%)] font-bold">✓</span> Plug &amp; play</li>
        </ul>

        {/* SECONDARY CTA — repeat after benefits */}
        <div className="w-full pt-2" onClickCapture={handleCtaClick('bio_secondary')}>
          <TikTokDeepLinkButton
            label="Get Yours Now – Before It Sells Out →"
            campaign="tt_bio_link"
            content="bio_secondary"
            className="h-14 text-base w-full"
          />
          {/* MICRO RISK REVERSAL */}
          <p className="mt-2 text-[13px] font-semibold text-foreground/80 text-center">
            Try it risk-free for 30 days
          </p>
        </div>

        <p className="pt-6 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} GetPawsy
        </p>
      </div>

      {/* STICKY CTA — always visible on mobile-first sales page */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border/60 transition-transform duration-300 ${
          showSticky ? 'translate-y-0' : 'translate-y-full'
        }`}
        aria-hidden={!showSticky}
      >
        <div className="mx-auto max-w-md" ref={stickyCtaRef} onClickCapture={handleCtaClick('bio_sticky')}>
          <TikTokDeepLinkButton
            label="Get Yours Now →"
            campaign="tt_bio_link"
            content="bio_sticky"
            className="h-13 text-base w-full"
          />
        </div>
      </div>
    </main>
  );
}
