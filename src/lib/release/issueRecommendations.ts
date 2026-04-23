/**
 * Auto-derived "what to do first" recommendations for a release.
 *
 * Inputs are the raw `release_report_issues` rows + the validation
 * sample data. We bucket each open/in-progress issue by severity, then
 * emit a small ranked playbook so the admin sees one or two concrete
 * next actions before scrolling through every individual issue card.
 *
 * Severity is intentionally simple (4 tiers) so the UI can render a
 * single highlighted block without overwhelming the panel.
 */

import type { ReleaseIssue } from '@/hooks/useReleaseIssues';

export type RecommendationSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IssueRecommendation {
  /** Stable id for React keys + dedupe. */
  key: string;
  severity: RecommendationSeverity;
  /** Short headline shown as the action title. */
  title: string;
  /** One-sentence why-this-first rationale. */
  rationale: string;
  /** Concrete first action(s) the admin should take. */
  steps: string[];
  /** Number of underlying open/in-progress issues this folds together. */
  affectedIssues: number;
  /** Optional total impacted product count (sum across issues). */
  affectedProducts?: number;
}

/**
 * Pattern matchers — each returns a recommendation if the pattern hits.
 * Order matters: the first matching CRITICAL pattern wins the top slot,
 * then we fall through to HIGH / MEDIUM. We deliberately match on
 * substrings of the title/description (case-insensitive) because issue
 * titles can come from validate-merchant-feed reasons, manual notes, or
 * Merchant Center copy-pastes.
 */
interface PatternRule {
  key: string;
  severity: RecommendationSeverity;
  /** Substrings (lowercase) — ANY match triggers the rule. */
  needles: string[];
  title: string;
  rationale: string;
  steps: string[];
}

const RULES: PatternRule[] = [
  {
    key: 'account-suspension',
    severity: 'critical',
    needles: [
      'suspend',
      'account suspended',
      'policy violation',
      'misrepresentation',
      'account disapproval',
      'disapproved account',
    ],
    title: 'Hef Merchant Center accountopschorting op',
    rationale:
      'Een account-niveau opschorting blokkeert ALLE producten. Los dit eerst op voordat individuele feed-fixes effect hebben.',
    steps: [
      'Open Merchant Center → Account issues en lees de exacte beleidsreden.',
      'Doorloop de checklist op /admin/merchant-fix-checklist (trust-pagina\'s, prijsmatch, shipping).',
      'Vraag pas een herbeoordeling aan nadat alle items op de checklist groen zijn.',
    ],
  },
  {
    key: 'image-broken',
    severity: 'high',
    needles: ['image_invalid', 'image_fetch_failed', 'missing_or_invalid_image_url', 'image_link', 'broken image'],
    title: 'Repareer ontbrekende of kapotte product-images',
    rationale:
      'GMC weigert producten met onbereikbare image_link. Dit is de #1 reden voor "item disapproved".',
    steps: [
      'Run validate-merchant-feed opnieuw en bekijk de Evidence-blokken voor de exacte HTTP-status.',
      'Vervang 404/redirect URLs in de bron — of laat merchant-sync de fallback placeholder injecteren.',
      'Trigger daarna een merchant-feed refresh zodat GMC binnen 24u opnieuw fetcht.',
    ],
  },
  {
    key: 'shipping-weight',
    severity: 'high',
    needles: ['weight_out_of_range', 'missing_shipping_weight', 'shipping_weight'],
    title: 'Normaliseer shipping_weight op alle producten',
    rationale:
      'Zonder geldig gewicht (1–25 kg) berekent Google geen verzendkosten en wordt het product geweigerd voor US shopping.',
    steps: [
      'Verifieer dat merchant-sync gram→kg conversie en de 1–25 kg cap toepast.',
      'Voor XL items (cat tree, dog bed) handmatig een minimum van 5 kg zetten.',
      'Herexporteer de feed en check de samenvatting in deze release.',
    ],
  },
  {
    key: 'price-mismatch',
    severity: 'high',
    needles: ['price mismatch', 'price_mismatch', 'price differs', 'landing page price'],
    title: 'Synchroniseer feed-prijzen met de live PDP',
    rationale:
      'Een prijsverschil tussen feed en website is een directe trigger voor "Misrepresentation". Fix dit vóór de herbeoordeling.',
    steps: [
      'Run de merchant-safe audit en let op price-drift entries.',
      'Forceer een merchant-feed regenerate zodat de cache de nieuwe PDP-prijs reflecteert.',
      'Bevestig met een steekproef van 3 producten in incognito + /merchant-feed.xml.',
    ],
  },
  {
    key: 'missing-required',
    severity: 'medium',
    needles: ['missing_title', 'missing_price', 'missing_availability', 'missing gtin', 'missing_brand'],
    title: 'Vul ontbrekende verplichte feed-velden aan',
    rationale:
      'Producten zonder verplichte attributen worden uitgesloten — laag-risico maar verkleint je catalogus zichtbaar in Shopping.',
    steps: [
      'Bekijk de Evidence per issue om te zien welke producten geraakt zijn.',
      'Patch de bronvelden in /admin/products of de import-pipeline.',
      'Herbouw de feed en bevestig dat de count naar 0 zakt in de volgende release.',
    ],
  },
  {
    key: 'policy-content',
    severity: 'medium',
    needles: ['banned term', 'banned_term', 'medical claim', 'guaranteed', 'vet approved'],
    title: 'Verwijder verboden termen uit copy',
    rationale:
      'Banned terms (medische claims, "guaranteed", etc.) triggeren content-policy reviews en blokkeren ads.',
    steps: [
      'Run de merchant-safe scan op productbeschrijvingen.',
      'Vervang gemarkeerde termen via de approved microcopy in src/config/merchant-policy.ts.',
      'Re-validate de feed na deploy.',
    ],
  },
];

const SEVERITY_RANK: Record<RecommendationSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function matchRule(text: string): PatternRule | null {
  const lower = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.needles.some((n) => lower.includes(n))) return rule;
  }
  return null;
}

/**
 * Build a ranked list of next-action recommendations from the active
 * (non-resolved) issues on a release. Returns an empty list when there's
 * nothing actionable — callers should hide the section entirely in that
 * case to avoid empty-state noise.
 *
 * @param issues       All issues for the release (resolved ones are skipped).
 * @param productCounts Optional `issue_id → impacted product count` map
 *                     so the recommendation can show "X products affected".
 */
export function buildRecommendations(
  issues: ReleaseIssue[] | null | undefined,
  productCounts?: Record<string, number>,
): IssueRecommendation[] {
  if (!Array.isArray(issues) || issues.length === 0) return [];

  const active = issues.filter((i) => i.status !== 'resolved');
  if (active.length === 0) return [];

  // Bucket active issues per matching rule, summing impact.
  const grouped = new Map<
    string,
    { rule: PatternRule; issueCount: number; productCount: number }
  >();
  let unmatchedCount = 0;

  for (const issue of active) {
    const haystack = `${issue.issue_key} ${issue.title} ${issue.description ?? ''}`;
    const rule = matchRule(haystack);
    const products = productCounts?.[issue.id] ?? 0;
    if (!rule) {
      unmatchedCount++;
      continue;
    }
    const entry = grouped.get(rule.key);
    if (entry) {
      entry.issueCount += 1;
      entry.productCount += products;
    } else {
      grouped.set(rule.key, { rule, issueCount: 1, productCount: products });
    }
  }

  const recs: IssueRecommendation[] = Array.from(grouped.values()).map(
    ({ rule, issueCount, productCount }) => ({
      key: rule.key,
      severity: rule.severity,
      title: rule.title,
      rationale: rule.rationale,
      steps: rule.steps,
      affectedIssues: issueCount,
      affectedProducts: productCount > 0 ? productCount : undefined,
    }),
  );

  // Generic catch-all so admins still see a nudge for unrecognized issues.
  if (unmatchedCount > 0 && recs.length === 0) {
    recs.push({
      key: 'review-open-issues',
      severity: 'medium',
      title: `Beoordeel ${unmatchedCount} open issue${unmatchedCount === 1 ? '' : 's'}`,
      rationale:
        'Geen automatische match gevonden — open elk issue, wijs een eigenaar toe en zet de status door zodra er actie loopt.',
      steps: [
        'Loop de issue-lijst hieronder door op volgorde van impact.',
        'Wijs elk item een verantwoordelijke toe en update de status.',
      ],
      affectedIssues: unmatchedCount,
    });
  }

  recs.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    // Tie-break: more affected issues first.
    return b.affectedIssues - a.affectedIssues;
  });

  // Cap to top 3 — anything beyond that is noise on a release page.
  return recs.slice(0, 3);
}

export const SEVERITY_LABEL: Record<RecommendationSeverity, string> = {
  critical: 'Kritiek',
  high: 'Hoog',
  medium: 'Gemiddeld',
  low: 'Laag',
};