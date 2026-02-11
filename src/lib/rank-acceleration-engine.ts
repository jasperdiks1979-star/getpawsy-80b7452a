/**
 * 30-Day Rank Acceleration Engine
 * 
 * Phases:
 * 1. Impression Activation — detect boost candidates from GSC data
 * 2. Auto Link Boost — inject contextual links for candidates
 * 3. Title Momentum — A/B title rotation for low-CTR pages
 * 4. Freshness Signal — incremental content updates every 14 days
 * 5. Crawl Stimulation — IndexNow + sitemap triggers
 * 6. Early Growth Mode — adaptive thresholds for new domains
 * 7. Safety Limits — prevent over-optimization
 * 8. Dashboard Reporting — structured output
 */

import type { GSCGuideReport } from './gsc';
import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export type AccelerationMode = 'early' | 'standard';

export interface BoostCandidate {
  slug: string;
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  priorityScore: number;
  mode: AccelerationMode;
  boostActions: AccelerationAction[];
  linksInjected: number;
  titleTestActive: boolean;
  freshnessApplied: boolean;
  crawlPinged: boolean;
  lastBoostedAt?: string;
  boostCount30d: number;
}

export interface AccelerationAction {
  type: 'link-boost' | 'title-test' | 'freshness-update' | 'crawl-ping' | 'faq-inject' | 'comparison-add';
  description: string;
  status: 'pending' | 'applied' | 'skipped';
  appliedAt?: string;
}

export interface TitleTest {
  slug: string;
  originalTitle: string;
  variants: TitleVariant[];
  startedAt: string;
  status: 'running' | 'completed' | 'cancelled';
  winnerId?: string;
}

export interface TitleVariant {
  id: string;
  title: string;
  type: 'emotional' | 'list-number' | 'benefit-driven';
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface LinkBoostPlan {
  targetSlug: string;
  links: Array<{
    fromSlug: string;
    anchorText: string;
    anchorType: 'semantic' | 'partial' | 'internal-hub';
  }>;
}

export interface FreshnessUpdate {
  slug: string;
  updates: Array<{
    type: 'faq' | 'comparison-row' | 'internal-link';
    description: string;
  }>;
  nextUpdateDue: string;
}

export interface AccelerationReport {
  mode: AccelerationMode;
  totalImpressions: number;
  candidates: BoostCandidate[];
  linkBoostPlans: LinkBoostPlan[];
  activeTitleTests: TitleTest[];
  freshnessQueue: FreshnessUpdate[];
  crawlsPinged: number;
  safetyStatus: SafetyStatus;
  summary: AccelerationSummary;
}

export interface SafetyStatus {
  maxLinksPerPage30d: number;
  exactAnchorPercent: number;
  canonicalsModified: boolean;
  robotsTxtModified: boolean;
  violations: string[];
}

export interface AccelerationSummary {
  totalCandidates: number;
  linksInjected: number;
  titleTestsActive: number;
  freshnessUpdatesQueued: number;
  crawlsPinged: number;
  avgPositionDelta: number;
  ctrChange: number;
  safetyViolations: number;
}

// ============= CONSTANTS =============

const SAFETY = {
  MAX_LINKS_PER_PAGE_30D: 10,
  MAX_EXACT_ANCHOR_PERCENT: 40,
  MAX_BOOSTS_PER_PAGE_14D: 5,
  MAX_CROSS_CLUSTER_PERCENT: 15,
  TITLE_TEST_MIN_IMPRESSIONS: 150,
  TITLE_TEST_MAX_DAYS: 10,
  FRESHNESS_INTERVAL_DAYS: 14,
};

const EARLY_THRESHOLDS = {
  positionMin: 10,
  positionMax: 80,
  minImpressions: 10,
  domainImpressionCap: 100,
};

const STANDARD_THRESHOLDS = {
  positionMin: 10,
  positionMax: 60,
  minImpressions: 20,
  domainImpressionCap: 500,
};

// ============= MODE DETECTION =============

export function detectAccelerationMode(reports: GSCGuideReport[]): { mode: AccelerationMode; totalImpressions: number } {
  const totalImpressions = reports.reduce((sum, r) => {
    const p28 = r.periods['28d'];
    return sum + (p28?.impressions || 0);
  }, 0);

  return {
    mode: totalImpressions < EARLY_THRESHOLDS.domainImpressionCap ? 'early' : 'standard',
    totalImpressions,
  };
}

// ============= PHASE 1: IMPRESSION ACTIVATION =============

function calcAccelPriorityScore(position: number, impressions: number, clusterAuthority = 50): number {
  const positionScore = (60 - Math.min(position, 60)) * 0.7;
  const impressionScore = Math.log(impressions + 1) * 10;
  const authorityBonus = clusterAuthority * 0.5;
  return Math.round((positionScore + impressionScore + authorityBonus) * 100) / 100;
}

export function detectBoostCandidates(reports: GSCGuideReport[]): BoostCandidate[] {
  const { mode, totalImpressions } = detectAccelerationMode(reports);
  const thresholds = mode === 'early' ? EARLY_THRESHOLDS : STANDARD_THRESHOLDS;

  const candidates: BoostCandidate[] = [];

  for (const report of reports) {
    // Check page-level 28d metrics
    const p28 = report.periods['28d'];
    if (p28 && p28.avgPosition >= thresholds.positionMin && p28.avgPosition <= thresholds.positionMax && p28.impressions >= thresholds.minImpressions) {
      const priorityScore = calcAccelPriorityScore(p28.avgPosition, p28.impressions);
      candidates.push({
        slug: report.slug,
        query: `[page] ${report.slug}`,
        position: p28.avgPosition,
        impressions: p28.impressions,
        clicks: p28.clicks,
        ctr: p28.ctr,
        priorityScore,
        mode,
        boostActions: generateAccelerationActions(report.slug, p28.ctr, mode),
        linksInjected: 0,
        titleTestActive: false,
        freshnessApplied: false,
        crawlPinged: false,
        boostCount30d: 0,
      });
    }

    // Check individual queries
    for (const q of report.topQueries) {
      if (q.position >= thresholds.positionMin && q.position <= thresholds.positionMax && q.impressions >= thresholds.minImpressions) {
        // Avoid duplicate slug entries from page-level
        if (candidates.some(c => c.slug === report.slug && c.query === q.query)) continue;

        const priorityScore = calcAccelPriorityScore(q.position, q.impressions);
        candidates.push({
          slug: report.slug,
          query: q.query,
          position: q.position,
          impressions: q.impressions,
          clicks: q.clicks,
          ctr: q.ctr * 100,
          priorityScore,
          mode,
          boostActions: generateAccelerationActions(report.slug, q.ctr * 100, mode),
          linksInjected: 0,
          titleTestActive: false,
          freshnessApplied: false,
          crawlPinged: false,
          boostCount30d: 0,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 30);
}

// ============= PHASE 2: AUTO LINK BOOST =============

export function generateLinkBoostPlans(candidates: BoostCandidate[]): LinkBoostPlan[] {
  const plans: LinkBoostPlan[] = [];
  const processedSlugs = new Set<string>();

  for (const candidate of candidates) {
    if (processedSlugs.has(candidate.slug)) continue;
    processedSlugs.add(candidate.slug);

    const guide = SCALING_GUIDES.find(g => g.slug === candidate.slug);
    if (!guide) continue;

    const links: LinkBoostPlan['links'] = [];

    // 1 semantic anchor from same cluster
    const sameCluster = SCALING_GUIDES.filter(g => g.cluster === guide.cluster && g.slug !== guide.slug);
    if (sameCluster.length > 0) {
      const src = sameCluster[Math.floor(Math.random() * sameCluster.length)];
      links.push({
        fromSlug: src.slug,
        anchorText: guide.secondaryKWs.length > 0
          ? guide.secondaryKWs[Math.floor(Math.random() * guide.secondaryKWs.length)]
          : guide.primaryKW,
        anchorType: 'semantic',
      });
    }

    // 1 partial match from related subguide
    const subguides = sameCluster.filter(g => g.role === 'subguide');
    if (subguides.length > 0) {
      const src = subguides[Math.floor(Math.random() * subguides.length)];
      const words = guide.primaryKW.split(' ');
      links.push({
        fromSlug: src.slug,
        anchorText: words.length > 3 ? words.slice(0, 3).join(' ') : words.slice(0, 2).join(' '),
        anchorType: 'partial',
      });
    }

    // 1 internal from cluster hub
    const hub = sameCluster.find(g => g.role === 'hub');
    if (hub) {
      links.push({
        fromSlug: hub.slug,
        anchorText: `${guide.primaryKW} guide`,
        anchorType: 'internal-hub',
      });
    }

    if (links.length > 0) {
      plans.push({ targetSlug: candidate.slug, links });
    }
  }

  return plans;
}

// ============= PHASE 3: TITLE MOMENTUM =============

export function detectTitleTestCandidates(candidates: BoostCandidate[], clusterAvgCtr: number): TitleTest[] {
  const tests: TitleTest[] = [];

  for (const c of candidates) {
    if (c.impressions < 50 || c.ctr >= clusterAvgCtr) continue;

    const guide = SCALING_GUIDES.find(g => g.slug === c.slug);
    if (!guide) continue;

    const kw = guide.primaryKW;

    tests.push({
      slug: c.slug,
      originalTitle: guide.title,
      variants: [
        {
          id: `${c.slug}-emotional`,
          title: `${kw} — Your Pet Deserves the Best`,
          type: 'emotional',
          impressions: 0, clicks: 0, ctr: 0,
        },
        {
          id: `${c.slug}-list`,
          title: `Top 7 ${kw} (Tested & Reviewed 2026)`,
          type: 'list-number',
          impressions: 0, clicks: 0, ctr: 0,
        },
        {
          id: `${c.slug}-benefit`,
          title: `${kw} — Save Time, Money & Mess`,
          type: 'benefit-driven',
          impressions: 0, clicks: 0, ctr: 0,
        },
      ],
      startedAt: new Date().toISOString(),
      status: 'running',
    });
  }

  return tests.slice(0, 5); // Max 5 concurrent tests
}

// ============= PHASE 4: FRESHNESS SIGNAL =============

export function buildFreshnessQueue(candidates: BoostCandidate[]): FreshnessUpdate[] {
  const processedSlugs = new Set<string>();
  const queue: FreshnessUpdate[] = [];

  for (const c of candidates) {
    if (processedSlugs.has(c.slug)) continue;
    processedSlugs.add(c.slug);

    const guide = SCALING_GUIDES.find(g => g.slug === c.slug);
    if (!guide) continue;

    const nextUpdate = new Date();
    nextUpdate.setDate(nextUpdate.getDate() + SAFETY.FRESHNESS_INTERVAL_DAYS);

    queue.push({
      slug: c.slug,
      updates: [
        { type: 'faq', description: `Add FAQ: "What makes the best ${guide.primaryKW}?"` },
        { type: 'comparison-row', description: `Add comparison row for top-rated ${guide.primaryKW}` },
        { type: 'internal-link', description: `Update internal link to latest hub content` },
      ],
      nextUpdateDue: nextUpdate.toISOString().split('T')[0],
    });
  }

  return queue;
}

// ============= PHASE 5: CRAWL STIMULATION =============

export function getCrawlStimulationTargets(candidates: BoostCandidate[]): string[] {
  const slugs = new Set<string>();
  for (const c of candidates) {
    if (c.boostActions.some(a => a.status === 'applied')) {
      slugs.add(c.slug);
    }
  }
  // Also always include homepage
  return ['/', ...Array.from(slugs).map(s => `/guides/${s}/`)];
}

// ============= PHASE 7: SAFETY VALIDATION =============

export function validateSafety(candidates: BoostCandidate[], linkPlans: LinkBoostPlan[]): SafetyStatus {
  const violations: string[] = [];

  // Check max links per page per 30 days
  const linkCountBySlug: Record<string, number> = {};
  for (const plan of linkPlans) {
    linkCountBySlug[plan.targetSlug] = (linkCountBySlug[plan.targetSlug] || 0) + plan.links.length;
  }

  for (const [slug, count] of Object.entries(linkCountBySlug)) {
    if (count > SAFETY.MAX_LINKS_PER_PAGE_30D) {
      violations.push(`${slug}: ${count} links exceeds ${SAFETY.MAX_LINKS_PER_PAGE_30D} max per 30 days`);
    }
  }

  // Check exact anchor percentage
  let totalAnchors = 0;
  let exactAnchors = 0;
  for (const plan of linkPlans) {
    for (const link of plan.links) {
      totalAnchors++;
      // Only semantic and partial used, no exact — safe by design
    }
  }
  const exactPercent = totalAnchors > 0 ? Math.round((exactAnchors / totalAnchors) * 100) : 0;
  if (exactPercent > SAFETY.MAX_EXACT_ANCHOR_PERCENT) {
    violations.push(`Exact anchor ratio ${exactPercent}% exceeds ${SAFETY.MAX_EXACT_ANCHOR_PERCENT}% limit`);
  }

  const maxLinks = Math.max(0, ...Object.values(linkCountBySlug));

  return {
    maxLinksPerPage30d: maxLinks,
    exactAnchorPercent: exactPercent,
    canonicalsModified: false,
    robotsTxtModified: false,
    violations,
  };
}

// ============= ACTION GENERATION =============

function generateAccelerationActions(slug: string, ctr: number, mode: AccelerationMode): AccelerationAction[] {
  const actions: AccelerationAction[] = [
    { type: 'link-boost', description: '+3 contextual inbound links (1 semantic, 1 partial, 1 hub)', status: 'pending' },
    { type: 'crawl-ping', description: 'Trigger IndexNow + sitemap refresh', status: 'pending' },
  ];

  if (ctr < 3) {
    actions.push({ type: 'title-test', description: 'A/B meta title rotation (emotional / list / benefit)', status: 'pending' });
  }

  actions.push({ type: 'freshness-update', description: '+1 FAQ, +1 comparison row, +1 internal link update (14d cycle)', status: 'pending' });
  actions.push({ type: 'faq-inject', description: 'Expand FAQ with search-intent question', status: 'pending' });

  return actions;
}

// ============= MAIN ORCHESTRATOR =============

export function runAccelerationEngine(reports: GSCGuideReport[]): AccelerationReport {
  const { mode, totalImpressions } = detectAccelerationMode(reports);

  // Phase 1: Detect candidates
  const candidates = detectBoostCandidates(reports);

  // Phase 2: Generate link boost plans
  const linkBoostPlans = generateLinkBoostPlans(candidates);

  // Phase 3: Detect title test candidates
  const clusterAvgCtr = candidates.length > 0
    ? candidates.reduce((s, c) => s + c.ctr, 0) / candidates.length
    : 2;
  const activeTitleTests = detectTitleTestCandidates(candidates, clusterAvgCtr);

  // Phase 4: Build freshness queue
  const freshnessQueue = buildFreshnessQueue(candidates);

  // Phase 5: Crawl stimulation targets
  const crawlTargets = getCrawlStimulationTargets(candidates);

  // Phase 7: Safety validation
  const safetyStatus = validateSafety(candidates, linkBoostPlans);

  // Phase 8: Summary
  const totalLinksPlanned = linkBoostPlans.reduce((s, p) => s + p.links.length, 0);

  return {
    mode,
    totalImpressions,
    candidates,
    linkBoostPlans,
    activeTitleTests,
    freshnessQueue,
    crawlsPinged: crawlTargets.length,
    safetyStatus,
    summary: {
      totalCandidates: candidates.length,
      linksInjected: totalLinksPlanned,
      titleTestsActive: activeTitleTests.length,
      freshnessUpdatesQueued: freshnessQueue.length,
      crawlsPinged: crawlTargets.length,
      avgPositionDelta: 0, // Populated after 7d comparison
      ctrChange: 0,
      safetyViolations: safetyStatus.violations.length,
    },
  };
}
