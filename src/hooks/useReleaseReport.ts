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
 * Retry policy for transient failures of the merchant-sync and
 * validate-merchant-feed edge functions. We retry on:
 *   - network/abort errors (no response)
 *   - HTTP 408, 425, 429, 500, 502, 503, 504
 * Non-transient errors (4xx other than the above) fail fast.
 */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1500;
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

class TransientFnError extends Error {
  constructor(public status: number | null, message: string) {
    super(message);
    this.name = 'TransientFnError';
  }
}
class PermanentFnError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'PermanentFnError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry wrapper that emits per-attempt callbacks for UI feedback. */
async function withRetry<T>(
  fnName: string,
  invoke: () => Promise<T>,
  onAttempt?: (attempt: number, lastError?: string) => void,
): Promise<{ value: T; attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onAttempt?.(attempt, lastErr instanceof Error ? lastErr.message : undefined);
    try {
      const value = await invoke();
      return { value, attempts: attempt };
    } catch (e) {
      lastErr = e;
      const transient =
        e instanceof TransientFnError ||
        (e instanceof TypeError) || // fetch network failure
        (e instanceof Error && /abort|timeout|network/i.test(e.message));
      if (!transient || attempt === MAX_ATTEMPTS) {
        throw e;
      }
      // Exponential backoff with jitter
      const wait = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 400;
      console.warn(`[useReleaseReport] ${fnName} attempt ${attempt} failed (transient). Retrying in ${Math.round(wait)}ms`, e);
      await sleep(wait);
    }
  }
  // Unreachable, but TypeScript-safe
  throw lastErr instanceof Error ? lastErr : new Error('Unknown retry failure');
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
  const [retryInfo, setRetryInfo] = useState<{
    fn: 'merchant-sync' | 'validate-merchant-feed';
    attempt: number;
    lastError?: string;
  } | null>(null);

  const callFn = useCallback(async (name: string, body: unknown) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    let res: Response;
    try {
      res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/${name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body ?? {}),
          // Hard ceiling so a hung edge function doesn't wedge the UI
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (e: any) {
      // Network / timeout — always transient
      throw new TransientFnError(null, `${name} network error: ${e?.message ?? 'unknown'}`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const snippet = txt.slice(0, 200);
      if (TRANSIENT_STATUSES.has(res.status)) {
        throw new TransientFnError(res.status, `${name} ${res.status}: ${snippet}`);
      }
      throw new PermanentFnError(res.status, `${name} ${res.status}: ${snippet}`);
    }
    return res.json();
  }, []);

  const reportRelease = useCallback(
    async ({ title, notes }: ReportOptions) => {
      setError(null);
      setResult(null);
      setRetryInfo(null);
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
        const { value: sync, attempts: syncAttempts } = await withRetry(
          'merchant-sync',
          () => callFn('merchant-sync', { mode: 'live' }),
          (attempt, lastError) => {
            setRetryInfo({ fn: 'merchant-sync', attempt, lastError });
            if (attempt > 1) {
              toast.warning(
                `Merchant sync hapert · poging ${attempt}/${MAX_ATTEMPTS}…`,
                { description: lastError?.slice(0, 140) },
              );
            }
          },
        );
        const syncSummary = {
          runId: sync.runId ?? null,
          mode_effective: sync.mode_effective ?? null,
          successCount: Number(sync.successCount ?? 0),
          errorCount: Number(sync.errorCount ?? 0),
          totalProducts: Number(sync.totalProducts ?? 0),
          startedAt: sync.startedAt ?? null,
          completedAt: sync.completedAt ?? null,
          attempts: syncAttempts,
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
        setRetryInfo(null);
        const { value: val, attempts: valAttempts } = await withRetry(
          'validate-merchant-feed',
          () => callFn('validate-merchant-feed', {}),
          (attempt, lastError) => {
            setRetryInfo({ fn: 'validate-merchant-feed', attempt, lastError });
            if (attempt > 1) {
              toast.warning(
                `Feed-validatie hapert · poging ${attempt}/${MAX_ATTEMPTS}…`,
                { description: lastError?.slice(0, 140) },
              );
            }
          },
        );
        const validationSummary = {
          ok: !!val.ok,
          totalItemsInFeed: Number(val.totalItemsInFeed ?? 0),
          sampleSize: Number(val.sampleSize ?? 0),
          okCount: Number(val.summary?.ok ?? 0),
          failCount: Number(val.summary?.fail ?? 0),
          topFailReasons: val.summary?.topFailReasons ?? [],
          // Persist per-item evidence so the Issue panel can link each
          // failreason back to a concrete product id + failed field. We
          // cap defensively to keep release rows small.
          sampleResults: Array.isArray(val.sampleResults)
            ? val.sampleResults.slice(0, 50)
            : [],
          feedUrl: 'https://getpawsy.pet/merchant-feed.xml',
          attempts: valAttempts,
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
        setRetryInfo(null);
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
        const isTransient = e instanceof TransientFnError;
        const isPermanent = e instanceof PermanentFnError;
        const phaseLabel = isTransient || isPermanent
          ? (e.message.startsWith('merchant-sync') ? 'Merchant sync' : 'Feed-validatie')
          : 'Release flow';
        const reason = isTransient
          ? `${phaseLabel} bleef tijdelijke fouten geven na ${MAX_ATTEMPTS} pogingen. ${e.message}`
          : isPermanent
            ? `${phaseLabel} faalde permanent (HTTP ${e.status}). ${e.message}`
            : (e?.message ?? 'Release report flow failed');
        const msg = reason;
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
        setRetryInfo(null);
        toast.error(`${phaseLabel} mislukt`, {
          description: msg.slice(0, 220),
          duration: 10_000,
        });
        return null;
      }
    },
    [callFn],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setRetryInfo(null);
  }, []);

  return { phase, result, error, retryInfo, reportRelease, reset };
}
