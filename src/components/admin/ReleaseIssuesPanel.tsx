import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  UserCircle2,
  ListChecks,
  ExternalLink,
  FileSearch,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from 'lucide-react';
import {
  useReleaseIssues,
  STATUS_LABELS,
  type ReleaseIssueStatus,
} from '@/hooks/useReleaseIssues';
import { cn } from '@/lib/utils';
import { buildIssueEvidence, type IssueEvidence, type SampleResult } from '@/lib/release/issueEvidence';
import { useProductNames } from '@/hooks/useProductNames';
import { buildRecommendations } from '@/lib/release/issueRecommendations';
import { ReleaseRecommendationsBanner } from './ReleaseRecommendationsBanner';
import { downloadIssuesCsv } from '@/lib/release/issuesCsvExport';
import { toast } from 'sonner';

const UNASSIGNED = '__unassigned__';

function statusBadge(status: ReleaseIssueStatus) {
  switch (status) {
    case 'resolved':
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Opgelost
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3" />
          In behandeling
        </Badge>
      );
    case 'open':
    default:
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Open
        </Badge>
      );
  }
}

interface Props {
  releaseId: string;
  topFailReasons: Array<[string, number]> | null | undefined;
  /**
   * Per-item validation results from `validate-merchant-feed`. Used to
   * surface concrete evidence (product id + failed field + snippet) per
   * issue. Null/empty when an older release didn't persist sample data.
   */
  sampleResults?: SampleResult[] | null;
  /** Override for the live merchant feed URL shown in evidence links. */
  feedUrl?: string | null;
  /** Optional release title — included as a header row in CSV exports. */
  releaseTitle?: string | null;
}

/**
 * Per-release issue tracker. Renders one row per known issue with:
 *  - status dropdown (Open / In behandeling / Opgelost)
 *  - assignee dropdown (admin users)
 *  - delete button (custom issues only — auto-detected ones can be re-seeded)
 *
 * Validation_fail issues are auto-seeded by the hook; custom issues can
 * be added inline.
 */
export function ReleaseIssuesPanel({
  releaseId,
  topFailReasons,
  sampleResults,
  feedUrl,
  releaseTitle,
}: Props) {
  const {
    issues,
    assignees,
    loading,
    error,
    updateIssue,
    addCustomIssue,
    deleteIssue,
  } = useReleaseIssues(releaseId, topFailReasons);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState<Record<string, boolean>>({});

  const onAdd = async () => {
    setAdding(true);
    try {
      await addCustomIssue(newTitle, newDesc);
      setNewTitle('');
      setNewDesc('');
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  };

  const counts = issues
    ? issues.reduce(
        (acc, i) => {
          acc[i.status]++;
          return acc;
        },
        { open: 0, in_progress: 0, resolved: 0 } as Record<ReleaseIssueStatus, number>,
      )
    : null;

  // Aggregate per-issue product impact from the evidence builder so the
  // recommendations banner can show "X products affected" per action.
  const productCounts: Record<string, number> = {};
  if (issues) {
    for (const i of issues) {
      const ev = buildIssueEvidence(i.issue_key, sampleResults ?? null, feedUrl ?? undefined);
      if (ev) productCounts[i.id] = ev.totalAffected;
    }
  }
  const recommendations = buildRecommendations(issues, productCounts);

  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-3">
      <ReleaseRecommendationsBanner recommendations={recommendations} />
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4 text-primary" />
          Issues
          {counts && (
            <span className="text-xs text-muted-foreground font-normal">
              · {counts.open} open · {counts.in_progress} in behandeling · {counts.resolved} opgelost
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowAdd((s) => !s)}
        >
          <Plus className="h-3 w-3" />
          Issue toevoegen
        </Button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-md border bg-background p-2 space-y-2">
          <Input
            placeholder="Korte titel (bv. 'GTIN ontbreekt op 12 producten')"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-8 text-sm"
          />
          <Textarea
            placeholder="Optioneel: extra context, links, eigenaar-notes…"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="text-sm min-h-[60px]"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAdd(false);
                setNewTitle('');
                setNewDesc('');
              }}
              disabled={adding}
            >
              Annuleren
            </Button>
            <Button size="sm" onClick={onAdd} disabled={adding || !newTitle.trim()}>
              {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Toevoegen
            </Button>
          </div>
        </div>
      )}

      {loading && !issues && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Issues laden…
        </div>
      )}
      {error && (
        <div className="text-xs text-destructive py-2">{error}</div>
      )}
      {issues && issues.length === 0 && !loading && (
        <div className="text-xs text-muted-foreground italic py-2">
          Geen issues geregistreerd voor deze release.
        </div>
      )}

      {issues && issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((issue) => {
            const isResolved = issue.status === 'resolved';
            const evidence = buildIssueEvidence(
              issue.issue_key,
              sampleResults ?? null,
              feedUrl ?? undefined,
            );
            const isEvidenceOpen = !!evidenceOpen[issue.id];
            return (
              <li
                key={issue.id}
                className={cn(
                  'rounded-md border bg-background p-2 text-xs space-y-2',
                  isResolved && 'opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(issue.status)}
                      <Badge variant="outline" className="text-[10px]">
                        {issue.source === 'validation_fail' ? 'Auto · feed' : 'Custom'}
                      </Badge>
                      <span
                        className={cn(
                          'font-medium text-sm break-words',
                          isResolved && 'line-through text-muted-foreground',
                        )}
                      >
                        {issue.title}
                      </span>
                    </div>
                    {issue.description && (
                      <p className="text-muted-foreground mt-1 break-words">
                        {issue.description}
                      </p>
                    )}
                  </div>
                  {issue.source === 'custom' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteIssue(issue.id)}
                      title="Issue verwijderen"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {evidence && (
                  <EvidenceBlock
                    evidence={evidence}
                    isOpen={isEvidenceOpen}
                    onToggle={() =>
                      setEvidenceOpen((s) => ({ ...s, [issue.id]: !s[issue.id] }))
                    }
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">
                      Status
                    </label>
                    <Select
                      value={issue.status}
                      onValueChange={(v) =>
                        updateIssue(issue.id, { status: v as ReleaseIssueStatus })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABELS) as ReleaseIssueStatus[]).map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">
                      <UserCircle2 className="h-3 w-3 inline mr-1" />
                      Verantwoordelijke
                    </label>
                    <Select
                      value={issue.assignee_id ?? UNASSIGNED}
                      onValueChange={(v) =>
                        updateIssue(issue.id, {
                          assignee_id: v === UNASSIGNED ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Niet toegewezen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED} className="text-xs italic">
                          Niet toegewezen
                        </SelectItem>
                        {assignees.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            {a.display_name || a.email || a.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {issue.resolved_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Opgelost op {new Date(issue.resolved_at).toLocaleString()}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Per-issue evidence block. Lives as its own component so we can call
 * `useProductNames` per issue (each issue has its own slice of affected
 * product ids), without violating React's rules-of-hooks inside the
 * issues map. Renders:
 *   - count badge (impacted product total)
 *   - collapsible product list with name + snippet + fix link
 */
function EvidenceBlock({
  evidence,
  isOpen,
  onToggle,
}: {
  evidence: IssueEvidence;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const ids = evidence.items.map((i) => i.productId);
  // Only fetch names when the panel is open — keeps the initial render
  // cheap when an admin scans 20+ issues without expanding any.
  const namesMap = useProductNames(isOpen ? ids : []);
  const count = evidence.totalAffected;

  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 text-[11px] font-medium text-foreground"
      >
        <span className="flex items-center gap-1.5 flex-wrap">
          <FileSearch className="h-3 w-3 text-primary" />
          Evidence
          <Badge variant="outline" className="text-[10px] font-mono">
            {evidence.feedTag}
          </Badge>
          <Badge
            variant={count > 0 ? 'destructive' : 'secondary'}
            className="text-[10px] gap-1"
          >
            {count} product{count === 1 ? '' : 's'}
          </Badge>
        </span>
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground italic">{evidence.hint}</p>
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-muted-foreground">Bronpagina:</span>
            <a
              href={evidence.feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1 font-mono break-all"
            >
              merchant-feed.xml
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-muted-foreground">· veld:</span>
            <code className="font-mono text-foreground">{evidence.feedField}</code>
          </div>

          {evidence.items.length > 0 ? (
            <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {evidence.items.map((it) => {
                const meta = namesMap[it.productId];
                const displayName = meta?.name ?? null;
                const liveHref = meta?.slug ? `/products/${meta.slug}` : null;
                return (
                  <li
                    key={it.productId}
                    className="rounded border bg-background px-2 py-1 text-[11px] flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {displayName ? (
                          <span className="font-medium text-foreground truncate">
                            {displayName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Loading…</span>
                        )}
                        {liveHref && (
                          <a
                            href={liveHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline inline-flex items-center gap-0.5 text-[10px]"
                            title="Open live product page"
                          >
                            view
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                      <code className="block font-mono text-[10px] text-muted-foreground truncate">
                        id: {it.productId}
                      </code>
                      <code className="block font-mono text-foreground break-all">
                        {it.snippet}
                      </code>
                    </div>
                    <a
                      href={it.productAdminUrl}
                      className="text-primary underline shrink-0 inline-flex items-center gap-0.5 text-[10px]"
                      title="Open product in admin"
                    >
                      fix
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">
              Geen per-item evidence beschikbaar — herhaal de feed-validatie via
              "Report Release" om sampleResults op te slaan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}