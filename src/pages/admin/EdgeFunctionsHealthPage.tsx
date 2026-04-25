import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

/**
 * Edge Functions Health
 *
 * Operator console that probes every deployed edge function with an
 * OPTIONS request and surfaces per-function runtime status. A function
 * that fails to import (TypeScript boot error, missing top-level secret,
 * bad transitive dep) returns 5xx with a BOOT_ERROR-shaped body — the
 * `edge-functions-health` function classifies that as `error` so we can
 * see at a glance which functions still fail.
 */

type ProbeStatus = 'success' | 'error' | 'skipped';

interface ProbeResult {
  name: string;
  status: ProbeStatus;
  httpStatus: number | null;
  durationMs: number;
  bootError: boolean;
  errorSnippet: string | null;
}

interface HealthResponse {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  concurrency: number;
  timeoutMs: number;
  summary: { total: number; success: number; error: number; bootErrors: number };
  results: ProbeResult[];
  error?: string;
}

function StatusBadge({ status, bootError }: { status: ProbeStatus; bootError: boolean }) {
  if (status === 'success') {
    return (
      <Badge variant="outline" className="gap-1 bg-green-500/15 text-green-600 border-green-500/30">
        <CheckCircle2 className="w-3 h-3" /> Success
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="outline" className="gap-1 bg-destructive/15 text-destructive border-destructive/30">
        <XCircle className="w-3 h-3" /> {bootError ? 'Boot error' : 'Error'}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground">
      Skipped
    </Badge>
  );
}

export default function EdgeFunctionsHealthPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      const { data: res, error: invokeErr } = await supabase.functions.invoke<HealthResponse>(
        'edge-functions-health',
        { body: { concurrency: 8, timeoutMs: 8000 } },
      );
      if (invokeErr) throw invokeErr;
      if (!res?.ok) throw new Error(res?.error || 'Health check failed');
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.results.filter((r) => {
      if (onlyErrors && r.status !== 'error') return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, onlyErrors]);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <Helmet>
        <title>Edge Functions Health · Admin</title>
      </Helmet>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edge Functions Health</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Boot-pings every deployed edge function and reports TypeScript runtime status.
            A function returning a boot error means it failed to import (syntax, type, or
            missing dependency) and is currently unreachable.
          </p>
        </div>
        <Button onClick={runCheck} disabled={running} size="lg" className="shrink-0">
          {running ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" /> Run health check</>
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div><strong>Failed to run check:</strong> {error}</div>
        </div>
      )}

      {data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryTile label="Total" value={data.summary.total} />
            <SummaryTile label="Success" value={data.summary.success} tone="success" />
            <SummaryTile label="Errors" value={data.summary.error} tone="error" />
            <SummaryTile label="Boot errors" value={data.summary.bootErrors} tone="warn" />
          </div>

          <div className="text-xs text-muted-foreground mb-4">
            Last run: {format(new Date(data.startedAt), 'PPpp')} · {data.durationMs} ms ·
            concurrency {data.concurrency} · timeout {data.timeoutMs} ms
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Filter by function name…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant={onlyErrors ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyErrors((v) => !v)}
            >
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              {onlyErrors ? 'Showing errors only' : 'Show errors only'}
            </Button>
          </div>

          {/* Results table */}
          <div className="rounded-md border border-border overflow-hidden">
            <ScrollArea className="h-[60vh]">
              <div className="divide-y divide-border/40">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {data.results.length === 0 ? 'No functions probed.' : 'No matches for current filter.'}
                  </div>
                ) : (
                  filtered.map((r) => <ResultRow key={r.name} r={r} />)
                )}
              </div>
            </ScrollArea>
          </div>
        </>
      )}

      {!data && !error && !running && (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Click <strong>Run health check</strong> to probe every edge function.
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'error' | 'warn';
}) {
  const toneCls =
    tone === 'success'
      ? 'text-green-600'
      : tone === 'error'
      ? 'text-destructive'
      : tone === 'warn'
      ? 'text-amber-600'
      : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
    </div>
  );
}

function ResultRow({ r }: { r: ProbeResult }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!r.errorSnippet;
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={r.status} bootError={r.bootError} />
          <code className="text-sm truncate">{r.name}</code>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span>{r.httpStatus ?? '—'}</span>
          <span>{r.durationMs} ms</span>
          {hasDetail && (
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'Details'}
            </Button>
          )}
        </div>
      </div>
      {open && hasDetail && (
        <pre className="mt-2 ml-2 text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words text-muted-foreground">
          {r.errorSnippet}
        </pre>
      )}
    </div>
  );
}