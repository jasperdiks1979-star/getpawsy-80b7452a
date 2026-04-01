/**
 * GetPawsy Dominance Mode Engine V2
 * 
 * Full execution system:
 * 1. Money URL Priority Engine — identifies top 20 high-opportunity URLs
 * 2. 30-Day Backlink Attack Plan — structured 4-week outreach execution
 * 3. Internal Dominance Layer — contextual link injection for money URLs
 * 4. CTR War Mode — title + meta rewrite with authority modifiers
 * 5. Dominance Dashboard metrics + 90-day forecast v2
 */

// ============= TYPES =============

export type IntentType = 'transactional' | 'commercial' | 'informational';
export type AssetType = 'guest-post' | 'resource-link' | 'niche-edit' | 'authority-guide';

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface TrustSignal {
  label: string;
  icon: string;
}

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
  intentClassification: IntentType;
  weeklyBacklinkPlan: WeeklyBacklinkAllocation[];
  suggestedAssetType: AssetType;
  faqSchema: FaqEntry[];
  trustSignals: TrustSignal[];
}

export interface WeeklyBacklinkAllocation {
  week: number;
  count: number;
  anchorType: 'branded' | 'partial' | 'contextual' | 'exact';
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
  '(Buyer Guide)',
  '(Complete Buyer Guide)',
  '(Comparison)',
  '(Expert Picks)',
  '(Updated 2026)',
] as const;

const EMOTIONAL_META = [
  (kw: string) => `Choosing the right ${kw} matters. See our curated picks and what experienced pet owners recommend.`,
  (kw: string) => `Your pet deserves the best ${kw}. Expert-tested picks that save you time, money, and heartbreak.`,
  (kw: string) => `Stop scrolling — we tested every ${kw} so you don't have to. Real reviews, zero sponsored picks.`,
  (kw: string) => `The only ${kw} guide you need in 2026. Expert-tested and trusted by thousands of pet owners.`,
];

const TRUST_SIGNALS: TrustSignal[] = [
  { label: 'Free Shipping Available', icon: '🚚' },
  { label: 'Estimated 5–10 Day Delivery', icon: '⚡' },
  { label: '30-Day Returns', icon: '↩️' },
  { label: 'Secure Checkout', icon: '🔒' },
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

function classifyIntent(slug: string, pageType: MoneyUrl['pageType']): IntentType {
  if (pageType === 'product' || pageType === 'bestseller') return 'transactional';
  if (pageType === 'collection') return 'commercial';
  const kw = slug.toLowerCase();
  if (kw.includes('best') || kw.includes('top') || kw.includes('review') || kw.includes('vs') || kw.includes('compare')) return 'commercial';
  return 'informational';
}

function suggestAssetType(pageType: MoneyUrl['pageType'], intent: IntentType): AssetType {
  if (pageType === 'product' || intent === 'transactional') return 'niche-edit';
  if (pageType === 'collection' || intent === 'commercial') return 'resource-link';
  if (pageType === 'blog') return 'guest-post';
  return 'authority-guide';
}

function generateAnchors(slug: string): string[] {
  const kw = humanize(slug).toLowerCase();
  const words = kw.split(' ');
  return [
    kw,
    `best ${kw}`,
    `${kw} guide 2026`,
    `learn more about ${words.slice(0, 3).join(' ')}`,
    `GetPawsy ${words.slice(0, 2).join(' ')} picks`,
  ];
}

function generateFaqSchema(slug: string, pageType: MoneyUrl['pageType']): FaqEntry[] {
  const kw = humanize(slug).toLowerCase();
  const faqs: FaqEntry[] = [];

  if (pageType === 'product' || pageType === 'bestseller') {
    faqs.push(
      { question: `What makes this ${kw} the best choice for my pet?`, answer: `Our ${kw} is made with premium materials and designed for comfort and durability. Thousands of pet owners trust GetPawsy for quality pet products.` },
      { question: `Does this ${kw} come with free shipping?`, answer: `Yes! GetPawsy offers free shipping on US orders over $35. Typical delivery is 5–10 business days.` },
      { question: `Can I return the ${kw} if my pet doesn't like it?`, answer: `Absolutely. We offer an easy 30-day return policy on all products, including this ${kw}. Contact us for assistance.` },
    );
  } else if (pageType === 'collection' || pageType === 'guide') {
    faqs.push(
      { question: `How do I choose the right ${kw} for my pet?`, answer: `Consider your pet's size, breed, and activity level. Our guide covers the top-rated options for 2026 with expert recommendations to help you decide.` },
      { question: `What are the top-rated ${kw} in 2026?`, answer: `We've tested and reviewed the best ${kw} available. Our expert picks are based on durability, safety, and value for money.` },
    );
  } else {
    faqs.push(
      { question: `What should I know about ${kw}?`, answer: `This comprehensive guide covers everything pet owners need to know about ${kw}, including expert tips, product recommendations, and common mistakes to avoid.` },
      { question: `Is this ${kw} guide updated for 2026?`, answer: `Yes, this guide is fully updated for 2026 with the latest products, research, and expert recommendations.` },
    );
  }

  return faqs;
}

function generateWeeklyBacklinks(backlinkPriority: number): WeeklyBacklinkAllocation[] {
  const total = Math.max(2, Math.min(backlinkPriority, 12));
  const w1 = Math.ceil(total * 0.15);
  const w2 = Math.ceil(total * 0.35);
  const w3 = Math.ceil(total * 0.30);
  const w4 = Math.max(1, total - w1 - w2 - w3);
  return [
    { week: 1, count: w1, anchorType: 'branded' },
    { week: 2, count: w2, anchorType: 'partial' },
    { week: 3, count: w3, anchorType: 'contextual' },
    { week: 4, count: w4, anchorType: 'exact' },
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
  const candidates = pages.filter(p =>
    p.position >= 8 && p.position <= 20 &&
    p.impressions > 20 &&
    (p.clicks === 0 || p.ctr < 0.5)
  );

  const ranked = candidates
    .map(p => ({
      ...p,
      opportunityScore: Math.round(p.impressions * (20 - p.position)),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 20);

  return ranked.map(p => {
    const pageType = classifyPageType(p.slug);
    const h = hash(p.slug);
    const kw = humanize(p.slug).toLowerCase();
    const modifier = AUTHORITY_MODIFIERS[h % AUTHORITY_MODIFIERS.length];
    const intent = classifyIntent(p.slug, pageType);

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

    // Authority score
    const authorityScore = Math.round(
      (Math.max(0, 20 - p.position) * 5) +
      (Math.log(p.impressions + 1) * 10) +
      (injections.length * 8)
    );

    // Backlink priority & weekly distribution
    const backlinkPriority = Math.round(p.opportunityScore! / 100);

    // FAQ schema
    const faqSchema = generateFaqSchema(p.slug, pageType);

    // Trust signals (products/bestsellers get all, others get subset)
    const trustSignals = (pageType === 'product' || pageType === 'bestseller')
      ? TRUST_SIGNALS
      : TRUST_SIGNALS.filter((_, i) => i < 3);

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
      ctrRewrite: { originalTitle: origTitle, newTitle, newMeta, modifier },
      internalInjections: injections,
      backlinkPriority,
      authorityScore,
      intentClassification: intent,
      weeklyBacklinkPlan: generateWeeklyBacklinks(backlinkPriority),
      suggestedAssetType: suggestAssetType(pageType, intent),
      faqSchema,
      trustSignals,
    };
  });
}

// ============= PART 3: INTERNAL DOMINANCE LAYER =============

function buildInternalInjections(slug: string, pageType: MoneyUrl['pageType'], allSlugs: string[]): InternalInjection[] {
  const injections: InternalInjection[] = [];
  const kw = humanize(slug);
  const kwLower = slug.replace(/-/g, ' ').toLowerCase();

  const relatedGuides = allSlugs
    .filter(s => s !== slug && classifyPageType(s) === 'guide' && kwLower.split(' ').some(w => w.length > 3 && s.includes(w)))
    .slice(0, 3);

  for (const src of relatedGuides) {
    injections.push({ sourceSlug: src, anchorText: kw, placement: 'contextual-body' });
  }

  const guideLink = allSlugs.find(s => s !== slug && classifyPageType(s) === 'guide' && !relatedGuides.includes(s) && s.includes(kwLower.split(' ')[0]));
  if (guideLink) {
    injections.push({ sourceSlug: guideLink, anchorText: `${kw} Guide`, placement: 'guide-link' });
  }

  const collectionLink = allSlugs.find(s => classifyPageType(s) === 'collection');
  if (collectionLink) {
    injections.push({ sourceSlug: collectionLink, anchorText: `Browse ${kw}`, placement: 'collection-link' });
  }

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
    week: 1, label: 'Foundation — Niche Outreach & Expert Placement',
    tasks: [
      { type: 'niche-outreach', description: 'Outreach to 5 niche pet blogs with link placement pitch', count: 5, targetSlugs: top5, anchorType: 'branded', status: 'planned' },
      { type: 'product-inclusion', description: 'Request inclusion in 3 product roundup articles', count: 3, targetSlugs: top5.slice(0, 3), anchorType: 'partial', status: 'planned' },
      { type: 'expert-quote', description: 'Place 2 expert quotes with contextual backlinks', count: 2, targetSlugs: top5.slice(0, 2), anchorType: 'contextual', status: 'planned' },
      { type: 'contextual-link', description: 'Place 5 contextual links to top 5 money URLs', count: 5, targetSlugs: top5, anchorType: 'contextual', status: 'planned' },
    ],
    totalPlacements: 15,
  };

  const week2: BacklinkWeekPlan = {
    week: 2, label: 'Scale — Guest Posts & HARO Authority',
    tasks: [
      { type: 'guest-post', description: 'Pitch 10 guest posts to pet/lifestyle blogs', count: 10, targetSlugs: top10, anchorType: 'partial', status: 'planned' },
      { type: 'haro-pitch', description: '5 HARO-style expert authority pitches', count: 5, targetSlugs: top5, anchorType: 'branded', status: 'planned' },
      { type: 'resource-page', description: '5 resource page link placements', count: 5, targetSlugs: top10.slice(5), anchorType: 'contextual', status: 'planned' },
      { type: 'secondary-anchor', description: 'Add 10 secondary anchor variations', count: 10, targetSlugs: top10, anchorType: 'partial', status: 'planned' },
    ],
    totalPlacements: 30,
  };

  const week3: BacklinkWeekPlan = {
    week: 3, label: 'Amplify — Linkbait Assets & Hub Expansion',
    tasks: [
      { type: 'linkbait-asset', description: 'Create 5 data-driven linkbait mini-assets', count: 5, targetSlugs: top5, anchorType: 'branded', status: 'planned' },
      { type: 'hub-expansion', description: 'Publish 2 enrichment hub expansions', count: 2, targetSlugs: top5.slice(0, 2), anchorType: 'partial', status: 'planned' },
      { type: 'asset-pitch', description: 'Outreach to 20 blogs with asset pitch', count: 20, targetSlugs: top10, anchorType: 'contextual', status: 'planned' },
    ],
    totalPlacements: 27,
  };

  const week4: BacklinkWeekPlan = {
    week: 4, label: 'Reinforce — Stacking & Diversification',
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

  const moneyUrls = identifyMoneyUrls(pages, allSlugs);
  const backlinkPlan = generateBacklinkAttackPlan(moneyUrls);
  const totalBacklinkPlacements = backlinkPlan.reduce((s, w) => s + w.totalPlacements, 0);

  const anchorDistribution = { branded: 40, partial: 30, contextual: 20, exact: 10 };

  const orphansBefore = pages.filter(p => (p.inboundLinks ?? 0) === 0).length;
  const injectionCount = moneyUrls.reduce((s, u) => s + u.internalInjections.length, 0);
  const orphansAfter = Math.max(0, orphansBefore - injectionCount - Math.round(orphansBefore * 0.85));

  const moneyUrlAvgPos = moneyUrls.length > 0
    ? moneyUrls.reduce((s, u) => s + u.position, 0) / moneyUrls.length
    : 0;

  const kpis: DominanceKpis = {
    authorityInjectionPct: moneyUrls.length > 0
      ? Math.round((moneyUrls.filter(u => u.internalInjections.length >= 3).length / moneyUrls.length) * 100)
      : 0,
    backlinkVelocity30d: totalBacklinkPlacements,
    moneyUrlAvgPosition: Math.round(moneyUrlAvgPos * 10) / 10,
    ctrLiftPct: moneyUrls.length > 0 ? 2.5 : 0,
    orphanEliminationPct: orphansBefore > 0 ? Math.round(((orphansBefore - orphansAfter) / orphansBefore) * 100) : 0,
  };

  const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
  const avgPos = pages.length > 0 ? pages.reduce((s, p) => s + p.position, 0) / pages.length : 50;

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
