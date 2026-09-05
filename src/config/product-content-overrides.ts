/**
 * Per-SKU verified content overrides.
 *
 * When a product ID appears in `PRODUCT_CONTENT_OVERRIDES`, PDP components
 * MUST prefer the values in the override over their generic category defaults.
 *
 * Rules:
 * - Only add facts that are VERIFIED against the product's own DB row
 *   (description, media, or supplier confirmation) — never generic category
 *   guesses.
 * - Omit a field entirely when the fact is not verified. Consumers fall back
 *   to their generic behaviour only for omitted fields.
 * - `hideSections` lets a SKU suppress duplicative PDP sections that repeat
 *   the same claims the override already communicates.
 */

export interface PdpBenefit {
  text: string;
}

export interface PdpStep {
  step: string;
  title: string;
  description: string;
}

export interface PdpSpecRow {
  label: string;
  value: string;
}

export interface PdpFaq {
  q: string;
  a: string;
}

export type PdpSectionFlag =
  | 'litterBoxConversionBoost'
  | 'productIdealFor'
  | 'productVsAlternatives'
  | 'litterBoxLovedSection'
  | 'reassuranceCallout'
  | 'problemSolution'
  | 'crawlableRelatedLinks'
  | 'whyPetParentsLoveIt';

export interface PdpProblemSolutionRow {
  problem: string;
  solution: string;
}

export interface ProductContentOverride {
  benefits?: string[];
  specs?: PdpSpecRow[];
  steps?: PdpStep[];
  faqs?: PdpFaq[];
  hideSections?: PdpSectionFlag[];
  intro?: string;
  inStockLine?: string;
  verifiedShippingLine?: string;
  supportLabel?: string;
  suppressUrgencyLine?: boolean;
  hideAdIntentHeadline?: boolean;
  hideEmotionalHook?: boolean;
  /** Shopper-facing H1 replacement. Canonical name / SEO metadata are untouched. */
  displayTitle?: string;
  /** Exactly the 3 short bullets shown in the mobile above-the-fold quick-buy card. */
  heroBullets?: string[];
  /** Enables the mobile-only compact quick-buy card under the gallery. */
  mobileQuickBuy?: boolean;
  /** Verified "Best for" bullets; overrides generic ad-intent bullets. */
  bestFor?: string[];
  /** Verified problem → solution rows rendered under the buy box. */
  problemSolution?: PdpProblemSolutionRow[];
  /** Hides the "Best Value" badge on the Buy 2 volume tier (badge only — discount math untouched). */
  hideBestValueBadge?: boolean;
  galleryFilter?: {
    imageOnly?: boolean;
    maxImages?: number;
    blockedUrlTokens?: string[];
  };
}


/**
 * Automatic Cat Litter Box – Self-Cleaning with App Control
 * Verified from: products.description (60L, IR exit sensor, app schedules +
 * usage monitoring, odor management, multi-cat). Unverified claims like
 * carbon-filter cadence, <50dB, kitten safety, 5lb minimum, BPA-free ABS,
 * "50% less scooping", and specific dimensions are intentionally omitted.
 */
const AUTOMATIC_CAT_LITTER_BOX: ProductContentOverride = {
  intro:
    'A self-cleaning litter box for busy cat homes, with a 60 L interior, app scheduling, usage monitoring, and an infrared exit sensor that starts cleaning only after your cat leaves.',
  inStockLine: 'In stock — ships to United States',
  verifiedShippingLine: 'Estimated delivery: 5–10 business days',
  supportLabel: 'Customer Support',
  suppressUrgencyLine: true,
  hideAdIntentHeadline: true,
  hideEmotionalHook: true,
  galleryFilter: {
    imageOnly: true,
    maxImages: 15,
    blockedUrlTokens: ['cinematic', 'video', '.mp4', '.webm', '.mov', '.m4v', '.avi', '.m3u8'],
  },
  benefits: [
    'Automatic cleaning cycle after each visit',
    'App control for schedules and usage monitoring',
    'Built-in odor management to keep your home fresh',
    'Designed for multi-cat households',
  ],
  specs: [
    { label: 'Category', value: 'Cat Litter Boxes' },
    { label: 'Capacity', value: '60 L' },
    { label: 'Sensor', value: 'Infrared exit sensor — cleaning cycle starts only after your cat leaves' },
    { label: 'App Control', value: 'Schedule cleaning cycles and monitor usage from your smartphone' },
    { label: 'Odor Control', value: 'Built-in odor management system' },
    { label: 'Suitable For', value: 'Multi-cat households' },
    { label: 'Brand', value: 'GetPawsy' },
  ],
  steps: [
    {
      step: '1',
      title: 'Your cat uses the litter box',
      description: 'The spacious 60 L interior fits comfortably in multi-cat households.',
    },
    {
      step: '2',
      title: 'The infrared sensor detects the exit',
      description: 'The cleaning cycle only starts after your cat has safely left the unit.',
    },
    {
      step: '3',
      title: 'The automatic cycle handles the mess',
      description: 'Waste is separated and the odor management system helps keep the room fresh.',
    },
    {
      step: '4',
      title: 'You monitor everything from the app',
      description: 'Schedule cleaning cycles and track usage from your phone.',
    },
  ],
  faqs: [
    {
      q: 'How does the automatic cleaning work?',
      a: 'An infrared sensor detects when your cat exits the unit and then starts the cleaning cycle automatically. The cycle does not run while a cat is inside.',
    },
    {
      q: 'What can I control from the app?',
      a: 'You can schedule cleaning cycles and monitor your cat’s usage of the litter box from your smartphone.',
    },
    {
      q: 'Is it suitable for more than one cat?',
      a: 'Yes — this model is designed for multi-cat households. For most homes we still recommend a second box available elsewhere so cats always have a clean option.',
    },
    {
      q: 'How does it handle odor?',
      a: 'The unit has a built-in odor management system that helps keep your home fresh between cleaning cycles.',
    },
    {
      q: 'What is the capacity?',
      a: 'The internal capacity is 60 litres, giving your cat plenty of room to turn around and dig comfortably.',
    },
    {
      q: 'How long does shipping take?',
      a: 'We ship to the United States. Delivery times and any free-shipping thresholds are shown at checkout.',
    },
    {
      q: 'What is the return policy?',
      a: 'GetPawsy offers a 30-day return policy. Items must be unused and in original condition — contact support to start a return.',
    },
  ],
  hideSections: [
    // These sections repeat the same "less scooping / odor / app control /
    // multi-cat" claims the Key Benefits + FAQ already cover, and several of
    // them make unverified statements (dB level, "50% less scooping", etc.).
    'litterBoxConversionBoost',
    'productIdealFor',
    'productVsAlternatives',
    'litterBoxLovedSection',
    'reassuranceCallout',
    // Problem/Solution duplicates the Key Benefits + How It Works messaging
    // and adds generic THE PROBLEM / THE SOLUTION headings with no new facts.
    'problemSolution',
    // CrawlableRelatedLinks ("More Products You Might Like") duplicates the
    // "You May Also Like" RelatedProductsCarousel that renders right above it.
    'crawlableRelatedLinks',
  ],
};

/**
 * Covered Cat Litter Box – Privacy Hood with Scoop & Deodorizing Bags
 * MANUAL product. Verified from products.description only: covered privacy
 * hood, enclosed design, removable top, included scoop, deodorizing bags,
 * helps contain litter scatter and odor. No sensors, no app control, no
 * automatic waste removal — generic "litter box" category copy must not apply.
 */
const COVERED_CAT_LITTER_BOX: ProductContentOverride = {
  intro:
    'A covered litter box with a privacy hood that gives your cat an enclosed space. It comes with a scoop and deodorizing bags, and the removable top makes routine scooping and cleaning straightforward.',
  suppressUrgencyLine: true,
  hideAdIntentHeadline: true,
  hideEmotionalHook: true,
  benefits: [
    'Covered privacy hood gives your cat an enclosed space',
    'Litter scoop and deodorizing bags included',
    'Removable top for easy access and routine scooping',
    'Enclosed design helps contain litter scatter and visual mess',
    'Suitable for everyday manual litter-box use',
  ],
  specs: [
    { label: 'Category', value: 'Cat Litter Boxes' },
    { label: 'Type', value: 'Covered (hooded) litter box — manual scooping' },
    { label: 'Design', value: 'Enclosed hood with removable top' },
    { label: 'Included', value: 'Litter scoop and deodorizing bags' },
    { label: 'Litter Containment', value: 'Enclosed sides help contain litter scatter' },
    { label: 'Brand', value: 'GetPawsy' },
  ],
  steps: [
    { step: '1', title: 'Place the box and add litter', description: 'Fill the base with your usual litter and set the hood in place.' },
    { step: '2', title: 'Your cat uses the enclosed space', description: 'The privacy hood gives your cat a covered spot and helps keep litter inside the box.' },
    { step: '3', title: 'Scoop with the included scoop', description: 'Lift or remove the top for easy access and scoop as part of your normal routine.' },
    { step: '4', title: 'Bag and dispose', description: 'Use the included deodorizing bags when you empty the scooped waste.' },
  ],
  faqs: [
    { q: 'Is this litter box automatic or self-cleaning?', a: 'No. This is a manual covered litter box. There are no sensors, motors or app control — you scoop it yourself with the included scoop.' },
    { q: 'What is included?', a: 'The covered litter box with its privacy hood, a litter scoop, and deodorizing bags.' },
    { q: 'How do I clean it?', a: 'The top is removable, so you can lift it off for easy access, scoop the litter as part of your daily routine, and wipe the base out when you change the litter.' },
    { q: 'Does the hood help with mess?', a: 'The enclosed design helps contain litter scatter and keeps the contents out of sight. Regular scooping is still needed to keep it fresh.' },
    { q: 'What litter can I use?', a: 'You can use your cat’s usual litter — the box has no mechanism that restricts litter type.' },
    { q: 'How long does shipping take?', a: 'We ship to the United States. Delivery times and any free-shipping thresholds are shown at checkout.' },
    { q: 'What is the return policy?', a: 'GetPawsy offers a 30-day return policy. Items must be unused and in original condition — contact support to start a return.' },
  ],
  hideSections: [
    // All of these render hardcoded automatic/self-cleaning/sensor claims for
    // anything matching the "litter box" category — false for this manual box.
    'litterBoxConversionBoost',
    'problemSolution',
    'productVsAlternatives',
    'litterBoxLovedSection',
    'productIdealFor',
  ],
};

/**
 * Enclosed Cat Litter Box – Dual Opening Anti-Splash Odor-Locking
 * (slug: front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265)
 *
 * MANUAL product. Verified strictly from the product row: enclosed box with a
 * front flip door plus a dual-opening (top) entry, anti-splash walls,
 * odor-locking lid, anti-tracking design, White colorway, positioned for
 * multi-cat households and apartments. No sensors, no motor, no app control,
 * no automatic waste removal. Dimensions, materials, decibel levels, odor
 * performance percentages and durability lifespans are NOT verified and are
 * intentionally omitted.
 */
const ENCLOSED_DUAL_OPENING_LITTER_BOX: ProductContentOverride = {
  displayTitle: 'Enclosed Cat Litter Box — Front Flip Door, Anti-Splash, Odor-Locking',
  intro:
    'An enclosed litter box built to keep litter and mess inside: a front flip door for your cat, a second top opening for you, anti-splash walls, and an odor-locking lid.',
  inStockLine: 'In stock — ships to United States',
  verifiedShippingLine: 'Estimated delivery: 5–10 business days',
  supportLabel: 'Customer Support',
  suppressUrgencyLine: true,
  hideAdIntentHeadline: true,
  hideEmotionalHook: true,
  mobileQuickBuy: true,
  bestFor: ['Multi-cat households', 'Apartment living', 'Cats that kick litter out'],
  heroBullets: [
    'Front flip door plus a second top opening',
    'Anti-splash walls and anti-tracking enclosed design',
    'Odor-locking lid keeps the box covered between uses',
  ],
  benefits: [
    'Front flip door your cat walks through, plus a top opening for scooping',
    'Anti-splash walls help keep litter and spray inside the box',
    'Enclosed anti-tracking design to reduce litter carried onto the floor',
    'Odor-locking lid keeps the box closed between visits',
    'Suitable for multi-cat households and apartment living',
  ],
  problemSolution: [
    {
      problem: 'Litter ends up all over the floor around the box.',
      solution: 'The enclosed anti-tracking design and front flip door keep litter inside instead of following your cat out.',
    },
    {
      problem: 'Spray and scatter get past low-walled open trays.',
      solution: 'High anti-splash walls contain the mess inside the box.',
    },
    {
      problem: 'An open box leaves smells out in the room.',
      solution: 'The odor-locking lid keeps the box covered between visits.',
    },
    {
      problem: 'Covered boxes can be awkward to clean.',
      solution: 'The dual-opening design gives you a separate top access point for scooping.',
    },
  ],
  specs: [
    { label: 'Category', value: 'Cat Litter Boxes' },
    { label: 'Type', value: 'Enclosed litter box — manual scooping' },
    { label: 'Openings', value: 'Front flip door for your cat, plus a top opening for access' },
    { label: 'Walls', value: 'Anti-splash walls' },
    { label: 'Lid', value: 'Odor-locking lid' },
    { label: 'Litter Containment', value: 'Anti-tracking enclosed design' },
    { label: 'Color', value: 'White' },
    { label: 'Suitable For', value: 'Multi-cat households and apartments' },
    { label: 'Brand', value: 'GetPawsy' },
  ],
  steps: [
    { step: '1', title: 'Add your usual litter', description: 'Fill the base with the litter your cat already uses and close the lid.' },
    { step: '2', title: 'Your cat enters through the flip door', description: 'The front flip door leads into the enclosed space.' },
    { step: '3', title: 'Mess stays inside', description: 'Anti-splash walls and the enclosed anti-tracking design keep litter and spray in the box.' },
    { step: '4', title: 'Scoop through the top opening', description: 'Use the second, top opening for scooping as part of your normal routine.' },
  ],
  faqs: [
    { q: 'Is this litter box automatic or self-cleaning?', a: 'No. This is a manual enclosed litter box — there are no sensors, motors or app control. You scoop it yourself.' },
    { q: 'What does "dual opening" mean?', a: 'There are two ways in: a front flip door your cat walks through, and a top opening you can use for access and scooping.' },
    { q: 'Does it help with litter tracking?', a: 'The box uses an enclosed anti-tracking design with a front flip door, which is built to keep litter inside the box rather than on your floor.' },
    { q: 'What about odor?', a: 'The box has an odor-locking lid that keeps it covered between visits. Regular scooping is still needed to keep it fresh.' },
    { q: 'Is it suitable for more than one cat?', a: 'It is positioned for multi-cat households and apartment living. In most multi-cat homes we still recommend having a second box available elsewhere.' },
    { q: 'What litter can I use?', a: 'Your cat’s usual litter — there is no mechanism that restricts litter type.' },
    { q: 'How long does shipping take?', a: 'We ship to the United States. Estimated delivery is 5–10 business days, and shipping options are confirmed at checkout.' },
    { q: 'What is the return policy?', a: 'GetPawsy offers a 30-day return policy. Items must be unused and in original condition — contact support to start a return.' },
  ],
  hideSections: [
    // Generic litter-box sections hardcode automatic / sensor / app-control
    // claims that are false for this manual box, or repeat the same points.
    'litterBoxConversionBoost',
    'litterBoxLovedSection',
    'problemSolution',
    'productVsAlternatives',
    'productIdealFor',
    'reassuranceCallout',
    // Implicit emotional social proof — not verified for this SKU.
    'whyPetParentsLoveIt',
  ],
  hideBestValueBadge: true,
};

export const PRODUCT_CONTENT_OVERRIDES: Record<string, ProductContentOverride> = {
  '128e0207-8a94-4d71-b428-5b7f5002528f': AUTOMATIC_CAT_LITTER_BOX,
  'e4474637-f447-4503-a342-5667c4c546a8': COVERED_CAT_LITTER_BOX,
  'e265e7fe-af60-4efc-b927-5c4f79fc1bf0': ENCLOSED_DUAL_OPENING_LITTER_BOX,
};


export function getProductContentOverride(productId?: string | null): ProductContentOverride | undefined {
  if (!productId) return undefined;
  return PRODUCT_CONTENT_OVERRIDES[productId];
}

export function isSectionHiddenForProduct(
  productId: string | null | undefined,
  section: PdpSectionFlag,
): boolean {
  const o = getProductContentOverride(productId);
  return !!o?.hideSections?.includes(section);
}