/**
 * conversionFlags — lightweight, instant-rollback feature flags for the
 * CI-2 Emotional PDP + Mobile Conversion layer.
 *
 * Storage: localStorage (per-device) with safe SSR-free defaults. Admin can
 * flip values via the browser console (`window.__gpFlags.set('mobileTrustBar', false)`)
 * or we can wire a small admin UI later. All flags default to ON for the
 * conservative additive blocks and OFF for anything more invasive — every
 * block is reversible by toggling its flag back.
 */

export type ConversionFlagKey =
  | 'emotionalHook'
  | 'mobileTrustBar'
  | 'swipeBenefitChips'
  | 'reassuranceCallout'
  | 'dynamicAtcLabel'
  | 'intentGating'
  | 'premiumCard'
  | 'premiumHero'
  | 'premiumCheckoutCart'
  | 'premiumPdpV2'
  | 'premiumCollection'
  | 'premiumCheckoutV2'
  | 'premiumNav'
  | 'premiumCartV3'
  | 'premiumThankYou'
  | 'premiumPdpStickyV2'
  | 'premiumPostPurchase'
  | 'premiumHomeAboveFold'
  | 'premiumReading'
  | 'premiumNotFound'
  | 'premiumSkeleton'
  | 'premiumSearchEmpty'
  | 'premiumFooter'
  | 'premiumAuth'
  | 'premiumCartCheckoutV4'
  | 'premiumMobileNavV2'
  | 'premiumProfile'
  | 'premiumCollectionFilters'
  | 'premiumReviews'
  | 'premiumSocialProof'
  | 'premiumSearchUI'
  | 'premiumGuidesHub'
  | 'premiumNewsletter'
  | 'premiumCartCheckoutV5'
  | 'premiumAuthV2'
  | 'premiumOrders'
  | 'premiumWishlist'
  | 'pdpStickyPaymentMarks'
  | 'aiHomepage';

const DEFAULTS: Record<ConversionFlagKey, boolean> = {
  emotionalHook: true,
  mobileTrustBar: true,
  swipeBenefitChips: true,
  reassuranceCallout: true,
  dynamicAtcLabel: true,
  // When true, weak-intent visitors see the baseline PDP without ad-driven
  // headline overrides or Pinterest-specific banners. Off = legacy behavior.
  intentGating: true,
  // CI-6: premium DTC product card polish (single badge, calmer typography,
  // no emoji, refined spacing). Pure presentation; flip to false to restore
  // the legacy multi-badge card instantly.
  premiumCard: true,
  // CI-7: premium DTC homepage hero — single emotional headline, single
  // primary CTA, hairline trust row, no urgency ping, no secondary CTA.
  // When on, the legacy duplicate trust strips below the hero are suppressed
  // to keep above-the-fold quiet. Flip to false to restore legacy hero.
  premiumHero: true,
  // CI-8: premium DTC cart polish — sticky mobile checkout bar, single
  // hairline trust row instead of triple-stacked rows, calmer item cards,
  // and the duplicate sidebar upsell suppressed on mobile. Pure presentation
  // and ordering; pricing, shipping math, Stripe and checkout untouched.
  premiumCheckoutCart: true,
  // CI-9: PDP → ATC polish v2 — sticky bar that hides on scroll-down /
  // reveals on scroll-up, haptic on tap, larger touch target, semantic
  // color tokens. Above-the-fold cleanup suppresses the duplicate mobile
  // trust bar + emotional hook (already represented by subline + chips),
  // and the gallery uses a calmer zoom hint. Pure presentation; flip to
  // false to restore CI-2/CI-7 behavior instantly.
  premiumPdpV2: true,
  // CI-10: premium DTC collection-page polish — hairline trust row
  // (matches CI-7/CI-8), denser mobile grid, calmer infinite-scroll
  // hairline divider, and subtle 'Customer favorite' rank emphasis on
  // the first 3 winners. Pure presentation; flip to false to restore
  // the legacy header / chip trust row / grid.
  premiumCollection: true,
  // CI-11: premium checkout polish v2 — sticky mobile bar that hides on
  // scroll-down / reveals on scroll-up, hairline trust row (matches CI-7/
  // CI-8/CI-10), quieter terms warning, calmer payment-methods subtext.
  // Pure presentation; Stripe redirect, pricing, and validation untouched.
  premiumCheckoutV2: true,
  // CI-11: premium global navbar polish — sticky header hides on
  // scroll-down and reveals on scroll-up (mobile), tighter scrolled
  // height, hairline border. Pure presentation; nav links + routes
  // unchanged. Flip to false to restore the always-visible legacy nav.
  premiumNav: true,
  // CI-12: cart polish v3 — mobile sticky checkout bar uses transform-hide
  // on scroll-down (matches CI-11 PDP/checkout), shipping-info pill becomes
  // a hairline micro-caps line, and the order-summary card border tightens.
  // Pure presentation; pricing, shipping math, and Stripe untouched.
  premiumCartV3: true,
  // CI-12: premium thank-you page — calmer typography (no emoji in H1),
  // semantic success token instead of hard-coded green, hairline "what
  // happens next" panel. Tracking, conversion events, and post-purchase
  // offer untouched.
  premiumThankYou: true,
  // CI-13: PDP sticky ATC v2 — hides on scroll-down / reveals on scroll-up
  // (matches CI-11 navbar + checkout + CI-12 cart), hairline trust micro-caps
  // row replaces the chunky desktop trust pills, tighter border + lighter
  // shadow. Pure presentation; ATC handler, pricing, and quantity untouched.
  premiumPdpStickyV2: true,
  // CI-13: post-purchase polish — soft email capture on the thank-you page
  // (no popup, trust-first copy), and a quiet returning-visitor welcome strip
  // on the homepage for ~30 days after the most recent successful purchase.
  // Both are dismissable / additive. Tracking and conversion events untouched.
  premiumPostPurchase: true,
  // CI-14: homepage above-the-fold polish v2 — tightens hero subline measure
  // and replaces the chunky benefit cards with a calmer hairline list under
  // a micro-caps eyebrow. Headline, CTA, image, and link targets unchanged.
  premiumHomeAboveFold: true,
  // CI-14: guide + blog reading polish — sticky reading-progress bar, calmer
  // editorial header (micro-caps category eyebrow instead of chunky badges,
  // tighter meta row). Content rendering, schema, and links untouched.
  premiumReading: true,
  // CI-15: calmer 404 — hairline circle + Compass icon, micro-caps eyebrow,
  // hairline link chips. Routing, SEO meta, and logging untouched.
  premiumNotFound: true,
  // CI-15: quieter product skeletons — hairline border instead of soft shadow,
  // lower-contrast bars. Identical footprint so layout doesn't shift on swap.
  premiumSkeleton: true,
  // CI-15: search-specific empty state — calmer copy, shows the query, popular
  // category chips, and a clear browse-all CTA. Only triggers when the user
  // has an active search query; category empty state is unchanged.
  premiumSearchEmpty: true,
  // CI-16: footer polish — denser link hierarchy, hairline dividers between
  // bottom rows, calmer trust micro-row, tighter column typography. Pure
  // presentation; all link targets, social URLs, and reset behavior unchanged.
  premiumFooter: true,
  // CI-16: auth page polish — calmer card (hairline border, no soft shadow),
  // micro-caps eyebrow, tighter spacing, English labels on password divider
  // + remember-me. Auth flow, validation, and OAuth handlers untouched.
  premiumAuth: true,
  // CI-17: cart + checkout polish v4 — premium empty states (Compass icon,
  // hairline circle, micro-caps eyebrow), calmer cart item rows (hairline
  // border + lighter qty stepper), refined checkout typography (micro-caps
  // section eyebrow above each card title, English-only labels, tighter
  // form labels). Pure presentation; pricing, validation, Stripe redirect,
  // and abandoned-cart logic untouched.
  premiumCartCheckoutV4: true,
  // CI-17: mobile nav drawer polish — hairline dividers between sections,
  // micro-caps section eyebrows (Browse / Categories / Account), calmer
  // link typography, premium search bar treatment. Pure presentation;
  // nav links, routes, sign-out, and admin entries untouched.
  premiumMobileNavV2: true,
  // CI-18: profile / account polish — calmer cards (hairline border, no soft
  // shadow), micro-caps section eyebrow under H1, English-only sign-out copy,
  // tighter buttons and section spacing. Auth, sign-out handler, passkeys,
  // and reset-data logic untouched.
  premiumProfile: true,
  // CI-18: collection + filter bar polish — hairline breadcrumb row, micro-
  // caps "Showing X" line, calmer active-filter pills (hairline border, no
  // tint), and a refined sort dropdown trigger. Pure presentation; filter
  // state, sort logic, and URL params untouched.
  premiumCollectionFilters: true,
  // CI-19: PDP reviews polish — hairline review cards (no soft shadow),
  // micro-caps "Verified buyer" eyebrow (replaces tinted pill), calmer
  // star row, tighter title typography, hairline summary card. Pure
  // presentation; review CRUD, helpful counts, and verified-buyer logic
  // untouched.
  premiumReviews: true,
  // CI-19: homepage social proof polish — micro-caps "Customer promise"
  // eyebrow, hairline promise tiles (no icon tint), calmer trust-badge
  // row (no card background, no hover lift). Pure presentation; copy,
  // links, and shipping constants untouched.
  premiumSocialProof: true,
  // CI-20: search overlay polish — hairline (1px) input + dropdown borders
  // (no ring tint), micro-caps "Recent" / "Popular" / "Categories" eyebrows,
  // calmer result rows (no soft shadow, hairline dividers), refined empty-
  // state with hairline icon circle, and hairline category/popular chips.
  // Pure presentation; search query, navigation, and tracking untouched.
  premiumSearchUI: true,
  // CI-20: guides hub polish — hairline guide cards (no soft shadow / hover
  // lift), micro-caps category eyebrow (replaces sparkles + chunky title row),
  // calmer hub header (no gradient icon tile), refined chip nav with hairline
  // borders. Pure presentation; routing, schema, and links untouched.
  premiumGuidesHub: true,
  // CI-21: newsletter capture polish — hairline border (no tinted bg), micro-
  // caps eyebrow, calmer icon ring, refined success state. Pure presentation;
  // signup handler, Supabase insert, and welcome email flow untouched.
  premiumNewsletter: true,
  // CI-22: cart + checkout polish v5 — micro-caps section eyebrows ("Your cart",
  // "Order summary"), font-display semibold titles, hairline separators between
  // summary rows, calmer quantity stepper (border-border/60), and hairline
  // checkout item rows. Pure presentation; pricing, Stripe, and validation
  // untouched. Flip to false to restore CI-17/v4 behavior instantly.
  premiumCartCheckoutV5: true,
  // CI-22: auth page polish v2 — hairline underlined tabs (no filled pill),
  // dynamic font-display heading per tab ("Sign in" / "Create account"), and
  // a tighter card padding. Auth flow, validation, OAuth handlers untouched.
  premiumAuthV2: true,
  // CI-23: orders page polish — hairline order cards (no soft shadow), micro-
  // caps "Order" eyebrow above the order id, calmer status badges (hairline
  // border, no tinted fill), refined empty state (hairline circle + Compass-
  // like icon, micro-caps eyebrow), and a quieter tracking row. Pure
  // presentation; order data, tracking links, and claim flow untouched.
  premiumOrders: true,
  // CI-23: wishlist polish — hairline product cards (no soft shadow), micro-
  // caps category eyebrow, calmer price row, hairline icon ring on the empty
  // state with micro-caps eyebrow. Pure presentation; wishlist storage,
  // add-to-cart, and sort/filter logic untouched.
  premiumWishlist: true,
  // CV-001: hairline payment marks row above the mobile sticky ATC (Apple Pay,
  // Google Pay, Visa, Mastercard, Amex — text-only, no images, no external
  // dependencies). Frontend-only trust signal for Pinterest mobile visitors.
  // Pure presentation; ATC handler, price math, and analytics untouched.
  pdpStickyPaymentMarks: true,
  // CI-8: AI homepage personalization (winner routing + emotional angle).
  // Default OFF — flip in admin after QA. Engine failure always falls back
  // to the static premium hero / default block order, so this is safe to
  // enable per-segment without storefront risk.
  aiHomepage: false,
};

const LS_KEY = 'gp_conversion_flags_v1';

function readAll(): Partial<Record<ConversionFlagKey, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(next: Partial<Record<ConversionFlagKey, boolean>>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function getConversionFlag(key: ConversionFlagKey): boolean {
  const overrides = readAll();
  return overrides[key] ?? DEFAULTS[key];
}

export function setConversionFlag(key: ConversionFlagKey, value: boolean): void {
  const overrides = readAll();
  overrides[key] = value;
  writeAll(overrides);
}

// Expose a tiny console helper for instant ops-side rollback.
if (typeof window !== 'undefined') {
  (window as unknown as { __gpFlags?: unknown }).__gpFlags = {
    get: getConversionFlag,
    set: setConversionFlag,
    defaults: DEFAULTS,
  };
}