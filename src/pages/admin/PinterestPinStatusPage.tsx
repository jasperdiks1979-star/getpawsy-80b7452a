import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, ExternalLink, Loader2, Download, ChevronDown, ChevronRight, Bug, RotateCcw, Wand2, Trash2, Wrench, Send, ShieldCheck, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { PATTERNS, type PatternId } from '@/lib/pinterest-patterns-client';

const PATTERN_LABELS: Record<string, string> = Object.fromEntries(
  PATTERNS.map((p) => [p.id as string, p.label]),
);
function patternLabel(hookGroup: string | null): { id: PatternId; label: string } | null {
  if (!hookGroup) return null;
  const label = PATTERN_LABELS[hookGroup];
  return label ? { id: hookGroup as PatternId, label } : null;
}

type PinRow = {
  id: string;
  product_slug: string | null;
  pin_title: string | null;
  pin_variant: string | null;
  status: string;
  scheduled_at: string | null;
  posted_at: string | null;
  publishing_started_at: string | null;
  publish_attempts: number | null;
  last_publish_error: string | null;
  error_message: string | null;
  rejection_reason: string | null;
  pinterest_pin_id: string | null;
  external_url: string | null;
  hook_group: string | null;
  pin_image_url: string | null;
  destination_link: string | null;
  board_id: string | null;
  created_at: string;
};

const STATUS_FILTERS = ['all', 'queued', 'publishing', 'posted', 'failed', 'draft', 'rejected', 'skipped'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const statusVariant: Record<string, string> = {
  posted: 'bg-emerald-500/15 text-emerald-700 border-emerald-200',
  queued: 'bg-blue-500/15 text-blue-700 border-blue-200',
  publishing: 'bg-amber-500/15 text-amber-700 border-amber-200',
  failed: 'bg-red-500/15 text-red-700 border-red-200',
  draft: 'bg-slate-500/15 text-slate-700 border-slate-200',
  rejected: 'bg-rose-500/15 text-rose-700 border-rose-200',
  skipped: 'bg-zinc-500/15 text-zinc-700 border-zinc-200',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function PinterestPinStatusPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, any>>({});
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [maintLoading, setMaintLoading] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pinterest-pin-status', filter],
    queryFn: async () => {
      let q = supabase
        .from('pinterest_pin_queue')
        .select('id, product_slug, pin_title, pin_variant, status, scheduled_at, posted_at, publishing_started_at, publish_attempts, last_publish_error, error_message, rejection_reason, pinterest_pin_id, external_url, hook_group, pin_image_url, destination_link, board_id, created_at')
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .limit(500);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PinRow[];
    },
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    (data ?? []).forEach((r) => { by[r.status] = (by[r.status] ?? 0) + 1; });
    return by;
  }, [data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter((r) =>
      [r.pin_title, r.product_slug, r.pin_variant, r.last_publish_error, r.error_message, r.rejection_reason]
        .filter(Boolean).some((v) => (v as string).toLowerCase().includes(s)));
  }, [data, search]);

  const exportCsv = () => {
    const cols: { key: keyof PinRow; label: string }[] = [
      { key: 'id', label: 'id' },
      { key: 'pin_title', label: 'pin_title' },
      { key: 'product_slug', label: 'product_slug' },
      { key: 'pin_variant', label: 'pin_variant' },
      { key: 'hook_group', label: 'hook_group' },
      { key: 'status', label: 'status' },
      { key: 'scheduled_at', label: 'scheduled_at' },
      { key: 'posted_at', label: 'posted_at' },
      { key: 'publishing_started_at', label: 'publishing_started_at' },
      { key: 'publish_attempts', label: 'publish_attempts' },
      { key: 'last_publish_error', label: 'last_publish_error' },
      { key: 'error_message', label: 'error_message' },
      { key: 'rejection_reason', label: 'rejection_reason' },
      { key: 'pinterest_pin_id', label: 'pinterest_pin_id' },
      { key: 'external_url', label: 'external_url' },
      { key: 'created_at', label: 'created_at' },
    ];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [
      cols.map((c) => c.label).join(','),
      ...filtered.map((r) => cols.map((c) => esc(r[c.key])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `pinterest-pin-status_${filter}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleExpand = async (row: PinRow) => {
    const next = !expanded[row.id];
    setExpanded((s) => ({ ...s, [row.id]: next }));
    if (next && !logs[row.id]) {
      const { data: log } = await supabase
        .from('pinterest_publish_logs')
        .select('attempt, status, error_message, response_payload, request_payload, duration_ms, created_at')
        .eq('pin_queue_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLogs((s) => ({ ...s, [row.id]: log ?? null }));
    }
  };

  const retryPin = async (row: PinRow) => {
    setRetrying((s) => ({ ...s, [row.id]: true }));
    try {
      const { data: res, error } = await supabase.functions.invoke('pinterest-publish-now', {
        body: { mode: 'pin', pinId: row.id },
      });
      if (error) throw error;
      const r = res as { ok: boolean; message?: string; pinterest_pin_id?: string; stage?: string };
      if (r?.ok) {
        toast({ title: 'Published', description: r.pinterest_pin_id ? `Pin ${r.pinterest_pin_id}` : 'Success' });
      } else {
        toast({
          title: `Failed at ${r?.stage || 'publish'}`,
          description: r?.message || 'Unknown error',
          variant: 'destructive',
        });
      }
      // refresh log + table row
      setLogs((s) => ({ ...s, [row.id]: undefined as any }));
      await refetch();
      if (expanded[row.id]) {
        const { data: log } = await supabase
          .from('pinterest_publish_logs')
          .select('attempt, status, error_message, response_payload, request_payload, duration_ms, created_at')
          .eq('pin_queue_id', row.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLogs((s) => ({ ...s, [row.id]: log ?? null }));
      }
    } catch (e) {
      toast({ title: 'Retry error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRetrying((s) => ({ ...s, [row.id]: false }));
    }
  };

  const runAutomation = async (action: string, body: Record<string, unknown> = {}) => {
    setMaintLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', { body: { action, ...body } });
      if (error) throw error;
      const r = data as any;
      if (r?.ok === false) throw new Error(r?.error || `${action} failed`);
      return r;
    } finally {
      setMaintLoading(null);
    }
  };

  const handleGenerateDrafts = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('pinterest-viral-batch', {
        body: { productSlug: 'automatic-self-cleaning-cat-litter-box', maxPins: 5, requireApproval: true },
      });
      if (error) throw error;
      toast({ title: 'Generation kicked off', description: `Drafts: ${(data as any)?.queued ?? '?'}` });
      await refetch();
    } catch (e) {
      toast({ title: 'Generate failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleQueueDrafts = async () => {
    const drafts = (data ?? []).filter((r) => r.status === 'draft').slice(0, 10);
    if (!drafts.length) return toast({ title: 'No drafts to queue' });
    try {
      const r = await runAutomation('bulk_approve', { pinIds: drafts.map((d) => d.id) });
      toast({ title: 'Queued', description: `Approved ${r?.approved ?? 0} (failed ${r?.failures?.length ?? 0})` });
      await refetch();
    } catch (e) {
      toast({ title: 'Queue failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleApproveAllDrafts = async () => {
    const drafts = (data ?? []).filter((r) => r.status === 'draft');
    if (!drafts.length) return toast({ title: 'No drafts to approve' });
    if (!confirm(`Promote ALL ${drafts.length} draft pins to queued? This does not publish them.`)) return;
    setMaintLoading('bulk_approve_all');
    try {
      const ids = drafts.map((d) => d.id);
      const chunkSize = 50;
      let approved = 0;
      const failures: any[] = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const r = await runAutomation('bulk_approve', { pinIds: chunk });
        approved += r?.approved ?? 0;
        if (Array.isArray(r?.failures)) failures.push(...r.failures);
      }
      toast({
        title: 'Bulk approve complete',
        description: `Approved ${approved} of ${ids.length}${failures.length ? ` · failed ${failures.length}` : ''}`,
        variant: failures.length ? 'destructive' : undefined,
      });
      await refetch();
    } catch (e) {
      toast({ title: 'Bulk approve failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setMaintLoading(null);
    }
  };

  const handlePublishNext = async () => {
    setMaintLoading('publish-next');
    try {
      const { data: res, error } = await supabase.functions.invoke('pinterest-publish-now', { body: { mode: 'next' } });
      if (error) throw error;
      const r = res as any;
      if (r?.ok) toast({ title: 'Published', description: r.pinterest_pin_id || 'OK' });
      else toast({ title: `Failed at ${r?.stage}`, description: r?.message, variant: 'destructive' });
      await refetch();
    } catch (e) {
      toast({ title: 'Publish failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setMaintLoading(null);
    }
  };

  const handleMaintenance = async () => {
    try {
      const r = await runAutomation('queue_maintenance');
      setHealth(r);
      toast({
        title: 'Maintenance complete',
        description: `Validated ${r.validated} · Marked invalid ${r.invalid_marked_rejected} · Stuck cleared ${r.cleared_stuck_publishing} · Deduped ${r.deduped}`,
      });
      await refetch();
    } catch (e) {
      toast({ title: 'Maintenance failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleDeleteInvalidDrafts = async () => {
    if (!confirm('Delete all invalid draft pins (broken image, missing overlay/title/destination)?')) return;
    try {
      const r = await runAutomation('delete_invalid_drafts');
      toast({ title: 'Invalid drafts deleted', description: `Deleted ${r.deleted}` });
      await refetch();
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const [verifyReport, setVerifyReport] = useState<any | null>(null);
  const handleVerifyDrafts = async () => {
    setVerifyReport(null);
    try {
      const r = await runAutomation('verify_drafts');
      setVerifyReport(r);
      toast({
        title: 'Verify complete',
        description: `Scanned ${r.scanned} · ready ${r.ready} · warnings ${r.with_warnings} · invalid ${r.invalid}`,
      });
    } catch (e) {
      toast({ title: 'Verify failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  // ── AI Creative Director ──────────────────────────────────────────────
  const [cdOpen, setCdOpen] = useState(false);
  const [cdSlug, setCdSlug] = useState('');
  const [cdCount, setCdCount] = useState(5);
  const [cdForce, setCdForce] = useState(false);
  const [cdResult, setCdResult] = useState<any | null>(null);
  const handleCreativeDirector = async () => {
    if (!cdSlug.trim()) {
      toast({ title: 'Product slug required', variant: 'destructive' });
      return;
    }
    setMaintLoading('creative_director');
    setCdResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('pinterest-creative-director', {
        body: {
          action: 'run_full',
          productSlug: cdSlug.trim(),
          count: cdCount,
          force: cdForce,
        },
      });
      if (error) throw error;
      const r = data as any;
      setCdResult(r);
      if (r?.ok) {
        toast({
          title: `Creative Director: ${r.niche}`,
          description: r.message,
        });
        await refetch();
      } else {
        toast({ title: 'Creative Director failed', description: r?.message || 'unknown', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Creative Director failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setMaintLoading(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pinterest Pin Status</h1>
          <p className="text-sm text-muted-foreground">Live publish status, schedule, and error reasons for every pin in the queue.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV ({filtered.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pipeline controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleGenerateDrafts} disabled={!!maintLoading}>
              <Wand2 className="h-4 w-4 mr-2" /> Generate draft pins
            </Button>
            <Button size="sm" variant="outline" onClick={handleQueueDrafts} disabled={!!maintLoading}>
              <RotateCcw className="h-4 w-4 mr-2" /> Queue drafts (top 10)
            </Button>
            <Button
              size="sm"
              onClick={handleApproveAllDrafts}
              disabled={!!maintLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {maintLoading === 'bulk_approve_all' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve all drafts ({(data ?? []).filter((r) => r.status === 'draft').length})
            </Button>
            <Button size="sm" variant="outline" onClick={handlePublishNext} disabled={!!maintLoading}>
              {maintLoading === 'publish-next' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Publish next pin now
            </Button>
            <Button size="sm" variant="outline" onClick={handleMaintenance} disabled={!!maintLoading}>
              {maintLoading === 'queue_maintenance' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
              Run queue maintenance
            </Button>
            <Button size="sm" variant="secondary" onClick={handleVerifyDrafts} disabled={!!maintLoading}>
              {maintLoading === 'verify_drafts' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Verify drafts
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDeleteInvalidDrafts} disabled={!!maintLoading}>
              {maintLoading === 'delete_invalid_drafts' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete invalid drafts
            </Button>
            <Button
              size="sm"
              onClick={() => setCdOpen((v) => !v)}
              disabled={!!maintLoading}
              className="bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-700 hover:to-violet-700 text-white"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              AI Creative Director
            </Button>
          </div>
          {cdOpen && (
            <div className="rounded border p-3 space-y-3 bg-gradient-to-br from-fuchsia-50 to-violet-50 dark:from-fuchsia-950/20 dark:to-violet-950/20">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Sparkles className="h-4 w-4 text-fuchsia-600" />
                AI Creative Director — niche-aware lifestyle pins
              </div>
              <p className="text-xs text-muted-foreground">
                Detects the product niche, drafts {cdCount} unique scene briefs, renders each as a fully-composed lifestyle photo
                (no floating product cards), runs the quality filter, and inserts approved scenes as <code>draft</code>. Approval still required.
              </p>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col gap-1 min-w-[260px] flex-1">
                  <label className="text-xs font-medium">Product slug</label>
                  <Input
                    placeholder="e.g. automatic-self-cleaning-cat-litter-box"
                    value={cdSlug}
                    onChange={(e) => setCdSlug(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1 w-24">
                  <label className="text-xs font-medium">Count</label>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={cdCount}
                    onChange={(e) => setCdCount(Math.max(1, Math.min(8, Number(e.target.value) || 5)))}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={cdForce}
                    onChange={(e) => setCdForce(e.target.checked)}
                  />
                  Re-detect niche
                </label>
                <Button
                  size="sm"
                  onClick={handleCreativeDirector}
                  disabled={maintLoading === 'creative_director' || !cdSlug.trim()}
                  className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                >
                  {maintLoading === 'creative_director' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate AI-directed pins
                </Button>
              </div>
              {cdResult && (
                <div className="rounded border bg-background p-3 space-y-2 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">niche: {cdResult.niche}</Badge>
                    <Badge variant="outline" className="border-emerald-500 text-emerald-700">
                      drafted: {cdResult.drafts?.length ?? 0}
                    </Badge>
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      rejected: {cdResult.rejected?.length ?? 0}
                    </Badge>
                  </div>
                  {!!cdResult.drafts?.length && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {cdResult.drafts.map((d: any) => (
                        <a
                          key={d.queueId}
                          href={d.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group rounded overflow-hidden border bg-muted"
                        >
                          <img
                            src={d.imageUrl}
                            alt={d.brief?.headline || 'pin'}
                            className="w-full aspect-[9/16] object-cover group-hover:opacity-90"
                            loading="lazy"
                          />
                          <div className="p-1.5 space-y-0.5">
                            <div className="font-medium leading-tight line-clamp-2">{d.brief?.headline}</div>
                            <div className="text-[10px] text-muted-foreground line-clamp-1">{d.brief?.cta}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                  {!!cdResult.rejected?.length && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground">Show rejected ({cdResult.rejected.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {cdResult.rejected.map((r: any, i: number) => (
                          <li key={i} className="border-l-2 border-amber-500 pl-2">
                            <span className="font-medium">{r.brief?.headline || '—'}</span>
                            <span className="text-muted-foreground"> · {(r.reasons || []).join(', ')}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
          {verifyReport && (
            <div className="rounded border p-3 space-y-2 text-xs bg-muted/30">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" /> Verify report
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">scanned: {verifyReport.scanned}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> ready: {verifyReport.ready}
                </Badge>
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  <AlertTriangle className="h-3 w-3 mr-1" /> warnings: {verifyReport.with_warnings}
                </Badge>
                <Badge variant="outline" className="border-red-500 text-red-700">invalid: {verifyReport.invalid}</Badge>
              </div>
              {!!Object.keys(verifyReport.reason_tally || {}).length && (
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(verifyReport.reason_tally as Record<string, number>).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="text-[10px]">{k}: {v}</Badge>
                  ))}
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-muted-foreground">Per-pin report ({verifyReport.report?.length ?? 0})</summary>
                <pre className="mt-1 max-h-72 overflow-auto rounded bg-background p-2 text-[10px]">
                  {JSON.stringify(verifyReport.report, null, 2)}
                </pre>
              </details>
            </div>
          )}
          {health && (
            <div className="rounded border p-3 space-y-2 text-xs bg-muted/30">
              <div className="font-semibold">Queue health</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(health.counts_by_status || {}).map(([k, v]) => (
                  <Badge key={k} variant="outline" className={statusVariant[k] ?? ''}>{k}: {String(v)}</Badge>
                ))}
              </div>
              <div className="text-muted-foreground">
                Validated {health.validated} · valid {health.valid} · marked invalid {health.invalid_marked_rejected} ·
                stuck cleared {health.cleared_stuck_publishing} · orphans recovered {health.recovered_orphaned_queued} ·
                deduped {health.deduped}
              </div>
              {!!health.invalid_sample?.length && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Invalid sample ({health.invalid_sample.length})</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-background p-2 text-[10px]">
                    {JSON.stringify(health.invalid_sample, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <TabsList className="flex flex-wrap h-auto">
              {STATUS_FILTERS.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                  {filter === s && data && <span className="ml-2 text-xs opacity-70">({filtered.length})</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            placeholder="Search title, slug, variant, error…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
            {Object.entries(counts).map(([k, v]) => (
              <Badge key={k} variant="outline" className={statusVariant[k] ?? ''}>{k}: {v}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading pins…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">No pins match the current filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">Pin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead className="min-w-[260px]">Last Error / Reason</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const err = r.last_publish_error ?? r.error_message ?? r.rejection_reason ?? '';
                    const isOpen = !!expanded[r.id];
                    const log = logs[r.id];
                    const canRetry = ['failed', 'rejected', 'queued', 'draft'].includes(r.status);
                    return (
                      <Fragment key={r.id}>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <button
                              onClick={() => toggleExpand(r)}
                              className="mt-0.5 text-muted-foreground hover:text-foreground"
                              aria-label="Toggle details"
                            >
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            {r.pin_image_url ? (
                              <img
                                src={r.pin_image_url}
                                alt=""
                                className="h-12 w-9 object-cover rounded border bg-muted shrink-0"
                                loading="lazy"
                              />
                            ) : null}
                            <div className="min-w-0">
                          <div className="font-medium line-clamp-1">{r.pin_title || '(untitled)'}</div>
                          {(() => {
                            const p = patternLabel(r.hook_group);
                            return p ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase tracking-wide bg-violet-500/10 text-violet-700 border-violet-200"
                                  title={`Pattern: ${p.id}`}
                                >
                                  {p.label}
                                </Badge>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(p.id);
                                    toast({ title: 'Pattern ID copied', description: p.id });
                                  }}
                                  title="Click to copy pattern_id"
                                  className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-500/5 text-violet-700 hover:bg-violet-500/15 transition"
                                >
                                  {p.id}
                                </button>
                              </div>
                            ) : null;
                          })()}
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {r.product_slug} · {r.hook_group || r.pin_variant}
                          </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${statusVariant[r.status] ?? ''}`}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmt(r.scheduled_at)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmt(r.posted_at)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.publish_attempts ?? 0}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground line-clamp-2" title={err}>
                            {err || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                          {r.external_url ? (
                            <a href={r.external_url} target="_blank" rel="noopener noreferrer"
                               className="inline-flex items-center text-primary hover:underline text-xs">
                              Open <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                            {canRetry && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => retryPin(r)}
                                disabled={!!retrying[r.id]}
                              >
                                {retrying[r.id]
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <RotateCcw className="h-3 w-3" />}
                                <span className="ml-1 text-xs">Retry</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="p-4">
                            <div className="grid gap-3 md:grid-cols-2 text-xs">
                              <div className="space-y-1">
                                <div className="font-semibold flex items-center gap-1"><Bug className="h-3 w-3" /> Pin metadata</div>
                                <div><span className="text-muted-foreground">Pin id:</span> {r.id}</div>
                                <div><span className="text-muted-foreground">Board id:</span> {r.board_id || '—'}</div>
                                <div><span className="text-muted-foreground">Pinterest id:</span> {r.pinterest_pin_id || '—'}</div>
                                <div className="break-all"><span className="text-muted-foreground">Image:</span>{' '}
                                  {r.pin_image_url
                                    ? <a href={r.pin_image_url} target="_blank" rel="noopener noreferrer" className="underline">open</a>
                                    : '—'}
                                </div>
                                <div className="break-all"><span className="text-muted-foreground">Destination:</span>{' '}
                                  {r.destination_link
                                    ? <a href={r.destination_link} target="_blank" rel="noopener noreferrer" className="underline">{r.destination_link}</a>
                                    : '—'}
                                </div>
                                <div className="text-destructive whitespace-pre-wrap break-words pt-1">
                                  {err || 'No error recorded.'}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="font-semibold">Last publish log</div>
                                {log === undefined ? (
                                  <div className="text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" /> loading…</div>
                                ) : log === null ? (
                                  <div className="text-muted-foreground">No log entry yet.</div>
                                ) : (
                                  <>
                                    <div>
                                      <span className="text-muted-foreground">Attempt:</span> {log.attempt} ·{' '}
                                      <span className="text-muted-foreground">status:</span> {log.status} ·{' '}
                                      <span className="text-muted-foreground">duration:</span> {log.duration_ms}ms
                                    </div>
                                    {log.error_message && (
                                      <div className="text-destructive break-words">{log.error_message}</div>
                                    )}
                                    <details className="mt-1">
                                      <summary className="cursor-pointer text-muted-foreground">Pinterest response</summary>
                                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-background p-2 text-[10px]">
{JSON.stringify(log.response_payload, null, 2)}
                                      </pre>
                                    </details>
                                    <details>
                                      <summary className="cursor-pointer text-muted-foreground">Request payload</summary>
                                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-background p-2 text-[10px]">
{JSON.stringify(log.request_payload, null, 2)}
                                      </pre>
                                    </details>
                                  </>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}