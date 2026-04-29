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
import { resolveUtm, syncUtmToUrl, persistUtmToSession } from '@/lib/utmNormalizer';
import { logUtmCheckpoint } from '@/lib/utmDebugLog';

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
  // Resolve attribution + sync URL SYNCHRONOUSLY during render setup so the
  // global visitor tracker (SafeGlobalVisitorTracker → useVisitorTracking)
  // sees the bucketed UTMs on its FIRST insert into visitor_activity.
  //
  // Why useState initializer + history.replaceState (not useEffect):
  //   useEffect runs AFTER children mount, which means the global tracker's
  //   own useEffect can fire first and persist a row with utm_source=null
  //   /utm_campaign=null. That made the TikTok dashboard show 0 sessions for
  //   bio-link visitors. Doing it during render guarantees the URL — and
  //   sessionStorage UTM cache (set by getUTMParams) — are correct before
  //   any tracking call resolves them.
  const [attribution] = useState<Record<string, string | null>>(() => {
    const urlCampaign = searchParams.get('utm_campaign');
    const isPaidHook = !!urlCampaign && (BIO_HOOKS as readonly string[]).includes(urlCampaign.toLowerCase());
    const resolvedCampaign = isPaidHook ? urlCampaign! : assignBioHook();
    const resolvedContent = searchParams.get('utm_content') || (isPaidHook ? null : 'tt_bio_link');
    // Use the central normalizer so that source/medium/campaign/content
    // resolution + URL sync + sessionStorage persistence all share the
    // same rules with every other surface (redirects, trackers, CTAs).
    const utm = resolveUtm({
      search: searchParams,
      fallback: {
        utm_source: 'tiktok',
        utm_medium: 'social',
        utm_campaign: resolvedCampaign,
        utm_content: resolvedContent ?? undefined,
      },
      persist: false,
    });
    // Always force the bucketed hook to win, even if the URL carried a
    // generic tt_bio_link campaign — the bucket assignment is the more
    // specific signal and must drive dashboard rows.
    utm.utm_campaign = resolvedCampaign;
    if (resolvedContent) utm.utm_content = resolvedContent;

    persistUtmToSession(utm);
    syncUtmToUrl(utm);

    const resolved: Record<string, string | null> = {
      utm_source: utm.utm_source ?? null,
      utm_medium: utm.utm_medium ?? null,
      utm_campaign: utm.utm_campaign ?? null,
      utm_content: utm.utm_content ?? null,
      utm_term: utm.utm_term ?? null,
      ad: searchParams.get('ad') || 'tt',
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    };
    return resolved;
  });

  // Keep react-router's useSearchParams in sync with the rewritten URL on
  // the next tick so child components (TikTokDeepLinkButton) read the
  // bucketed campaign. history.replaceState above does NOT notify the
  // router, so we follow up with setSearchParams to push the same values.
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
    // Debug checkpoint #1 — captures UTM state right after /go mounts +
    // bucketing/syncUtmToUrl have run. Safe no-op without ?debug_utm=1.
    logUtmCheckpoint('go_mount', { attribution });
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
    // Debug checkpoint #2 — captures UTM state at the moment of click,
    // BEFORE the outbound navigation, so we can compare against pdp_load.
    logUtmCheckpoint('cta_click', { placement, attribution });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 px-5 pt-5 pb-32">
      <div className="mx-auto max-w-md flex flex-col items-center text-center gap-4">
        {/* Brand mark — minimal, no nav */}
        <Link to="/" className="inline-flex items-center gap-2" aria-label="GetPawsy home">
          <span className="text-base font-display font-extrabold tracking-tight text-foreground">
            Get<span className="text-[hsl(25,95%,53%)]">Pawsy</span>
          </span>
        </Link>

        {/* 1. HERO — above the fold */}
        <h1 className="text-[28px] sm:text-4xl font-display font-extrabold leading-[1.1] text-foreground tracking-tight">
          I haven&apos;t scooped in 3 months...
        </h1>
        <p className="text-base font-semibold text-foreground/80 -mt-2">
          Here&apos;s exactly why <span className="text-[hsl(25,95%,53%)]">👇</span>
        </p>

        <div className="w-full rounded-2xl bg-card shadow-lg p-3">
          <img
            src={PRODUCT_IMAGE}
            alt="GetPawsy automatic self-cleaning cat litter box"
            width={640}
            height={640}
            fetchPriority="high"
            decoding="async"
            className="w-full max-w-[320px] mx-auto aspect-square object-contain rounded-xl"
          />
        </div>

        {/* 2. PRIMARY CTA */}
        <div className="w-full" ref={primaryCtaRef} onClickCapture={handleCtaClick('bio_primary')}>
          <div className="animate-bounce">
            <TikTokDeepLinkButton
              label="Get Yours Now →"
              campaign="tt_bio_link"
              content="bio_primary"
              className="h-14 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold shadow-lg shadow-[hsl(25,95%,53%)]/30"
            />
          </div>
        </div>

        {/* 3. TRUST STRIP */}
        <ul className="grid grid-cols-2 gap-1.5 w-full text-[12px] font-medium text-foreground/80 text-left">
          <li className="rounded-lg bg-card border border-border/50 px-2 py-1.5">🇺🇸 Ships from US warehouse</li>
          <li className="rounded-lg bg-card border border-border/50 px-2 py-1.5">✔ Free US Shipping $35+</li>
          <li className="rounded-lg bg-card border border-border/50 px-2 py-1.5">✔ 30-Day Returns</li>
          <li className="rounded-lg bg-card border border-border/50 px-2 py-1.5">✔ Secure Checkout</li>
        </ul>

        {/* 4. PAIN vs SOLUTION */}
        <div className="w-full grid grid-cols-2 gap-2 text-left pt-2">
          <div className="rounded-xl border border-border/60 bg-card/60 p-3">
            <p className="text-[13px] font-bold text-foreground/70 mb-1.5">Manual litter box</p>
            <ul className="grid gap-1 text-[12px] text-muted-foreground">
              <li>✗ Daily scooping</li>
              <li>✗ Bad smell</li>
              <li>✗ Mess everywhere</li>
            </ul>
          </div>
          <div className="rounded-xl border-2 border-[hsl(25,95%,53%)]/40 bg-[hsl(25,95%,53%)]/5 p-3">
            <p className="text-[13px] font-bold text-[hsl(25,95%,53%)] mb-1.5">This smart litter box</p>
            <ul className="grid gap-1 text-[12px] text-foreground/85 font-medium">
              <li>✓ Cleans itself</li>
              <li>✓ No smell</li>
              <li>✓ Always fresh</li>
            </ul>
          </div>
        </div>

        {/* 5. SOCIAL PROOF */}
        <div className="w-full rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm">
          <p className="text-base text-amber-500 leading-none" aria-label="5 out of 5 stars">★★★★★</p>
          <p className="mt-2 text-[15px] font-medium text-foreground leading-snug">
            “This literally changed my life. No more smell.”
          </p>
          <p className="mt-1.5 text-[12px] text-muted-foreground">— Sarah M., cat owner</p>
        </div>

        {/* 6. FEATURES */}
        <ul className="w-full text-left grid gap-1.5 text-[15px] font-medium text-foreground pt-1">
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> Cleans itself automatically</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> No smell, ever</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> Works with most cat litter</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> App-controlled</li>
        </ul>

        {/* 7. URGENCY */}
        <div className="w-full rounded-xl border border-[hsl(25,95%,53%)]/30 bg-[hsl(25,95%,53%)]/5 p-3 text-left">
          <p className="text-[14px] font-bold text-[hsl(25,95%,53%)]">
            ⚠️ Limited stock — selling out fast
          </p>
          <p className="mt-1 text-[12px] text-foreground/75">
            Most people wait too long — and regret it.
          </p>
        </div>

        {/* 8. FINAL CTA */}
        <div className="w-full" onClickCapture={handleCtaClick('bio_secondary')}>
          <TikTokDeepLinkButton
            label="Get Yours Now →"
            campaign="tt_bio_link"
            content="bio_secondary"
            className="h-14 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold shadow-lg shadow-[hsl(25,95%,53%)]/30"
          />
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
            className="h-13 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold"
          />
        </div>
      </div>
    </main>
  );
}
