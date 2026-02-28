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
  const lastProgressRef = useRef<number>(Date.now());
  const STUCK_THRESHOLD_MS = 180_000; // 3 min without progress = stuck (matches backend)
  const [appearsStuck, setAppearsStuck] = useState(false);

  const fetchStatus = useCallback(async (runId?: string) => {
    const { data, error } = await invokeFunction<{
      ok: boolean; run: JobRun | null; steps: JobRunStep[]; logs: JobRunLog[]; reason?: string;
    }>('job-status', {
      body: JSON.stringify({ runId: runId || null, latest: runId ? false : true }),
      silent: true,
    });

    if (error || !data?.ok) {
      const errMsg = data?.reason || error?.message || 'Failed to fetch status';
      setState(prev => ({ ...prev, loading: false, error: errMsg }));
      return;
    }

    // Track progress: if run status or steps changed, update timestamp
    setState(prev => {
      const statusChanged = prev.run?.status !== data.run?.status;
      const stepsChanged = JSON.stringify(prev.steps.map(s => s.status)) !== JSON.stringify(data.steps.map(s => s.status));
      if (statusChanged || stepsChanged) {
        lastProgressRef.current = Date.now();
        setAppearsStuck(false);
      }
      return { ...prev, run: data.run, steps: data.steps, logs: data.logs, loading: false, error: null };
    });

    return data.run;
  }, [invokeFunction]);

  const startPolling = useCallback((runId?: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    lastProgressRef.current = Date.now();
    setAppearsStuck(false);

    pollingRef.current = setInterval(async () => {
      const run = await fetchStatus(runId);

      // Check stuck detection: use server-side updated_at (heartbeat) if available
      const sinceLastProgress = Date.now() - lastProgressRef.current;
      if (run && (run.status === 'queued' || run.status === 'running')) {
        // Also check server-side heartbeat via started_at as fallback
        const serverLastProgress = run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0;
        if (sinceLastProgress > STUCK_THRESHOLD_MS || serverLastProgress > STUCK_THRESHOLD_MS) {
          setAppearsStuck(true);
        }
      }

      if (run && (run.status === 'success' || run.status === 'failed' || run.status === 'cancelled')) {
        setAppearsStuck(false);
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    }, 10_000); // Poll every 10s
  }, [fetchStatus]);

  const triggerRun = useCallback(async (mode: 'dryrun' | 'fullstack' = 'fullstack', forceOverride = false) => {
    setState(prev => ({ ...prev, triggering: true, error: null, reauthRequired: false, traceId: null }));

    const { data, error } = await invokeFunction<{
      ok: boolean; runId?: string; reason?: string; nextAllowedAt?: string; activeRunId?: string;
      traceId?: string; reauthRequired?: boolean;
    }>('run-all', {
      body: JSON.stringify({ source: 'manual', mode, forceOverride }),
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

  const cancelRun = useCallback(async (runId?: string, force = false) => {
    const { data, error } = await invokeFunction<{
      ok: boolean; cancelled?: boolean; reason?: string; mode?: string;
    }>('cancel-run', {
      body: JSON.stringify({ runId: runId || state.run?.id, force, reason: 'Cancelled from UI' }),
      silent: true,
    });

    if (error || !data?.ok) {
      const reason = data?.reason || error?.message || 'Failed to cancel run';
      setState(prev => ({ ...prev, error: reason }));
      return { ok: false, reason };
    }

    // Refresh status after cancel
    await fetchStatus(runId || state.run?.id);
    return { ok: true, mode: data.mode };
  }, [invokeFunction, fetchStatus, state.run?.id]);

  const resetView = useCallback(() => {
    setAppearsStuck(false);
    lastProgressRef.current = Date.now();
    fetchStatus();
  }, [fetchStatus]);

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

  return { ...state, isActive, appearsStuck, triggerRun, cancelRun, refresh: () => fetchStatus(), resetView };
}
