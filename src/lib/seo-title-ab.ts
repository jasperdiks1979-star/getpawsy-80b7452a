/**
 * SEO Title A/B Testing System
 * 
 * Deterministic 7-day rotation for SEO title variants.
 * No cloaking risk — same variant for ALL users for 7 days.
 * Winner selection: >=12% CTR uplift after 150 impressions or 10 days.
 */

export interface TitleVariant {
  id: 'A' | 'B' | 'C';
  title: string;
  description: string;
  startDate?: string;
  endDate?: string;
}

export interface TitleABConfig {
  slug: string;
  activeVariantId: 'A' | 'B' | 'C';
  variants: TitleVariant[];
  rotationIntervalDays: number;
  rotationStartDate: string; // ISO date
  winner?: 'A' | 'B' | 'C' | null;
  winnerSelectedAt?: string;
}

// Active title A/B tests
const TITLE_AB_TESTS: Record<string, TitleABConfig> = {
  'outdoor-dog-games-2026': {
    slug: 'outdoor-dog-games-2026',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-13',
    winner: null,
    variants: [
      { id: 'A', title: 'Outdoor Dog Games (2026) – 15 Premium Quality Ideas', description: 'Number + authority trigger + year.' },
      { id: 'B', title: '15 Best Outdoor Dog Games (2026 Guide)', description: 'List-first format.' },
      { id: 'C', title: 'Outdoor Dog Games Dogs Actually Love (2026)', description: 'Emotional/curiosity trigger.' },
    ],
  },
  'best-dog-bed-2026': {
    slug: 'best-dog-bed-2026',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-13',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Dog Beds (2026) – 10 Tested Picks by Foam & Breed', description: 'Number + method.' },
      { id: 'B', title: '10 Best Dog Beds (2026) – Orthopedic & Calming Tested', description: 'List-first.' },
      { id: 'C', title: 'Best Dog Beds That Actually Last (2026 Review)', description: 'Durability hook.' },
    ],
  },
  'best-cat-litter-box-2026': {
    slug: 'best-cat-litter-box-2026',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-13',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Cat Litter Box (2026) – 12 Tested for Odor & Size', description: 'Number + testing method.' },
      { id: 'B', title: '12 Best Cat Litter Boxes (2026) – Odor Control Ranked', description: 'List-first.' },
      { id: 'C', title: 'Best Cat Litter Box That Controls Odor (2026)', description: 'Benefit-first.' },
    ],
  },
  'best-orthopedic-dog-bed': {
    slug: 'best-orthopedic-dog-bed',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-13',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Orthopedic Dog Beds for Joint Support (2026)', description: 'Authority + year.' },
      { id: 'B', title: 'Best Orthopedic Dog Beds – Stop Joint Pain Fast (Vet Tested 2026)', description: 'Outcome + differentiator + year.' },
      { id: 'C', title: 'Best Orthopedic Dog Bed for Joint Pain (2026)', description: 'Problem-specific intent match.' },
    ],
  },

  // ═══ POSITION 1 DOMINATION — CTR OUTPERFORMANCE VARIANTS ═══
  'orthopedic-dog-beds': {
    slug: 'orthopedic-dog-beds',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-23',
    winner: null,
    variants: [
      { id: 'A', title: '7 Best Orthopedic Dog Beds – Stop Joint Pain Fast (Vet Tested 2026)', description: 'Outcome + authority + urgency.' },
      { id: 'B', title: 'Best Orthopedic Dog Beds (2026) – Memory Foam Tested by Weight', description: 'Method-driven specificity.' },
    ],
  },
  'cat-trees-for-large-cats': {
    slug: 'cat-trees-for-large-cats',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-23',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Cat Trees for Large Cats – Won\'t Tip or Wobble (2026)', description: 'Pain point + outcome + year.' },
      { id: 'B', title: 'Heavy Duty Cat Trees for 25+ lb Cats – Stability Tested (2026)', description: 'Specificity + testing credibility.' },
    ],
  },
  'best-dog-car-seats': {
    slug: 'best-dog-car-seats',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-23',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Dog Car Seats – Crash-Tested & Safe for All Sizes (2026)', description: 'Safety outcome + coverage + year.' },
      { id: 'B', title: '10 Best Dog Car Seats (2026) – Booster & Harness Tested', description: 'List + method + type coverage.' },
    ],
  },
  'best-elevated-dog-bed': {
    slug: 'best-elevated-dog-bed',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-23',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Elevated Dog Beds – Cooling Airflow for Hot Dogs (2026)', description: 'Benefit-first + problem.' },
      { id: 'B', title: '8 Best Elevated Dog Beds (2026) – Indoor & Outdoor Tested', description: 'List + versatility + year.' },
    ],
  },
  'self-cleaning-litter-box-guide': {
    slug: 'self-cleaning-litter-box-guide',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-23',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Self-Cleaning Litter Boxes – Zero Daily Scooping (2026)', description: 'Outcome promise + year.' },
      { id: 'B', title: '7 Best Self-Cleaning Litter Boxes (2026) – Odor & Noise Tested', description: 'List + testing method.' },
    ],
  },
  'best-interactive-dog-toys': {
    slug: 'best-interactive-dog-toys',
    activeVariantId: 'A',
    rotationIntervalDays: 7,
    rotationStartDate: '2026-02-23',
    winner: null,
    variants: [
      { id: 'A', title: 'Best Interactive Dog Toys – End Boredom & Destruction (2026)', description: 'Outcome-driven + year.' },
      { id: 'B', title: '12 Best Interactive Dog Toys (2026) – Puzzle & Treat Tested', description: 'List + category + method.' },
    ],
  },
};

/**
 * Get the currently active title variant for a given slug.
 * Uses deterministic 7-day rotation based on start date.
 */
export function getActiveTitleVariant(slug: string): TitleVariant | null {
  const config = TITLE_AB_TESTS[slug];
  if (!config) return null;

  // If winner is selected, always return winner
  if (config.winner) {
    return config.variants.find(v => v.id === config.winner) || null;
  }

  // Calculate which variant is active based on 7-day rotation
  const startDate = new Date(config.rotationStartDate);
  const now = new Date();
  const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const rotationCycle = Math.floor(daysSinceStart / config.rotationIntervalDays);
  const variantIndex = rotationCycle % config.variants.length;

  return config.variants[variantIndex];
}

/**
 * Get all variant configs for admin dashboard display
 */
export function getTitleABTests(): Record<string, TitleABConfig> {
  return TITLE_AB_TESTS;
}

/**
 * Get the active title for a guide (falls back to seoTitle/title if no test)
 */
export function getSeoTitle(slug: string, fallbackSeoTitle?: string, fallbackTitle?: string): string {
  const variant = getActiveTitleVariant(slug);
  if (variant) return variant.title;
  return fallbackSeoTitle || fallbackTitle || '';
}

/**
 * Get current rotation status for monitoring
 */
export function getTitleABStatus(slug: string): {
  currentVariant: TitleVariant | null;
  dayInRotation: number;
  daysUntilSwap: number;
  totalRotations: number;
  isTestActive: boolean;
} {
  const config = TITLE_AB_TESTS[slug];
  if (!config) {
    return { currentVariant: null, dayInRotation: 0, daysUntilSwap: 0, totalRotations: 0, isTestActive: false };
  }

  const startDate = new Date(config.rotationStartDate);
  const now = new Date();
  const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayInRotation = daysSinceStart % config.rotationIntervalDays;
  const daysUntilSwap = config.rotationIntervalDays - dayInRotation;
  const totalRotations = Math.floor(daysSinceStart / config.rotationIntervalDays);

  return {
    currentVariant: getActiveTitleVariant(slug),
    dayInRotation,
    daysUntilSwap,
    totalRotations,
    isTestActive: !config.winner,
  };
}
