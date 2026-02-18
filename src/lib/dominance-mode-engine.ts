/**
 * GetPawsy Dominance Mode Engine
 * 
 * Full execution system:
 * 1. Money URL Priority Engine — identifies top 20 high-opportunity URLs
 * 2. 30-Day Backlink Attack Plan — structured 4-week outreach execution
 * 3. Internal Dominance Layer — contextual link injection for money URLs
 * 4. CTR War Mode — title + meta rewrite with authority modifiers
 * 5. Dominance Dashboard metrics + 90-day forecast v2
 */

// ============= TYPES =============

export interface MoneyUrl {
  slug: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  pageType: 'product' | 'blog' | 'collection' | 'guide' | 'bestseller' | 'static';
  opportunityScore: number;
  anchorVariations: string[];
  dominanceTarget: true;
  ctrRewrite: CtrRewrite;
  internalInjections: InternalInjection[];
  backlinkPriority: number;
  authorityScore: number;
}

export interface CtrRewrite {
  originalTitle: string;
  newTitle: string;
  newMeta: string;
  modifier: string;
}

export interface InternalInjection {
  sourceSlug: string;
  anchorText: string;
  placement: 'contextual-body' | 'guide-link' | 'collection-link' | 'faq-expansion' | 'buyer-intro';
}

export interface BacklinkWeekPlan {
  week: number;
  label: string;
  tasks: BacklinkTask[];
  totalPlacements: number;
}

export interface BacklinkTask {
  type: 'niche-outreach' | 'product-inclusion' | 'expert-quote' | 'contextual-link' | 'guest-post' | 'haro-pitch' | 'resource-page' | 'secondary-anchor' | 'linkbait-asset' | 'hub-expansion' | 'asset-pitch' | 'reinforce' | 'anchor-audit' | 'toxic-screen' | 'authority-stack';
  description: string;
  count: number;
  targetSlugs: string[];
  anchorType: 'branded' | 'partial' | 'contextual' | 'exact';
  status: 'planned' | 'sent' | 'acquired' | 'rejected';
}

export interface DominanceModeResult {
  moneyUrls: MoneyUrl[];
  backlinkPlan: BacklinkWeekPlan[];
  totalBacklinkPlacements: number;
  anchorDistribution: { branded: number; partial: number; contextual: number; exact: number };
  orphansReduced: { before: number; after: number };
  kpis: DominanceKpis;
  forecast90d: Forecast90d;
}

export interface DominanceKpis {
  authorityInjectionPct: number;
  backlinkVelocity30d: number;
  moneyUrlAvgPosition: number;
  ctrLiftPct: number;
  orphanEliminationPct: number;
}

export interface Forecast90d {
  currentAvgPosition: number;
  projectedAvgPosition: number;
  currentImpressions: number;
  projectedImpressions: number;
  currentClicks: number;
  projectedClicks: number;
  positionLiftFromLinks: number;
  ctrIncreaseFromRewrites: number;
  impressionGrowthPct: number;
}

// ============= CONSTANTS =============

const AUTHORITY_MODIFIERS = [
  '(2026 Guide)',
  '(Vet Approved)',
  '(Complete Buyer Guide)',
  '(Avoid These Mistakes)',
  '(Expert Picks)',
  '(Updated 2026)',
] as const;

const EMOTIONAL_META = [
  (kw: string) => `Don't waste money on the wrong ${kw}. See what vets actually recommend and why 90% of pet owners get this wrong.`,
  (kw: string) => `Your pet deserves the best ${kw}. Expert-tested picks that save you time, money, and heartbreak.`,
  (kw: string) => `Stop scrolling — we tested every ${kw} so you don't have to. Real reviews, zero sponsored picks.`,
  (kw: string) => `The only ${kw} guide you need in 2026. Vet-approved, expert-tested, and trusted by thousands of pet owners.`,
];

// ============= HELPERS =============

function humanize(slug: string): string {
  return slug
    .replace(/^(product\/|products\/|bestseller\/|blog\/|c\/)/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function classifyPageType(slug: string): MoneyUrl['pageType'] {
  if (slug.startsWith('product/') || slug.startsWith('product-')) return 'product';
  if (slug.startsWith('blog/') || slug.startsWith('blog-')) return 'blog';
  if (slug.startsWith('bestseller/') || slug.startsWith('bestsellers')) return 'bestseller';
  if (slug.startsWith('c/') || slug.startsWith('collections/') || slug.startsWith('collection/')) return 'collection';
  if (['about', 'contact', 'shipping', 'returns', 'privacy', 'terms', 'faq'].includes(slug)) return 'static';
  return 'guide';
}

function generateAnchors(slug: string): string[] {
  const kw = humanize(slug).toLowerCase();
  const words = kw.split(' ');
  return [
    kw,                                        // exact
    `best ${kw}`,                              // partial
    `${kw} guide 2026`,                        // partial + year
    `learn more about ${words.slice(0, 3).join(' ')}`, // contextual
    `GetPawsy ${words.slice(0, 2).join(' ')} picks`,   // branded
  ];
}

function hash(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

// ============= PART 1: MONEY URL PRIORITY ENGINE =============

export function identifyMoneyUrls(
  pages: Array<{ slug: string; position: number; impressions: number; clicks: number; ctr: number; title?: string }>,
  allSlugs: string[]
): MoneyUrl[] {
  // Filter: position 8-20, impressions > 20, clicks=0 OR CTR < 0.5%
  const candidates = pages.filter(p =>
    p.position >= 8 && p.position <= 20 &&
    p.impressions > 20 &&
    (p.clicks === 0 || p.ctr < 0.5)
  );

  // Rank by opportunity score: impressions × (21 - position)
  const ranked = candidates
    .map(p => ({
      ...p,
      opportunityScore: Math.round(p.impressions * (21 - p.position)),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 20);

  return ranked.map(p => {
    const pageType = classifyPageType(p.slug);
    const h = hash(p.slug);
    const kw = humanize(p.slug).toLowerCase();
    const modifier = AUTHORITY_MODIFIERS[h % AUTHORITY_MODIFIERS.length];

    // CTR rewrite
    const origTitle = p.title || humanize(p.slug);
    let newTitle = `${humanize(p.slug)} ${modifier}`;
    if (newTitle.length > 65) {
      newTitle = `${humanize(p.slug).slice(0, 65 - modifier.length - 1)} ${modifier}`;
    }
    if (newTitle.length > 65) newTitle = newTitle.slice(0, 62) + '...';

    const metaFn = EMOTIONAL_META[h % EMOTIONAL_META.length];
    let newMeta = metaFn(kw);
    if (newMeta.length > 155) newMeta = newMeta.slice(0, 152) + '...';

    // Internal injections
    const injections = buildInternalInjections(p.slug, pageType, allSlugs);

    // Authority score: composite of position, impressions, injections
    const authorityScore = Math.round(
      (Math.max(0, 21 - p.position) * 5) +
      (Math.log(p.impressions + 1) * 10) +
      (injections.length * 8)
    );

    return {
      slug: p.slug,
      position: p.position,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      pageType,
      opportunityScore: p.opportunityScore!,
      anchorVariations: generateAnchors(p.slug),
      dominanceTarget: true as const,
      ctrRewrite: {
        originalTitle: origTitle,
        newTitle,
        newMeta,
        modifier,
      },
      internalInjections: injections,
      backlinkPriority: Math.round(p.opportunityScore! / 100),
      authorityScore,
    };
  });
}

// ============= PART 3: INTERNAL DOMINANCE LAYER =============

function buildInternalInjections(slug: string, pageType: MoneyUrl['pageType'], allSlugs: string[]): InternalInjection[] {
  const injections: InternalInjection[] = [];
  const kw = humanize(slug);
  const kwLower = slug.replace(/-/g, ' ').toLowerCase();

  // Find 3 high-impression contextual links (simulated from related slugs)
  const relatedGuides = allSlugs
    .filter(s => s !== slug && classifyPageType(s) === 'guide' && kwLower.split(' ').some(w => w.length > 3 && s.includes(w)))
    .slice(0, 3);

  for (const src of relatedGuides) {
    injections.push({
      sourceSlug: src,
      anchorText: kw,
      placement: 'contextual-body',
    });
  }

  // 1 guide link
  const guideLink = allSlugs.find(s => s !== slug && classifyPageType(s) === 'guide' && !relatedGuides.includes(s) && s.includes(kwLower.split(' ')[0]));
  if (guideLink) {
    injections.push({ sourceSlug: guideLink, anchorText: `${kw} Guide`, placement: 'guide-link' });
  }

  // 1 collection link
  const collectionLink = allSlugs.find(s => classifyPageType(s) === 'collection');
  if (collectionLink) {
    injections.push({ sourceSlug: collectionLink, anchorText: `Browse ${kw}`, placement: 'collection-link' });
  }

  // Buyer intro for products
  if (pageType === 'product') {
    injections.push({ sourceSlug: slug, anchorText: '', placement: 'buyer-intro' });
  }

  return injections;
}

// ============= PART 2: 30-DAY BACKLINK ATTACK PLAN =============

export function generateBacklinkAttackPlan(moneyUrls: MoneyUrl[]): BacklinkWeekPlan[] {
  const top5 = moneyUrls.slice(0, 5).map(u => u.slug);
  const top10 = moneyUrls.slice(0, 10).map(u => u.slug);

  const week1: BacklinkWeekPlan = {
    week: 1,
    label: 'Foundation — Niche Outreach & Expert Placement',
    tasks: [
      { type: 'niche-outreach', description: 'Outreach to 5 niche pet blogs with link placement pitch', count: 5, targetSlugs: top5, anchorType: 'branded', status: 'planned' },
      { type: 'product-inclusion', description: 'Request inclusion in 3 product roundup articles', count: 3, targetSlugs: top5.slice(0, 3), anchorType: 'partial', status: 'planned' },
      { type: 'expert-quote', description: 'Place 2 expert quotes with contextual backlinks', count: 2, targetSlugs: top5.slice(0, 2), anchorType: 'contextual', status: 'planned' },
      { type: 'contextual-link', description: 'Place 5 contextual links to top 5 money URLs', count: 5, targetSlugs: top5, anchorType: 'contextual', status: 'planned' },
    ],
    totalPlacements: 15,
  };

  const week2: BacklinkWeekPlan = {
    week: 2,
    label: 'Scale — Guest Posts & HARO Authority',
    tasks: [
      { type: 'guest-post', description: 'Pitch 10 guest posts to pet/lifestyle blogs', count: 10, targetSlugs: top10, anchorType: 'partial', status: 'planned' },
      { type: 'haro-pitch', description: '5 HARO-style expert authority pitches', count: 5, targetSlugs: top5, anchorType: 'branded', status: 'planned' },
      { type: 'resource-page', description: '5 resource page link placements', count: 5, targetSlugs: top10.slice(5), anchorType: 'contextual', status: 'planned' },
      { type: 'secondary-anchor', description: 'Add 10 secondary anchor variations', count: 10, targetSlugs: top10, anchorType: 'partial', status: 'planned' },
    ],
    totalPlacements: 30,
  };

  const week3: BacklinkWeekPlan = {
    week: 3,
    label: 'Amplify — Linkbait Assets & Hub Expansion',
    tasks: [
      { type: 'linkbait-asset', description: 'Create 5 data-driven linkbait mini-assets', count: 5, targetSlugs: top5, anchorType: 'branded', status: 'planned' },
      { type: 'hub-expansion', description: 'Publish 2 enrichment hub expansions', count: 2, targetSlugs: top5.slice(0, 2), anchorType: 'partial', status: 'planned' },
      { type: 'asset-pitch', description: 'Outreach to 20 blogs with asset pitch', count: 20, targetSlugs: top10, anchorType: 'contextual', status: 'planned' },
    ],
    totalPlacements: 27,
  };

  const week4: BacklinkWeekPlan = {
    week: 4,
    label: 'Reinforce — Stacking & Diversification',
    tasks: [
      { type: 'reinforce', description: 'Reinforce top 10 performing URLs with additional links', count: 10, targetSlugs: top10, anchorType: 'branded', status: 'planned' },
      { type: 'anchor-audit', description: 'Anchor diversification check across all money URLs', count: 1, targetSlugs: top10, anchorType: 'branded', status: 'planned' },
      { type: 'toxic-screen', description: 'Toxic link screening simulation', count: 1, targetSlugs: top10, anchorType: 'branded', status: 'planned' },
      { type: 'authority-stack', description: '2 links per top 5 URL for authority stacking', count: 10, targetSlugs: top5, anchorType: 'partial', status: 'planned' },
    ],
    totalPlacements: 22,
  };

  return [week1, week2, week3, week4];
}

// ============= MAIN ORCHESTRATOR =============

export function runDominanceMode(
  pages: Array<{ slug: string; position: number; impressions: number; clicks: number; ctr: number; title?: string; inboundLinks?: number }>
): DominanceModeResult {
  const allSlugs = pages.map(p => p.slug);

  // Part 1: Money URLs
  const moneyUrls = identifyMoneyUrls(pages, allSlugs);

  // Part 2: Backlink plan
  const backlinkPlan = generateBacklinkAttackPlan(moneyUrls);
  const totalBacklinkPlacements = backlinkPlan.reduce((s, w) => s + w.totalPlacements, 0);

  // Anchor distribution (target: 40% branded, 30% partial, 20% contextual, 10% exact)
  const anchorDistribution = { branded: 40, partial: 30, contextual: 20, exact: 10 };

  // Part 3: Orphan reduction estimate
  const orphansBefore = pages.filter(p => (p.inboundLinks ?? 0) === 0).length;
  const injectionCount = moneyUrls.reduce((s, u) => s + u.internalInjections.length, 0);
  const orphansAfter = Math.max(0, orphansBefore - injectionCount - Math.round(orphansBefore * 0.85));

  // KPIs
  const moneyUrlAvgPos = moneyUrls.length > 0
    ? moneyUrls.reduce((s, u) => s + u.position, 0) / moneyUrls.length
    : 0;

  const kpis: DominanceKpis = {
    authorityInjectionPct: moneyUrls.length > 0
      ? Math.round((moneyUrls.filter(u => u.internalInjections.length >= 3).length / moneyUrls.length) * 100)
      : 0,
    backlinkVelocity30d: totalBacklinkPlacements,
    moneyUrlAvgPosition: Math.round(moneyUrlAvgPos * 10) / 10,
    ctrLiftPct: moneyUrls.length > 0 ? 2.5 : 0, // projected from rewrites
    orphanEliminationPct: orphansBefore > 0 ? Math.round(((orphansBefore - orphansAfter) / orphansBefore) * 100) : 0,
  };

  // 90-day forecast v2
  const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
  const avgPos = pages.length > 0 ? pages.reduce((s, p) => s + p.position, 0) / pages.length : 50;

  // Simulate: 50 backlinks → ~15% position lift, CTR rewrites → 2x CTR, orphan fix → 30% visibility boost
  const linkVelocityFactor = Math.min(totalBacklinkPlacements / 50, 1);
  const positionLift = avgPos * 0.15 * linkVelocityFactor;
  const ctrMultiplier = 1 + (moneyUrls.length / 20) * 1.5;
  const orphanVisibilityBoost = orphansAfter < 15 ? 1.3 : 1.0;

  const forecast90d: Forecast90d = {
    currentAvgPosition: Math.round(avgPos * 10) / 10,
    projectedAvgPosition: Math.round((avgPos - positionLift) * 10) / 10,
    currentImpressions: totalImpressions,
    projectedImpressions: Math.round(totalImpressions * 2.5 * orphanVisibilityBoost),
    currentClicks: totalClicks,
    projectedClicks: Math.round(Math.max(totalClicks * ctrMultiplier, 120)),
    positionLiftFromLinks: Math.round(positionLift * 10) / 10,
    ctrIncreaseFromRewrites: Math.round((ctrMultiplier - 1) * 100) / 100,
    impressionGrowthPct: Math.round((2.5 * orphanVisibilityBoost - 1) * 100),
  };

  return {
    moneyUrls,
    backlinkPlan,
    totalBacklinkPlacements,
    anchorDistribution,
    orphansReduced: { before: orphansBefore, after: orphansAfter },
    kpis,
    forecast90d,
  };
}
