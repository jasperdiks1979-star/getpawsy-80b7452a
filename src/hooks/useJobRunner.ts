import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';

export interface JobRun {
  id: string;
  source: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  triggered_by: string | null;
  report: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface JobRunStep {
  id: string;
  run_id: string;
  step_key: string;
  step_label: string;
  step_order: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
}

export interface JobRunLog {
  id: string;
  run_id: string;
  step_key: string | null;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  created_at: string;
}

export interface JobStatusState {
  run: JobRun | null;
  steps: JobRunStep[];
  logs: JobRunLog[];
  loading: boolean;
  triggering: boolean;
  error: string | null;
  reauthRequired: boolean;
  traceId: string | null;
}

export function useJobRunner() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [state, setState] = useState<JobStatusState>({
    run: null, steps: [], logs: [], loading: true, triggering: false, error: null,
    reauthRequired: false, traceId: null,
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (runId?: string) => {
    const { data, error } = await invokeFunction<{
      ok: boolean; run: JobRun | null; steps: JobRunStep[]; logs: JobRunLog[]; reason?: string;
    }>('job-status', {
      body: JSON.stringify({ runId: runId || null, latest: runId ? false : true }),
      silent: true,
    });

    if (error || !data?.ok) {
      // Only set error if we got a real error, not just "no data"
      const errMsg = data?.reason || error?.message || 'Failed to fetch status';
      setState(prev => ({ ...prev, loading: false, error: errMsg }));
      return;
    }

    setState(prev => ({
      ...prev, run: data.run, steps: data.steps, logs: data.logs, loading: false, error: null,
    }));

    return data.run;
  }, [invokeFunction]);

  const startPolling = useCallback((runId?: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      const run = await fetchStatus(runId);
      if (run && (run.status === 'success' || run.status === 'failed' || run.status === 'cancelled')) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    }, 3000);
  }, [fetchStatus]);

  const triggerRun = useCallback(async (mode: 'dryrun' | 'fullstack' = 'fullstack') => {
    setState(prev => ({ ...prev, triggering: true, error: null, reauthRequired: false, traceId: null }));

    const { data, error } = await invokeFunction<{
      ok: boolean; runId?: string; reason?: string; nextAllowedAt?: string; activeRunId?: string;
      traceId?: string; reauthRequired?: boolean;
    }>('run-all', {
      body: JSON.stringify({ source: 'manual', mode }),
      silent: true,
    });

    const traceId = data?.traceId || null;
    const reauthRequired = data?.reauthRequired || false;

    if (error || !data?.ok) {
      const reason = data?.reason || error?.message || 'Failed to trigger run';
      setState(prev => ({ ...prev, triggering: false, error: reason, traceId, reauthRequired }));
      return { ok: false, reason, traceId, reauthRequired };
    }

    setState(prev => ({ ...prev, triggering: false, traceId }));

    if (data.runId) {
      await fetchStatus(data.runId);
      startPolling(data.runId);
    }

    return { ok: true, runId: data.runId, traceId };
  }, [invokeFunction, fetchStatus, startPolling]);

  // Initial load
  useEffect(() => {
    fetchStatus().then(run => {
      if (run && (run.status === 'queued' || run.status === 'running')) {
        startPolling(run.id);
      }
    });
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchStatus, startPolling]);

  const isActive = state.run?.status === 'queued' || state.run?.status === 'running';

  return { ...state, isActive, triggerRun, refresh: () => fetchStatus() };
}
