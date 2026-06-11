import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

// Build-time constants injected by Vite. BUILD_ID comes from vite-plugin-build-id.
declare const __BUILD_ID__: string | undefined;
const BUILD_ID = (typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev') as string;

type DiagRow = { label: string; value: string | number; ok: boolean; hint?: string };

async function fetchDiag(): Promise<DiagRow[]> {
  const rows: DiagRow[] = [];

  // 1. Frontend build
  rows.push({
    label: 'Frontend build',
    value: BUILD_ID,
    ok: BUILD_ID !== 'dev',
    hint: 'Vite build id injected at compile time',
  });

  // 2. Queue health counts
  const { data: queued } = await supabase
    .from('pinterest_pin_queue')
    .select('id, board_id, approved_at, rejection_reason, product_slug, pin_image_url, destination_link', { count: 'exact' })
    .eq('status', 'queued');
  const all = queued || [];
  const slugNotAllowed = all.filter((r: any) => r.rejection_reason === 'slug_not_allowed').length;
  const boardNull = all.filter((r: any) => !r.board_id).length;
  const notApproved = all.filter((r: any) => !r.approved_at).length;
  const ready = all.filter(
    (r: any) =>
      r.board_id &&
      r.approved_at &&
      r.rejection_reason !== 'slug_not_allowed' &&
      typeof r.pin_image_url === 'string' &&
      r.pin_image_url.startsWith('https://') &&
      typeof r.destination_link === 'string' &&
      r.destination_link.includes('/products/'),
  ).length;
  const distinctSlugs = new Set(all.map((r: any) => r.product_slug).filter(Boolean));

  rows.push({ label: 'Queued pins', value: all.length, ok: true });
  rows.push({ label: 'Ready to publish', value: ready, ok: ready > 0 });
  rows.push({ label: 'slug_not_allowed', value: slugNotAllowed, ok: slugNotAllowed === 0 });
  rows.push({ label: 'board_id NULL', value: boardNull, ok: boardNull === 0 });
  rows.push({ label: 'Not approved', value: notApproved, ok: notApproved === 0 });
  rows.push({ label: 'Distinct queued slugs', value: distinctSlugs.size, ok: true });

  // 3. Latest deploy error from edge function logs (best-effort via diagnostic endpoint)
  try {
    const { data: lastRun } = await supabase
      .from('pinterest_cron_runs')
      .select('run_at, success, error_message, function_version')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun) {
      rows.push({
        label: 'Last cron run',
        value: new Date((lastRun as any).run_at).toLocaleString(),
        ok: (lastRun as any).success !== false,
        hint: (lastRun as any).error_message || (lastRun as any).function_version || '',
      });
    }
  } catch {
    // table may not exist — non-fatal
  }

  return rows;
}

export default function DeployDiagnosticPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pinterest-deploy-diag'],
    queryFn: fetchDiag,
    refetchInterval: 30_000,
  });

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Deploy Diagnostic</CardTitle>
        <button
          onClick={() => refetch()}
          className="text-xs underline opacity-70 hover:opacity-100"
        >
          {isFetching ? 'refreshing…' : 'refresh'}
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {(data || []).map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between rounded border px-2 py-1.5"
                title={r.hint || ''}
              >
                <span className="text-muted-foreground">{r.label}</span>
                <Badge
                  variant="outline"
                  className={
                    r.ok
                      ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                      : 'border-amber-200 text-amber-700 bg-amber-50'
                  }
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 mr-1" />
                  )}
                  {String(r.value)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}