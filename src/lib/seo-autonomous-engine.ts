/**
 * Enterprise Autonomous SEO AI System
 *
 * 6-layer architecture with hard safety guardrails.
 * Semi-autonomous: auto-allowed actions under thresholds,
 * manual approval for destructive changes.
 *
 * Layer 1: Central AI Core (unified SEO performance score)
 * Layer 2: Autonomous Action Engine (safe auto-optimizations)
 * Layer 3: Ranking Velocity Booster (position-based queuing)
 * Layer 4: Enterprise Cluster Domination (authority concentration)
 * Layer 5: AI Self-Healing Protocol (recovery mode)
 * Layer 6: Enterprise Safety (rate limits, rollback, logging)
 */

// ============= EMERGENCY RECOVERY MODE =============

export type EmergencyTriggerType = 'ranking_drop_10pct' | 'traffic_drop_15pct' | 'index_ratio_below_55' | 'ctr_collapse_priority';

export type RecoveryPhase = 'stabilize' | 'trust_rebuild' | 'top10_push';

export interface EmergencyRecoveryConfig {
  active: boolean;
  activatedAt: string;
  triggers: EmergencyTriggerType[];
  weeklyActionBudget: number;
  priority: 'stabilization';
  currentPhase: RecoveryPhase;
  frozenActions: string[];
  enabledActions: string[];
  diagnosticSweep: DiagnosticSweepResult | null;
  exitConditions: EmergencyExitConditions;
  monitoringWindowDays: number;
  trustRebuild: TrustRebuildConfig;
  top10Push: Top10PushConfig;
  algorithmVariant: AlgorithmUpdateVariant;
}

export interface DiagnosticSweepResult {
  runAt: string;
  indexCoverageChange14d: number; // % change
  canonicalMismatches: number;
  crawlWastePct: number;
  affectedPages: AffectedPageDiagnostic[];
}

export interface AffectedPageDiagnostic {
  url: string;
  primaryKeyword: string;
  impressionDelta: number;   // % change
  ctrDelta: number;          // % change
  avgPositionDelta: number;  // absolute change (positive = worse)
  repairActions: string[];
}

export interface EmergencyExitConditions {
  rankingsStable7Days: boolean;
  noFurtherDrop5Pct: boolean;
  indexCrawlRatioAbove60: boolean;
  crawlWasteBelow8: boolean;
  canonicalIntegrityAbove95: boolean;
  consecutiveStableDays: number;
  canExit: boolean;
  daysSinceActivation: number;
}

// ============= PHASE 2 — TRUST REBUILD =============

export interface TrustRebuildConfig {
  active: boolean;
  activatedAt: string | null;
  paceLimit: string; // e.g. '1 page per 3 days'
  maxLinksPerPage: number;
  anchorStrategy: 'natural_only';
  improvements: TrustRebuildPage[];
  crawlCleanup: CrawlCleanupStatus;
  kpiTargets: TrustKPITargets;
}

export interface TrustRebuildPage {
  url: string;
  keyword: string;
  plannedImprovements: string[];
  status: 'pending' | 'in_progress' | 'completed';
  scheduledDate: string;
}

export interface CrawlCleanupStatus {
  parameterNormalization: boolean;
  thinDuplicatesRemoved: number;
  consolidatedProductUrls: number;
  sitemapCanonicalOnly: boolean;
}

export interface TrustKPITargets {
  ctrStable: boolean;
  impressionTrendPositive: boolean;
  indexCrawlRatioAbove60: boolean;
  duplicateUrlsBelow5: boolean;
}

// ============= PHASE 3 — TOP 10 PUSH =============

export interface Top10PushConfig {
  active: boolean;
  activatedAt: string | null;
  requiresStabilityDays: number; // 14
  maxPagesPerWeek: number;       // 2
  targets: Top10PushTarget[];
  kpiTargets: Top10KPITargets;
}

export interface Top10PushTarget {
  url: string;
  keyword: string;
  currentPosition: number;
  impressions: number;
  ctr: number;
  actions: string[];
  snippetOptimization: string;
  authorityBoost: string[];
  status: 'queued' | 'in_progress' | 'completed';
}

export interface Top10KPITargets {
  targetPosition: string; // 'Top 5'
  targetCtr: string;      // '>5%'
  featuredSnippetEligible: boolean;
  impressionGrowth30d: string; // '25%'
}

// ============= ALGORITHM UPDATE VARIANT =============

export interface AlgorithmUpdateVariant {
  volatilityDetected: boolean;
  actions: string[];
  monitoring: string[];
}

export function getEmergencyRecoveryConfig(): EmergencyRecoveryConfig {
  return {
    active: true,
    activatedAt: new Date().toISOString(),
    triggers: ['ranking_drop_10pct', 'traffic_drop_15pct', 'ctr_collapse_priority'],
    weeklyActionBudget: 2,
    priority: 'stabilization',
    currentPhase: 'stabilize',
    frozenActions: [
      'new_content_creation',
      'cluster_expansion',
      'backlink_automation',
      'structural_url_changes',
      'bulk_internal_link_injections',
      'new_cluster_expansion',
      'autonomous_longform_generation',
      'dog_beds_optimization',
      'cat_litter_optimization',
    ],
    enabledActions: [
      'canonical_integrity_checks',
      'duplicate_crawl_monitoring',
      'schema_validation',
      'meta_revert',
      'controlled_ctr_ab_test',
      'anchor_density_reduction',
      'noindex_conflict_check',
    ],
    diagnosticSweep: generateDiagnosticSweep(),
    exitConditions: evaluateExitConditions(),
    monitoringWindowDays: 7,
    trustRebuild: getTrustRebuildConfig(),
    top10Push: getTop10PushConfig(),
    algorithmVariant: getAlgorithmUpdateVariant(),
  };
}

function getTrustRebuildConfig(): TrustRebuildConfig {
  return {
    active: false, // Activates after Phase 1 stabilization
    activatedAt: null,
    paceLimit: '1 page per 3 days',
    maxLinksPerPage: 2,
    anchorStrategy: 'natural_only',
    improvements: [
      { url: '/guides/best-cat-trees-2026', keyword: 'best cat trees 2026', plannedImprovements: ['Add statistics section', 'Expand pros/cons', 'Add expert use-case block'], status: 'pending', scheduledDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] },
      { url: '/guides/best-dog-bed-2026', keyword: 'best dog bed 2026', plannedImprovements: ['Add comparison data points', 'Expand material analysis', 'Add vet-reviewed badge'], status: 'pending', scheduledDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0] },
      { url: '/cat-trees-condos', keyword: 'cat trees for sale', plannedImprovements: ['Add buying guide section', 'Expand size comparison table'], status: 'pending', scheduledDate: new Date(Date.now() + 13 * 86400000).toISOString().split('T')[0] },
      { url: '/guides/best-cat-litter-box-2026', keyword: 'best cat litter box', plannedImprovements: ['Add odor control comparison', 'Expert cleaning tips section'], status: 'pending', scheduledDate: new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0] },
    ],
    crawlCleanup: {
      parameterNormalization: false,
      thinDuplicatesRemoved: 0,
      consolidatedProductUrls: 0,
      sitemapCanonicalOnly: true,
    },
    kpiTargets: {
      ctrStable: false,
      impressionTrendPositive: false,
      indexCrawlRatioAbove60: true,
      duplicateUrlsBelow5: false,
    },
  };
}

function getTop10PushConfig(): Top10PushConfig {
  return {
    active: false, // Activates only after 14 days stability
    activatedAt: null,
    requiresStabilityDays: 14,
    maxPagesPerWeek: 2,
    targets: [
      { url: '/guides/best-cat-trees-2026', keyword: 'best cat trees 2026', currentPosition: 12.3, impressions: 487, ctr: 4.9, actions: ['+5 contextual internal links', '+2 semantic sub-sections', 'Comparison decision matrix', 'FAQ block (5 entries)'], snippetOptimization: '"Tested & Ranked 2026" — proof elements + main keyword', authorityBoost: ['Link from Cat Trees hub', 'Breadcrumb reinforcement', 'Add micro-guide: apartment cat trees'], status: 'queued' },
      { url: '/cat-trees-condos', keyword: 'cat trees for sale', currentPosition: 9.8, impressions: 612, ctr: 6.9, actions: ['+3 contextual internal links', 'Add buyer decision matrix', 'FAQ block (3 entries)'], snippetOptimization: '"Shop Cat Trees — Free Shipping Available" + urgency trigger', authorityBoost: ['Homepage feature rotation', 'Breadcrumb reinforcement'], status: 'queued' },
      { url: '/guides/best-dog-bed-2026', keyword: 'best dog bed 2026', currentPosition: 15.7, impressions: 318, ctr: 2.5, actions: ['+4 contextual internal links', '+2 long-tail sub-sections', 'Comparison table', 'FAQ block (4 entries)'], snippetOptimization: '"Vet-Approved Dog Beds 2026" + updated badge', authorityBoost: ['Link from Dog Beds hub', 'Add micro-guide: cooling dog beds'], status: 'queued' },
      { url: '/product/luxury-cat-tree-xl', keyword: 'large cat tree', currentPosition: 14.6, impressions: 278, ctr: 4.0, actions: ['+3 internal links', 'Expand product description', 'FAQ block (3 entries)'], snippetOptimization: '"Best Large Cat Tree — Tested for Stability"', authorityBoost: ['Link from cornerstone guide', 'Bestseller badge'], status: 'queued' },
    ],
    kpiTargets: {
      targetPosition: 'Top 5',
      targetCtr: '>5%',
      featuredSnippetEligible: true,
      impressionGrowth30d: '25%',
    },
  };
}

function getAlgorithmUpdateVariant(): AlgorithmUpdateVariant {
  return {
    volatilityDetected: false,
    actions: [
      'Pause aggressive changes',
      'Increase content depth over density',
      'Reduce anchor optimization intensity',
      'Improve topical authority breadth',
      'Add unique value (original insights, structured comparisons)',
      'Avoid rapid backlink acquisition spikes',
    ],
    monitoring: [
      'Position volatility (daily)',
      'Impression slope (daily)',
      'CTR stability (daily)',
      'Index ratio (daily)',
    ],
  };
}

function generateDiagnosticSweep(): DiagnosticSweepResult {
  return {
    runAt: new Date().toISOString(),
    indexCoverageChange14d: -6.2,
    canonicalMismatches: 4,
    crawlWastePct: 9.1,
    affectedPages: [
      {
        url: '/guides/best-cat-trees-2026',
        primaryKeyword: 'best cat trees 2026',
        impressionDelta: -22.4,
        ctrDelta: -1.8,
        avgPositionDelta: 3.2,
        repairActions: ['Revert meta to previous version', 'Verify canonical = self-referencing', 'Check anchor distribution'],
      },
      {
        url: '/guides/best-dog-bed-2026',
        primaryKeyword: 'best dog bed 2026',
        impressionDelta: -31.1,
        ctrDelta: -2.3,
        avgPositionDelta: 5.7,
        repairActions: ['Revert title A/B test', 'Remove 2 recent internal links', 'Validate schema integrity'],
      },
      {
        url: '/guides/best-cat-litter-box-2026',
        primaryKeyword: 'best cat litter box',
        impressionDelta: -18.5,
        ctrDelta: -0.9,
        avgPositionDelta: 2.1,
        repairActions: ['Verify canonical tag', 'Check noindex conflicts', 'Reduce anchor density'],
      },
      {
        url: '/cat-trees-condos',
        primaryKeyword: 'cat trees for sale',
        impressionDelta: -14.2,
        ctrDelta: -1.1,
        avgPositionDelta: 1.8,
        repairActions: ['Verify canonical = self-referencing', 'Check crawl depth', 'Validate schema'],
      },
      {
        url: '/guides/best-orthopedic-dog-bed',
        primaryKeyword: 'orthopedic dog bed',
        impressionDelta: -25.3,
        ctrDelta: -1.5,
        avgPositionDelta: 4.3,
        repairActions: ['Revert meta changes', 'Remove excessive exact anchors', 'Check robots.txt'],
      },
    ],
  };
}

function evaluateExitConditions(): EmergencyExitConditions {
  return {
    rankingsStable7Days: false,
    noFurtherDrop5Pct: true,
    indexCrawlRatioAbove60: true,
    crawlWasteBelow8: false,
    canonicalIntegrityAbove95: false,
    consecutiveStableDays: 3,
    canExit: false,
    daysSinceActivation: 3,
  };
}

// ============= FOCUS MODE CONFIG =============

export interface FocusModeConfig {
  active: boolean;
  cluster: string;
  primaryUrl: string;
  durationDays: number;
  startedAt: string;
  weeklyActionBudget: number;
  disabled: string[];
  enabled: string[];
}

export function getFocusModeConfig(): FocusModeConfig {
  return {
    active: false, // Suspended during Emergency Recovery
    cluster: 'Cat Trees & Condos',
    primaryUrl: '/guides/best-cat-trees-2026',
    durationDays: 30,
    startedAt: new Date().toISOString(),
    weeklyActionBudget: 3,
    disabled: [
      'new_cluster_expansion',
      'backlink_automation',
      'autonomous_longform_generation',
      'dog_beds_optimization',
      'cat_litter_optimization',
    ],
    enabled: [
      'ctr_meta_optimization',
      'faq_schema_additions',
      'duplicate_crawl_monitoring',
      'canonical_integrity_checks',
    ],
  };
}

// ============= LAYER 1 — CENTRAL AI CORE =============

export interface AICoreAnalysis {
  gscHealth: number;
  crawlHealth: number;
  indexationHealth: number;
  rankingVelocity: number;
  ctrPerformance: number;
  linkGraphStrength: number;
  revenueOverlay: number;
  conversionHealth: number;
  canonicalIntegrity: number;
  duplicateSuppression: number;
  unifiedScore: number; // 0-100
  status: 'optimal' | 'healthy' | 'attention' | 'critical';
  lastAnalyzedAt: string;
  focusMode: FocusModeConfig;
  emergencyRecovery: EmergencyRecoveryConfig;
}

export function calculateUnifiedScore(): AICoreAnalysis {
  const metrics = {
    gscHealth: 72,
    crawlHealth: 68,
    indexationHealth: 64,
    rankingVelocity: 58,
    ctrPerformance: 45,
    linkGraphStrength: 61,
    revenueOverlay: 52,
    conversionHealth: 48,
    canonicalIntegrity: 85,
    duplicateSuppression: 78,
  };

  const weights = {
    gscHealth: 0.12, crawlHealth: 0.10, indexationHealth: 0.12,
    rankingVelocity: 0.15, ctrPerformance: 0.12, linkGraphStrength: 0.10,
    revenueOverlay: 0.10, conversionHealth: 0.08, canonicalIntegrity: 0.06,
    duplicateSuppression: 0.05,
  };

  const unified = Math.round(
    Object.entries(weights).reduce((s, [k, w]) => s + (metrics[k as keyof typeof metrics] * w), 0)
  );

  const status = unified >= 75 ? 'optimal' : unified >= 60 ? 'healthy' : unified >= 40 ? 'attention' : 'critical';

  return { ...metrics, unifiedScore: unified, status, lastAnalyzedAt: new Date().toISOString(), focusMode: getFocusModeConfig(), emergencyRecovery: getEmergencyRecoveryConfig() };
}

// ============= LAYER 2 — AUTONOMOUS ACTION ENGINE =============

export type ActionPermission = 'auto' | 'manual';
export type ActionStatus = 'queued' | 'executing' | 'completed' | 'failed' | 'pending_approval' | 'rolled_back';

export interface AutonomousAction {
  id: string;
  type: string;
  permission: ActionPermission;
  target: string;
  description: string;
  status: ActionStatus;
  impact: 'high' | 'medium' | 'low';
  executedAt: string | null;
  rollbackAvailable: boolean;
  details: Record<string, unknown>;
}

export const AUTO_ALLOWED_ACTIONS = [
  { type: 'meta_description_update', label: 'Meta Description Update', maxPerWeek: 5 },
  { type: 'title_ab_rotation', label: 'Title A/B Rotation', cooldown: '14 days' },
  { type: 'faq_schema_addition', label: 'FAQ Schema Addition', maxPerWeek: 3 },
  { type: 'internal_link_injection', label: 'Internal Link Injection', maxPerPage: 2, cooldown: '14 days' },
  { type: 'sitemap_regeneration', label: 'Sitemap Regeneration', maxPerWeek: 1 },
  { type: 'parameter_noindex', label: 'Parameter URL Noindex', maxPerWeek: 5 },
] as const;

export const MANUAL_REQUIRED_ACTIONS = [
  { type: 'redirect_creation', label: '301 Redirect', reason: 'URL structure change' },
  { type: 'canonical_change', label: 'Canonical Tag Change', reason: 'Link equity redistribution' },
  { type: 'content_rewrite_major', label: 'Content Rewrite >20%', reason: 'Ranking stability risk' },
  { type: 'url_structure_change', label: 'URL Structure Change', reason: 'Indexation disruption risk' },
] as const;

export function generateAutonomousActions(): AutonomousAction[] {
  return [
    { id: 'aa-1', type: 'meta_description_update', permission: 'auto', target: '/guides/best-cat-trees-2026', description: 'Rewrite meta to include "tested & ranked" CTR trigger', status: 'completed', impact: 'medium', executedAt: new Date(Date.now() - 86400000).toISOString(), rollbackAvailable: true, details: { oldMeta: 'Best cat trees reviewed...', newMeta: 'Best Cat Trees 2026 — Tested & Ranked by Experts. Free Shipping Available.' } },
    { id: 'aa-2', type: 'faq_schema_addition', permission: 'auto', target: '/guides/best-dog-bed-2026', description: 'Add 3 FAQ entries for "how to choose" queries', status: 'completed', impact: 'high', executedAt: new Date(Date.now() - 172800000).toISOString(), rollbackAvailable: true, details: { faqCount: 3 } },
    { id: 'aa-3', type: 'internal_link_injection', permission: 'auto', target: '/guides/best-cat-litter-box-2026', description: 'Inject 2 contextual links from cat litter cluster', status: 'queued', impact: 'high', executedAt: null, rollbackAvailable: true, details: { linkCount: 2, sources: ['/guides/choosing-right-litter', '/product/self-cleaning-litter-box'] } },
    { id: 'aa-4', type: 'title_ab_rotation', permission: 'auto', target: '/guides/best-orthopedic-dog-bed', description: 'Rotate to variant B: "Best Orthopedic Dog Beds (Vet-Recommended)"', status: 'queued', impact: 'medium', executedAt: null, rollbackAvailable: true, details: { variantA: 'Best Orthopedic Dog Beds 2026', variantB: 'Best Orthopedic Dog Beds (Vet-Recommended) 2026' } },
    { id: 'aa-5', type: 'parameter_noindex', permission: 'auto', target: '?sort=*', description: 'Apply noindex to sort parameter URLs to reduce crawl waste', status: 'completed', impact: 'low', executedAt: new Date(Date.now() - 259200000).toISOString(), rollbackAvailable: true, details: { pattern: '?sort=', affectedCount: 87 } },
    { id: 'aa-6', type: 'redirect_creation', permission: 'manual', target: '/old-dog-beds', description: '301 redirect to /guides/best-dog-bed-2026', status: 'pending_approval', impact: 'high', executedAt: null, rollbackAvailable: false, details: { from: '/old-dog-beds', to: '/guides/best-dog-bed-2026' } },
    { id: 'aa-7', type: 'canonical_change', permission: 'manual', target: '/product/cat-tree-deluxe', description: 'Change canonical from /product/cat-tree-deluxe?color=brown to /product/cat-tree-deluxe', status: 'pending_approval', impact: 'medium', executedAt: null, rollbackAvailable: false, details: {} },
    { id: 'aa-8', type: 'sitemap_regeneration', permission: 'auto', target: 'sitemap.xml', description: 'Regenerate sitemap — 3 new guides added this week', status: 'completed', impact: 'low', executedAt: new Date(Date.now() - 43200000).toISOString(), rollbackAvailable: true, details: { newPages: 3 } },
  ];
}

// ============= LAYER 3 — RANKING VELOCITY BOOSTER =============

export interface VelocityTarget {
  url: string;
  keyword: string;
  currentPosition: number;
  impressions: number;
  ctr: number;
  zone: 'top10_assault' | 'momentum_push' | 'snippet_rewrite';
  queuedActions: string[];
  velocityScore: number; // 0-100
  estimatedWeeksToTarget: number;
}

export function generateVelocityTargets(): VelocityTarget[] {
  return [
    { url: '/guides/best-cat-trees-2026', keyword: 'best cat trees 2026', currentPosition: 12.3, impressions: 487, ctr: 4.9, zone: 'top10_assault', queuedActions: ['FAQ expansion', 'Internal authority +3 links', 'Homepage rotation'], velocityScore: 82, estimatedWeeksToTarget: 3 },
    { url: '/cat-trees-condos', keyword: 'cat trees for sale', currentPosition: 9.8, impressions: 612, ctr: 6.9, zone: 'top10_assault', queuedActions: ['Rich snippet optimization', 'Maintain structure'], velocityScore: 91, estimatedWeeksToTarget: 1 },
    { url: '/guides/best-dog-bed-2026', keyword: 'best dog bed 2026', currentPosition: 15.7, impressions: 318, ctr: 2.5, zone: 'momentum_push', queuedActions: ['Title optimization', 'FAQ schema', 'Homepage feature'], velocityScore: 68, estimatedWeeksToTarget: 6 },
    { url: '/guides/best-cat-litter-box-2026', keyword: 'best cat litter box', currentPosition: 18.2, impressions: 201, ctr: 2.0, zone: 'momentum_push', queuedActions: ['Meta rewrite', 'Internal links +4', 'FAQ schema'], velocityScore: 55, estimatedWeeksToTarget: 8 },
    { url: '/guides/best-orthopedic-dog-bed', keyword: 'orthopedic dog bed', currentPosition: 16.4, impressions: 189, ctr: 2.6, zone: 'momentum_push', queuedActions: ['Title A/B test', 'FAQ schema', 'Cornerstone link'], velocityScore: 58, estimatedWeeksToTarget: 7 },
    { url: '/product/luxury-cat-tree-xl', keyword: 'large cat tree', currentPosition: 14.6, impressions: 278, ctr: 4.0, zone: 'momentum_push', queuedActions: ['Internal links +3', 'Bestseller rotation'], velocityScore: 72, estimatedWeeksToTarget: 5 },
    { url: '/guides/indoor-cat-enrichment', keyword: 'indoor cat enrichment', currentPosition: 19.1, impressions: 98, ctr: 1.0, zone: 'snippet_rewrite', queuedActions: ['Meta rewrite', 'Internal links +4', 'FAQ cluster'], velocityScore: 42, estimatedWeeksToTarget: 10 },
    { url: '/guides/outdoor-dog-games-2026', keyword: 'outdoor dog games', currentPosition: 17.8, impressions: 112, ctr: 1.8, zone: 'snippet_rewrite', queuedActions: ['Title CTR optimization', 'FAQ expansion'], velocityScore: 45, estimatedWeeksToTarget: 9 },
  ];
}

// ============= LAYER 4 — ENTERPRISE CLUSTER DOMINATION =============

export interface ClusterDominanceData {
  name: string;
  tier: 1 | 2;
  pages: number;
  avgPosition: number;
  totalImpressions: number;
  internalLinks: number;
  thinNodes: number;
  mergeCandidates: number;
  authorityScore: number;
  status: 'dominant' | 'growing' | 'weak';
  actions: string[];
}

export function generateClusterDominance(): ClusterDominanceData[] {
  return [
    { name: 'Cat Trees & Condos', tier: 1, pages: 8, avgPosition: 13.2, totalImpressions: 1544, internalLinks: 34, thinNodes: 1, mergeCandidates: 0, authorityScore: 78, status: 'dominant', actions: ['Maintain link density', 'Add 2 micro-guides for long-tail coverage'] },
    { name: 'Dog Beds', tier: 1, pages: 4, avgPosition: 18.4, totalImpressions: 641, internalLinks: 18, thinNodes: 0, mergeCandidates: 0, authorityScore: 62, status: 'growing', actions: ['Boost internal links +6', 'Add cooling/orthopedic sub-guides', 'Create comparison content'] },
    { name: 'Cat Litter', tier: 2, pages: 3, avgPosition: 22.1, totalImpressions: 377, internalLinks: 12, thinNodes: 1, mergeCandidates: 1, authorityScore: 48, status: 'weak', actions: ['Merge "choosing-right-litter" into cornerstone', 'Add 3 FAQs', 'Boost internal links +4'] },
    { name: 'Dog Activities', tier: 2, pages: 2, avgPosition: 23.1, totalImpressions: 201, internalLinks: 6, thinNodes: 1, mergeCandidates: 0, authorityScore: 35, status: 'weak', actions: ['Add 3 supporting micro-guides', 'Repair orphan product page', 'Create "best dog toys" cornerstone'] },
  ];
}

// ============= LAYER 5 — AI SELF-HEALING PROTOCOL =============

export type RecoveryTrigger = 'ranking_drop' | 'crawl_waste' | 'index_ratio' | 'canonical_conflict';

export interface RecoveryStatus {
  active: boolean;
  triggers: RecoveryTrigger[];
  activeSince: string | null;
  actionsInProgress: string[];
  pausedActions: string[];
  recoveryProgress: number; // 0-100
}

export interface HealthCheck {
  metric: string;
  value: number;
  threshold: number;
  status: 'pass' | 'warning' | 'fail';
  trigger: RecoveryTrigger;
  description: string;
}

export function runHealthChecks(): HealthCheck[] {
  return [
    { metric: 'Ranking Stability', value: 82, threshold: 90, status: 'fail', trigger: 'ranking_drop', description: '⚠️ >10% ranking drop detected in last 7 days — Emergency trigger activated' },
    { metric: 'Organic Traffic WoW', value: -16.3, threshold: -15, status: 'fail', trigger: 'ranking_drop', description: '⚠️ 16.3% organic traffic drop week-over-week — Emergency trigger activated' },
    { metric: 'Crawl Waste', value: 9.1, threshold: 8, status: 'warning', trigger: 'crawl_waste', description: 'Crawl waste at 9.1% — above 8% target, stabilization needed' },
    { metric: 'Index/Crawl Ratio', value: 58, threshold: 60, status: 'fail', trigger: 'index_ratio', description: '⚠️ Index ratio at 58% — below 60% threshold, approaching emergency trigger at 55%' },
    { metric: 'Canonical Integrity', value: 92, threshold: 95, status: 'warning', trigger: 'canonical_conflict', description: '8 canonical mismatches detected — above 5% tolerance' },
    { metric: 'Duplicate URLs', value: 6.8, threshold: 5, status: 'warning', trigger: 'crawl_waste', description: 'Duplicate crawling at 6.8% — above 5% target' },
  ];
}

export function getRecoveryStatus(): RecoveryStatus {
  const checks = runHealthChecks();
  const fails = checks.filter(c => c.status === 'fail');

  return {
    active: true, // Emergency Recovery Mode is active
    triggers: ['ranking_drop', 'index_ratio'],
    activeSince: new Date().toISOString(),
    actionsInProgress: [
      'Revert last 7-day meta changes on affected pages',
      'Verify canonical = self-referencing on all guides',
      'Reduce anchor density on over-optimized pages',
      'Validate schema integrity (no errors)',
      'Normalize parameter URLs',
    ],
    pausedActions: [
      'New content creation',
      'Cluster expansion',
      'Backlink automation',
      'Structural URL changes',
      'Bulk internal link injections',
      'Title A/B tests',
      'FAQ schema additions',
    ],
    recoveryProgress: 15,
  };
}

// ============= LAYER 6 — ENTERPRISE SAFETY =============

export interface SafetyMetrics {
  actionsThisWeek: number;
  maxActionsPerWeek: number;
  rollbackMemoryDays: number;
  changesLoggedTotal: number;
  rollbacksAvailable: number;
  lastActionAt: string | null;
  stabilityPriority: boolean;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  actionType: string;
  target: string;
  permission: ActionPermission;
  status: ActionStatus;
  canRollback: boolean;
  rolledBackAt: string | null;
  details: string;
}

export function getSafetyMetrics(): SafetyMetrics {
  return {
    actionsThisWeek: 0,
    maxActionsPerWeek: 2, // Emergency Recovery Mode: reduced from 3
    rollbackMemoryDays: 30,
    changesLoggedTotal: 47,
    rollbacksAvailable: 12,
    lastActionAt: new Date(Date.now() - 43200000).toISOString(),
    stabilityPriority: true,
  };
}

export function getActionLog(): ActionLogEntry[] {
  const now = Date.now();
  return [
    { id: 'log-1', timestamp: new Date(now - 43200000).toISOString(), actionType: 'sitemap_regeneration', target: 'sitemap.xml', permission: 'auto', status: 'completed', canRollback: true, rolledBackAt: null, details: 'Added 3 new guide URLs to sitemap' },
    { id: 'log-2', timestamp: new Date(now - 86400000).toISOString(), actionType: 'meta_description_update', target: '/guides/best-cat-trees-2026', permission: 'auto', status: 'completed', canRollback: true, rolledBackAt: null, details: 'Updated meta with CTR trigger "Tested & Ranked"' },
    { id: 'log-3', timestamp: new Date(now - 172800000).toISOString(), actionType: 'faq_schema_addition', target: '/guides/best-dog-bed-2026', permission: 'auto', status: 'completed', canRollback: true, rolledBackAt: null, details: 'Added 3 FAQ entries targeting "how to choose" queries' },
    { id: 'log-4', timestamp: new Date(now - 259200000).toISOString(), actionType: 'parameter_noindex', target: '?sort=*', permission: 'auto', status: 'completed', canRollback: true, rolledBackAt: null, details: 'Applied noindex to 87 sort parameter URLs' },
    { id: 'log-5', timestamp: new Date(now - 345600000).toISOString(), actionType: 'internal_link_injection', target: '/guides/best-cat-trees-2026', permission: 'auto', status: 'completed', canRollback: true, rolledBackAt: null, details: 'Injected 2 contextual links from product pages' },
    { id: 'log-6', timestamp: new Date(now - 432000000).toISOString(), actionType: 'title_ab_rotation', target: '/guides/best-cat-litter-box-2026', permission: 'auto', status: 'completed', canRollback: true, rolledBackAt: null, details: 'Rotated to variant B with "Self-Cleaning" CTR hook' },
    { id: 'log-7', timestamp: new Date(now - 518400000).toISOString(), actionType: 'meta_description_update', target: '/guides/outdoor-dog-games-2026', permission: 'auto', status: 'rolled_back', canRollback: false, rolledBackAt: new Date(now - 432000000).toISOString(), details: 'Rolled back — CTR decreased after update' },
  ];
}
