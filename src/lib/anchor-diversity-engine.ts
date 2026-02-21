/**
 * Anchor Text Diversity Engine
 * 
 * Enforces 30% exact / 40% partial / 30% branded anchor distribution
 * across all internal links to remain Google penalty-safe.
 */

export type AnchorType = 'exact' | 'partial' | 'branded' | 'natural';

export interface AnchorRecord {
  targetSlug: string;
  anchorText: string;
  anchorType: AnchorType;
  sourceSlug: string;
}

export interface AnchorDistributionReport {
  targetSlug: string;
  total: number;
  exact: number;
  partial: number;
  branded: number;
  natural: number;
  exactPct: number;
  partialPct: number;
  brandedPct: number;
  isSafe: boolean;
  warning: string | null;
}

const BRAND_TERMS = ['getpawsy', 'get pawsy', 'pawsy', 'our pick', 'shop here', 'view collection', 'browse', 'see more', 'learn more', 'read more', 'click here'];

export function classifyAnchor(anchorText: string, targetKeyword: string): AnchorType {
  const anchor = anchorText.toLowerCase().trim();
  const keyword = targetKeyword.toLowerCase().trim();

  // Exact match
  if (anchor === keyword) return 'exact';

  // Branded
  if (BRAND_TERMS.some(b => anchor.includes(b))) return 'branded';

  // Partial match - contains the keyword or significant overlap
  const keywordWords = keyword.split(/\s+/);
  const anchorWords = anchor.split(/\s+/);
  const overlap = keywordWords.filter(w => anchorWords.includes(w)).length;
  if (overlap >= Math.ceil(keywordWords.length * 0.5)) return 'partial';

  return 'natural';
}

export function analyzeDistribution(records: AnchorRecord[]): Map<string, AnchorDistributionReport> {
  const byTarget = new Map<string, AnchorRecord[]>();
  for (const r of records) {
    const existing = byTarget.get(r.targetSlug) || [];
    existing.push(r);
    byTarget.set(r.targetSlug, existing);
  }

  const reports = new Map<string, AnchorDistributionReport>();
  for (const [slug, recs] of byTarget) {
    const total = recs.length;
    const exact = recs.filter(r => r.anchorType === 'exact').length;
    const partial = recs.filter(r => r.anchorType === 'partial').length;
    const branded = recs.filter(r => r.anchorType === 'branded' || r.anchorType === 'natural').length;

    const exactPct = total ? Math.round((exact / total) * 100) : 0;
    const partialPct = total ? Math.round((partial / total) * 100) : 0;
    const brandedPct = total ? Math.round((branded / total) * 100) : 0;

    let warning: string | null = null;
    if (exactPct > 35) warning = `Exact match anchors at ${exactPct}% (max 30%). Reduce to avoid over-optimization penalty.`;
    else if (exactPct > 30) warning = `Exact match anchors at ${exactPct}% — approaching limit.`;

    reports.set(slug, {
      targetSlug: slug,
      total,
      exact,
      partial,
      branded,
      natural: recs.filter(r => r.anchorType === 'natural').length,
      exactPct,
      partialPct,
      brandedPct,
      isSafe: exactPct <= 30,
      warning,
    });
  }

  return reports;
}

/**
 * Suggest anchor text for a new link to maintain safe distribution.
 * Returns the recommended anchor type to use.
 */
export function suggestAnchorType(
  currentExact: number,
  currentPartial: number,
  currentBranded: number,
): AnchorType {
  const total = currentExact + currentPartial + currentBranded + 1; // +1 for the new link
  const exactPct = ((currentExact + 1) / total) * 100;
  const partialPct = ((currentPartial + 1) / total) * 100;

  // If adding exact would exceed 30%, suggest partial or branded
  if (exactPct > 30) {
    if (partialPct <= 45) return 'partial';
    return 'branded';
  }

  // Balance toward target distribution
  const exactGap = 30 - (currentExact / total) * 100;
  const partialGap = 40 - (currentPartial / total) * 100;
  const brandedGap = 30 - (currentBranded / total) * 100;

  if (partialGap >= exactGap && partialGap >= brandedGap) return 'partial';
  if (exactGap >= brandedGap) return 'exact';
  return 'branded';
}

/**
 * Generate diverse anchor text variants for a keyword.
 */
export function generateAnchorVariants(keyword: string): Record<AnchorType, string[]> {
  const words = keyword.split(/\s+/);
  const firstWord = words[0];
  const lastTwoWords = words.slice(-2).join(' ');

  return {
    exact: [keyword],
    partial: [
      `best ${keyword}`,
      `${keyword} guide`,
      `top ${keyword}`,
      `${keyword} for your pet`,
      lastTwoWords,
      `find the right ${lastTwoWords}`,
    ],
    branded: [
      `shop ${firstWord} at GetPawsy`,
      'browse our collection',
      'view recommendations',
      'see our picks',
      'explore options',
    ],
    natural: [
      'learn more here',
      'read our full guide',
      'check this out',
      'see what we recommend',
    ],
  };
}
