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
import { assignBioHook, BIO_HOOKS, EXPLICIT_PAID_CAMPAIGNS } from '@/lib/bioHookBucket';
import { resolveUtm, syncUtmToUrl, persistUtmToSession } from '@/lib/utmNormalizer';
import { logUtmCheckpoint } from '@/lib/utmDebugLog';
import { recordLpCtaClick } from '@/lib/lpCtaCorrelation';

const PRODUCT_IMAGE =
  'https://getpawsy.pet/images/products/128e0207-8a94-4d71-b428-5b7f5002528f.png';

const REVIEWS = [
  {
    quote: 'Honestly the best purchase I made this year. My apartment finally smells like an apartment, not a litter box.',
    name: 'Sarah M.',
    location: 'Austin, TX',
  },
  {
    quote: 'I have 2 cats and used to scoop twice a day. Haven’t touched it in weeks. Worth every dollar.',
    name: 'Jessica R.',
    location: 'Brooklyn, NY',
  },
  {
    quote: 'Was skeptical but the app actually works. I get a notification when it needs emptying. That’s it.',
    name: 'Michael T.',
    location: 'Denver, CO',
  },
];

const COMPARISON_ROWS: Array<{ label: string; manual: string; smart: string }> = [
  { label: 'Daily scooping', manual: 'Every day', smart: 'Never' },
  { label: 'Odor control', manual: 'Constant smell', smart: 'Sealed & fresh' },
  { label: 'Time per week', manual: '~70 min', smart: '< 5 min' },
  { label: 'Phone alerts', manual: 'No', smart: 'Yes' },
  { label: 'Works with most litter', manual: 'Yes', smart: 'Yes' },
];

/**
 * /go CTA variant tag. Bumped whenever we change the high-conversion
 * stack around the primary CTA (proof line, nudge text, bouncing arrow,
 * pulse). Flows into every lp_cta_* event so dashboards can attribute
 * PDP CTR lift to a specific variant of the page.
 *
 *   high_conv_v1 = baseline pre-uplift (Get Yours Now, no proof/nudge)
 *   high_conv_v2 = current — proof + nudge + arrow + pulse + new CTA copy
 */
const CTA_VARIANT = 'high_conv_v2';
const CTA_FEATURE_FLAGS = {
  has_proof: true,
  has_nudge: true,
  has_arrow: true,
  has_pulse: true,
  cta_copy: 'see_how_it_works',
} as const;

export default function LinkInBio() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Sticky CTA is always visible on /go for maximum conversion (TikTok cold traffic).
  const showSticky = true;
  const primaryCtaRef = useRef<HTMLDivElement>(null);
  const secondaryCtaRef = useRef<HTMLDivElement>(null);
  const stickyCtaRef = useRef<HTMLDivElement>(null);
  // Refs for the new proof + nudge blocks so we can measure WHO actually
  // saw them before clicking — that's how we attribute the CTR lift.
  const proofBlockRef = useRef<HTMLDivElement>(null);
  const nudgeBlockRef = useRef<HTMLDivElement>(null);

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
    // Treat paid hook rotations AND the 3 conversion video variants
    // (conv_timepain/conv_smell/conv_direct) as explicit campaigns —
    // never rewrite them with the bio bucket. tt_bio_link stays the
    // generic fallback for raw bio-link traffic.
    const isExplicitPaid =
      !!urlCampaign &&
      (EXPLICIT_PAID_CAMPAIGNS as readonly string[]).includes(urlCampaign.toLowerCase());
    const resolvedCampaign = isExplicitPaid ? urlCampaign! : assignBioHook();
    const resolvedContent = searchParams.get('utm_content') || (isExplicitPaid ? null : 'tt_bio_link');
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
      { el: secondaryCtaRef.current, placement: 'bio_secondary' },
      { el: stickyCtaRef.current, placement: 'bio_sticky' },
      { el: proofBlockRef.current, placement: 'uplift_proof' },
      { el: nudgeBlockRef.current, placement: 'uplift_nudge' },
    ];
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const placement = (entry.target as HTMLElement).dataset.ctaPlacement;
          if (!placement || seen.has(placement)) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            seen.add(placement);
            // Mirror to a window-scoped set so handleCtaClick can read which
            // uplift elements were already visible when the click happened.
            (window as any).__gpGoSeen = seen;
            trackEvent('lp_cta_impression', {
              page: '/go',
              funnel: 'tiktok_bio',
              funnel_step: 2,
              placement,
              cta_variant: CTA_VARIANT,
              ...CTA_FEATURE_FLAGS,
              ...attribution,
            });
          }
        }
      },
      { threshold: [0.5] },
    );
    // Debug guard — if a CTA ref never attached to a DOM element, its
    // impression event will silently never fire. Warn loudly so we catch
    // refactors that drop a ref={} prop on the primary/secondary/sticky
    // CTA wrappers before the dashboard quietly under-reports.
    const missing: string[] = [];
    targets.forEach(({ el, placement }) => {
      if (!el) {
        missing.push(placement);
        return;
      }
      el.dataset.ctaPlacement = placement;
      io.observe(el);
    });
    if (missing.length > 0) {
      console.warn(
        `[LinkInBio] CTA ref(s) not attached — impressions will be missing for: ${missing.join(
          ', ',
        )}. Check that <div ref={...CtaRef}> still wraps each CTA.`,
        { missing, attribution },
      );
      trackEvent('lp_cta_ref_missing', {
        page: '/go',
        funnel: 'tiktok_bio',
        missing_placements: missing.join(','),
        cta_variant: CTA_VARIANT,
        ...attribution,
      });
    }
    return () => io.disconnect();
  }, [attribution]);

  // FUNNEL STEP 4 — CTA click. Bubble-capture click on the CTA wrapper so we
  // log even if the underlying <Link>'s own onClick changes. Outbound nav to
  // PDP is still tracked separately by TikTokDeepLinkButton (tiktok_deep_link_click).
  const handleCtaClick = (placement: string) => () => {
    // Record the click FIRST so the click_id we mint is included in the
    // outgoing lp_cta_click event AND stored for the next view_item /
    // add_to_cart to pick up on its own.
    const link = recordLpCtaClick({ placement, attribution });
    // Read which uplift elements were visible at click time. Lets us answer:
    // "Of the users who clicked, what % had actually seen the proof line?"
    const seenBefore: Set<string> | undefined = (window as any).__gpGoSeen;
    const sawProof = seenBefore?.has('uplift_proof') ?? false;
    const sawNudge = seenBefore?.has('uplift_nudge') ?? false;
    trackEvent('lp_cta_click', {
      page: '/go',
      funnel: 'tiktok_bio',
      funnel_step: 3,
      placement,
      lp_click_id: link.click_id,
      lp_clicked_at: link.clicked_at,
      cta_variant: CTA_VARIANT,
      ...CTA_FEATURE_FLAGS,
      saw_proof_before_click: sawProof,
      saw_nudge_before_click: sawNudge,
      ...attribution,
    });
    // Debug checkpoint #2 — captures UTM state at the moment of click,
    // BEFORE the outbound navigation, so we can compare against pdp_load.
    logUtmCheckpoint('cta_click', { placement, attribution });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-[hsl(25,95%,53%)]/5 px-5 pt-5 pb-32">
      <div className="mx-auto max-w-md flex flex-col gap-5">
        {/* Brand mark — minimal, no nav */}
        <Link to="/" className="inline-flex items-center gap-2 self-center" aria-label="GetPawsy home">
          <span className="text-base font-display font-extrabold tracking-tight text-foreground">
            Get<span className="text-[hsl(25,95%,53%)]">Pawsy</span>
          </span>
        </Link>

        {/* 1. HERO — above the fold */}
        <header className="text-center flex flex-col gap-3">
          <span className="self-center inline-flex items-center gap-1.5 rounded-full bg-[hsl(25,95%,53%)]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[hsl(25,95%,53%)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(25,95%,53%)] animate-pulse" />
            As seen on TikTok
          </span>
          <h1 className="text-[30px] sm:text-4xl font-display font-extrabold leading-[1.05] tracking-tight text-foreground">
            I haven&apos;t scooped in <span className="text-[hsl(25,95%,53%)]">3 months</span>.
          </h1>
          <p className="text-[15px] font-medium text-foreground/75 max-w-[28ch] mx-auto">
            The self-cleaning litter box that cat owners can&apos;t stop talking about.
          </p>
        </header>

        {/* Product image */}
        <div className="w-full rounded-2xl bg-card shadow-lg ring-1 ring-border/40 p-3">
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

        {/* 2. PRIMARY CTA — high-conversion stack: proof → nudge → arrow → CTA → micro-commit */}
        <div className="w-full flex flex-col gap-3" ref={primaryCtaRef} onClickCapture={handleCtaClick('bio_primary')}>
          {/* Proof line */}
          <div ref={proofBlockRef} className="text-center flex flex-col gap-0.5">
            <p className="text-amber-500 text-base leading-none tracking-widest" aria-label="5 out of 5 stars">★★★★★</p>
            <p className="text-[13px] font-semibold text-foreground/85">
              Over 12,000 cat owners switched
            </p>
          </div>

          {/* Big nudge + bouncing arrow */}
          <div ref={nudgeBlockRef} className="text-center flex flex-col items-center gap-1">
            <p className="text-[18px] sm:text-[20px] font-display font-extrabold text-foreground leading-tight">
              👇 Tap below to see how it works
            </p>
            <span aria-hidden className="gp-arrow-bounce text-2xl text-[hsl(25,95%,53%)] leading-none">▼</span>
          </div>

          <TikTokDeepLinkButton
            label="See how it works →"
            campaign="tt_bio_link"
            content="bio_primary"
            className="gp-cta-pulse h-14 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold rounded-xl shadow-lg shadow-[hsl(25,95%,53%)]/30"
          />

          {/* Micro-commitment */}
          <p className="text-center text-[13px] font-semibold text-foreground/75">
            ⏱️ Takes 10 seconds to see it
          </p>
        </div>

        {/* 3. TRUST BADGES */}
        <ul className="grid grid-cols-2 gap-2 w-full text-[12px] font-semibold text-foreground/85">
          <li className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2">
            <span aria-hidden>🚚</span> Free US Shipping $35+
          </li>
          <li className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2">
            <span aria-hidden>↩️</span> 30-Day Returns
          </li>
          <li className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2">
            <span aria-hidden>🔒</span> Secure Checkout
          </li>
          <li className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2">
            <span aria-hidden>💬</span> 24h US Support
          </li>
        </ul>

        {/* 4. MANUAL vs SMART comparison */}
        <section className="w-full rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-3 text-[12px] font-bold uppercase tracking-wider bg-muted/40 px-3 py-2.5 text-foreground/70">
            <span>Feature</span>
            <span className="text-center">Manual</span>
            <span className="text-center text-[hsl(25,95%,53%)]">Smart Box</span>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 items-center text-[13px] px-3 py-2.5 ${
                i % 2 === 1 ? 'bg-muted/20' : ''
              }`}
            >
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="text-center text-muted-foreground">{row.manual}</span>
              <span className="text-center font-bold text-[hsl(25,95%,53%)]">{row.smart}</span>
            </div>
          ))}
        </section>

        {/* 5. SOCIAL PROOF — multiple reviews */}
        <section className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-display font-bold text-foreground">What cat owners say</h2>
            <span className="text-[12px] font-semibold text-amber-500">★★★★★ 4.8/5</span>
          </div>
          {REVIEWS.map((r) => (
            <article key={r.name} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="text-amber-500 text-sm leading-none mb-2" aria-label="5 out of 5 stars">★★★★★</p>
              <p className="text-[14px] font-medium text-foreground leading-snug">
                “{r.quote}”
              </p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                — {r.name}, {r.location}
              </p>
            </article>
          ))}
        </section>

        {/* 6. FINAL CTA */}
        <div className="w-full flex flex-col gap-2" ref={secondaryCtaRef} onClickCapture={handleCtaClick('bio_secondary')}>
          <TikTokDeepLinkButton
            label="See how it works →"
            campaign="tt_bio_link"
            content="bio_secondary"
            className="gp-cta-pulse h-14 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold rounded-xl shadow-lg shadow-[hsl(25,95%,53%)]/30"
          />
          <p className="text-center text-[13px] font-semibold text-foreground/80">
            Try it risk-free for 30 days
          </p>
        </div>

        <p className="pt-6 text-[11px] text-muted-foreground text-center">
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
            label="See how it works →"
            campaign="tt_bio_link"
            content="bio_sticky"
            className="h-13 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold"
          />
        </div>
      </div>
    </main>
  );
}
