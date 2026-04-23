/**
 * CSV export of all release issues for a given release.
 *
 * Produces a single, RFC-4180-compliant CSV that admins can open in
 * Excel / Numbers / Google Sheets for their own follow-up workflows.
 *
 * Columns (in order):
 *   - issue_id        – DB primary key (stable handle for joins)
 *   - status          – open / in_progress / resolved
 *   - severity        – critical / high / medium / low (auto-derived
 *                       from `buildRecommendations` rule matching)
 *   - source          – validation_fail | custom
 *   - scope           – which feed field / surface this affects
 *   - title
 *   - description
 *   - assignee
 *   - affected_products – count from validation evidence (0 for custom)
 *   - suggested_fix   – first concrete next step from the recommendations
 *                       playbook (one line, comma-separated when multiple)
 *   - issue_key       – raw key (debug / re-import handle)
 *   - created_at
 *   - updated_at
 *   - resolved_at
 */

import type {
  AdminAssignee,
  ReleaseIssue,
} from '@/hooks/useReleaseIssues';
import {
  buildIssueEvidence,
  type SampleResult,
} from '@/lib/release/issueEvidence';
import {
  buildRecommendations,
  type RecommendationSeverity,
} from '@/lib/release/issueRecommendations';

interface BuildOptions {
  releaseId: string;
  releaseTitle?: string | null;
  issues: ReleaseIssue[];
  assignees: AdminAssignee[];
  sampleResults?: SampleResult[] | null;
  feedUrl?: string | null;
}

const CSV_HEADERS = [
  'issue_id',
  'status',
  'severity',
  'source',
  'scope',
  'title',
  'description',
  'assignee',
  'affected_products',
  'suggested_fix',
  'feed_field',
  'feed_tag',
  'feed_hint',
  'source_url',
  'evidence_snippets',
  'affected_product_ids',
  'issue_key',
  'created_at',
  'updated_at',
  'resolved_at',
] as const;

/** RFC-4180 escape: wrap in quotes if needed and double internal quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Always quote — keeps consumers (Excel especially) from mis-parsing
  // commas, newlines, or leading whitespace inside fix steps.
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Resolve severity per issue by re-running the recommendation matcher
 * on a single-issue input. This guarantees the CSV severity column
 * matches what the admin sees in the in-app "Aanbevolen acties" banner.
 */
function severityFor(
  issue: ReleaseIssue,
  productCounts: Record<string, number>,
): { severity: RecommendationSeverity | 'unmatched'; suggestedFix: string } {
  // buildRecommendations skips resolved issues — temporarily flip status
  // to 'open' for the lookup so the CSV can still classify resolved rows
  // (useful for historical exports). We don't mutate the original row.
  const probe: ReleaseIssue = { ...issue, status: 'open' };
  const recs = buildRecommendations([probe], productCounts);
  if (recs.length === 0) {
    return { severity: 'unmatched', suggestedFix: '' };
  }
  const top = recs[0];
  // Join the playbook steps into a single CSV-safe line (numbered) so
  // the admin can read the full action sequence in their spreadsheet.
  const fix = top.steps
    .map((s, i) => `${i + 1}. ${s}`)
    .join(' | ');
  return { severity: top.severity, suggestedFix: fix };
}

/** Cap snippets / IDs in the CSV so a single row doesn't blow past
 *  spreadsheet cell limits (Excel = 32,767 chars). */
const MAX_EVIDENCE_ITEMS = 25;

interface EvidenceColumns {
  scope: string;
  feedField: string;
  feedTag: string;
  feedHint: string;
  sourceUrl: string;
  evidenceSnippets: string;
  affectedProductIds: string;
}

function evidenceFor(
  issue: ReleaseIssue,
  sampleResults: SampleResult[] | null | undefined,
  feedUrl: string | null | undefined,
): EvidenceColumns {
  const ev = buildIssueEvidence(issue.issue_key, sampleResults ?? null, feedUrl ?? undefined);
  if (!ev) {
    return {
      scope: issue.source === 'custom' ? 'custom' : 'unknown',
      feedField: '',
      feedTag: '',
      feedHint: '',
      sourceUrl: feedUrl ?? '',
      evidenceSnippets: '',
      affectedProductIds: '',
    };
  }
  const capped = ev.items.slice(0, MAX_EVIDENCE_ITEMS);
  // "productId :: snippet" per line keeps both pieces joinable in Excel
  // via Text-to-Columns on " :: " if the admin wants to split them.
  const snippets = capped
    .map((it) => `${it.productId} :: ${it.snippet}`)
    .join(' | ');
  const ids = ev.items.map((it) => it.productId).join(', ');
  const overflow = ev.items.length > MAX_EVIDENCE_ITEMS
    ? ` (+${ev.items.length - MAX_EVIDENCE_ITEMS} more)`
    : '';
  return {
    scope: `feed:${ev.feedField}`,
    feedField: ev.feedField,
    feedTag: ev.feedTag,
    feedHint: ev.hint,
    sourceUrl: ev.feedUrl,
    evidenceSnippets: snippets + overflow,
    affectedProductIds: ids,
  };
}

function assigneeFor(
  issue: ReleaseIssue,
  assignees: AdminAssignee[],
): string {
  if (!issue.assignee_id) return '';
  const match = assignees.find((a) => a.id === issue.assignee_id);
  if (!match) return issue.assignee_id;
  return match.display_name || match.email || issue.assignee_id;
}

/**
 * Build the CSV body for a release. Rows are sorted critical → low
 * (then by status) so the most actionable items appear at the top of
 * the spreadsheet.
 */
export function buildIssuesCsv({
  releaseId,
  releaseTitle,
  issues,
  assignees,
  sampleResults,
  feedUrl,
}: BuildOptions): string {
  // Pre-compute affected product counts once per issue.
  const productCounts: Record<string, number> = {};
  for (const issue of issues) {
    const ev = buildIssueEvidence(
      issue.issue_key,
      sampleResults ?? null,
      feedUrl ?? undefined,
    );
    productCounts[issue.id] = ev?.totalAffected ?? 0;
  }

  const SEVERITY_RANK: Record<RecommendationSeverity | 'unmatched', number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    unmatched: 4,
  };
  const STATUS_RANK = { open: 0, in_progress: 1, resolved: 2 } as const;

  const enriched = issues.map((issue) => ({
    issue,
    ...severityFor(issue, productCounts),
    evidence: evidenceFor(issue, sampleResults, feedUrl),
    assignee: assigneeFor(issue, assignees),
    affected: productCounts[issue.id] ?? 0,
  }));

  enriched.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return STATUS_RANK[a.issue.status] - STATUS_RANK[b.issue.status];
  });

  const lines: string[] = [];
  // Lead with a `# release:` comment line so the spreadsheet preserves
  // provenance even after column reordering. Most importers treat the
  // first non-header line as data, so we prepend it as a CSV "data row"
  // with the comment in the first cell only.
  if (releaseTitle || releaseId) {
    lines.push(
      [
        csvCell(`# release: ${releaseTitle ?? '—'} (${releaseId})`),
        ...Array(CSV_HEADERS.length - 1).fill('""'),
      ].join(','),
    );
  }
  lines.push(CSV_HEADERS.map(csvCell).join(','));

  for (const e of enriched) {
    const row = [
      e.issue.id,
      e.issue.status,
      e.severity,
      e.issue.source,
      e.evidence.scope,
      e.issue.title,
      e.issue.description ?? '',
      e.assignee,
      e.affected,
      e.suggestedFix,
      e.evidence.feedField,
      e.evidence.feedTag,
      e.evidence.feedHint,
      e.evidence.sourceUrl,
      e.evidence.evidenceSnippets,
      e.evidence.affectedProductIds,
      e.issue.issue_key,
      e.issue.created_at,
      e.issue.updated_at,
      e.issue.resolved_at ?? '',
    ];
    lines.push(row.map(csvCell).join(','));
  }

  return lines.join('\r\n');
}

/** Trigger a browser download of the issues CSV. */
export function downloadIssuesCsv(opts: BuildOptions): void {
  const csv = buildIssuesCsv(opts);
  // BOM keeps Excel happy with UTF-8 (otherwise é / ë break).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const safe = (opts.releaseTitle || opts.releaseId)
    .toString()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'release';
  const a = document.createElement('a');
  a.href = url;
  a.download = `release-issues-${safe}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}