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
  | 'crawlableRelatedLinks';

export interface ProductContentOverride {
  benefits?: string[];
  specs?: PdpSpecRow[];
  steps?: PdpStep[];
  faqs?: PdpFaq[];
  hideSections?: PdpSectionFlag[];
}

/**
 * Automatic Cat Litter Box – Self-Cleaning with App Control
 * Verified from: products.description (60L, IR exit sensor, app schedules +
 * usage monitoring, odor management, multi-cat). Unverified claims like
 * carbon-filter cadence, <50dB, kitten safety, 5lb minimum, BPA-free ABS,
 * "50% less scooping", and specific dimensions are intentionally omitted.
 */
const AUTOMATIC_CAT_LITTER_BOX: ProductContentOverride = {
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

export const PRODUCT_CONTENT_OVERRIDES: Record<string, ProductContentOverride> = {
  '128e0207-8a94-4d71-b428-5b7f5002528f': AUTOMATIC_CAT_LITTER_BOX,
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