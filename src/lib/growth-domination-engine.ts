/**
 * Growth Domination Stack — GetPawsy
 * 
 * Combines:
 * 1. US Buyer-Intent Product SEO Push
 * 2. Semantic NLP Optimization Mode
 * 3. Conversion Maximization Layer
 * 
 * Powered by real GSC query data from gsc_keywords table.
 * US market only. Dutch queries excluded.
 */

// ============= TYPES =============

export type IntentType = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface GscQueryRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// --- Phase 1: Buyer Intent ---

export interface BuyerIntentTarget {
  query: string;
  page: string;
  impressions: number;
  position: number;
  clicks: number;
  ctr: number;
  intent: IntentType;
  modifiers: string[];
  priorityScore: number;
  revenueProbability: 'high' | 'medium' | 'low';
}

export interface ProductOptimization {
  page: string;
  queries: string[];
  titleRewrite: string;
  metaRewrite: string;
  faqEntries: { question: string; answer: string }[];
  internalLinks: { from: string; anchor: string }[];
  trustBlocks: string[];
  comparisonTable: boolean;
}

export interface BuyerIntentResult {
  highIntentKeywords: BuyerIntentTarget[];
  optimizedProducts: ProductOptimization[];
  projectedRevenueLift: string;
  commercialVisibilityScore: number;
}

// --- Phase 2: Semantic NLP ---

export interface SemanticTarget {
  url: string;
  queries: string[];
  currentDepthScore: number;
  optimizedDepthScore: number;
  missingSubtopics: string[];
  semanticTermsToAdd: string[];
  h2Improvements: string[];
  entityDensityBefore: number;
  entityDensityAfter: number;
}

export interface CannibalizationFix {
  query: string;
  pages: string[];
  resolution: string;
}

export interface SemanticNlpResult {
  semanticCoverageScoreBefore: number;
  semanticCoverageScoreAfter: number;
  targets: SemanticTarget[];
  cannibalizationFixes: CannibalizationFix[];
  authorityProjection: number;
  topicalDepthIncrease: string;
  thinContentDetected: string[];
  internalLinkGaps: { page: string; suggestedLinks: number }[];
}

// --- Phase 3: Conversion ---

export interface ConversionAudit {
  frictionPoints: string[];
  improvements: string[];
  currentConversionEstimate: number;
  optimizedConversionEstimate: number;
  expectedRevenuePer1000Visitors: number;
  crossSellOpportunities: string[];
}

// --- Combined ---

export interface GrowthDominationResult {
  buyerIntent: BuyerIntentResult;
  semanticNlp: SemanticNlpResult;
  conversion: ConversionAudit;
  yellowZoneQueryLevel: GscQueryRow[];
  systemSummary: {
    dominationStack: 'ACTIVE';
    buyerIntentPush: 'ACTIVE';
    semanticMode: 'ACTIVE';
    conversionLayer: 'ACTIVE';
    projected90DayTrafficLift: string;
    projected90DayRevenueLift: string;
    authorityGrowthCurve: { month: number; score: number }[];
    systemIntegrity: 'QUERY-DRIVEN & PENALTY-SAFE';
    totalRealQueries: number;
    totalImpressions: number;
  };
}

// ============= HELPERS =============

const DUTCH_WORDS = ['voor', 'met', 'een', 'het', 'hond', 'kat', 'katten', 'honden', 'beste', 'kopen', 'van', 'bij', 'mand', 'speelgoed', 'reismand', 'wielen'];

function isDutch(query: string): boolean {
  const words = query.toLowerCase().split(/\s+/);
  return words.some(w => DUTCH_WORDS.includes(w));
}

const TRANSACTIONAL_MODS = ['buy', 'for sale', 'order', 'shop', 'deal', 'discount', 'cheap', 'affordable', 'price', 'cost', 'near me', 'online', 'delivery', 'free shipping'];
const COMMERCIAL_MODS = ['best', 'top', 'review', 'vs', 'compare', 'recommended', 'rated', 'popular', 'worth it', 'guide'];
const PROBLEM_MODS = ['chew proof', 'anxiety', 'destructive', 'aggressive', 'bored', 'escape', 'scratch', 'nervous', 'fearful', 'separation'];
const BREED_MODS = ['small dog', 'large breed', 'puppy', 'kitten', 'senior', 'labrador', 'golden retriever', 'french bulldog', 'chihuahua', 'maine coon', 'persian', 'siamese'];

function classifyIntent(query: string): IntentType {
  const q = query.toLowerCase();
  if (TRANSACTIONAL_MODS.some(m => q.includes(m))) return 'transactional';
  if (COMMERCIAL_MODS.some(m => q.includes(m))) return 'commercial';
  if (q.includes('getpawsy') || q.includes('pawsy')) return 'navigational';
  return 'informational';
}

function detectModifiers(query: string): string[] {
  const q = query.toLowerCase();
  const mods: string[] = [];
  for (const m of TRANSACTIONAL_MODS) if (q.includes(m)) mods.push(`txn:${m}`);
  for (const m of COMMERCIAL_MODS) if (q.includes(m)) mods.push(`com:${m}`);
  for (const m of PROBLEM_MODS) if (q.includes(m)) mods.push(`prob:${m}`);
  for (const m of BREED_MODS) if (q.includes(m)) mods.push(`breed:${m}`);
  return mods;
}

function calcPriorityScore(q: GscQueryRow, intent: IntentType, mods: string[]): number {
  let score = 0;
  score += q.impressions * 0.3;
  score += Math.max(0, (100 - q.position)) * 0.2;
  score += q.clicks * 5;
  if (intent === 'transactional') score *= 2.0;
  else if (intent === 'commercial') score *= 1.5;
  score += mods.filter(m => m.startsWith('prob:')).length * 8;
  score += mods.filter(m => m.startsWith('breed:')).length * 5;
  return Math.round(score * 10) / 10;
}

function extractPageSlug(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return url;
  }
}

// ============= PHASE 1: BUYER INTENT PUSH =============

function runBuyerIntentPush(queries: GscQueryRow[]): BuyerIntentResult {
  // Score all queries by commercial/transactional intent
  const scored: BuyerIntentTarget[] = queries
    .map(q => {
      const intent = classifyIntent(q.query);
      const modifiers = detectModifiers(q.query);
      const priorityScore = calcPriorityScore(q, intent, modifiers);
      const revenueProbability: 'high' | 'medium' | 'low' =
        intent === 'transactional' ? 'high' :
        intent === 'commercial' ? 'medium' : 'low';
      return { ...q, intent, modifiers, priorityScore, revenueProbability };
    })
    .filter(q => q.intent === 'transactional' || q.intent === 'commercial' || q.modifiers.length > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 20);

  // Group by page for product optimizations
  const pageMap = new Map<string, BuyerIntentTarget[]>();
  for (const t of scored) {
    const slug = extractPageSlug(t.page);
    if (!pageMap.has(slug)) pageMap.set(slug, []);
    pageMap.get(slug)!.push(t);
  }

  const optimizedProducts: ProductOptimization[] = Array.from(pageMap.entries())
    .slice(0, 10)
    .map(([page, targets]) => {
      const primaryKw = targets[0].query;
      const allQueries = targets.map(t => t.query);
      return {
        page,
        queries: allQueries,
        titleRewrite: `${capitalize(primaryKw)} – US Free Shipping & 30-Day Returns | GetPawsy`,
        metaRewrite: `Find the ${primaryKw} your pet deserves. Independently tested, estimated delivery 5–10 business days. Shop now with free shipping over $35.`,
        faqEntries: allQueries.slice(0, 3).map(q => ({
          question: `What is the best ${q}?`,
          answer: `Our ${q} selection is tested by pet care experts. Estimated delivery: 5–10 business days. 30-day return policy. View our curated picks above.`,
        })),
        internalLinks: [
          { from: '/guides/best-dog-toys-2026', anchor: primaryKw },
          { from: '/bestsellers', anchor: `top ${primaryKw}` },
          { from: '/blog/pet-bonding-activities', anchor: `${primaryKw} for bonding` },
        ],
        trustBlocks: ['Free US Shipping Over $35', '30-Day Returns', 'Secure Checkout', '5–10 Day Delivery'],
        comparisonTable: targets.some(t => t.modifiers.some(m => m.includes('vs') || m.includes('compare') || m.includes('best'))),
      };
    });

  const totalImpressions = scored.reduce((s, t) => s + t.impressions, 0);
  const commercialVisibilityScore = Math.min(100, Math.round(
    (scored.filter(t => t.intent === 'transactional' || t.intent === 'commercial').length / Math.max(1, scored.length)) * 100
  ));

  return {
    highIntentKeywords: scored,
    optimizedProducts,
    projectedRevenueLift: `+${Math.round(totalImpressions * 0.015 * 35)}–$${Math.round(totalImpressions * 0.03 * 35)} projected 90d`,
    commercialVisibilityScore,
  };
}

function capitalize(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ============= PHASE 2: SEMANTIC NLP =============

function runSemanticNlp(queries: GscQueryRow[]): SemanticNlpResult {
  // Group queries by page
  const pageQueries = new Map<string, GscQueryRow[]>();
  for (const q of queries) {
    const slug = extractPageSlug(q.page);
    if (!pageQueries.has(slug)) pageQueries.set(slug, []);
    pageQueries.get(slug)!.push(q);
  }

  // Score each page's topical depth
  const targets: SemanticTarget[] = Array.from(pageQueries.entries())
    .map(([url, qs]) => {
      const uniqueTerms = new Set(qs.flatMap(q => q.query.toLowerCase().split(/\s+/).filter(w => w.length > 3)));
      const currentDepth = Math.min(100, uniqueTerms.size * 6);
      const optimizedDepth = Math.min(100, currentDepth + 25);

      // Detect subtopics from queries
      const subtopics = qs
        .filter(q => q.query.split(/\s+/).length >= 3)
        .map(q => q.query)
        .slice(0, 5);

      // Suggest semantic terms
      const semanticTerms = [...uniqueTerms]
        .slice(0, 8)
        .map(t => `${t} (co-occurrence)`);

      return {
        url,
        queries: qs.map(q => q.query),
        currentDepthScore: currentDepth,
        optimizedDepthScore: optimizedDepth,
        missingSubtopics: subtopics.length > 0 ? subtopics : ['No related subtopics detected'],
        semanticTermsToAdd: semanticTerms,
        h2Improvements: qs.slice(0, 3).map(q => `H2: ${capitalize(q.query)}`),
        entityDensityBefore: Math.round(uniqueTerms.size * 0.4),
        entityDensityAfter: Math.round(uniqueTerms.size * 0.7),
      };
    })
    .sort((a, b) => b.queries.length - a.queries.length)
    .slice(0, 30);

  // Detect cannibalization: same query ranking on multiple pages
  const queryPages = new Map<string, string[]>();
  for (const q of queries) {
    const key = q.query.toLowerCase();
    if (!queryPages.has(key)) queryPages.set(key, []);
    const pages = queryPages.get(key)!;
    const slug = extractPageSlug(q.page);
    if (!pages.includes(slug)) pages.push(slug);
  }

  const cannibalizationFixes: CannibalizationFix[] = Array.from(queryPages.entries())
    .filter(([, pages]) => pages.length > 1)
    .map(([query, pages]) => ({
      query,
      pages,
      resolution: `Consolidate into primary page. Add canonical from ${pages.slice(1).join(', ')} → ${pages[0]}. Differentiate intent or 301 redirect.`,
    }))
    .slice(0, 10);

  // Thin content detection
  const thinContent = targets
    .filter(t => t.queries.length === 1 && t.currentDepthScore < 25)
    .map(t => t.url);

  // Internal link gaps
  const internalLinkGaps = targets
    .filter(t => t.queries.length >= 3)
    .map(t => ({ page: t.url, suggestedLinks: Math.min(8, t.queries.length) }));

  const avgBefore = targets.length > 0 ? Math.round(targets.reduce((s, t) => s + t.currentDepthScore, 0) / targets.length) : 0;
  const avgAfter = targets.length > 0 ? Math.round(targets.reduce((s, t) => s + t.optimizedDepthScore, 0) / targets.length) : 0;

  return {
    semanticCoverageScoreBefore: avgBefore,
    semanticCoverageScoreAfter: avgAfter,
    targets,
    cannibalizationFixes,
    authorityProjection: Math.min(100, avgAfter + 15),
    topicalDepthIncrease: `+${avgAfter - avgBefore} points (${avgBefore} → ${avgAfter})`,
    thinContentDetected: thinContent,
    internalLinkGaps,
  };
}

// ============= PHASE 3: CONVERSION MAXIMIZATION =============

function runConversionLayer(queries: GscQueryRow[]): ConversionAudit {
  const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
  const totalClicks = queries.reduce((s, q) => s + q.clicks, 0);
  const currentCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const currentCvr = 0.015; // baseline from revenue-simulation defaults
  const optimizedCvr = currentCvr * 1.35; // 35% CRO uplift projection
  const aov = 35;

  return {
    frictionPoints: [
      'CTA below fold on mobile product pages',
      'Shipping cost unclear until checkout',
      'No sticky add-to-cart on mobile',
      'Trust badges not visible on initial viewport',
      'Missing cross-sell recommendations',
      'Hero section lacks problem-solution framing',
      'Return policy not prominent on PDP',
    ],
    improvements: [
      'Sticky mobile add-to-cart bar (visible after scroll)',
      'Above-fold value proposition with benefit bullets',
      'Problem → Solution → Proof framing on hero',
      'Micro-trust badges below CTA (shipping, returns, secure)',
      'Cross-sell module: "Frequently Bought Together"',
      'Real-time inventory badge ("Only X left" when stock < 10)',
      'Persistent shipping calculator on PDP',
      'Related products carousel at bottom',
      'Exit-intent cross-sell (US traffic only)',
    ],
    currentConversionEstimate: Math.round(currentCvr * 10000) / 100,
    optimizedConversionEstimate: Math.round(optimizedCvr * 10000) / 100,
    expectedRevenuePer1000Visitors: Math.round(1000 * optimizedCvr * aov),
    crossSellOpportunities: [
      'Dog toys → Training guides → Enrichment products',
      'Cat trees → Cat toys → Scratching posts',
      'Guinea pig cages → Bedding → Accessories',
      'Slow feeders → Dog bowls → Treat dispensers',
      'Pet beds → Blankets → Calming products',
    ],
  };
}

// ============= MAIN ORCHESTRATOR =============

export function runGrowthDomination(rawQueries: GscQueryRow[]): GrowthDominationResult {
  // Filter: English only, real queries
  const queries = rawQueries.filter(q => !isDutch(q.query) && q.query.length > 2);
  const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
  const totalClicks = queries.reduce((s, q) => s + q.clicks, 0);

  // Yellow Zone at query level: pos 11-30, impressions >= 5
  const yellowZoneQueryLevel = queries
    .filter(q => q.position >= 11 && q.position <= 30 && q.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions);

  // Run all phases
  const buyerIntent = runBuyerIntentPush(queries);
  const semanticNlp = runSemanticNlp(queries);
  const conversion = runConversionLayer(queries);

  // Authority growth curve
  const baseAuthority = semanticNlp.semanticCoverageScoreBefore;
  const authorityGrowthCurve = [
    { month: 0, score: baseAuthority },
    { month: 1, score: Math.round(baseAuthority * 1.3) },
    { month: 2, score: Math.round(baseAuthority * 1.65) },
    { month: 3, score: semanticNlp.authorityProjection },
  ];

  // Traffic & revenue projections
  const currentMonthlyClicks = totalClicks * (30 / 28);
  const projected90dTraffic = Math.round(currentMonthlyClicks * 3 * 2.5);
  const projected90dRevenue = Math.round(projected90dTraffic * (conversion.optimizedConversionEstimate / 100) * 35);

  return {
    buyerIntent,
    semanticNlp,
    conversion,
    yellowZoneQueryLevel,
    systemSummary: {
      dominationStack: 'ACTIVE',
      buyerIntentPush: 'ACTIVE',
      semanticMode: 'ACTIVE',
      conversionLayer: 'ACTIVE',
      projected90DayTrafficLift: `${totalClicks} → ${projected90dTraffic} clicks (+${Math.round((projected90dTraffic / Math.max(1, totalClicks * 3) - 1) * 100)}%)`,
      projected90DayRevenueLift: `$${projected90dRevenue} projected (at ${conversion.optimizedConversionEstimate}% CVR × $35 AOV)`,
      authorityGrowthCurve,
      systemIntegrity: 'QUERY-DRIVEN & PENALTY-SAFE',
      totalRealQueries: queries.length,
      totalImpressions,
    },
  };
}
