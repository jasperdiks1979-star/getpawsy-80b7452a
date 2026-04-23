import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  FileDown,
} from 'lucide-react';
import { useReleaseReport } from '@/hooks/useReleaseReport';
import { downloadReleaseReportPdf } from '@/utils/releaseReportPdf';
import { toast } from 'sonner';

/**
 * Report a new release. On submit, this:
 *   1. Creates a `release_reports` row (audit trail)
 *   2. Auto-triggers `merchant-sync` (live)
 *   3. Auto-triggers `validate-merchant-feed`
 *   4. Stores both summaries on the release row
 */
export function ReportReleaseCard() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const { phase, result, error, reportRelease, reset } = useReleaseReport();

  const busy = phase === 'creating' || phase === 'syncing' || phase === 'validating';

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await reportRelease({ title: title.trim(), notes: notes.trim() || undefined });
  };

  const handleDownloadPdf = () => {
    if (!result) return;
    try {
      downloadReleaseReportPdf({
        title: title.trim() || 'Release Report',
        notes: notes.trim() || undefined,
        result,
      });
      toast.success('Release report PDF downloaded');
    } catch (e) {
      console.error('Release PDF export failed:', e);
      toast.error('Could not generate PDF');
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Report Release
            </CardTitle>
            <CardDescription className="mt-1">
              Logs a new release and automatically runs the Merchant Center sync + feed validation.
              When validation completes, an evidence PDF (matrix + summary) is auto-downloaded for your GMC appeal.
            </CardDescription>
          </div>
          {phase !== 'idle' && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Release title</label>
          <Input
            placeholder="e.g. v2026.04.23 — US identity rollout"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Release notes (optional)</label>
          <Textarea
            placeholder="What changed in this release?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={3}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={busy || !title.trim()}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {phase === 'creating' && 'Creating release…'}
              {phase === 'syncing' && 'Syncing Merchant Center…'}
              {phase === 'validating' && 'Validating feed…'}
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4 mr-2" />
              Report Release & Trigger Feed Refresh
            </>
          )}
        </Button>

        {/* Phase progress */}
        {phase !== 'idle' && (
          <div className="space-y-2 text-sm">
            <PhaseRow
              label="Release recorded"
              done={['syncing', 'validating', 'completed'].includes(phase)}
              busy={phase === 'creating'}
            />
            <PhaseRow
              label="Merchant Center sync"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              done={['validating', 'completed'].includes(phase)}
              busy={phase === 'syncing'}
            />
            <PhaseRow
              label="Feed validation"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              done={phase === 'completed'}
              busy={phase === 'validating'}
            />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {result && phase === 'completed' && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Release completed
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Badge variant="secondary" className="justify-center">
                Sync {result.sync_summary?.successCount}/{result.sync_summary?.totalProducts}
              </Badge>
              <Badge variant="secondary" className="justify-center">
                Feed {result.validation_summary?.okCount}/{result.validation_summary?.sampleSize} OK
              </Badge>
              <Badge variant="outline" className="justify-center col-span-2 truncate">
                Run: {result.sync_summary?.runId?.slice(0, 12) ?? '—'}
              </Badge>
            </div>
            {result.validation_summary?.topFailReasons?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Top fail reasons:{' '}
                {result.validation_summary.topFailReasons
                  .map((r: [string, number]) => `${r[0]} (${r[1]})`)
                  .join(', ')}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleDownloadPdf}
            >
              <FileDown className="h-4 w-4" />
              Download Release Report (PDF)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhaseRow({
  label,
  icon,
  done,
  busy,
}: {
  label: string;
  icon?: React.ReactNode;
  done: boolean;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : done ? (
        <CheckCircle2 className="h-4 w-4 text-primary" />
      ) : (
        <div className="h-4 w-4 rounded-full border border-muted-foreground/40" />
      )}
      <span className={done || busy ? 'text-foreground' : 'text-muted-foreground'}>
        {label}
      </span>
      {icon && <span className="text-muted-foreground">{icon}</span>}
    </div>
  );
}
