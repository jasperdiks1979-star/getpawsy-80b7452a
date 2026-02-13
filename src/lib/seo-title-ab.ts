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
      {
        id: 'A',
        title: 'Outdoor Dog Games (2026) – 15 Vet-Approved Ideas',
        description: 'Number + authority trigger + year. Standard high-CTR format.',
      },
      {
        id: 'B',
        title: '15 Best Outdoor Dog Games (2026 Guide)',
        description: 'List-first format. Emphasizes completeness.',
      },
      {
        id: 'C',
        title: 'Outdoor Dog Games Dogs Actually Love (2026)',
        description: 'Emotional/curiosity trigger. Benefit-driven.',
      },
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
