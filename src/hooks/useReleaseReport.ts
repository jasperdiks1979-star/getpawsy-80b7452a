import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { downloadReleaseReportPdf } from '@/utils/releaseReportPdf';

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export type ReleaseReportPhase =
  | 'idle'
  | 'creating'
  | 'syncing'
  | 'validating'
  | 'completed'
  | 'failed';

export interface ReleaseReportResult {
  id: string;
  status: string;
  sync_summary: any;
  validation_summary: any;
  error_message: string | null;
  completed_at: string | null;
}

interface ReportOptions {
  title: string;
  notes?: string;
}

/**
 * Reports a new release and automatically:
 *  1. Triggers `merchant-sync` (live mode) — pushes latest product data to GMC
 *  2. Triggers `validate-merchant-feed` — validates the public feed
 *  3. Persists both summaries on the release_reports row for audit trail
 */
export function useReleaseReport() {
  const [phase, setPhase] = useState<ReleaseReportPhase>('idle');
  const [result, setResult] = useState<ReleaseReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callFn = useCallback(async (name: string, body: unknown) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/${name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body ?? {}),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`${name} ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }, []);

  const reportRelease = useCallback(
    async ({ title, notes }: ReportOptions) => {
      setError(null);
      setResult(null);
      setPhase('creating');

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        const msg = 'Not authenticated';
        setError(msg);
        setPhase('failed');
        toast.error(msg);
        return null;
      }

      // 1. Create release row
      const { data: row, error: insertErr } = await supabase
        .from('release_reports')
        .insert({
          title,
          notes: notes ?? null,
          reported_by: userId,
          status: 'syncing',
        })
        .select()
        .single();

      if (insertErr || !row) {
        const msg = insertErr?.message ?? 'Failed to create release report';
        setError(msg);
        setPhase('failed');
        toast.error(msg);
        return null;
      }

      try {
        // 2. Trigger merchant-sync (live)
        setPhase('syncing');
        const sync = await callFn('merchant-sync', { mode: 'live' });
        const syncSummary = {
          runId: sync.runId ?? null,
          mode_effective: sync.mode_effective ?? null,
          successCount: Number(sync.successCount ?? 0),
          errorCount: Number(sync.errorCount ?? 0),
          totalProducts: Number(sync.totalProducts ?? 0),
          startedAt: sync.startedAt ?? null,
          completedAt: sync.completedAt ?? null,
        };

        await supabase
          .from('release_reports')
          .update({
            status: 'validating',
            sync_run_id: sync.runId ?? null,
            sync_summary: syncSummary,
          })
          .eq('id', row.id);

        // 3. Trigger validate-merchant-feed
        setPhase('validating');
        const val = await callFn('validate-merchant-feed', {});
        const validationSummary = {
          ok: !!val.ok,
          totalItemsInFeed: Number(val.totalItemsInFeed ?? 0),
          sampleSize: Number(val.sampleSize ?? 0),
          okCount: Number(val.summary?.ok ?? 0),
          failCount: Number(val.summary?.fail ?? 0),
          topFailReasons: val.summary?.topFailReasons ?? [],
        };

        const completedAt = new Date().toISOString();
        const { data: updated } = await supabase
          .from('release_reports')
          .update({
            status: 'completed',
            validation_summary: validationSummary,
            completed_at: completedAt,
          })
          .eq('id', row.id)
          .select()
          .single();

        const final: ReleaseReportResult = {
          id: row.id,
          status: 'completed',
          sync_summary: syncSummary,
          validation_summary: validationSummary,
          error_message: null,
          completed_at: completedAt,
          ...(updated ?? {}),
        };
        setResult(final);
        setPhase('completed');
        toast.success(
          `Release reported · sync ${syncSummary.successCount}/${syncSummary.totalProducts} · feed ${validationSummary.okCount}/${validationSummary.sampleSize} OK`,
        );
        // 4. Auto-generate the GMC evidence PDF (matrix + release summary)
        //    so the operator can attach it to the appeal in one click.
        try {
          downloadReleaseReportPdf({
            title,
            notes,
            result: final,
          });
          toast.success('Evidence PDF downloaded · ready for GMC appeal');
        } catch (pdfErr) {
          console.error('[useReleaseReport] PDF auto-generation failed:', pdfErr);
          toast.error('Could not auto-generate PDF — use the manual Download button.');
        }
        return final;
      } catch (e: any) {
        const msg = e?.message ?? 'Release report flow failed';
        await supabase
          .from('release_reports')
          .update({
            status: 'failed',
            error_message: msg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        setError(msg);
        setPhase('failed');
        toast.error(msg);
        return null;
      }
    },
    [callFn],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setError(null);
  }, []);

  return { phase, result, error, reportRelease, reset };
}
