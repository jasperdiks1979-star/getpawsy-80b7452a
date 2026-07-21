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
import { initClarity, clarityMilestone, clarityTag } from '@/lib/clarity';
import { visibilityFlagsAtClickTime } from '@/lib/lpCtaVisibility';
import { getVisitorCohort } from '@/lib/visitorCohort';
import { useCtaVariant } from '@/hooks/useCtaVariant';
import { useCtaCopyWinner } from '@/hooks/useCtaCopyWinner';
import type { CtaPlacement, CtaCopyMode } from '@/lib/ctaCopyRegistry';

/**
 * /go CTA variant tag. Bumped whenever we change the high-conversion
 * stack around the primary CTA (proof line, nudge text, bouncing arrow,
 * pulse). Flows into every lp_cta_* event so dashboards can attribute
 * PDP CTR lift to a specific variant of the page.
 *
 *   high_conv_v1 = baseline pre-uplift (Get Yours Now, no proof/nudge)
 *   high_conv_v2 = baseline rollback target — proof + nudge + arrow + pulse
 *   high_conv_v3 = current — adds video + post-image CTA + scroll-gated urgency
 *
 * NOTE: The string below is just the BUILD-TIME DEFAULT. The page reads
 * the actual active variant at runtime from `cta_variant_config` via the
 * `useCtaVariant` hook — the auto-rollback edge function may have flipped
 * it back to the baseline if CTR dropped below the configured floor.
 * Always reference the runtime `ctaVariant` inside the component, never
 * this constant directly.
 */
const CTA_VARIANT_DEFAULT = 'high_conv_v3';
const CTA_FEATURE_FLAGS = {
  has_proof: true,
  has_nudge: false,
  has_arrow: false,
  has_pulse: true,
  cta_copy: 'watch_how_it_works',
  has_post_image_cta: false,
  has_subhead_watch: true,
  has_video_hero: true,
  layout: 'curiosity_first_v1',
} as const;

/**
 * Scroll-depth gating threshold for the urgency reveal block.
 *
 * The "Limited stock" message is intentionally HIDDEN above the fold (per
 * the high-CTR /go playbook: cold TikTok traffic must not see buy-pressure
 * before they've engaged with the proof + nudge stack). It only unlocks
 * once the user has scrolled past this percentage of the page — i.e. they
 * already showed intent by scrolling deep, so urgency now nudges them to
 * convert instead of scaring them off.
 *
 * 25 % was chosen so urgency surfaces shortly after the primary CTA — TikTok
 * traffic is high-bounce, so we want the urgency nudge BEFORE most users leave.
 * Previous value (60 %) only fired for the ~7 % of visitors who scrolled
 * deep enough, missing the bulk of cold ad traffic.
 */
const URGENCY_REVEAL_THRESHOLD = 25;

/**
 * Dynamic CTA copy is now driven by the auto-winner system.
 *
 *   - Candidate labels live in `src/lib/ctaCopyRegistry.ts`.
 *   - The `cta-copy-winner-elector` edge function picks the winning
 *     label per (placement, mode) every hour based on 48h CTR
 *     (≥50 imps per variant required).
 *   - `useCtaCopyWinner` fetches the active winners and resolves them
 *     to visible button text via `pickCopy(placement, mode)`.
 *
 * Only the visible button TEXT changes — UTM / campaign / content /
 * deep-link refs are untouched, so funnel attribution stays stable
 * across copy swaps.
 */

export default function LinkInBio() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Runtime-controlled CTA variant. The auto-rollback edge function flips
  // this to the baseline if CTR drops below the configured floor. Falls
  // back to CTA_VARIANT_DEFAULT while the network round-trip is in flight
  // so impressions are never tagged with an empty variant.
  const { variant: ctaVariant } = useCtaVariant(CTA_VARIANT_DEFAULT);
  // Auto-elected winning copy per (placement, mode). Hook is called early
  // so it always runs in the same order; the actual `copyMode` resolution
  // happens AFTER `urgencyVisible` is declared below.
  const { pickCopy, hook: visitorHook } = useCtaCopyWinner();
  // Sticky CTA visibility. Hidden by default while the primary above-the-fold
  // CTA is on screen, and hidden again whenever the in-content secondary CTA
  // (bio_secondary) enters the viewport — that CTA lives at the bottom of the
  // page and if the sticky stays visible the two orange buttons overlap on
  // mobile (observed on iPhone Safari). One sticky bar, no duplicate.
  const [showSticky, setShowSticky] = useState(false);
  const [secondaryVisible, setSecondaryVisible] = useState(false);
  const primaryCtaRef = useRef<HTMLDivElement>(null);
  const secondaryCtaRef = useRef<HTMLDivElement>(null);
  const stickyCtaRef = useRef<HTMLDivElement>(null);
  // Demo video placement — autoplay loop above the fold. Tracked as its own
  // placement (`bio_video_cta`) so heatmaps can attribute clicks that fired
  // AFTER the user watched the demo vs text-only CTA paths.
  const videoCtaRef = useRef<HTMLDivElement>(null);

  // Video resilience — if /videos/go-demo.mp4 fails to load (mobile data
  // saver, CDN hiccup, slow 3G), we swap the <video> for the static poster
  // image so the layout never collapses and the CTA stays visible. Also
  // tracked as its own event so we can quantify how often video fails on
  // cold TikTok traffic (which historically had ~7% PDP CTR — a broken
  // video here would explain a big chunk of the drop-off).
  const [videoFailed, setVideoFailed] = useState(false);

  // Scroll-gated urgency reveal — keeps the "Limited stock" message OUT of
  // the above-the-fold experience (per the high-CTR /go playbook: no buy
  // pressure before the user has watched/considered). Flips to true the
  // first time the user crosses the URGENCY_REVEAL_THRESHOLD scroll-depth.
  // Sticky once true so it doesn't flicker if the user scrolls back up.
  const [urgencyVisible, setUrgencyVisible] = useState(false);

  // Resolve copy mode + winning text/label per placement. Recomputed on
  // every render so the calm→urgent swap fires when scroll passes 60%.
  // Only the visible TEXT changes — UTM/campaign/content stay identical.
  const copyMode: CtaCopyMode = urgencyVisible ? 'urgent' : 'calm';
  const primaryCopy = pickCopy('bio_primary', copyMode);
  const secondaryCopy = pickCopy('bio_secondary', copyMode);
  const stickyCopy = pickCopy('bio_sticky', copyMode);

  // ─── Per-placement heatmap & funnel telemetry ──────────────────────────
  // Page-mount epoch — used to compute "time-to-visible" and "time-to-click"
  // in milliseconds for every CTA placement. This is the single most useful
  // signal for diagnosing where cold TikTok users hesitate or scroll past
  // without engaging. Stored in a ref so re-renders don't reset the clock.
  const pageMountAtRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  // Per-placement first-visible timestamp — keyed by the same placement
  // strings used in the IntersectionObserver targets list. Filled the FIRST
  // time each placement crosses the visibility threshold; consumed at click
  // time to compute "dwell" (visible → click delta).
  const firstVisibleAtRef = useRef<Record<string, number>>({});
  // First-click winner — which placement actually captured the click. Lets
  // the dashboard answer: "of the 4 placements rendered, which one wins?".
  const firstClickPlacementRef = useRef<string | null>(null);

  // Per-placement click count + the last click metadata (placement + ts).
  // Powers two new analytics signals:
  //   • lp_cta_repeat_click → SAME placement re-clicked within 30s
  //     ("user hesitated / re-engaged on the same CTA")
  //   • lp_cta_misclick     → DIFFERENT placement clicked within 600ms of
  //     the previous click ("likely fat-finger / accidental tap on an
  //     adjacent element"). 600ms is the upper bound for human reaction
  //     after committing to a tap — anything faster than that on a new
  //     placement is almost certainly not a deliberate second decision.
  const placementClickCountRef = useRef<Record<string, number>>({});
  const lastClickRef = useRef<{ placement: string; at: number } | null>(null);
  const MISCLICK_WINDOW_MS = 600;
  const REPEAT_CLICK_WINDOW_MS = 30_000;

  // Helper: current scroll-depth as a 0..100 percentage. Used to stamp every
  // click with HOW deep the user had scrolled — critical for distinguishing
  // "clicked above the fold" from "scrolled all the way then clicked sticky".
  const currentScrollDepthPct = (): number => {
    if (typeof window === 'undefined') return 0;
    const doc = document.documentElement;
    const scrolled = window.scrollY + window.innerHeight;
    const total = Math.max(doc.scrollHeight, 1);
    return Math.min(100, Math.round((scrolled / total) * 100));
  };

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
    // Visitor cohort — locked at first call per tab. Tagged on Clarity AND
    // sent on the lp_view event so heatmaps and the admin overview can both
    // segment cold (first_session) vs returning traffic side-by-side.
    const cohort = getVisitorCohort();
    trackEvent('lp_view', {
      page: '/go',
      funnel: 'tiktok_bio',
      funnel_step: 1,
      cohort,
      ...attribution,
    });
    // Debug checkpoint #1 — captures UTM state right after /go mounts +
    // bucketing/syncUtmToUrl have run. Safe no-op without ?debug_utm=1.
    logUtmCheckpoint('go_mount', { attribution });
    // Microsoft Clarity — funnel-scoped boot. The helper itself is gated by
    // marketing consent + Founder Mode so we never pollute heatmaps with
    // internal sessions. Tags let us slice heatmaps by variant + campaign.
    initClarity();
    clarityTag('page', '/go');
    clarityTag('funnel', 'tiktok_bio');
    clarityTag('cta_variant', ctaVariant);
    // Cohort tag — primary heatmap filter dimension. With this you can
    // open Clarity and view the EXACT same heatmap twice:
    //   - cohort = first_session  → cold TikTok, scroll/click pattern
    //   - cohort = returning      → people who already know the brand
    // The two heatmaps side-by-side reveal where cold traffic specifically
    // hesitates (e.g. drops at the proof block) vs returning users.
    clarityTag('cohort', cohort);
    if (attribution.utm_campaign) clarityTag('utm_campaign', attribution.utm_campaign);
    if (attribution.utm_content) clarityTag('utm_content', attribution.utm_content);
    clarityMilestone('go_landing_view');
    // Re-runs once `ctaVariant` resolves so Clarity tagging reflects any
    // auto-rollback the guard performed since the last pageview.
  }, [attribution, ctaVariant]);

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
      // Scroll-gated urgency reveal — flip-and-stick once the user passes
      // the threshold. Fire-and-forget tracking + Clarity beacon so the
      // dashboard can attribute clicks that happened AFTER urgency surfaced.
      if (pct >= URGENCY_REVEAL_THRESHOLD) {
        setUrgencyVisible((prev) => {
          if (prev) return prev;
          trackEvent('lp_urgency_revealed', {
            page: '/go',
            funnel: 'tiktok_bio',
            depth_pct: pct,
            threshold_pct: URGENCY_REVEAL_THRESHOLD,
            cta_variant: ctaVariant,
            ...attribution,
          });
          clarityMilestone('urgency_revealed');
          clarityTag('saw_urgency', true);
          return true;
        });
      }
      for (const m of milestones) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          trackEvent('lp_scroll_depth', {
            page: '/go',
            funnel: 'tiktok_bio',
            depth_pct: m,
            ...attribution,
          });
          // Mirror to Clarity so heatmaps can be filtered by "users who
          // reached 75% scroll" — the cleanest drop-off signal we have.
          clarityMilestone(`scroll_${m}`);
          clarityTag('max_scroll_depth', m);
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
      { el: videoCtaRef.current, placement: 'bio_video_cta' },
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
            // Per-placement first-visible timestamp + scroll depth at the
            // moment of visibility. These two together explain WHERE in the
            // page each placement actually surfaces for cold traffic — e.g.
            // if bio_sticky has time_to_visible_ms ≈ 0 but bio_secondary
            // averages 8s + 45% scroll, that's the drop-off zone.
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const timeToVisibleMs = Math.max(0, Math.round(now - pageMountAtRef.current));
            const scrollDepthAtVisible = currentScrollDepthPct();
            firstVisibleAtRef.current[placement] = now;
            // Stamp the active copy label on impressions so the elector can
            // attribute clicks back per copy variant. Only the 3 button
            // placements have copy variants; other (proof/nudge/arrow/video)
            // placements stay un-stamped.
            const impressionCopy =
              placement === 'bio_primary' ? primaryCopy
              : placement === 'bio_secondary' ? secondaryCopy
              : placement === 'bio_sticky' ? stickyCopy
              : null;
            trackEvent('lp_cta_impression', {
              page: '/go',
              funnel: 'tiktok_bio',
              funnel_step: 2,
              placement,
              time_to_visible_ms: timeToVisibleMs,
              scroll_depth_at_visible: scrollDepthAtVisible,
              cta_variant: ctaVariant,
              cohort: getVisitorCohort(),
              ...(impressionCopy
                ? {
                    cta_copy_label: impressionCopy.label,
                    cta_copy_mode: copyMode,
                    cta_copy_source: impressionCopy.source,
                    hook_family: visitorHook?.hook_family ?? null,
                    hook_source: visitorHook?.source ?? null,
                  }
                : {}),
              ...CTA_FEATURE_FLAGS,
              ...attribution,
            });
            // Clarity custom event per visibility milestone — lets us filter
            // heatmaps & recordings by "users who saw the proof" vs not.
            //   - bio_primary / bio_secondary / bio_sticky → cta_visible_<placement>
            //   - uplift_proof  → proof_visible
            //   - uplift_nudge  → nudge_visible (+ arrow_visible — the arrow lives
            //     inside the nudge block, so when nudge crosses 50% the arrow is
            //     guaranteed to be on screen too)
            if (placement === 'uplift_proof') {
              clarityMilestone('proof_visible');
            } else if (placement === 'uplift_nudge') {
              clarityMilestone('nudge_visible');
            } else if (placement === 'uplift_arrow') {
              // Dedicated arrow visibility — fires independently from the
              // surrounding nudge block so we can A/B the arrow's effect.
              clarityMilestone('arrow_visible');
            } else {
              clarityMilestone(`cta_visible_${placement}`);
              if (placement === 'bio_primary') clarityMilestone('cta_visible');
              // Per-placement Clarity tags — these become FILTER DIMENSIONS
              // on the Clarity dashboard. With these you can build heatmap
              // segments like "users who saw bio_post_image but not
              // bio_secondary" to find scroll drop-off zones.
              clarityTag(`saw_${placement}`, true);
              clarityTag(`time_to_visible_${placement}_ms`, timeToVisibleMs);
              clarityTag(`scroll_at_visible_${placement}`, scrollDepthAtVisible);
            }
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
        cta_variant: ctaVariant,
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
    // Read which uplift elements were visible at click time. Single source of
    // truth in lpCtaVisibility — the verification test imports the same fn
    // so this contract can never silently drift.
    const flags = visibilityFlagsAtClickTime();
    const sawProof = flags.saw_proof_before_click;
    const sawNudge = flags.saw_nudge_before_click;
    // Per-placement timing stamps. `time_to_click_ms` is from page mount
    // (raw engagement speed); `dwell_ms` is from when THIS placement first
    // became visible (true consideration time). Together they let the
    // dashboard separate "fast skim → click" from "saw it, hesitated, clicked".
    const nowClick = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const timeToClickMs = Math.max(0, Math.round(nowClick - pageMountAtRef.current));
    const visibleAt = firstVisibleAtRef.current[placement];
    const dwellMs = visibleAt != null ? Math.max(0, Math.round(nowClick - visibleAt)) : null;
    const scrollDepthAtClick = currentScrollDepthPct();
    // First-click attribution — only the FIRST CTA wins. If a user clicks
    // bio_post_image then later bio_sticky, the analytics dashboard should
    // attribute the conversion to bio_post_image (the placement that
    // actually triggered intent). Subsequent clicks still fire events for
    // diagnostic purposes but are tagged is_repeat_click=true.
    const isFirstClick = firstClickPlacementRef.current === null;
    if (isFirstClick) firstClickPlacementRef.current = placement;

    // ─── Misclick + repeat-click classification ───────────────────────
    // Computed BEFORE we update the click bookkeeping refs so the deltas
    // reflect the previous state. Both signals are fire-and-forget and
    // never block the main lp_cta_click event below.
    const prevClick = lastClickRef.current;
    const priorCountForPlacement = placementClickCountRef.current[placement] ?? 0;
    const isRepeatClick =
      priorCountForPlacement > 0 &&
      prevClick != null &&
      prevClick.placement === placement &&
      nowClick - prevClick.at <= REPEAT_CLICK_WINDOW_MS;
    const isMisclick =
      prevClick != null &&
      prevClick.placement !== placement &&
      nowClick - prevClick.at <= MISCLICK_WINDOW_MS;

    if (isMisclick) {
      // Most likely accidental — a click on a DIFFERENT placement within
      // 600ms is faster than human reaction time for a deliberate
      // re-decision, so this is almost always a fat-finger / scroll-tap.
      // We log it so the dashboard can subtract these from "real" CTR
      // and the heatmap can isolate the offending zones.
      const dtMs = Math.round(nowClick - prevClick!.at);
      trackEvent('lp_cta_misclick', {
        page: '/go',
        funnel: 'tiktok_bio',
        placement,
        previous_placement: prevClick!.placement,
        delta_ms: dtMs,
        scroll_depth_at_click: scrollDepthAtClick,
        cta_variant: ctaVariant,
        cohort: getVisitorCohort(),
        ...attribution,
      });
      clarityTag('had_misclick', true);
      clarityTag('misclick_pair', `${prevClick!.placement}->${placement}`);
      clarityMilestone('cta_misclick');
    } else if (isRepeatClick) {
      // Same placement, re-clicked within 30s. Reads as hesitation /
      // double-tap / "did it register?" — useful intent signal that
      // doesn't deserve full credit but isn't an error either.
      const dtMs = Math.round(nowClick - prevClick!.at);
      trackEvent('lp_cta_repeat_click', {
        page: '/go',
        funnel: 'tiktok_bio',
        placement,
        repeat_index: priorCountForPlacement, // 1 = 2nd click, 2 = 3rd, …
        delta_ms: dtMs,
        scroll_depth_at_click: scrollDepthAtClick,
        cta_variant: ctaVariant,
        cohort: getVisitorCohort(),
        ...attribution,
      });
      clarityTag(`repeat_click_${placement}`, true);
      clarityTag('last_repeat_placement', placement);
      clarityMilestone(`cta_repeat_click_${placement}`);
    }

    // Update bookkeeping AFTER classification so future clicks reference
    // the prior state correctly.
    placementClickCountRef.current[placement] = priorCountForPlacement + 1;
    lastClickRef.current = { placement, at: nowClick };

    trackEvent('lp_cta_click', {
      page: '/go',
      funnel: 'tiktok_bio',
      funnel_step: 3,
      placement,
      lp_click_id: link.click_id,
      lp_clicked_at: link.clicked_at,
      time_to_click_ms: timeToClickMs,
      dwell_ms: dwellMs,
      scroll_depth_at_click: scrollDepthAtClick,
      is_first_click: isFirstClick,
      first_click_placement: firstClickPlacementRef.current,
      cta_variant: ctaVariant,
      cohort: getVisitorCohort(),
      // Surface classification on the canonical click event too so a single
      // SQL query against lp_cta_click rows can answer "what % of clicks were
      // misclicks / repeats" without joining to the dedicated event types.
      is_repeat_click: isRepeatClick,
      is_misclick: isMisclick,
      repeat_index: priorCountForPlacement,
      // Auto-winner attribution. Stamped on the canonical click event so
      // the elector can compute per-(placement, copy_label) CTR with a
      // single GROUP BY. Only the 3 button placements carry copy labels;
      // ancillary placements (video/proof/nudge/arrow) stay un-stamped.
      ...(placement === 'bio_primary'
        ? {
            cta_copy_label: primaryCopy.label,
            cta_copy_mode: copyMode,
            cta_copy_source: primaryCopy.source,
            hook_family: visitorHook?.hook_family ?? null,
            hook_source: visitorHook?.source ?? null,
          }
        : placement === 'bio_secondary'
        ? {
            cta_copy_label: secondaryCopy.label,
            cta_copy_mode: copyMode,
            cta_copy_source: secondaryCopy.source,
            hook_family: visitorHook?.hook_family ?? null,
            hook_source: visitorHook?.source ?? null,
          }
        : placement === 'bio_sticky'
        ? {
            cta_copy_label: stickyCopy.label,
            cta_copy_mode: copyMode,
            cta_copy_source: stickyCopy.source,
            hook_family: visitorHook?.hook_family ?? null,
            hook_source: visitorHook?.source ?? null,
          }
        : {}),
      ...CTA_FEATURE_FLAGS,
      ...flags,
      ...attribution,
    });
    // Spec-compliant mirror: the TikTok funnel brief calls for an
    // `lp_click` event with destination_url + UTM context. We fire it
    // ALONGSIDE lp_cta_click (never replacing it) so existing dashboards
    // and the auto-winner elector keep working unchanged. Wrapped in a
    // try/catch — analytics MUST NEVER block CTA navigation.
    try {
      const destinationUrl =
        `/products/automatic-cat-litter-box-self-cleaning-app-control` +
        `?ad=${encodeURIComponent(attribution.ad || 'tt')}` +
        `&utm_source=${encodeURIComponent(attribution.utm_source || 'tiktok')}` +
        `&utm_medium=${encodeURIComponent(attribution.utm_medium || 'social')}` +
        `&utm_campaign=${encodeURIComponent(attribution.utm_campaign || 'tt_bio_link')}` +
        (attribution.utm_content ? `&utm_content=${encodeURIComponent(attribution.utm_content)}` : '');
      trackEvent('lp_click', {
        placement,
        destination_url: destinationUrl,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        timestamp: Date.now(),
        lp_click_id: link.click_id,
      });
    } catch { /* never block navigation */ }
    // Clarity click beacon + tags so heatmap funnels can answer:
    // "of users who saw proof, how many actually clicked?"
    clarityTag('saw_proof_before_click', sawProof);
    clarityTag('saw_nudge_before_click', sawNudge);
    // Arrow tag is the cleanest A/B dimension — it isolates the bouncing
    // arrow's contribution to CTR vs the nudge text alone.
    clarityTag('saw_arrow_before_click', flags.saw_arrow_before_click);
    // Per-placement click tags — these are the heatmap-filter goldmine.
    // On the Clarity dashboard you can now segment:
    //   - "users who clicked bio_primary" vs "clicked bio_sticky"
    //   - "first_click_placement = bio_post_image" → scroll heatmap of
    //     ONLY users who converted via the post-image CTA
    //   - "scroll_depth_at_click < 30" → above-the-fold winners
    clarityTag(`clicked_${placement}`, true);
    clarityTag('last_click_placement', placement);
    clarityTag('first_click_placement', firstClickPlacementRef.current!);
    clarityTag('time_to_click_ms', timeToClickMs);
    clarityTag('scroll_depth_at_click', scrollDepthAtClick);
    if (dwellMs != null) clarityTag(`dwell_${placement}_ms`, dwellMs);
    clarityMilestone(`cta_click_${placement}`);
    clarityMilestone('cta_click');
    if (isFirstClick) clarityMilestone(`first_click_${placement}`);
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

        {/*
          ABOVE THE FOLD — high-converting pre-sell hook.
          Headline → sub → autoplay demo video → trust line → primary CTA.
          NOTE: Trust line uses category-true language only (no invented
          star ratings or review counts) per merchant-safe compliance.
        */}
        <header className="text-center flex flex-col gap-2">
          <h1 className="text-[34px] sm:text-4xl font-display font-extrabold leading-[1.05] tracking-tight text-foreground">
            Cleaner Litter, Less Work <span className="text-[hsl(25,95%,53%)]">Every Day</span>
          </h1>
          <p className="text-[15px] font-semibold text-foreground/75 leading-snug">
            Cat owners are switching to this self-cleaning box
          </p>
        </header>

        {/* MAIN VISUAL — autoplay looping demo (cat → cleaning → clean result). */}
        <div
          ref={videoCtaRef}
          className="w-full"
          onClickCapture={handleCtaClick('bio_video_cta')}
        >
          <div className="relative w-full overflow-hidden rounded-2xl border border-border/60 bg-black shadow-xl aspect-[9/16] max-h-[460px] mx-auto">
            {videoFailed ? (
              <img
                src="/videos/go-demo-poster.jpg"
                alt="Self-cleaning litter box demo"
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
                decoding="async"
              />
            ) : (
              <video
                src="/videos/go-demo.mp4"
                poster="/videos/go-demo-poster.jpg"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="absolute inset-0 w-full h-full object-cover"
                aria-label="Self-cleaning litter box demo"
                onError={() => {
                  setVideoFailed(true);
                  try {
                    trackEvent('lp_video_error', {
                      placement: 'bio_video_cta',
                      page: '/go',
                      funnel: 'tiktok_bio',
                    });
                  } catch { /* analytics must never break UX */ }
                }}
              />
            )}
          </div>
        </div>

        {/* Trust line — factual, no invented metrics */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] font-semibold text-foreground/70">
          <span className="inline-flex items-center gap-1">🇺🇸 US warehouse</span>
          <span className="inline-flex items-center gap-1">🚚 3–7 day delivery</span>
          <span className="inline-flex items-center gap-1">↩ 30-day returns</span>
        </div>

        {/* PRIMARY CTA — above the fold */}
        <div
          className="w-full flex flex-col gap-2"
          ref={primaryCtaRef}
          onClickCapture={handleCtaClick('bio_primary')}
        >
          <TikTokDeepLinkButton
            label={primaryCopy.text}
            campaign="tt_bio_link"
            content="bio_primary"
            className={`gp-cta-pulse ${urgencyVisible ? 'gp-cta-emphasize' : ''} h-14 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold rounded-xl shadow-lg shadow-[hsl(25,95%,53%)]/30`}
          />
          <p className="text-center text-[13px] font-semibold text-foreground/70">
            ⏱ 10 seconds • No signup
          </p>
        </div>

        {/* ─────────── BELOW THE FOLD (post-intent) ─────────── */}

        {/* PAIN — short emotional bullets */}
        <section className="w-full flex flex-col gap-2 pt-2">
          <h2 className="text-[18px] font-display font-extrabold text-foreground">
            Sound familiar?
          </h2>
          <ul className="flex flex-col gap-2 text-[14px] font-medium text-foreground">
            {[
              'Bad smell in your home',
              'Daily scooping frustration',
              'Mess around the litter box',
            ].map((b) => (
              <li
                key={b}
                className="flex items-center gap-2.5 rounded-xl bg-card border border-border/60 px-3.5 py-3"
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10 text-destructive text-[13px] font-extrabold">
                  ✕
                </span>
                {b}
              </li>
            ))}
          </ul>
          <p className="text-[14px] font-semibold text-foreground/80 text-center pt-1">
            There’s a reason this is going viral 👇
          </p>
        </section>

        {/* PRODUCT BENEFITS — fact-based, no review counts */}
        <section className="w-full flex flex-col gap-2">
          <h2 className="text-[18px] font-display font-extrabold text-foreground">
            Why owners are switching
          </h2>
          <ul className="grid grid-cols-2 gap-2 text-[13px] font-medium text-foreground">
            {[
              'Cleans itself',
              'Odor-sealed',
              'App-controlled',
              'Works with most litter',
            ].map((b) => (
              <li
                key={b}
                className="flex items-center gap-2 rounded-xl bg-card border border-border/60 px-3 py-2.5"
              >
                <span className="text-[hsl(25,95%,53%)] font-extrabold">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </section>

        {/* URGENCY — factual logistics, surfaces after scroll */}
        {urgencyVisible && (
          <aside
            className="w-full rounded-xl border border-[hsl(25,95%,53%)]/40 bg-[hsl(25,95%,53%)]/8 px-4 py-3 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-500"
            role="status"
            aria-live="polite"
          >
            <p className="text-[13px] font-bold text-foreground leading-tight">
              📦 Limited US stock — restocks take 4–6 weeks
            </p>
            <p className="text-[12px] text-foreground/75 leading-tight">
              🚚 3–7 day shipping from US warehouse
            </p>
          </aside>
        )}

        {/* TRUST PROOF — fades in after 60% scroll, no tracking changes */}
        {urgencyVisible && (
          <section
            className="w-full grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-3 duration-700"
            aria-label="Trust signals"
          >
            <div className="flex flex-col items-center text-center gap-1 rounded-xl border border-border/60 bg-card px-2 py-3">
              <span className="text-xl" aria-hidden="true">🇺🇸</span>
              <span className="text-[11px] font-bold text-foreground leading-tight">Ships from US</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1 rounded-xl border border-[hsl(25,95%,53%)]/40 bg-[hsl(25,95%,53%)]/8 px-2 py-3">
              <span className="text-xl" aria-hidden="true">🛡️</span>
              <span className="text-[11px] font-bold text-foreground leading-tight">30-Day Guarantee</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1 rounded-xl border border-border/60 bg-card px-2 py-3">
              <span className="text-xl" aria-hidden="true">🚚</span>
              <span className="text-[11px] font-bold text-foreground leading-tight">3–7 Day Delivery</span>
            </div>
          </section>
        )}

        {/* FINAL CTA */}
        <div
          className="w-full flex flex-col gap-2 pt-2"
          ref={secondaryCtaRef}
          onClickCapture={handleCtaClick('bio_secondary')}
        >
          <TikTokDeepLinkButton
            label={secondaryCopy.text}
            campaign="tt_bio_link"
            content="bio_secondary"
            className={`gp-cta-pulse ${urgencyVisible ? 'gp-cta-emphasize' : ''} h-14 text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold rounded-xl shadow-lg shadow-[hsl(25,95%,53%)]/30`}
          />
          <p
            className={`text-center text-[13px] font-semibold transition-all duration-500 ${
              urgencyVisible
                ? 'text-[hsl(25,95%,46%)] animate-in fade-in slide-in-from-bottom-1'
                : 'text-foreground/75'
            }`}
          >
            🛡️ 30-day risk-free guarantee
          </p>
        </div>

        <p className="pt-6 text-[11px] text-muted-foreground text-center">
          © {new Date().getFullYear()} GetPawsy
        </p>
      </div>

      {/* STICKY CTA */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur border-t transition-all duration-300 ${
          showSticky ? 'translate-y-0' : 'translate-y-full'
        } ${
          urgencyVisible
            ? 'bg-[hsl(25,95%,97%)]/95 border-[hsl(25,95%,53%)]/60 shadow-[0_-12px_32px_-8px_hsl(25_95%_53%_/_0.35)]'
            : 'bg-background/95 border-border/60'
        }`}
        aria-hidden={!showSticky}
      >
        {urgencyVisible && (
          <p className="mx-auto max-w-md mb-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-[hsl(25,95%,46%)]">
            ⏱ Tap below — 10 seconds, no signup
          </p>
        )}
        <div className="mx-auto max-w-md" ref={stickyCtaRef} onClickCapture={handleCtaClick('bio_sticky')}>
          <TikTokDeepLinkButton
            label={stickyCopy.text}
            campaign="tt_bio_link"
            content="bio_sticky"
            className={`gp-cta-pulse ${urgencyVisible ? 'gp-cta-emphasize h-14' : 'h-13'} text-base w-full bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white font-bold rounded-xl`}
          />
        </div>
      </div>
    </main>
  );
}
