/**
 * CTR Boost Engine
 * 
 * Generates optimized title tags and meta descriptions for pages
 * ranking in positions 1-15 to maximize click-through rate.
 * 
 * Rules:
 * - Titles: 55-65 characters
 * - Meta descriptions: 150-160 characters
 * - Add "2026" dynamically where relevant
 * - Use power modifiers (Expert, Complete, Step-by-Step)
 * - FAQ schema eligibility detection
 */

export interface CtrBoostSuggestion {
  slug: string;
  currentPosition: number;
  currentCtr: number;
  impressions: number;
  suggestedTitle: string;
  suggestedMeta: string;
  hasFaqPotential: boolean;
  reason: string;
}

// Known slug-to-optimized mapping for high-value pages
const MANUAL_CTR_OVERRIDES: Record<string, { title: string; meta: string }> = {
  'pet-insurance-guide': {
    title: 'Is Pet Insurance Worth It in 2026? Cost Breakdown + Expert Advice',
    meta: 'See real pricing, coverage differences, and when pet insurance actually makes sense. Compare top plans side by side.',
  },
  'dog-bathing-guide': {
    title: 'How to Bathe a Dog Properly (Step-by-Step 2026 Guide)',
    meta: 'Avoid common bathing mistakes and keep your dog calm, clean, and healthy. Expert tips for every coat type.',
  },
  'how-to-choose-collar-leash-dog': {
    title: 'How to Choose the Perfect Dog Collar & Leash (Avoid These Mistakes)',
    meta: 'Sizing, materials, safety tips and what most dog owners get wrong. Find the right collar for your dog\'s breed.',
  },
  'cat-water-fountains': {
    title: 'Are Cat Water Fountains Worth It? Benefits + Vet Insights (2026)',
    meta: 'Improve hydration, reduce kidney risk, and see which fountains work best. Vet-reviewed recommendations inside.',
  },
  'best-interactive-dog-toys': {
    title: 'Best Interactive Dog Toys (2026) – Tested & Ranked by Experts',
    meta: 'We tested 25+ interactive dog toys. See which ones keep dogs engaged longest, prevent boredom, and are built to last.',
  },
  'best-cat-litter-boxes': {
    title: 'Best Cat Litter Boxes (2026) – Self-Cleaning & Budget Picks',
    meta: 'Compare top-rated litter boxes for odor control, easy cleaning, and multi-cat homes. Expert picks for every budget.',
  },
  'best-slow-feeder-dog-bowls': {
    title: 'Best Slow Feeder Dog Bowls (2026) – Stop Fast Eating Today',
    meta: 'Prevent bloat and improve digestion with the right slow feeder. We tested and ranked the top options for all breeds.',
  },
  'best-cat-toys-for-indoor-cats': {
    title: 'Best Cat Toys for Indoor Cats (2026) – Keep Them Active',
    meta: 'Indoor cats need stimulation. These expert-picked toys fight boredom, encourage play, and keep your cat healthy.',
  },
  'dog-enrichment-toys': {
    title: 'Dog Enrichment Toys (2026) – Mental Stimulation Guide',
    meta: 'Reduce anxiety and destructive behavior with the right enrichment toys. Premium quality picks for every dog size.',
  },
};

// Power modifiers for title generation
const POWER_MODIFIERS = [
  'Complete Guide', 'Expert Picks', 'Tested & Ranked', 'Step-by-Step',
  'Avoid These Mistakes', 'What Actually Works', 'Premium Quality',
];

function humanizeSlug(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/202\d/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateTitle(slug: string, position: number): string {
  const keyword = humanizeSlug(slug);
  const needsYear = !slug.includes('2026');
  const modifier = position <= 5 ? 'Expert Picks' : 'Complete Guide';
  
  let title = '';
  if (slug.startsWith('best-')) {
    title = `${keyword}${needsYear ? ' (2026)' : ''} – Tested & Ranked`;
  } else if (slug.startsWith('how-to-')) {
    title = `${keyword}${needsYear ? ' (2026)' : ''} – ${modifier}`;
  } else {
    title = `${keyword}${needsYear ? ' (2026)' : ''} – ${modifier}`;
  }
  
  // Enforce 55-65 char limit
  if (title.length > 65) title = title.slice(0, 62) + '...';
  return title;
}

function generateMeta(slug: string): string {
  const keyword = humanizeSlug(slug).toLowerCase();
  const templates = [
    `Discover the best ${keyword} for 2026. Expert reviews, honest comparisons, and free US shipping on all orders.`,
    `Your complete guide to ${keyword}. Real testing, no sponsored picks. Find the perfect match for your pet.`,
    `Everything you need to know about ${keyword}. Vet-reviewed tips, top picks, and honest recommendations.`,
  ];
  
  // Pick template based on slug hash for consistency
  const hash = slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  let meta = templates[hash % templates.length];
  
  // Enforce 150-160 char limit
  if (meta.length > 160) meta = meta.slice(0, 157) + '...';
  if (meta.length < 150) meta += ' Shop now at GetPawsy.';
  
  return meta;
}

// V3 CTR modifiers for zero-click pages
const ZERO_CLICK_MODIFIERS = [
  '(Buyer Guide)',
  '(Expert Guide)',
  '(2026 Edition)',
  '(Comparison)',
];

export function generateCtrBoosts(
  pages: Array<{ slug: string; position: number; impressions: number; clicks: number; ctr: number }>
): CtrBoostSuggestion[] {
  // Target pages ranking 1-20 with meaningful impressions
  const targets = pages.filter(p => p.position >= 1 && p.position <= 20 && p.impressions >= 10);
  
  return targets
    .sort((a, b) => b.impressions - a.impressions)
    .map((p, i) => {
      const override = MANUAL_CTR_OVERRIDES[p.slug];
      let suggestedTitle = override?.title || generateTitle(p.slug, p.position);
      const suggestedMeta = override?.meta || generateMeta(p.slug);
      
      // V3: If position <= 20 AND clicks = 0, append modifier
      if (p.position <= 20 && p.clicks === 0 && !override) {
        const hash = p.slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const modifier = ZERO_CLICK_MODIFIERS[(hash + i) % ZERO_CLICK_MODIFIERS.length];
        if ((suggestedTitle + ' ' + modifier).length <= 65) {
          suggestedTitle = `${suggestedTitle} ${modifier}`;
        }
      }
      
      // FAQ potential: guide-like pages with informational intent
      const hasFaqPotential = /^(best-|how-to-|choosing-|guide-|why-)/.test(p.slug) ||
        p.slug.includes('guide') || p.slug.includes('tips');
      
      return {
        slug: p.slug,
        currentPosition: p.position,
        currentCtr: p.ctr,
        impressions: p.impressions,
        suggestedTitle,
        suggestedMeta,
        hasFaqPotential,
        reason: p.clicks === 0
          ? `ZERO CLICKS at position ${p.position} with ${p.impressions} impressions — modifier appended`
          : p.ctr < 3
          ? `Low CTR (${p.ctr.toFixed(1)}%) at position ${p.position} with ${p.impressions} impressions`
          : `Position ${p.position} – title optimization can push CTR from ${p.ctr.toFixed(1)}% to 5%+`,
      };
    });
}
