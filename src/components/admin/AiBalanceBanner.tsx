import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

type State = 'ok' | 'low' | 'rate_limited' | 'error' | 'no_key' | 'loading';

interface Status {
  state: State;
  message: string;
  checkedAt?: string;
}

const POLL_MS = 60_000;

export function AiBalanceBanner() {
  const [status, setStatus] = useState<Status>({ state: 'loading', message: 'Checking AI balance…' });

  const check = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-balance-check');
      if (error) {
        setStatus({ state: 'error', message: error.message });
        return;
      }
      setStatus({
        state: (data?.state as State) ?? 'error',
        message: data?.message ?? 'Unknown response',
        checkedAt: data?.checkedAt,
      });
    } catch (e: any) {
      setStatus({ state: 'error', message: String(e?.message ?? e) });
    }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // OK state: tiny pill, non-intrusive
  if (status.state === 'ok') {
    return (
      <div className="flex items-center justify-between px-4 py-1.5 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-b border-emerald-500/20">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          AI Gateway: credits available — safe to run regeneration
        </span>
        <button onClick={check} className="opacity-60 hover:opacity-100" aria-label="Recheck">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (status.state === 'loading') {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] bg-muted text-muted-foreground border-b">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking AI balance…
      </div>
    );
  }

  // Warning / blocking states
  const tone =
    status.state === 'low'
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';

  const headline =
    status.state === 'low'
      ? 'AI balance depleted — regeneration is BLOCKED'
      : status.state === 'rate_limited'
        ? 'AI Gateway rate-limited — retry shortly'
        : status.state === 'no_key'
          ? 'AI Gateway not configured (LOVABLE_API_KEY missing)'
          : 'AI Gateway unreachable';

  return (
    <div className={`px-4 py-2.5 text-xs border-b ${tone}`}>
      <div className="flex items-start justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">{headline}</div>
            <div className="opacity-80">{status.message}</div>
            {status.state === 'low' && (
              <div className="opacity-90">
                Top up in <strong>Settings → Cloud &amp; AI balance</strong>, then click recheck.
                Pinterest Creative Director and other AI pipelines will resume automatically.
              </div>
            )}
            {status.checkedAt && (
              <div className="opacity-60 text-[10px]">
                Last checked: {new Date(status.checkedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={check}
          className="flex items-center gap-1 px-2 py-1 rounded border border-current/30 hover:bg-background/40 transition-colors shrink-0"
        >
          <RefreshCw className="h-3 w-3" /> Recheck
        </button>
      </div>
    </div>
  );
}